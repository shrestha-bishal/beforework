function appendMarkup(parent,markup){
  const template=document.createElement("template");
  template.innerHTML=markup;
  parent.append(template.content.cloneNode(true));
}

function projectEntries(project){
  const groups=project.groups||[];
  const entries=groups.flatMap(group=>(group.items||[]).map(item=>({item,group})));
  (project.items||[]).forEach(item=>entries.push({
    item,
    group:{id:"__project_items__",name:"Unassigned",items:project.items}
  }));
  return entries;
}

function fieldControl(field,item,group,project,value,scheduleFieldValue){
  const dataset={
    pid:project.id,
    gid:group.id,
    iid:item.id,
    fieldid:field.id
  };
  if (field.type==="schedule"){
    const control=document.createElement("span");
    control.className="tableRelationValue";
    control.textContent=scheduleFieldValue(project,item)||"-";
    return control;
  }
  if (field.type==="priority" || field.type==="select" || field.type==="multi-select" || field.type==="relation"){
    const control=document.createElement("select");
    const isMultiple=field.type==="multi-select"||field.type==="relation";
    control.className=`form-control tableCell${isMultiple?" tableMultiSelect":""}`;
    Object.assign(control.dataset,dataset);
    if (isMultiple){
      control.multiple=true;
      const selected=Array.isArray(value)?value:[];
      const options=field.type==="relation"
        ? projectEntries(project).filter(({item:candidate})=>candidate.id!==item.id)
          .map(({item:candidate,group:candidateGroup})=>({id:candidate.id,label:`${candidate.title} (${candidateGroup.name})`}))
        : window.BeforeworkFieldTypes.getInputChoices(field,{project,selected});
      control.size=Math.max(2,Math.min(3,options.length));
      options.forEach(option=>{
        const element=document.createElement("option");
        element.value=option.id;
        element.textContent=option.label;
        element.selected=selected.includes(option.id);
        control.appendChild(element);
      });
    } else {
      const options=window.BeforeworkFieldTypes.getInputChoices(field,{project,selected:[value]});
      [{id:"",label:"None"},...options].forEach(option=>{
        const element=document.createElement("option");
        element.value=option.id;
        element.textContent=option.label;
        element.selected=value===option.id;
        control.appendChild(element);
      });
    }
    return control;
  }
  if (field.type==="checkbox"){
    const label=document.createElement("label");
    label.className="checkboxTableCell";
    const control=document.createElement("input");
    control.type="checkbox";
    control.className="tableCell";
    Object.assign(control.dataset,dataset);
    control.value="true";
    control.checked=value===true || value==="true" || value==="1" || value==="yes" || value===1;
    label.appendChild(control);
    return label;
  }
  if (field.type==="relation"){
    const titles=new Map(projectEntries(project).map(({item:candidate})=>[candidate.id,candidate.title]));
    const control=document.createElement("span");
    control.className="tableRelationValue";
    control.textContent=(Array.isArray(value)?value:[]).map(id=>titles.get(id)).filter(Boolean).join(", ")||"-";
    return control;
  }
  const control=document.createElement("input");
  control.className="form-control tableCell";
  Object.assign(control.dataset,dataset);
  control.type=field.type==="date"||field.type==="start-date"||field.type==="due-date" ? "date"
    : window.BeforeworkFieldTypes.getInputType(field);
  if (control.type==="number") control.step="any";
  if (field.type==="url") control.placeholder="https://...";
  if (field.type==="email") control.placeholder="name@example.com";
  control.value=value==null?"":String(value);
  return control;
}

export class TableView {
  constructor({cloneTemplate,...dependencies}){
    this.cloneTemplate=cloneTemplate;
    this.dependencies=dependencies;
  }

