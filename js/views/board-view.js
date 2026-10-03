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

  render(project,board,view){
    const {
      projectGroups,
      projectItemEntries,
      itemMatchesFilter,
      scheduleSave,
      renderProjectList,
      editGroupName,
      confirmDeleteGroup,
      openNewItemModal,
      moveItem,
      setItemFieldValue,
      priorityField,
      dateFields,
      fieldsWithStartBeforeDue,
      fieldChipHtml,
      tagById,
      tagPillHtml,
      openItemModal
    }=this.dependencies;
    const templates=this.cloneTemplate();
    const groupingField=(project.fields||[]).find(field=>field.id===view?.groupByFieldId&&field.type==="select");
    const storageGroups=projectGroups(project);
    const columns=groupingField
      ? [
        ...(groupingField.options||[]).map(option=>({
          id:option.id,
          name:option.label,
          fieldOptionId:option.id,
          fieldGrouping:true,
          entries:[]
        })),
        {id:"",name:"No value",fieldOptionId:"",fieldGrouping:true,entries:[]}
      ]
      : storageGroups.map(group=>({
        ...group,
        entries:(group.items||[]).map(item=>({item,group}))
      }));
    if (groupingField){
      projectItemEntries(project).forEach(entry=>{
        const value=entry.item.values?.[groupingField.id]||"";
        const column=columns.find(candidate=>candidate.fieldOptionId===value)
          || columns.find(candidate=>candidate.fieldOptionId==="");
        column.entries.push(entry);
      });
    }
    columns.forEach(group=>{
      const column=templates.querySelector("#boardGroupTemplate").content.firstElementChild.cloneNode(true);
      column.dataset.groupId=group.id;
      const visibleEntries=group.entries.filter(({item,group:itemGroup})=>itemMatchesFilter(project,item,itemGroup));
      column.querySelector(".groupTitle").value=group.name;
      column.querySelector(".groupTitle").readOnly=!!group.virtual||!!group.fieldGrouping;
      const count=column.querySelector("[data-board-group-count]");
      count.textContent=`${visibleEntries.length}${visibleEntries.length!==group.entries.length?"/"+group.entries.length:""}`;

      column.querySelector(".groupTitle").addEventListener("change",event=>{
        group.name=event.target.value.trim()||group.name;
        scheduleSave();
        renderProjectList();
      });
      const groupMenuButton=column.querySelector('[data-action="groupMenu"]');
      const groupMenu=column.querySelector(".fieldColumnMenu");
      groupMenuButton.hidden=!!group.virtual||!!group.fieldGrouping;
      const groupActionMenu=window.BeforeworkActionMenu.create().register(groupMenuButton,groupMenu);
      groupMenuButton.setAttribute("aria-label",`Group actions for ${group.name}`);
      groupMenu.querySelector('[data-group-action="edit"]').onclick=event=>{
        event.stopPropagation();
        groupActionMenu.close();
        editGroupName(project,group);
      };
      groupMenu.querySelector('[data-group-action="delete"]').onclick=event=>{
        event.stopPropagation();
        groupActionMenu.close();
        confirmDeleteGroup(project,group);
      };
      column.querySelector('[data-action="addItem"]').onclick=()=>groupingField
        ? openNewItemModal(project,storageGroups[0],null,{fieldId:groupingField.id,value:group.fieldOptionId})
        : openNewItemModal(project,group);

      const body=column.querySelector(".groupBody");
      visibleEntries.forEach(({item,group:itemGroup})=>body.appendChild(this.createCard(project,itemGroup,item,templates,{
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
        if (groupingField) setItemFieldValue(project.id,data.groupId,data.itemId,groupingField.id,group.fieldOptionId);
        else moveItem(project.id,data.groupId,group.id,data.itemId,null);
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
    if (priority) appendMarkup(card.querySelector(".cardPriority"),fieldChipHtml(priority,item.values[priority.id],project));
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
      appendMarkup(dateChips,fieldChipHtml(field,item.values[field.id],project));
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
