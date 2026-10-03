function appendMarkup(parent,markup){
  const template=document.createElement("template");
  template.innerHTML=markup;
  parent.append(template.content.cloneNode(true));
}

export class ListView {
  constructor({cloneTemplate,...dependencies}){
    this.cloneTemplate=cloneTemplate;
    this.dependencies=dependencies;
  }

  render(project, board){
    const {
      projectGroups,
      projectItemEntries,
      itemMatchesFilter,
      wireTableColumnReordering,
      openNewItemModal,
      exportProjectCsv,
      selectedItemIds,
      isItemCompleted,
      rowsForSelection,
      bulkSetCompleted,
      bulkMove,
      bulkDuplicate,
      bulkTag,
      bulkDelete,
      getListSort,
      setListSort,
      wireGroupColumnHeader,
      wireCustomColumnHeader,
      wireColumnFilterHeader,
      render,
      sortProjectRows,
      tagById,
      tagPillHtml,
      fieldCellHtml,
      formatUpdatedAt,
      openItemModal,
      applyTableColumnOrder,
      applyTableColumnVisibility,
      applyColumnFilterVisibility,
      scheduleSave
    } = this.dependencies;
    const templates=this.cloneTemplate();
    const wrap=templates.querySelector("#listViewTemplate").content.firstElementChild.cloneNode(true);
    const groups=projectGroups(project);
    const showGroupColumn = groups.length>1;
    const showProgressColumn = groups.some(group=>group.items.some(item=>
      itemMatchesFilter(project,item,group,true) && Array.isArray(item.subitems) && item.subitems.length>0));
    board.appendChild(wrap);
    const table=wrap.querySelector(".listTable");
    const headerRow=table.tHead.rows[0];
    const groupHeader=headerRow.querySelector("[data-list-group-header]");
    const tagsHeader=headerRow.querySelector('[data-column-id="tags"]');
    const progressHeader=headerRow.querySelector("[data-list-progress-header]");
    if (showGroupColumn) groupHeader.hidden=false;
    else groupHeader.remove();
    if (showProgressColumn) progressHeader.hidden=false;
    else progressHeader.remove();
    project.fields.forEach(field=>{
      const fieldHeader=templates.querySelector("#listViewFieldHeaderTemplate").content.firstElementChild.cloneNode(true);
      fieldHeader.dataset.field=field.id;
      fieldHeader.dataset.columnId=`field:${field.id}`;
      fieldHeader.querySelector(".fieldColumnLabel").textContent=field.label;
      const dragHandle=fieldHeader.querySelector(".fieldColumnDragHandle");
      dragHandle.setAttribute("aria-label",`Reorder ${field.label} column`);
      dragHandle.title="Drag to reorder column";
      const menuButton=fieldHeader.querySelector(".fieldColumnMenuBtn");
      menuButton.setAttribute("aria-label",`Actions for ${field.label}`);
      menuButton.title="Column actions";
      tagsHeader.before(fieldHeader);
    });
    headerRow.querySelectorAll("th[data-column-id]").forEach(th=>wireColumnFilterHeader(th,project));
    wireTableColumnReordering(table,project,"list");

    const doQuickAdd = () => {
      openNewItemModal(project, groups[0]);
    };
    wrap.querySelector("#quickAddBtn").onclick = doQuickAdd;
    wrap.querySelector("#exportCsvBtn").onclick = () => exportProjectCsv(project,"list",showProgressColumn);
    const updateSelection = () => {
      const selected = [...selectedItemIds];
      const selectedItems = projectItemEntries(project).map(row=>row.item).filter(item => selected.includes(item.id));
      const allSelectedCompleted = selectedItems.length > 0 && selectedItems.every(isItemCompleted);
      const allSelectedIncomplete = selectedItems.length > 0 && selectedItems.every(item => !isItemCompleted(item));
      const completeBtn = wrap.querySelector("#bulkComplete");
      const incompleteBtn = wrap.querySelector("#bulkIncomplete");
      wrap.querySelector("#selectedCount").textContent = selected.length;
      wrap.querySelector(".bulkBar").dataset.selected = selected.length ? "true" : "false";
      completeBtn.disabled = selected.length === 0 || allSelectedCompleted;
      incompleteBtn.disabled = selected.length === 0 || allSelectedIncomplete;
      completeBtn.classList.toggle("is-hidden", selected.length === 0 || allSelectedCompleted);
      incompleteBtn.classList.toggle("is-hidden", selected.length === 0 || allSelectedIncomplete);
      wrap.querySelectorAll("input[data-item-select]").forEach(input=>{
        input.checked = selectedItemIds.has(input.dataset.itemSelect);
      });
    };
    wrap.querySelector("#bulkSelectAll").onclick = () => {
      rowsForSelection(project).forEach(row=>selectedItemIds.add(row.item.id));
      updateSelection();
    };
    wrap.querySelector("#selectAllItems").onchange = e => {
      rowsForSelection(project).forEach(row=>{
        if (e.target.checked) selectedItemIds.add(row.item.id);
        else selectedItemIds.delete(row.item.id);
      });
      updateSelection();
    };
    wrap.querySelector("#bulkComplete").onclick = () => bulkSetCompleted(project, true);
    wrap.querySelector("#bulkIncomplete").onclick = () => bulkSetCompleted(project, false);
    wrap.querySelector("#bulkMove").onclick = () => bulkMove(project);
    wrap.querySelector("#bulkDuplicate").onclick = () => bulkDuplicate(project);
    wrap.querySelector("#bulkTag").onclick = () => bulkTag(project);
    wrap.querySelector("#bulkDelete").onclick = () => bulkDelete(project);

    wrap.querySelectorAll("th[data-field]").forEach(th=>{
      const field = th.dataset.field;
      const arrow = getListSort().field===field ? (getListSort().dir==="asc"?" ↑":" ↓") : "";
      const customField = project.fields.find(candidate=>candidate.id===field);
      if (field==="group"){
        th.querySelector(".arrow").textContent = arrow;
        wireGroupColumnHeader(th, project);
      } else if (customField){
        th.querySelector(".arrow").textContent = arrow;
        wireCustomColumnHeader(th, customField, project);
      } else {
        th.querySelector(".arrow").textContent = arrow;
      }
      th.onclick = () => {
        if (getListSort().field===field) getListSort().dir = getListSort().dir==="asc"?"desc":"asc";
        else setListSort({field, dir: field==="updated" ? "desc" : "asc"});
        render();
      };
    });

    const rows=sortProjectRows(project,rowsForSelection(project,true));

    const tbody = wrap.querySelector("#listTbody");
    const colCount = 4 + project.fields.length + (showGroupColumn?1:0) + (showProgressColumn?1:0);
    if (!rows.length){
      const emptyRow=templates.querySelector("#listViewEmptyRowTemplate").content.firstElementChild.cloneNode(true);
      const emptyCell=emptyRow.querySelector("[data-list-empty-cell]");
      emptyCell.colSpan=colCount;
      emptyCell.textContent="No items match the current filters.";
      tbody.appendChild(emptyRow);
      applyTableColumnOrder(table,project,"list");
      applyTableColumnVisibility(table,project,"list");
      applyColumnFilterVisibility(table,project);
      return;
    }
    const rowTemplate=templates.querySelector("#listViewRowTemplate");
    rows.forEach(({item,group})=>{
      const doneSub = item.subitems.filter(s=>s.done).length;
      const row=rowTemplate.content.firstElementChild.cloneNode(true);
      row.classList.toggle("archived",!!item.archived);
      row.dataset.pid=project.id;
      row.dataset.gid=group.id;
      row.dataset.iid=item.id;
      const checkbox=row.querySelector("input[data-item-select]");
      checkbox.dataset.itemSelect=item.id;
      checkbox.checked=selectedItemIds.has(item.id);
      const archivedLabel=row.querySelector(".listArchivedLabel");
      archivedLabel.hidden=!item.archived;
      row.querySelector("[data-list-item-title]").textContent=item.title;
      const groupCell=row.querySelector("[data-list-group-cell]");
      if (showGroupColumn) groupCell.textContent=group.name;
      else groupCell.remove();
      const tags=row.querySelector("[data-list-tags]");
      const itemTags=(item.tagIds||[]).map(id=>tagById(project,id)).filter(Boolean);
      if (itemTags.length) itemTags.forEach(tag=>appendMarkup(tags,tagPillHtml(tag)));
      else tags.textContent="-";
      const progressCell=row.querySelector("[data-list-progress-cell]");
      if (showProgressColumn) progressCell.textContent=item.subitems.length ? `${doneSub}/${item.subitems.length}` : "-";
      else progressCell.remove();
      row.querySelector("[data-list-updated]").textContent=formatUpdatedAt(item.updatedAt);
      const tagsCell=row.querySelector('[data-column-id="tags"]');
      project.fields.forEach(field=>{
        const cell=document.createElement("td");
        cell.className="p-2 border-bottom";
        cell.dataset.columnId=`field:${field.id}`;
        if (field.type==="multi-select"){
          const control=document.createElement("select");
          control.multiple=true;
          control.className="form-control listMultiSelect";
          Object.assign(control.dataset,{pid:project.id,gid:group.id,iid:item.id,fieldid:field.id});
          const selected=Array.isArray(item.values[field.id])?item.values[field.id]:[];
          (field.options||[]).forEach(option=>{
            const element=document.createElement("option");
            element.value=option.id;
            element.textContent=option.label;
            element.selected=selected.includes(option.id);
            control.appendChild(element);
          });
          control.addEventListener("change",()=>{
            item.values[field.id]=[...control.selectedOptions].map(option=>option.value);
            item.updatedAt=Date.now();
            scheduleSave();
          });
          cell.appendChild(control);
        } else appendMarkup(cell,fieldCellHtml(field,item.values[field.id],project,item));
        tagsCell.before(cell);
      });
      tbody.appendChild(row);
    });
    tbody.querySelectorAll("tr[data-iid]").forEach(tr=>{
      tr.onclick = e => {
        if (e.target.closest(".appSelectWrap")) return;
        if (e.target.matches("input[data-item-select]")){
          if (e.target.checked) selectedItemIds.add(e.target.dataset.itemSelect);
          else selectedItemIds.delete(e.target.dataset.itemSelect);
          updateSelection();
          return;
        }
        openItemModal(tr.dataset.pid, tr.dataset.gid, tr.dataset.iid);
      };
    });
    applyTableColumnOrder(table,project,"list");
    applyTableColumnVisibility(table,project,"list");
    applyColumnFilterVisibility(table,project);
    updateSelection();
  }
}