  render(project,board){
    const {
      projectGroups,
      projectItemEntries,
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
      scheduleFieldValue,
      getItem,
      scheduleSave,
      renderProjectList,
      applyTableColumnOrder,
      applyTableColumnVisibility,
      applyColumnFilterVisibility
    }=this.dependencies;
    const templates=this.cloneTemplate();
    const wrap=templates.querySelector("#tableViewTemplate").content.firstElementChild.cloneNode(true);
    const groups=projectGroups(project);
    const showGroupColumn=groups.length>1;
    board.appendChild(wrap);
    const table=wrap.querySelector(".listTable");
    const headerRow=table.tHead.rows[0];
    const groupHeader=headerRow.querySelector("[data-table-group-header]");
    const tagsEnabled=project.fields.some(field=>field.type==="tags");
    let tagsHeader=headerRow.querySelector('[data-column-id="tags"]');
    const tagsField=project.fields.find(field=>field.type==="tags");
    if (!tagsEnabled){
      tagsHeader.remove();
      tagsHeader=null;
    }
    else {
      const fieldHeader=templates.querySelector("#tableViewFieldHeaderTemplate").content.firstElementChild.cloneNode(true);
      fieldHeader.dataset.field=tagsField.id;
      fieldHeader.dataset.columnId="tags";
      fieldHeader.querySelector(".fieldColumnLabel").textContent=tagsField.label;
      fieldHeader.querySelector(".fieldColumnDragHandle").setAttribute("aria-label",`Reorder ${tagsField.label} column`);
      fieldHeader.querySelector(".fieldColumnMenuBtn").setAttribute("aria-label",`Actions for ${tagsField.label}`);
      fieldHeader.querySelector(".fieldColumnMenuBtn").title="Column actions";
      tagsHeader.replaceWith(fieldHeader);
      tagsHeader=fieldHeader;
      wireCustomColumnHeader(tagsHeader,tagsField,project);
    }
    if (showGroupColumn) groupHeader.hidden=false;
    else groupHeader.remove();
    project.fields.filter(field=>field.type!=="tags").forEach(field=>{
      const fieldHeader=templates.querySelector("#tableViewFieldHeaderTemplate").content.firstElementChild.cloneNode(true);
      fieldHeader.dataset.field=field.id;
      fieldHeader.dataset.columnId=`field:${field.id}`;
      const fieldLabel=window.BeforeworkFieldTypes.getDisplayLabel(field);
      fieldHeader.querySelector(".fieldColumnLabel").textContent=fieldLabel;
      const dragHandle=fieldHeader.querySelector(".fieldColumnDragHandle");
      dragHandle.setAttribute("aria-label",`Reorder ${fieldLabel} column`);
      dragHandle.title="Drag to reorder column";
      const menuButton=fieldHeader.querySelector(".fieldColumnMenuBtn");
      menuButton.setAttribute("aria-label",`Actions for ${fieldLabel}`);
      menuButton.title="Column actions";
      if (tagsHeader) tagsHeader.before(fieldHeader);
      else headerRow.appendChild(fieldHeader);
    });
    headerRow.querySelectorAll("th[data-column-id]").forEach(th=>wireColumnFilterHeader(th,project));
    wireTableColumnReordering(table,project,"table");

    wrap.querySelector("#quickAddBtn").onclick=()=>openNewItemModal(project,groups[0]);
    wrap.querySelector('[data-view-action="export-csv"]').onclick=()=>exportProjectCsv(project,"table");
    const updateSelection=()=>{
      const selected=[...selectedItemIds];
      const selectedItems=projectItemEntries(project).map(row=>row.item).filter(item=>selected.includes(item.id));
      const allSelectedCompleted=selectedItems.length>0 && selectedItems.every(isItemCompleted);
      const allSelectedIncomplete=selectedItems.length>0 && selectedItems.every(item=>!isItemCompleted(item));
      const completeBtn=wrap.querySelector("#bulkComplete");
      const incompleteBtn=wrap.querySelector("#bulkIncomplete");
      wrap.querySelector("#selectedCount").textContent=selected.length;
      wrap.querySelector(".bulkBar").dataset.selected=selected.length?"true":"false";
      completeBtn.disabled=selected.length===0 || allSelectedCompleted;
      incompleteBtn.disabled=selected.length===0 || allSelectedIncomplete;
      completeBtn.classList.toggle("is-hidden",selected.length===0 || allSelectedCompleted);
      incompleteBtn.classList.toggle("is-hidden",selected.length===0 || allSelectedIncomplete);
      wrap.querySelectorAll("input[data-item-select]").forEach(input=>{
        input.checked=selectedItemIds.has(input.dataset.itemSelect);
      });
    };
    wrap.querySelector("#bulkSelectAll").onclick=()=>{
      rowsForSelection(project).forEach(row=>selectedItemIds.add(row.item.id));
      updateSelection();
    };
    wrap.querySelector("#selectAllItems").onchange=event=>{
      rowsForSelection(project).forEach(row=>{
        if (event.target.checked) selectedItemIds.add(row.item.id);
        else selectedItemIds.delete(row.item.id);
      });
      updateSelection();
    };
    wrap.querySelector("#bulkComplete").onclick=()=>bulkSetCompleted(project,true);
    wrap.querySelector("#bulkIncomplete").onclick=()=>bulkSetCompleted(project,false);
    wrap.querySelector("#bulkMove").onclick=()=>bulkMove(project);
    wrap.querySelector("#bulkDuplicate").onclick=()=>bulkDuplicate(project);
    const bulkTagButton=wrap.querySelector("#bulkTag");
    if (tagsEnabled) bulkTagButton.onclick=()=>bulkTag(project);
    else bulkTagButton.remove();
    wrap.querySelector("#bulkDelete").onclick=()=>bulkDelete(project);

    wrap.querySelectorAll("th[data-field]").forEach(th=>{
      const field=th.dataset.field;
      const sort=getListSort();
      th.querySelector(".arrow").textContent=sort.field===field?(sort.dir==="asc"?" ↑":" ↓"):"";
      const customField=project.fields.find(candidate=>candidate.id===field);
      if (field==="group") wireGroupColumnHeader(th,project);
      else if (customField) wireCustomColumnHeader(th,customField,project);
      th.onclick=()=>{
        const current=getListSort();
        if (current.field===field) current.dir=current.dir==="asc"?"desc":"asc";
        else setListSort({field,dir:field==="updated"?"desc":"asc"});
        render();
      };
    });

    const rows=sortProjectRows(project,rowsForSelection(project,true));
    const tbody=wrap.querySelector("#tableTbody");
    const colCount=2+project.fields.length+(showGroupColumn?1:0);
    if (!rows.length){
      updateSelection();
      const emptyRow=templates.querySelector("#tableViewEmptyRowTemplate").content.firstElementChild.cloneNode(true);
      const emptyCell=emptyRow.querySelector("[data-table-empty-cell]");
      emptyCell.colSpan=colCount;
      emptyCell.textContent="No rows match the current filters.";
      tbody.appendChild(emptyRow);
      applyTableColumnOrder(table,project,"table");
      applyTableColumnVisibility(table,project,"table");
      applyColumnFilterVisibility(table,project);
      return;
    }
    const rowTemplate=templates.querySelector("#tableViewRowTemplate");
    rows.forEach(({item,group})=>{
      const row=rowTemplate.content.firstElementChild.cloneNode(true);
      row.dataset.pid=project.id;
      row.dataset.gid=group.id;
      row.dataset.iid=item.id;
      const checkbox=row.querySelector("input[data-item-select]");
      checkbox.dataset.itemSelect=item.id;
      checkbox.checked=selectedItemIds.has(item.id);
      const title=row.querySelector("input[data-title-cell]");
      Object.assign(title.dataset,{pid:project.id,gid:group.id,iid:item.id});
      title.value=item.title;
      const groupCell=row.querySelector("[data-table-group-cell]");
      if (showGroupColumn) groupCell.textContent=group.name;
      else groupCell.remove();
      const tags=row.querySelector("[data-table-tags]");
      if (tagsEnabled){
        const itemTags=(item.tagIds||[]).map(id=>tagById(project,id)).filter(Boolean);
        if (itemTags.length) itemTags.forEach(tag=>appendMarkup(tags,tagPillHtml(tag)));
        else tags.textContent="-";
      } else tags.closest("[data-column-id='tags']").remove();
      const tagsCell=row.querySelector('[data-column-id="tags"]');
      project.fields.filter(field=>field.type!=="tags").forEach(field=>{
        const cell=templates.querySelector("#tableViewFieldCellTemplate").content.firstElementChild.cloneNode(true);
        cell.dataset.columnId=`field:${field.id}`;
        const value=field.type==="location" ? item.values[field.id]??item.location??"" : item.values[field.id]??"";
        const control=fieldControl(field,item,group,project,value,scheduleFieldValue);
        cell.appendChild(control);
        if (tagsCell) tagsCell.before(cell);
        else row.appendChild(cell);
      });
      tbody.appendChild(row);
    });
    tbody.querySelectorAll("input[data-item-select]").forEach(input=>{
      input.addEventListener("change",event=>{
        if (event.target.checked) selectedItemIds.add(input.dataset.itemSelect);
        else selectedItemIds.delete(input.dataset.itemSelect);
        updateSelection();
      });
    });
    tbody.querySelectorAll("input[data-title-cell]").forEach(input=>{
      input.addEventListener("change",event=>{
        const item=getItem(input.dataset.pid,input.dataset.gid,input.dataset.iid);
        if (!item) return;
        item.title=event.target.value.trim()||item.title;
        item.updatedAt=Date.now();
        scheduleSave();
        renderProjectList();
      });
    });
    tbody.querySelectorAll(".tableCell[data-fieldid]").forEach(control=>{
      control.addEventListener("change",event=>{
        const item=getItem(control.dataset.pid,control.dataset.gid,control.dataset.iid);
        if (!item) return;
        const field=project.fields.find(candidate=>candidate.id===control.dataset.fieldid);
        const nextValue=window.BeforeworkFieldTypes.normalizeInput(field,{
          input:event.target,value:event.target.value,
          selectedOptions:event.target.selectedOptions?[...event.target.selectedOptions]:[],
          item,project
        });
        item.values[control.dataset.fieldid]=nextValue;
        if (field?.type==="location") item.location=String(nextValue||"").trim();
        item.updatedAt=Date.now();
        scheduleSave();
      });
    });
    applyTableColumnOrder(table,project,"table");
    applyTableColumnVisibility(table,project,"table");
    applyColumnFilterVisibility(table,project);
    updateSelection();
  }
}
