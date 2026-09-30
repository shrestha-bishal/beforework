"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source=fs.readFileSync(path.join(__dirname,"../js/folder-workspace.js"),"utf8");
const sandbox={window:{crypto:{randomUUID:(()=>{let id=0;return ()=>`shard-${++id}`;})()}}};
vm.runInNewContext(source,sandbox,{filename:"folder-workspace.js"});

function createMemoryDirectory(name="Workspace"){
  const files=new Map();
  const directories=new Map();
  const writeLog=[];
  const readLog=[];
  let modifiedAt=0;
  function makeDirectory(directoryName){
    return {
      kind:"directory",
      name:directoryName,
      async getDirectoryHandle(childName,{create=false}={}){
        if (!directories.has(childName)){
          if (!create) throw new Error(`Missing directory ${childName}`);
          directories.set(childName,makeDirectory(childName));
        }
        return directories.get(childName);
      },
      async getFileHandle(fileName,{create=false}={}){
        const key=`${directoryName}/${fileName}`;
        if (!files.has(key)){
          if (!create) throw new Error(`Missing file ${key}`);
          files.set(key,{kind:"file",text:"",writes:0,lastModified:0});
        }
        const entry=files.get(key);
        return {
          kind:"file",
          name:fileName,
          async getFile(){return {size:entry.text.length,lastModified:entry.lastModified,text:async()=>{readLog.push(key);return entry.text;}};},
          async createWritable(){
            let nextText="";
            return {write:async text=>{nextText=String(text);},close:async()=>{entry.text=nextText;entry.writes++;entry.lastModified=++modifiedAt;writeLog.push(key);}};
          }
        };
      },
      async removeEntry(fileName){files.delete(`${directoryName}/${fileName}`);},
      async *entries(){
        const prefix=`${directoryName}/`;
        for (const [key,value] of files){if (key.startsWith(prefix) && !key.slice(prefix.length).includes("/")) yield [key.slice(prefix.length),value];}
      },
      files,
      writeLog,
      readLog
    };
  }
  return makeDirectory(name);
}

function createWorkspaceModule(){
  let nextId=0;
  return sandbox.window.BeforeworkFolderWorkspace.create({
    validate:state=>({valid:Array.isArray(state.projects)&&Array.isArray(state.calendarItems),errors:["projects and calendarItems must be arrays"]}),
    maxSchemaVersion:7,
    migrate:state=>state,
    makeId:()=>`test-${++nextId}`
  });
}

function stateWithTwoProjects(){
  return {
    schemaVersion:7,
    folders:[],
    calendarItems:[],
    focusSessions:[],
    googleCalendarLinks:[],
    projects:[
      {id:"project-a",name:"Alpha",description:"Release planning",groups:[]},
      {id:"project-b",name:"Beta",description:null,groups:[]}
    ]
  };
}

test("creates a manifest and round-trips project and calendar shards",async()=>{
  const workspace=createWorkspaceModule();
  const directory=createMemoryDirectory();
  const state=stateWithTwoProjects();
  state.calendarItems.push({id:"event-1",title:"Release"});

  const revision=await workspace.save(directory,state);
  const loaded=await workspace.load(directory);
  const manifest=JSON.parse(await (await directory.getFileHandle("manifest.json")).getFile().then(file=>file.text()));

  assert.equal(manifest.format,"beforework-folder-workspace");
  assert.equal(manifest.projects.length,2);
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.state)),state);
  assert.equal(revision.projectSummaries["project-a"].description,"Release planning");
  assert.equal(revision.projectSummaries["project-b"].description,null);
  assert.equal(revision.wroteProjectFiles.length,2);
  assert.equal(revision.wroteCalendarFile,true);
  assert.match(directory.writeLog.at(-1),/manifest\.json$/);
});

