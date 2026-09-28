export class OverviewDetailsModel {
  getEntries(tone,{projects,openItems,overdueItems,completedItems,isItemCompleted,dueOf,priorityOf}){
    if (tone==="projects"){
      return projects.map(project=>{
        const items=(project.groups||[]).flatMap(group=>(group.items||[])
          .filter(item=>!item.archived)
          .map(item=>({item,group})));
        const completed=items.filter(row=>isItemCompleted(row.item)).length;
        return {kind:"project",id:project.id,title:project.name,meta:`${items.length-completed} open / ${completed} completed`};
      });
    }
    const source=tone==="open"?openItems:tone==="overdue"?overdueItems:completedItems;
    const entries=source.map(row=>{
      const due=dueOf(row);
      const priority=priorityOf(row);
      const meta=[row.project.name,row.group.name,
        due?`Due ${new Date(`${due}T00:00:00`).toLocaleDateString()}`:"",
        priority?`${priority[0].toUpperCase()}${priority.slice(1)} priority`:""]
        .filter(Boolean).join(" / ");
      return {kind:"item",id:row.item.id,projectId:row.project.id,groupId:row.group.id,
        title:row.item.title||"Untitled item",meta,due};
    });
    if (tone==="overdue") entries.sort((first,second)=>first.due.localeCompare(second.due));
    return entries;
  }
}
