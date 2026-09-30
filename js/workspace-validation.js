(function(global){
  "use strict";

  function isRecord(value){
    return value!==null && typeof value==="object" && !Array.isArray(value);
  }
  function hasText(value){
    return typeof value==="string" && value.trim().length>0;
  }
  function isDate(value){
    if (typeof value!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date=new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10)===value;
  }
  function validateWorkspaceData(data,maxSchemaVersion){
    const errors=[];
    const addError=message=>{ if (errors.length<30) errors.push(message); };
    const validateNamedRecord=(value,path)=>{
      if (!isRecord(value)){ addError(`${path} must be an object.`); return false; }
      if (!hasText(value.id)) addError(`${path}.id must be a non-empty string.`);
      if (!hasText(value.name)) addError(`${path}.name must be a non-empty string.`);
      return true;
    };
    const validateItems=(items,path,milestoneIds)=>{
      if (!Array.isArray(items)) return;
      items.forEach((item,index)=>{
        const itemPath=`${path}[${index}]`;
        if (!isRecord(item)){ addError(`${itemPath} must be an object.`); return; }
        if (!hasText(item.id)) addError(`${itemPath}.id must be a non-empty string.`);
        if (!hasText(item.title)) addError(`${itemPath}.title must be a non-empty string.`);
        if (item.milestoneId!==undefined && item.milestoneId!==null && (typeof item.milestoneId!=="string" || (milestoneIds && !milestoneIds.has(item.milestoneId)))){
          addError(`${itemPath}.milestoneId must reference a milestone in its project.`);
        }
        for (const key of ["tagIds","subitems","comments","activity"]){
          if (item[key]!==undefined && !Array.isArray(item[key])) addError(`${itemPath}.${key} must be an array.`);
        }
        if (item.attachments!==undefined && !Array.isArray(item.attachments)) addError(`${itemPath}.attachments must be an array.`);
        (Array.isArray(item.attachments) ? item.attachments : []).forEach((attachment,attachmentIndex)=>{
          const attachmentPath=`${itemPath}.attachments[${attachmentIndex}]`;
          if (!isRecord(attachment) || !hasText(attachment.id) || !hasText(attachment.name) || !Number.isSafeInteger(attachment.size) || attachment.size<0 || typeof attachment.type!=="string"){
            addError(`${attachmentPath} must have an id, name, non-negative integer size, and type.`);
          }
        });
        if (item.values!==undefined && !isRecord(item.values)) addError(`${itemPath}.values must be an object.`);
        (Array.isArray(item.subitems) ? item.subitems : []).forEach((subitem,subIndex)=>{
          if (!isRecord(subitem) || !hasText(subitem.title)) addError(`${itemPath}.subitems[${subIndex}] must have a title.`);
        });
      });
    };

    if (!isRecord(data)) return {valid:false,errors:["Workspace data must be a JSON object."]};
    if (!Array.isArray(data.projects)) addError("projects must be an array.");
    if (data.schemaVersion!==undefined && (!Number.isInteger(data.schemaVersion) || data.schemaVersion<0)){
      addError("schemaVersion must be a non-negative integer.");
    } else if (Number.isInteger(maxSchemaVersion) && Number.isInteger(data.schemaVersion) && data.schemaVersion>maxSchemaVersion){
      addError(`This file uses schema version ${data.schemaVersion}, newer than the supported version ${maxSchemaVersion}.`);
    }
    for (const key of ["folders","calendarItems","focusSessions","googleDeletedEventIds","googleCalendarLinks","googleCalendarCatalog"]){
      if (data[key]!==undefined && !Array.isArray(data[key])) addError(`${key} must be an array.`);
    }
    if (data.googleCalendarSyncTokens!==undefined && !isRecord(data.googleCalendarSyncTokens)){
      addError("googleCalendarSyncTokens must be an object.");
    }
    if (data.projects!==undefined && !Array.isArray(data.projects)) return {valid:false,errors};

    (data.projects||[]).forEach((project,index)=>{
      const projectPath=`projects[${index}]`;
      if (!validateNamedRecord(project,projectPath,"project")) return;
      if (project.description!==undefined && project.description!==null && typeof project.description!=="string"){
        addError(`${projectPath}.description must be a string or null.`);
      }
      for (const key of ["groups","fields","tags","views","milestones"]){
        if (project[key]!==undefined && !Array.isArray(project[key])) addError(`${projectPath}.${key} must be an array.`);
      }
      const milestones=Array.isArray(project.milestones)?project.milestones:[];
      const milestoneIds=new Set();
      milestones.forEach((milestone,milestoneIndex)=>{
        const path=`${projectPath}.milestones[${milestoneIndex}]`;
        if (!isRecord(milestone)){ addError(`${path} must be an object.`); return; }
        if (!hasText(milestone.id) || !hasText(milestone.title)) addError(`${path} must have an id and title.`);
        if (milestone.dueDate!==undefined && milestone.dueDate!==null && !isDate(milestone.dueDate)){
          addError(`${path}.dueDate must be a valid date string or null.`);
        }
        if (hasText(milestone.id)) milestoneIds.add(milestone.id);
      });
      (Array.isArray(project.fields) ? project.fields : []).forEach((field,fieldIndex)=>{
        const path=`${projectPath}.fields[${fieldIndex}]`;
        if (!isRecord(field)){ addError(`${path} must be an object.`); return; }
        if (!hasText(field.id) || !hasText(field.label)) addError(`${path} must have an id and label.`);
        if (field.options!==undefined && !Array.isArray(field.options)) addError(`${path}.options must be an array.`);
        (Array.isArray(field.options) ? field.options : []).forEach((option,optionIndex)=>{
          if (!isRecord(option) || !hasText(option.id) || !hasText(option.label)) addError(`${path}.options[${optionIndex}] must have an id and label.`);
        });
      });
      (Array.isArray(project.tags) ? project.tags : []).forEach((tag,tagIndex)=>validateNamedRecord(tag,`${projectPath}.tags[${tagIndex}]`));
      (Array.isArray(project.views) ? project.views : []).forEach((view,viewIndex)=>{
        const path=`${projectPath}.views[${viewIndex}]`;
        if (!isRecord(view) || !hasText(view.id) || !hasText(view.type) || !hasText(view.name)) addError(`${path} must have an id, type, and name.`);
      });
      (Array.isArray(project.groups) ? project.groups : []).forEach((group,groupIndex)=>{
        const groupPath=`${projectPath}.groups[${groupIndex}]`;
        if (!validateNamedRecord(group,groupPath)) return;
        if (group.items!==undefined && !Array.isArray(group.items)) addError(`${groupPath}.items must be an array.`);
        validateItems(group.items,`${groupPath}.items`,milestoneIds);
      });
    });
    validateItems(data.calendarItems,"calendarItems");
    (Array.isArray(data.folders) ? data.folders : []).forEach((folder,index)=>validateNamedRecord(folder,`folders[${index}]`));
    return {valid:errors.length===0,errors};
  }

  global.BeforeworkWorkspaceValidation=Object.freeze({validate:validateWorkspaceData});
})(window);