test("stores multiple attachment files and cleans up unreferenced files",async()=>{
  const workspace=createWorkspaceModule();
  const directory=createMemoryDirectory();
  const state=stateWithTwoProjects();
  const attachments=[
    {id:"attachment-one",name:"brief.txt",size:5,type:"text/plain"},
    {id:"attachment-two",name:"notes.txt",size:5,type:"text/plain"}
  ];
  const calendarAttachment={id:"calendar-attachment",name:"invite.ics",size:5,type:"text/calendar"};
  state.projects[0].groups.push({id:"group-a",name:"Tasks",items:[{id:"item-a",title:"Prepare release",attachments}]});
  state.calendarItems.push({id:"event-a",title:"Launch",attachments:[calendarAttachment]});
  for (const attachment of [...attachments,calendarAttachment]) await workspace.writeAttachment(directory,attachment.id,`data-${attachment.id}`);

  const revision=await workspace.save(directory,state);
  const manifest=JSON.parse(await (await directory.getFileHandle("manifest.json")).getFile().then(file=>file.text()));
  const loaded=await workspace.load(directory);
  const savedAttachment=await workspace.readAttachment(directory,attachments[0].id);

  assert.deepEqual(manifest.attachments,["attachment-one","attachment-two","calendar-attachment"]);
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.state.projects[0].groups[0].items[0].attachments)),attachments);
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.state.calendarItems[0].attachments)),[calendarAttachment]);
  assert.equal(await savedAttachment.text(),"data-attachment-one");

  loaded.state.projects[0].groups[0].items[0].attachments.pop();
  await workspace.save(directory,loaded.state,loaded.revision);

  assert.equal(directory.files.has("attachments/attachment-one"),true);
  assert.equal(directory.files.has("attachments/attachment-two"),false);
  assert.equal(directory.files.has("attachments/calendar-attachment"),true);
  assert.equal(revision.manifest.attachments.length,3);
});

test("retains attachment refs when saving a hydrated lazy project",async()=>{
  const workspace=createWorkspaceModule();
  const directory=createMemoryDirectory();
  const state=stateWithTwoProjects();
  state.projects[0].groups.push({id:"group-a",name:"Tasks",items:[{id:"item-a",title:"Prepare release",attachments:[{id:"attachment-old",name:"old.txt",size:3,type:"text/plain"}]}]});
  await workspace.writeAttachment(directory,"attachment-old","old");
  const revision=await workspace.save(directory,state);
  const index=await workspace.loadIndex(directory);
  const project=await workspace.loadProject(directory,"project-a",index);
  const newAttachment={id:"attachment-new",name:"new.txt",size:3,type:"text/plain"};
  await workspace.writeAttachment(directory,newAttachment.id,"new");
  project.groups[0].items[0].attachments.push(newAttachment);
  const lazyState={...index.metadata,projects:[project],projectSummaries:index.projects,calendarItems:index.calendarItems,folderLazy:true};

  const nextRevision=await workspace.save(directory,lazyState,index.revision);

  assert.deepEqual(JSON.parse(JSON.stringify(nextRevision.manifest.attachments)),["attachment-new","attachment-old"]);
  assert.equal(directory.files.has("attachments/attachment-old"),true);
  assert.equal(directory.files.has("attachments/attachment-new"),true);
  assert.equal(revision.manifest.attachments.length,1);
});

test("writes only a changed project shard and commits the manifest last",async()=>{
  const workspace=createWorkspaceModule();
  const directory=createMemoryDirectory();
  const original=stateWithTwoProjects();
  const firstRevision=await workspace.save(directory,original);
  const firstManifest=JSON.parse(await (await directory.getFileHandle("manifest.json")).getFile().then(file=>file.text()));
  const projectBPath=firstManifest.projects.find(project=>project.id==="project-b").file;
  const projectAPath=firstManifest.projects.find(project=>project.id==="project-a").file;
  const projectBWrites=directory.files.get(`projects/${projectBPath.split("/")[1]}`).writes;
  const notes=await (await directory.getDirectoryHandle("projects")).getFileHandle("notes.txt",{create:true});
  const notesWritable=await notes.createWritable();
  await notesWritable.write("keep this file");
  await notesWritable.close();
  const changed=structuredClone(original);
  changed.projects[0].name="Alpha updated";

  const nextRevision=await workspace.save(directory,changed,firstRevision);
  const nextManifest=JSON.parse(await (await directory.getFileHandle("manifest.json")).getFile().then(file=>file.text()));

  assert.equal(nextRevision.wroteProjectFiles.length,1);
  assert.equal(directory.files.get(`projects/${nextManifest.projects.find(project=>project.id==="project-b").file.split("/")[1]}`).writes,projectBWrites);
  assert.notEqual(nextManifest.projects.find(project=>project.id==="project-a").file,firstManifest.projects.find(project=>project.id==="project-a").file);
  assert.equal(directory.files.has(projectAPath),false);
  assert.equal(directory.files.get("projects/notes.txt").text,"keep this file");
});

