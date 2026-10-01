function appendMarkup(parent,markup){
  const template=document.createElement("template");
  template.innerHTML=markup;
  parent.append(template.content.cloneNode(true));
}

export class BoardView {
  constructor({cloneTemplate,...dependencies}){
    this.cloneTemplate=cloneTemplate;
    this.dependencies=dependencies;
  }

  render(project,board){
    const {
      itemMatchesFilter,
      scheduleSave,
      renderProjectList,
      editGroupName,
      confirmDeleteGroup,
      openNewItemModal,
      moveItem,
      priorityField,
      dateFields,
      fieldsWithStartBeforeDue,
      fieldChipHtml,
      tagById,
      tagPillHtml,
      openItemModal
    }=this.dependencies;
    const templates=this.cloneTemplate();
    project.groups.forEach(group=>{
      const column=templates.querySelector("#boardGroupTemplate").content.firstElementChild.cloneNode(true);
      column.dataset.groupId=group.id;
      const visibleItems=group.items.filter(item=>itemMatchesFilter(project,item,group));
      column.querySelector(".groupTitle").value=group.name;
      const count=column.querySelector("[data-board-group-count]");
      count.textContent=`${visibleItems.length}${visibleItems.length!==group.items.length?"/"+group.items.length:""}`;

      column.querySelector(".groupTitle").addEventListener("change",event=>{
        group.name=event.target.value.trim()||group.name;
        scheduleSave();
        renderProjectList();
      });
      const groupMenuButton=column.querySelector('[data-action="groupMenu"]');
      const groupMenu=column.querySelector(".fieldColumnMenu");
      groupMenuButton.setAttribute("aria-label",`Group actions for ${group.name}`);
      groupMenuButton.onclick=event=>{
        event.stopPropagation();
        const shouldOpen=!groupMenu.classList.contains("open");
        document.querySelectorAll(".fieldColumnMenu.open").forEach(other=>other.classList.remove("open"));
        groupMenu.classList.toggle("open",shouldOpen);
      };
      groupMenu.querySelector('[data-group-action="edit"]').onclick=event=>{
        event.stopPropagation();
        groupMenu.classList.remove("open");
        editGroupName(project,group);
      };
      groupMenu.querySelector('[data-group-action="delete"]').onclick=event=>{
        event.stopPropagation();
        groupMenu.classList.remove("open");
        confirmDeleteGroup(project,group);
      };
      column.querySelector('[data-action="addItem"]').onclick=()=>openNewItemModal(project,group);

      const body=column.querySelector(".groupBody");
      visibleItems.forEach(item=>body.appendChild(this.createCard(project,group,item,templates,{
        priorityField,dateFields,fieldsWithStartBeforeDue,fieldChipHtml,tagById,tagPillHtml,openItemModal
      })));
      column.addEventListener("dragover",event=>{
        event.preventDefault();
        column.classList.add("dragover");
      });
      column.addEventListener("dragleave",()=>column.classList.remove("dragover"));
      column.addEventListener("drop",event=>{
        event.preventDefault();
        column.classList.remove("dragover");
        const data=JSON.parse(event.dataTransfer.getData("text/plain"));
        moveItem(project.id,data.groupId,group.id,data.itemId,null);
      });
      board.appendChild(column);
    });
  }

  createCard(project,group,item,templates,helpers){
    const {priorityField,dateFields,fieldsWithStartBeforeDue,fieldChipHtml,tagById,tagPillHtml,openItemModal}=helpers;
    const card=templates.querySelector("#boardCardTemplate").content.firstElementChild.cloneNode(true);
    card.classList.toggle("archived",!!item.archived);
    card.draggable=true;
    const priority=priorityField(project);
    if (priority) appendMarkup(card.querySelector(".cardPriority"),fieldChipHtml(priority,item.values[priority.id]));
    card.querySelector("[data-board-card-title]").textContent=item.title;
    card.querySelector(".cardArchived").hidden=!item.archived;
    const doneSubitems=item.subitems.filter(subitem=>subitem.done).length;
    const subitemCount=card.querySelector(".cardSubitemCount");
    subitemCount.hidden=!item.subitems.length;
    if (item.subitems.length) subitemCount.textContent=`${doneSubitems}/${item.subitems.length}`;
    const commentCount=card.querySelector(".cardCommentCount");
    commentCount.hidden=!(item.comments&&item.comments.length);
    if (item.comments&&item.comments.length) card.querySelector("[data-board-comment-count]").textContent=String(item.comments.length);
    const dateChips=card.querySelector(".cardDateChips");
    fieldsWithStartBeforeDue(dateFields(project)).forEach(field=>{
      appendMarkup(dateChips,fieldChipHtml(field,item.values[field.id]));
    });
    const tags=card.querySelector(".cardTags");
    (item.tagIds||[]).forEach(tagId=>{
      const tag=tagById(project,tagId);
      if (tag) appendMarkup(tags,tagPillHtml(tag));
    });
    card.onclick=()=>openItemModal(project.id,group.id,item.id);
    card.addEventListener("dragstart",event=>{
      card.classList.add("dragging");
      event.dataTransfer.setData("text/plain",JSON.stringify({groupId:group.id,itemId:item.id}));
    });
    card.addEventListener("dragend",()=>card.classList.remove("dragging"));
    return card;
  }
}
