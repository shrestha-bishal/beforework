(function(global){
  "use strict";

  function isDate(value){
    if (typeof value!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date=new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10)===value;
  }

  function rowsForProject(project){
    if (!project) return [];
    const rows=[];
    const projectName=project.name||"Project";
    (project.milestones||[]).forEach(milestone=>{
      if (!milestone.dueDate) return;
      rows.push({
        id:`milestone:${project.id}:${milestone.id}`,
        projectId:project.id,
        projectName,
        milestoneId:milestone.id,
        title:milestone.title,
        date:milestone.dueDate,
        kind:"milestone",
        completed:false
      });
    });

    const hasLoadedItems=Array.isArray(project.groups)
      && (project.groups.some(group=>Array.isArray(group.items)) || Array.isArray(project.items));
    const groups=hasLoadedItems
      ? [...project.groups,...((project.items||[]).length||!project.groups.length
        ? [{id:"__project_items__",name:"Unassigned",items:project.items||[]}]
        : [])]
      : (project.itemIndex||[]).reduce((result,item)=>{
        let group=result.find(candidate=>candidate.id===item.groupId);
        if (!group){ group={id:item.groupId||"__project_items__",name:item.groupName||"Unassigned",items:[]}; result.push(group); }
        group.items.push(item);
        return result;
      },[]);
    const startField=(project.fields||[]).find(field=>field.type==="start-date")
      || (project.fields||[]).find(field=>field.type==="date"&&/^(start|start date|starts on)$/.test(String(field.label||"").trim().toLowerCase()));
    const dueField=(project.fields||[]).find(field=>field.type==="due-date")
      || (project.fields||[]).find(field=>field.type==="date"&&/^(due|due date|deadline)$/.test(String(field.label||"").trim().toLowerCase()));
    groups.forEach(group=>(group.items||[]).forEach(item=>{
      if (item.archived || item.calendarType==="event") return;
      const startDate=startField&&isDate(item.values?.[startField.id])
        ? item.values[startField.id]
        : (!startField&&isDate(item.startDate)?item.startDate:"");
      const dueDate=dueField&&isDate(item.values?.[dueField.id])?item.values[dueField.id]:"";
      const validStartDate=startDate&&dueDate&&startDate>dueDate?"":startDate;
      const date=dueDate||validStartDate;
      if (date){
        rows.push({
          id:`task:${project.id}:${item.id}:${dueField?.id||startField?.id||"date"}`,
          projectId:project.id,
          projectName,
          groupName:group.name,
          itemId:item.id,
          groupId:group.id,
          title:item.title,
          description:item.description||"",
          startDate:validStartDate,
          date,
          fieldLabel:dueDate?dueField.label:"Start date",
          kind:"task",
          completed:Number.isFinite(item.completedAt) && item.completedAt>0
        });
      }
    }));
    return rows.sort((first,second)=>first.date.localeCompare(second.date)||first.title.localeCompare(second.title));
  }

  function rowsForWorkspace(projects){
    return projects.flatMap(rowsForProject).sort((first,second)=>
      first.date.localeCompare(second.date)
      || first.projectName.localeCompare(second.projectName)
      || first.title.localeCompare(second.title));
  }

  global.BeforeworkRoadmapModel=Object.freeze({rowsForProject,rowsForWorkspace});
})(window);