test("detects an external edit to a locally changed project shard",async()=>{
  const workspace=createWorkspaceModule();
  const directory=createMemoryDirectory();
  const original=stateWithTwoProjects();
  const revision=await workspace.save(directory,original);
  const local=structuredClone(original);
  local.projects[0].name="Local version";
  const descriptor=JSON.parse(await (await directory.getFileHandle("manifest.json")).getFile().then(file=>file.text())).projects[0];
  const projectHandle=await (await directory.getDirectoryHandle("projects")).getFileHandle(descriptor.file.split("/")[1]);
  const writable=await projectHandle.createWritable();
  await writable.write(JSON.stringify({...original.projects[0],name:"External version"}));
  await writable.close();

  const conflict=await workspace.checkConflict(directory,local,revision);
  assert.equal(conflict.conflict,true);
  assert.equal(conflict.externalValid,true);
});

test("rejects manifest paths that escape the reserved shard folders",async()=>{
  const workspace=createWorkspaceModule();
  const directory=createMemoryDirectory();
  const handle=await directory.getFileHandle("manifest.json",{create:true});
  const writable=await handle.createWritable();
  await writable.write(JSON.stringify({
    format:"beforework-folder-workspace",
    formatVersion:1,
    metadata:{schemaVersion:7},
    calendarFile:"../calendar.json",
    projects:[]
  }));
  await writable.close();

  await assert.rejects(workspace.load(directory),/unsafe shard path/);
});

test("treats a missing referenced shard as an external conflict",async()=>{
  const workspace=createWorkspaceModule();
  const directory=createMemoryDirectory();
  const state=stateWithTwoProjects();
  const revision=await workspace.save(directory,state);
  const manifest=JSON.parse(await (await directory.getFileHandle("manifest.json")).getFile().then(file=>file.text()));
  const missingPath=manifest.projects[0].file;
  directory.files.delete(missingPath);
  const changed=structuredClone(state);
  changed.projects[1].name="Local edit";

  const conflict=await workspace.checkConflict(directory,changed,revision);

  assert.equal(conflict.conflict,true);
  assert.equal(conflict.externalValid,false);
});

test("loads the manifest index without reading project shards, then loads one project on demand",async()=>{
  const workspace=createWorkspaceModule();
  const directory=createMemoryDirectory();
  await workspace.save(directory,stateWithTwoProjects());
  directory.readLog.length=0;

  const index=await workspace.loadIndex(directory);

  assert.equal(index.projects.map(project=>project.name).join(","),"Alpha,Beta");
  assert.equal(directory.readLog[0],"Workspace/manifest.json");
  assert.equal(directory.readLog.some(path=>path.startsWith("projects/")),false);
  const project=await workspace.loadProject(directory,"project-b",index);
  assert.equal(project.name,"Beta");
  assert.equal(directory.readLog.filter(path=>path.startsWith("projects/")).join(","),"projects/test-2.json");
});

test("keeps lazy revisions compact while projects are hydrated on demand",async()=>{
  const workspace=createWorkspaceModule();
  const directory=createMemoryDirectory();
  const state=stateWithTwoProjects();
  state.projects[0].privatePayload="x".repeat(10000);
  state.projects[1].privatePayload="y".repeat(10000);
  await workspace.save(directory,state);
  const index=await workspace.loadIndex(directory);

  const first=await workspace.loadProject(directory,"project-a",index);
  const second=await workspace.loadProject(directory,"project-b",index);

  assert.equal(first.privatePayload.length,10000);
  assert.equal(second.privatePayload.length,10000);
  assert.equal(index.revision.projectStats["project-a"].size>0,true);
  assert.equal(index.revision.projectStats["project-b"].size>0,true);
  assert.equal(index.revision.projectHashes["project-a"].length<32,true);
  assert.equal(index.revision.projectHashes["project-b"].length<32,true);
  assert.equal(JSON.stringify(index.revision).includes("privatePayload"),false);
});

test("derives missing summaries from pre-index manifests without rejecting the workspace",async()=>{
  const workspace=createWorkspaceModule();
  const directory=createMemoryDirectory();
  await workspace.save(directory,stateWithTwoProjects());
  const manifestHandle=await directory.getFileHandle("manifest.json");
  const manifest=JSON.parse(await (await manifestHandle.getFile()).text());
  manifest.projects.forEach(project=>delete project.summary);
  const writable=await manifestHandle.createWritable();
  await writable.write(JSON.stringify(manifest));
  await writable.close();
  directory.readLog.length=0;

  const index=await workspace.loadIndex(directory);

  assert.equal(index.needsSummaryUpgrade,true);
  assert.equal(index.projects.map(project=>project.name).join(","),"Alpha,Beta");
  assert.equal(directory.readLog.filter(path=>path.startsWith("projects/")).length,2);
});