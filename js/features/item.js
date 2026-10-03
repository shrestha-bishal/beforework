(function(global){
  "use strict";

  const UNGROUPED_GROUP_ID="__project_items__";

  function create({
    uid,getProject,tagColorOptions,selectedItemIds,boardFilterTags,
    hasTagsField,queueGoogleEventDeletes,showConfirm,showDialog,
    scheduleSave,render,renderAll,renderProjectList
  }){
    function recordItemActivity(item,type,details={}){
      if (!item) return;
      if (!Array.isArray(item.activity)) item.activity=[];
      item.activity.push({id:uid(),type,at:Date.now(),...details});
    }

    function projectGroups(project){
      if (!project) return [];
      let groups=Array.isArray(project.groups)?project.groups:[];
      const hasLoadedGroups=groups.some(group=>Array.isArray(group.items));
      if (Array.isArray(project.itemIndex)&&!hasLoadedGroups){
        groups=groups.map(group=>({...group,items:[]}));
        project.itemIndex.forEach(item=>{
          let group=groups.find(candidate=>candidate.id===item.groupId);
          if (!group){
            group={id:UNGROUPED_GROUP_ID,name:"Unassigned",items:[],virtual:true};
            groups.push(group);
          }
          group.items.push(item);
        });
      }
      const items=Array.isArray(project.items)?project.items:[];
      return groups.length||items.length
        ?(items.length?[...groups,{id:UNGROUPED_GROUP_ID,name:"Unassigned",items,virtual:true}]:groups)
        :[{id:UNGROUPED_GROUP_ID,name:"Unassigned",items,virtual:true}];
    }

    function projectItemEntries(project){
      return projectGroups(project).flatMap(group=>(group.items||[]).map(item=>({item,group})));
    }

    function appendProjectItem(project,groupId,item){
      if (!project) throw new Error("The destination project could not be found.");
      if (groupId===UNGROUPED_GROUP_ID){
        if (!Array.isArray(project.items)) project.items=[];
        project.items.push(item);
        return;
      }
      const group=(project.groups||[]).find(candidate=>candidate.id===groupId);
      if (!group) throw new Error("The destination group could not be found.");
      if (!Array.isArray(group.items)) group.items=[];
      group.items.push(item);
    }

    function getGroup(pid,gid){
      return projectGroups(getProject(pid)).find(group=>group.id===gid);
    }

    function getItem(pid,gid,iid){
      return getGroup(pid,gid)?.items.find(item=>item.id===iid);
    }

    function isItemCompleted(item){
      return !!item&&item.calendarType!=="event"&&Number.isFinite(item.completedAt)&&item.completedAt>0;
    }

    function createItem(pid,title){
      const project=getProject(pid);
      const now=Date.now();
      const item={
        id:uid(),title,description:"",attachments:[],
        calendarType:(project&&project.itemDefaultType==="event")?"event":"task",
        startTime:"",endTime:"",location:"",endDate:"",completedAt:null,milestoneId:null,
        tagIds:[],values:{},subitems:[],comments:[],activity:[],archived:false,
        createdAt:now,updatedAt:now
      };
      recordItemActivity(item,"created");
      return item;
    }

    function createDraft(project,milestoneId=null,fieldAssignment=null){
      const now=Date.now();
      return {
        id:uid(),title:"",description:"",attachments:[],
        calendarType:project.itemDefaultType==="event"?"event":"task",
        startTime:"",endTime:"",location:"",endDate:"",completedAt:null,milestoneId,tagIds:[],
        values:fieldAssignment?{[fieldAssignment.fieldId]:fieldAssignment.value}:{},
        subitems:[],comments:[],activity:[],archived:false,createdAt:now,updatedAt:now
      };
    }

    function addItem(pid,gid,title){
      const item=createItem(pid,title);
      appendProjectItem(getProject(pid),gid,item);
      scheduleSave();
      render();
      return item;
    }

    function setItemFieldValue(pid,gid,iid,fieldId,value){
      const project=getProject(pid);
      const item=getItem(pid,gid,iid);
      const field=project?.fields?.find(candidate=>candidate.id===fieldId&&candidate.type==="select");
      if (!item||!field) return;
      const nextValue=field.options?.some(option=>option.id===value)?value:"";
      const previousValue=item.values?.[fieldId]||"";
      if (previousValue===nextValue) return;
      item.values=item.values||{};
      item.values[fieldId]=nextValue;
      item.updatedAt=Date.now();
      const optionLabel=id=>field.options?.find(option=>option.id===id)?.label||"No value";
      recordItemActivity(item,"moved",{from:optionLabel(previousValue),to:optionLabel(nextValue)});
      scheduleSave();
      render();
    }

    function removeItemRelations(project,itemIds){
      if (!project||!itemIds.length) return;
      const removed=new Set(itemIds);
      const now=Date.now();
      projectGroups(project).forEach(group=>group.items.forEach(item=>{
        (project.fields||[]).filter(field=>field.type==="relation").forEach(field=>{
          const linked=item.values?.[field.id];
          if (!Array.isArray(linked)) return;
          const next=linked.filter(id=>!removed.has(id));
          if (next.length!==linked.length){
            item.values[field.id]=next;
            item.updatedAt=now;
          }
        });
      }));
    }

    function deleteItem(pid,gid,iid){
      const project=getProject(pid);
      const group=getGroup(pid,gid);
      if (!group) return;
      const itemIndex=group.items.findIndex(item=>item.id===iid);
      if (itemIndex<0) return;
      queueGoogleEventDeletes(group.items[itemIndex]);
      group.items.splice(itemIndex,1);
      removeItemRelations(project,[iid]);
      scheduleSave();
      render();
    }

    function makeDuplicateItem(source){
      const now=Date.now();
      const copy={
        ...source,
        id:uid(),
        title:`${source.title} (copy)`,
        tagIds:[...(source.tagIds||[])],
        attachments:(source.attachments||[]).map(attachment=>({...attachment})),
        values:{...(source.values||{})},
        subitems:(source.subitems||[]).map(subitem=>({...subitem,id:uid(),done:false})),
        comments:[],activity:[],archived:false,completedAt:null,createdAt:now,updatedAt:now
      };
      recordItemActivity(copy,"created");
      delete copy.googleEventIds;
      delete copy.googleSyncMeta;
      return copy;
    }

    function duplicateItem(pid,gid,iid){
      const group=getGroup(pid,gid);
      const index=group?.items.findIndex(item=>item.id===iid)??-1;
      if (index<0) return null;
      const copy=makeDuplicateItem(group.items[index]);
      group.items.splice(index+1,0,copy);
      scheduleSave();
      render();
      return copy;
    }

    function toggleArchiveItem(pid,gid,iid){
      const item=getItem(pid,gid,iid);
      if (!item) return;
      item.archived=!item.archived;
      item.updatedAt=Date.now();
      scheduleSave();
      render();
      renderProjectList();
    }

    function addComment(pid,gid,iid,text){
      const item=getItem(pid,gid,iid);
      if (!item||!text.trim()) return;
      item.comments.push({id:uid(),text:text.trim(),createdAt:Date.now()});
      recordItemActivity(item,"commented");
      item.updatedAt=Date.now();
      scheduleSave();
      render();
    }

    function deleteComment(pid,gid,iid,cid){
      const item=getItem(pid,gid,iid);
      if (!item) return;
      item.comments=item.comments.filter(comment=>comment.id!==cid);
      item.updatedAt=Date.now();
      scheduleSave();
      render();
    }

    function bulkSetCompleted(project,completed){
      if (!selectedItemIds.size) return;
      const now=Date.now();
      projectGroups(project).forEach(group=>group.items.forEach(item=>{
        if (!selectedItemIds.has(item.id)) return;
        const wasCompleted=isItemCompleted(item);
        item.completedAt=completed?(wasCompleted?item.completedAt||now:now):null;
        item.updatedAt=now;
        recordItemActivity(item,completed?"completed":"reopened");
      }));
      selectedItemIds.clear();
      scheduleSave();
      renderAll();
    }

    async function bulkDelete(project){
      if (!selectedItemIds.size) return;
      if (!await showConfirm("Delete selected items",`Delete ${selectedItemIds.size} selected item(s)?`,true)) return;
      projectGroups(project).forEach(group=>{
        group.items.forEach(item=>{if(selectedItemIds.has(item.id))queueGoogleEventDeletes(item);});
        for(let index=group.items.length-1;index>=0;index--){
          if(selectedItemIds.has(group.items[index].id))group.items.splice(index,1);
        }
      });
      removeItemRelations(project,[...selectedItemIds]);
      selectedItemIds.clear();
      scheduleSave();
      render();
      renderProjectList();
    }

    async function bulkMove(project){
      if (!selectedItemIds.size) return;
      const groups=projectGroups(project);
      const choice=await showDialog({
        title:"Move selected items",
        message:"Choose a destination group.",
        fields:[{label:"Destination",type:"select",options:groups.map(group=>({value:group.id,label:group.name})),value:groups[0]?.id}],
        confirmLabel:"Move"
      });
      const target=groups.find(group=>group.id===choice);
      if (!target) return;
      const now=Date.now();
      groups.forEach(group=>{
        const moving=group.items.filter(item=>selectedItemIds.has(item.id));
        for(let index=group.items.length-1;index>=0;index--){
          if(selectedItemIds.has(group.items[index].id))group.items.splice(index,1);
        }
        moving.forEach(item=>{
          item.updatedAt=now;
          if(group.id!==target.id)recordItemActivity(item,"moved",{from:group.name,to:target.name});
          target.items.push(item);
        });
      });
      selectedItemIds.clear();
      scheduleSave();
      render();
    }

    function createTag(project,name,color){
      const tag={
        id:uid(),name,
        color:color||tagColorOptions[project.tags.length%tagColorOptions.length].value
      };
      project.tags.push(tag);
      scheduleSave();
      return tag;
    }

    async function bulkTag(project){
      if (!hasTagsField(project)||!selectedItemIds.size) return;
      const name=await showDialog({
        title:"Tag selected items",
        message:`Add a tag to ${selectedItemIds.size} selected item(s).`,
        fields:[{label:"Tag name",value:project.tags[0]?.name||"",placeholder:"e.g. urgent"}],
        confirmLabel:"Apply tag"
      });
      if (!name||!name.trim()) return;
      let tag=project.tags.find(candidate=>candidate.name.toLowerCase()===name.trim().toLowerCase());
      if (!tag){
        const color=await showDialog({
          title:`Pill color for ${name.trim()}`,
          fields:[{label:"Pill color",type:"tagColor",value:tagColorOptions[project.tags.length%tagColorOptions.length].value}],
          confirmLabel:"Create tag"
        });
        if (!color) return;
        tag=createTag(project,name.trim(),color);
      }
      projectGroups(project).forEach(group=>group.items.forEach(item=>{
        if(selectedItemIds.has(item.id)&&!item.tagIds.includes(tag.id)){
          item.tagIds.push(tag.id);
          item.updatedAt=Date.now();
        }
      }));
      selectedItemIds.clear();
      scheduleSave();
      renderAll();
    }

    function bulkDuplicate(project){
      if (!selectedItemIds.size) return;
      const selected=new Set(selectedItemIds);
      projectGroups(project).forEach(group=>{
        const items=[];
        group.items.forEach(item=>{
          items.push(item);
          if(selected.has(item.id))items.push(makeDuplicateItem(item));
        });
        group.items.splice(0,group.items.length,...items);
      });
      selectedItemIds.clear();
      scheduleSave();
      render();
      renderProjectList();
    }

    function moveItem(pid,fromGid,toGid,iid,toIndex){
      const from=getGroup(pid,fromGid);
      if (!from) return;
      const index=from.items.findIndex(item=>item.id===iid);
      if (index<0) return;
      const [item]=from.items.splice(index,1);
      const to=getGroup(pid,toGid);
      if (!to){
        from.items.splice(index,0,item);
        return;
      }
      if(toIndex==null||toIndex>to.items.length)to.items.push(item);
      else to.items.splice(toIndex,0,item);
      item.updatedAt=Date.now();
      if(fromGid!==toGid)recordItemActivity(item,"moved",{from:from.name,to:to.name});
      scheduleSave();
      render();
    }

    function deleteTag(project,tagId){
      project.tags=project.tags.filter(tag=>tag.id!==tagId);
      projectGroups(project).forEach(group=>group.items.forEach(item=>{
        item.tagIds=item.tagIds.filter(id=>id!==tagId);
      }));
      boardFilterTags.delete(tagId);
      scheduleSave();
      renderAll();
    }

    return Object.freeze({
      UNGROUPED_GROUP_ID,recordItemActivity,projectGroups,projectItemEntries,appendProjectItem,
      getGroup,getItem,isItemCompleted,createItem,createDraft,addItem,setItemFieldValue,
      removeItemRelations,deleteItem,makeDuplicateItem,duplicateItem,toggleArchiveItem,
      addComment,deleteComment,bulkSetCompleted,bulkDelete,bulkMove,createTag,bulkTag,
      bulkDuplicate,moveItem,deleteTag
    });
  }

  global.BeforeworkItemFeature=Object.freeze({create});
})(window);
