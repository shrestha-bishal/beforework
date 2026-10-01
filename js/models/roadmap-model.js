(function(global){
  "use strict";

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

    const hasLoadedItems=Array.isArray(project.groups)&&project.groups.some(group=>Array.isArray(group.items));
    const groups=hasLoadedItems
      ? project.groups
      : (project.itemIndex||[]).reduce((result,item)=>{
        let group=result.find(candidate=>candidate.id===item.groupId);
        if (!group){ group={id:item.groupId,name:item.groupName,items:[]}; result.push(group); }
        group.items.push(item);
        return result;
      },[]);
    const dateFields=(project.fields||[]).filter(field=>field.type==="date");
    groups.forEach(group=>(group.items||[]).forEach(item=>{
      if (item.archived || item.calendarType==="event") return;
      dateFields.forEach(field=>{
        const date=item.values?.[field.id];
        if (typeof date!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
        rows.push({
          id:`task:${project.id}:${item.id}:${field.id}`,
          projectId:project.id,
          projectName,
          groupName:group.name,
          itemId:item.id,
          groupId:group.id,
          title:item.title,
          description:item.description||"",
          date,
          fieldLabel:field.label,
          kind:"task",
          completed:Number.isFinite(item.completedAt) && item.completedAt>0
        });
      });
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
