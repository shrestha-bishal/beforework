(function(global){
  "use strict";

  const FORMAT="beforework-folder-workspace";
  const FORMAT_VERSION=1;
  const MANIFEST_FILE="manifest.json";
  const ATTACHMENTS_DIRECTORY="attachments";

  function canonical(value){ return JSON.stringify(value); }
  function isRecord(value){ return value!==null && typeof value==="object" && !Array.isArray(value); }
  function assertSafeAttachmentId(id){
    if (typeof id!=="string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new Error("The attachment has an unsafe id.");
  }
  function assertSafeShardPath(path,kind){
    const pattern=kind==="project" ? /^projects\/[a-zA-Z0-9_-]+\.json$/ : /^calendar\/[a-zA-Z0-9_-]+\.json$/;
    if (typeof path!=="string" || !pattern.test(path)) throw new Error("The workspace manifest contains an unsafe shard path.");
  }
  async function readText(directory,path){
    const [directoryName,fileName]=path.includes("/") ? path.split("/") : ["",path];
    const parent=directoryName ? await directory.getDirectoryHandle(directoryName) : directory;
    const handle=await parent.getFileHandle(fileName);
    return (await handle.getFile()).text();
  }
  async function readFileInfo(directory,path){
    const [directoryName,fileName]=path.includes("/") ? path.split("/") : ["",path];
    const parent=directoryName ? await directory.getDirectoryHandle(directoryName) : directory;
    const handle=await parent.getFileHandle(fileName);
    const file=await handle.getFile();
    return {size:file.size??(await file.text()).length,lastModified:file.lastModified||0};
  }
  function contentHash(text){
    let first=2166136261,second=2246822519;
    for (let index=0;index<text.length;index++){
      const code=text.charCodeAt(index);
      first=Math.imul(first^code,16777619);
      second=Math.imul(second^code,3266489917);
    }
    return `${(first>>>0).toString(16)}${(second>>>0).toString(16)}`;
  }
  async function writeText(directory,path,text){
    const [directoryName,fileName]=path.includes("/") ? path.split("/") : ["",path];
    const parent=directoryName ? await directory.getDirectoryHandle(directoryName,{create:true}) : directory;
    const handle=await parent.getFileHandle(fileName,{create:true});
    const writable=await handle.createWritable();
    await writable.write(text);
    await writable.close();
    return readFileInfo(directory,path);
  }
  async function fileExists(directory,path){
    try{
      const [directoryName,fileName]=path.split("/");
      const parent=await directory.getDirectoryHandle(directoryName);
      await parent.getFileHandle(fileName);
      return true;
    }catch(err){ return false; }
  }
  async function cleanupOrphans(directory,manifest){
    const referenced=new Set([manifest.calendarFile,...manifest.projects.map(project=>project.file)]);
    for (const directoryName of ["projects","calendar"]){
      try{
        const child=await directory.getDirectoryHandle(directoryName);
        for await (const [name,entry] of child.entries()){
          if (entry.kind==="file" && /^[a-zA-Z0-9_-]+\.json$/.test(name) && !referenced.has(`${directoryName}/${name}`)) await child.removeEntry(name);
        }
      }catch(err){/* Orphan cleanup is best-effort. */}
    }
    const referencedAttachments=new Set(manifest.attachments||[]);
    try{
      const child=await directory.getDirectoryHandle(ATTACHMENTS_DIRECTORY);
      for await (const [name,entry] of child.entries()){
        if (entry.kind==="file" && /^[a-zA-Z0-9_-]{1,128}$/.test(name) && !referencedAttachments.has(name)) await child.removeEntry(name);
      }
    }catch(err){/* Attachment orphan cleanup is best-effort. */}
  }
  async function clearIncomplete(directory){
    try{ await directory.removeEntry(MANIFEST_FILE); }catch(err){/* The manifest may not have been created. */}
    for (const directoryName of ["projects","calendar",ATTACHMENTS_DIRECTORY]){
      try{
        const child=await directory.getDirectoryHandle(directoryName);
        for await (const [name,entry] of child.entries()){
          if (entry.kind==="file" && (directoryName===ATTACHMENTS_DIRECTORY ? /^[a-zA-Z0-9_-]{1,128}$/.test(name) : /^[a-zA-Z0-9_-]+\.json$/.test(name))) await child.removeEntry(name);
        }
      }catch(err){/* Partial setup may not have created this directory. */}
    }
  }
  function makeRevision(manifest,projectHashes,projectStats,calendarText,calendarStat){
    return {
      manifest,
      manifestText:canonical(manifest),
      metadataText:canonical(manifest.metadata),
      projectHashes,
      projectStats,
      filesById:Object.fromEntries(manifest.projects.map(project=>[project.id,project.file])),
      calendarText,
      calendarFile:manifest.calendarFile,
      calendarStat
    };
  }
  function summarizeProject(project){
    const groups=(project.groups||[]).map(group=>({id:group.id,name:group.name,itemCount:(group.items||[]).length}));
    const ungroupedItems=Array.isArray(project.items)?project.items:[];
    if (ungroupedItems.length || !groups.length){
      groups.push({id:"__project_items__",name:"Unassigned",itemCount:ungroupedItems.length});
    }
    const summaryFieldIds=new Set((project.fields||[]).filter(field=>["date","start-date","due-date","priority","location"].includes(field.type)).map(field=>field.id));
    const items=[...(project.groups||[]).flatMap(group=>(group.items||[]).map(item=>({
      id:item.id,
      title:item.title,
      groupId:group.id,
      groupName:group.name,
      calendarType:item.calendarType||"task",
      description:item.description||"",
      archived:!!item.archived,
      completedAt:item.completedAt||null,
      updatedAt:item.updatedAt||0,
      createdAt:item.createdAt||0,
      tagIds:item.tagIds||[],
      values:Object.fromEntries(Object.entries(item.values||{}).filter(([fieldId])=>summaryFieldIds.has(fieldId))),
      location:item.location||"",
      startDate:item.startDate||"",
      startTime:item.startTime||"",
      endTime:item.endTime||"",
      endDate:item.endDate||"",
      googleEventIds:item.googleEventIds||{},
      googleSyncMeta:item.googleSyncMeta||{},
      calendarTimeZone:item.calendarTimeZone||"",
      attachments:item.attachments||[],
      recurrence:item.recurrence||null,
      reminderAt:item.reminderAt||null
    }))),...ungroupedItems.map(item=>({
      id:item.id,
      title:item.title,
      groupId:"__project_items__",
      groupName:"Unassigned",
      calendarType:item.calendarType||"task",
      description:item.description||"",
      archived:!!item.archived,
      completedAt:item.completedAt||null,
      updatedAt:item.updatedAt||0,
      createdAt:item.createdAt||0,
      tagIds:item.tagIds||[],
      values:Object.fromEntries(Object.entries(item.values||{}).filter(([fieldId])=>summaryFieldIds.has(fieldId))),
      location:item.location||"",
      startDate:item.startDate||"",
      startTime:item.startTime||"",
      endTime:item.endTime||"",
      endDate:item.endDate||"",
      googleEventIds:item.googleEventIds||{},
      googleSyncMeta:item.googleSyncMeta||{},
      calendarTimeZone:item.calendarTimeZone||"",
      attachments:item.attachments||[],
      recurrence:item.recurrence||null,
      reminderAt:item.reminderAt||null
    }))];
    return {
      id:project.id,
      name:project.name,
      description:project.description??null,
      hiddenFromOverview:project.hiddenFromOverview===true,
      milestones:(project.milestones||[]).map(milestone=>({id:milestone.id,title:milestone.title,dueDate:milestone.dueDate||null})),
      icon:project.icon||"",
      folderId:project.folderId||null,
      createdAt:project.createdAt||0,
      itemCount:groups.reduce((count,group)=>count+group.itemCount,0),
      openItemCount:items.filter(item=>!item.archived && item.calendarType!=="event" && !item.completedAt).length,
      completedItemCount:items.filter(item=>!item.archived && !!item.completedAt).length,
      groups,
      itemIndex:items,
      tags:(project.tags||[]).map(tag=>({id:tag.id,name:tag.name,color:tag.color})),
      fields:(project.fields||[]).map(field=>({id:field.id,label:field.label,type:field.type,options:field.options||[]})),
      views:project.views||[],
      activeViewId:project.activeViewId||null,
      itemDefaultType:project.itemDefaultType||"task"
    };
  }
  function validateState(state,validate,maxSchemaVersion){
    const result=validate(state,maxSchemaVersion);
    if (!result.valid) throw new Error(result.errors.join(" "));
    const ids=new Set();
    state.projects.forEach(project=>{
      if (ids.has(project.id)) throw new Error(`Duplicate project id: ${project.id}`);
      ids.add(project.id);
    });
  }
  function createFolderWorkspace({validate,maxSchemaVersion,migrate,makeId=()=>global.crypto.randomUUID()}){
    async function readManifest(directory){
      const manifestText=await readText(directory,MANIFEST_FILE);
      const manifest=JSON.parse(manifestText);
      if (!isRecord(manifest) || manifest.format!==FORMAT || manifest.formatVersion!==FORMAT_VERSION){
        throw new Error("This folder does not contain a supported Beforework workspace manifest.");
      }
      if (!isRecord(manifest.metadata) || !Array.isArray(manifest.projects) || manifest.projects.length>100000){
        throw new Error("The workspace manifest is malformed.");
      }
      if (manifest.attachments!==undefined && (!Array.isArray(manifest.attachments) || manifest.attachments.length>1000000)) throw new Error("The workspace manifest has an invalid attachment index.");
      const seenAttachments=new Set();
      (manifest.attachments||[]).forEach(id=>{
        assertSafeAttachmentId(id);
        if (seenAttachments.has(id)) throw new Error(`Duplicate attachment id in manifest: ${id}`);
        seenAttachments.add(id);
      });
      assertSafeShardPath(manifest.calendarFile,"calendar");
      const summaries=[];
      const seenIds=new Set();
      for (const descriptor of manifest.projects){
        if (!isRecord(descriptor) || typeof descriptor.id!=="string" || !descriptor.id.trim()) throw new Error("The workspace manifest has an invalid project entry.");
        if (seenIds.has(descriptor.id)) throw new Error(`Duplicate project id in manifest: ${descriptor.id}`);
        seenIds.add(descriptor.id);
        assertSafeShardPath(descriptor.file,"project");
        if (descriptor.summary!==undefined && (!isRecord(descriptor.summary) || descriptor.summary.id!==descriptor.id)) throw new Error("The workspace manifest has an invalid project summary.");
        summaries.push(descriptor.summary||null);
      }
      const metadataState={...manifest.metadata,projects:[],calendarItems:[]};
      const metadataValidation=validate(metadataState,maxSchemaVersion);
      if (!metadataValidation.valid) throw new Error(metadataValidation.errors.join(" "));
      return {manifest,manifestText,metadata:manifest.metadata,projects:summaries,calendarFile:manifest.calendarFile};
    }

    async function loadIndex(directory){
      const index=await readManifest(directory);
      const projects=[];
      let needsSummaryUpgrade=false;
      for (let projectIndex=0;projectIndex<index.projects.length;projectIndex++){
        const summary=index.projects[projectIndex];
        if (summary){ projects.push(summary); continue; }
        needsSummaryUpgrade=true;
        const project=await loadProject(directory,index.manifest.projects[projectIndex].id,index);
        projects.push(summarizeProject(project));
      }
      const calendarItems=JSON.parse(await readText(directory,index.calendarFile));
      if (!Array.isArray(calendarItems)) throw new Error("The calendar shard must contain an array.");
      const projectStats={};
      for (const descriptor of index.manifest.projects) projectStats[descriptor.id]=await readFileInfo(directory,descriptor.file);
      const calendarStat=await readFileInfo(directory,index.calendarFile);
      const revision=makeRevision(index.manifest,{},projectStats,canonical(calendarItems),calendarStat);
      revision.projectSummaries=Object.fromEntries(projects.map(project=>[project.id,project]));
      return {metadata:index.metadata,projects,calendarItems,calendarFile:index.calendarFile,manifest:index.manifest,manifestText:index.manifestText,revision,needsSummaryUpgrade};
    }

    async function loadProject(directory,projectId,index){
      const manifest=index?.manifest|| (await readManifest(directory)).manifest;
      const descriptor=manifest.projects.find(candidate=>candidate.id===projectId);
      if (!descriptor) throw new Error(`Project ${projectId} is not listed in the workspace manifest.`);
      const text=await readText(directory,descriptor.file);
      const project=JSON.parse(text);
      if (!isRecord(project) || project.id!==descriptor.id) throw new Error(`Project shard ${descriptor.file} does not match its manifest entry.`);
      const partialState={...manifest.metadata,projects:[project],calendarItems:[]};
      validateState(partialState,validate,maxSchemaVersion);
      if (index?.revision) index.revision.projectHashes[projectId]=contentHash(canonical(project));
      return project;
    }

    async function writeAttachment(directory,id,file){
      assertSafeAttachmentId(id);
      const attachments=await directory.getDirectoryHandle(ATTACHMENTS_DIRECTORY,{create:true});
      const handle=await attachments.getFileHandle(id,{create:true});
      const writable=await handle.createWritable();
      await writable.write(file);
      await writable.close();
      return handle.getFile();
    }

    async function readAttachment(directory,id){
      assertSafeAttachmentId(id);
      const attachments=await directory.getDirectoryHandle(ATTACHMENTS_DIRECTORY);
      const handle=await attachments.getFileHandle(id);
      return handle.getFile();
    }

    async function load(directory){
      const index=await loadIndex(directory);
      const manifest=index.manifest;
      const projectHashes={};
      const projects=[];
      for (const descriptor of manifest.projects){
        const project=await loadProject(directory,descriptor.id,index);
        projects.push(project);
        projectHashes[descriptor.id]=index.revision.projectHashes[descriptor.id];
      }
      const rawState={...manifest.metadata,projects,calendarItems:index.calendarItems};
      validateState(rawState,validate,maxSchemaVersion);
      const revision=makeRevision(manifest,projectHashes,index.revision.projectStats,canonical(index.calendarItems),index.revision.calendarStat);
      revision.projectSummaries=index.revision.projectSummaries;
      return {state:migrate ? migrate(rawState) : rawState,revision};
    }

    async function save(directory,state,revision=null){
      validateState(state,validate,maxSchemaVersion);
      const filesById={...(revision?.filesById||{})};
      const previousProjectHashes=revision?.projectHashes||{};
      const nextProjectHashes={};
      const nextProjectStats={};
      const nextProjects=[];
      const newFiles=new Set();
      const lazyState=Array.isArray(state.projectSummaries);
      const loadedById=new Map((state.projects||[]).map(project=>[project.id,project]));
      const projectEntries=lazyState ? state.projectSummaries : state.projects.map(summarizeProject);
      const attachmentIds=new Set();
      const addItemAttachments=item=>(item.attachments||[]).forEach(attachment=>{
        assertSafeAttachmentId(attachment.id);
        attachmentIds.add(attachment.id);
      });
      projectEntries.forEach(entry=>{
        const project=loadedById.get(entry.id);
        const items=project ? [...project.groups.flatMap(group=>group.items||[]),...(project.items||[])] : entry.itemIndex||[];
        items.forEach(addItemAttachments);
      });
      (state.calendarItems||[]).forEach(addItemAttachments);
      for (const entry of projectEntries){
        const project=loadedById.get(entry.id);
        let file=filesById[entry.id];
        let summary=entry;
        if (!project && !file) throw new Error(`New project ${entry.id} has no loaded project data.`);
        if (project){
          const text=canonical(project);
          const hash=contentHash(text);
          summary=summarizeProject(project);
          if (!file || hash!==previousProjectHashes[project.id] || canonical(summary)!==canonical(revision?.projectSummaries?.[project.id])){
            file=`projects/${makeId()}.json`;
            assertSafeShardPath(file,"project");
            nextProjectStats[project.id]=await writeText(directory,file,JSON.stringify(project,null,2));
            newFiles.add(file);
          }else{
            nextProjectStats[project.id]=revision.projectStats[project.id];
          }
          nextProjectHashes[project.id]=hash;
        }else{
          nextProjectHashes[entry.id]=previousProjectHashes[entry.id];
          nextProjectStats[entry.id]=revision.projectStats[entry.id];
        }
        nextProjects.push({id:entry.id,file,summary});
      }
      const calendarText=canonical(state.calendarItems||[]);
      let calendarFile=revision?.calendarFile;
      let calendarStat=revision?.calendarStat;
      if (!calendarFile || revision.calendarText!==calendarText){
        calendarFile=`calendar/${makeId()}.json`;
        assertSafeShardPath(calendarFile,"calendar");
        calendarStat=await writeText(directory,calendarFile,JSON.stringify(state.calendarItems||[],null,2));
      }
      const metadata={...state};
      delete metadata.projects;
      delete metadata.projectSummaries;
      delete metadata.folderLazy;
      delete metadata.calendarItems;
      const manifest={format:FORMAT,formatVersion:FORMAT_VERSION,metadata,calendarFile,projects:nextProjects,attachments:[...attachmentIds].sort()};
      const manifestText=canonical(manifest);
      if (!revision || revision.manifestText!==manifestText){
        await writeText(directory,MANIFEST_FILE,JSON.stringify(manifest,null,2));
      }
      await cleanupOrphans(directory,manifest);
      const revisionResult=makeRevision(manifest,nextProjectHashes,nextProjectStats,calendarText,calendarStat);
      revisionResult.projectSummaries=Object.fromEntries(nextProjects.map(project=>[project.id,project.summary]));
      revisionResult.wroteProjectFiles=[...newFiles];
      revisionResult.wroteCalendarFile=!revision || revision.calendarText!==calendarText;
      return revisionResult;
    }

    async function checkConflict(directory,state,revision){
      if (!revision) return {conflict:false,externalValid:true};
      try{
        const manifest=JSON.parse(await readText(directory,MANIFEST_FILE));
        if (canonical(manifest)!==revision.manifestText) return {conflict:true,externalValid:true};
        for (const project of manifest.projects){
          const stat=await readFileInfo(directory,project.file);
          if (!revision.projectStats[project.id]) return {conflict:true,externalValid:false};
          if (stat.size!==revision.projectStats[project.id].size || stat.lastModified!==revision.projectStats[project.id].lastModified) return {conflict:true,externalValid:true};
        }
        const calendarStat=await readFileInfo(directory,manifest.calendarFile);
        if (!revision.calendarStat) return {conflict:true,externalValid:false};
        if (calendarStat.size!==revision.calendarStat.size || calendarStat.lastModified!==revision.calendarStat.lastModified) return {conflict:true,externalValid:true};
        return {conflict:false,externalValid:true};
      }catch(err){ return {conflict:true,externalValid:false,error:err}; }
    }

    return Object.freeze({load,loadIndex,loadProject,save,checkConflict,clearIncomplete,writeAttachment,readAttachment,isWorkspace:async directory=>{
      try{ const manifest=JSON.parse(await readText(directory,MANIFEST_FILE)); return manifest?.format===FORMAT; }
      catch(err){ return false; }
    }});
  }

  global.BeforeworkFolderWorkspace=Object.freeze({create:createFolderWorkspace,summarizeProject,format:FORMAT,manifestFile:MANIFEST_FILE});
})(window);