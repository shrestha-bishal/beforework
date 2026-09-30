export class MilestonesView {
  constructor({cloneTemplate}){
    this.cloneTemplate=cloneTemplate;
  }

  render(project,board,{isItemCompleted,fmtDate,todayStr,createMilestone,editMilestone,deleteMilestone,openNewItem,openItem}){
    const view=this.cloneTemplate();
    const wrap=view.querySelector(".milestonesWrap");
    const grid=wrap.querySelector("[data-milestone-grid]");
    const empty=wrap.querySelector("[data-milestone-empty]");
    const cardTemplate=view.querySelector("#milestoneCardTemplate");
    const taskTemplate=view.querySelector("#milestoneTaskTemplate");
    const milestones=Array.isArray(project.milestones)?project.milestones:[];
    wrap.querySelector('[data-action="createMilestone"]').onclick=()=>createMilestone(project);
    grid.hidden=milestones.length===0;
    empty.hidden=milestones.length>0;
    milestones.forEach(milestone=>{
      const card=cardTemplate.content.cloneNode(true).querySelector(".milestoneCard");
      const linkedItems=project.groups.flatMap(group=>group.items.map(item=>({group,item})))
        .filter(entry=>entry.item.milestoneId===milestone.id&&!entry.item.archived&&entry.item.calendarType!=="event");
      const completed=linkedItems.filter(entry=>isItemCompleted(entry.item)).length;
      const percent=linkedItems.length?Math.round(completed/linkedItems.length*100):0;
      const overdue=milestone.dueDate&&milestone.dueDate<todayStr(0)&&completed<linkedItems.length;
      card.classList.toggle("overdue",!!overdue);
      card.querySelector("[data-milestone-title]").textContent=milestone.title;
      card.querySelector("[data-milestone-due]").textContent=milestone.dueDate?`Due ${fmtDate(milestone.dueDate)}`:"No due date";
      card.querySelector("[data-milestone-progress]").textContent=`${completed} of ${linkedItems.length} tasks complete`;
      card.querySelector("[data-milestone-percent]").textContent=`${percent}%`;
      card.querySelector("[data-milestone-fill]").style.width=`${percent}%`;
      const taskList=card.querySelector("[data-milestone-task-list]");
      taskList.hidden=linkedItems.length===0;
      card.querySelector("[data-milestone-no-tasks]").hidden=linkedItems.length>0;
      linkedItems.forEach(({group,item})=>{
        const task=taskTemplate.content.cloneNode(true).querySelector("li");
        const button=task.querySelector('[data-action="openMilestoneTask"]');
        button.textContent=item.title;
        button.dataset.gid=group.id;
        button.dataset.iid=item.id;
        button.classList.toggle("completed",isItemCompleted(item));
        button.onclick=()=>openItem(project.id,group.id,item.id);
        taskList.appendChild(task);
      });
      card.querySelector('[data-action="editMilestone"]').onclick=()=>editMilestone(project,milestone);
      const deleteButton=card.querySelector('[data-action="deleteMilestone"]');
      deleteButton.setAttribute("aria-label",`Delete ${milestone.title}`);
      deleteButton.onclick=()=>deleteMilestone(project,milestone);
      card.querySelector('[data-action="addMilestoneTask"]').onclick=()=>openNewItem(project,project.groups[0],milestone.id);
      grid.appendChild(card);
    });
    board.replaceChildren(view);
  }
}
