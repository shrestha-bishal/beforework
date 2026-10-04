"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");

const app=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
const view=fs.readFileSync(path.join(__dirname,"../js/views/table-view.js"),"utf8");
const listView=fs.readFileSync(path.join(__dirname,"../js/views/list-view.js"),"utf8");
const template=fs.readFileSync(path.join(__dirname,"../pages/table-view.html"),"utf8");
const listTemplate=fs.readFileSync(path.join(__dirname,"../pages/list-view.html"),"utf8");
const boardTemplate=fs.readFileSync(path.join(__dirname,"../pages/board-view.html"),"utf8");
const styles=fs.readFileSync(path.join(__dirname,"../styles/app.css"),"utf8");
const actionMenuStyles=fs.readFileSync(path.join(__dirname,"../styles/action-menu.css"),"utf8");

test("Table view markup is supplied by reusable page templates",()=>{
  for (const id of [
    "tableViewTemplate",
    "tableViewFieldHeaderTemplate",
    "tableViewRowTemplate",
    "tableViewFieldCellTemplate",
    "tableViewEmptyRowTemplate"
  ]){
    assert.ok(template.includes(`id="${id}"`),`missing ${id}`);
    assert.ok(view.includes(`#${id}`),`view does not use ${id}`);
  }
  assert.ok(!view.includes("wrap.innerHTML"));
  assert.ok(!view.includes("tbody.innerHTML"));
  assert.ok(app.includes('cloneTemplate:()=>window.BeforeworkViewTemplates.clone("tableView")'));
});

test("Table keeps shared selection, sorting, and edits wired to app behavior",()=>{
  for (const dependency of [
    "selectedItemIds",
    "rowsForSelection",
    "bulkSetCompleted",
    "bulkMove",
    "bulkDuplicate",
    "bulkTag",
    "bulkDelete",
    "getListSort",
    "setListSort",
    "getItem",
    "scheduleSave",
    "renderProjectList"
  ]){
    assert.ok(view.includes(dependency),`missing ${dependency}`);
  }
  assert.ok(app.includes('activeView.type === "table") tableView.render(project, board)'));
  assert.ok(!app.includes("function renderTableView("));
  assert.ok(app.includes('import("./views/table-view.js")'));
});

test("Table group header visibility matches optional group cells",()=>{
  assert.ok(view.includes("if (showGroupColumn) groupHeader.hidden=false;"));
  assert.ok(view.includes("else groupCell.remove();"));
  assert.match(view,/if \(!tagsEnabled\)\{\s*tagsHeader\.remove\(\);\s*tagsHeader=null;\s*\}/);
  assert.match(view,/const colCount=2\+project\.fields\.length\+\(showGroupColumn\?1:0\)/);
});

test("Table and List expose searchable multi-select filters on every data column",()=>{
  for (const source of [view,listView]){
    assert.ok(source.includes('headerRow.querySelectorAll("th[data-column-id]").forEach(th=>wireColumnFilterHeader(th,project))'));
    assert.ok(source.includes("rowsForSelection(project,true)"));
    assert.ok(source.includes("applyColumnFilterVisibility(table,project)"));
  }
  assert.match(app,/select\.multiple=true;/);
  assert.match(app,/select\.dataset\.appSelectButtonClass="fieldColumnMenuBtn columnFilterToggle"/);
  assert.match(app,/select\.dataset\.appSelectWrapClass="columnFilterSelectWrap"/);
  assert.match(app,/select\.dataset\.appSelectIcon="mdi:filter-outline"/);
  assert.match(app,/select\.dataset\.appSelectMenuTitle=/);
  assert.match(app,/enhanceSelectControl\(select\)/);
  assert.match(app,/setColumnFilterSelection\(project,columnId,values\)/);
  assert.match(app,/syncMainFilterSelection\(project,columnId,values\)/);
  assert.match(app,/function applyColumnFilterVisibility\(table,project\)/);
  assert.match(app,/row\.hidden=!item \|\| !itemMatchesFilter\(project,item,group\)/);
  assert.match(styles,/\.appSelectOption\.selected::before\{left:4px;\}/);
  assert.match(app,/th\.classList\.add\("hasColumnFilter"\)/);
  assert.match(styles,/\.listTable \.columnFilterSelectWrap\{position:absolute;top:50%;right:5px/);
  assert.match(styles,/\.listTable \.fieldColumnHeader\.hasColumnMenu \.columnFilterSelectWrap\{right:32px;\}/);
  assert.match(styles,/\.fieldColumnHeader:hover \.fieldColumnMenuBtn,.fieldColumnMenuBtn:focus-visible\{opacity:1;visibility:visible;transform:translateY\(-50%\) translateX\(0\);\}/);
  assert.match(styles,/@media \(pointer:coarse\)\{\.listTable \.fieldColumnHeader \.columnFilterSelectWrap \.columnFilterToggle\{opacity:1;visibility:visible;/);
});

test("Table and List expose column rearranging through their context menus",()=>{
  for (const markup of [template,listTemplate]){
    assert.match(markup,/class="menu action-menu action-menu--project fieldColumnMenu" role="menu" hidden/);
    assert.match(markup,/data-group-action="delete" class="danger menu-item menu-item--danger" role="menuitem"/);
    assert.match(markup,/data-column-action="delete" class="danger menu-item menu-item--danger" role="menuitem"/);
    assert.match(markup,/class="btn btn-invisible btn-sm listViewMenuBtn action-menu__trigger"/);
    assert.match(markup,/class="fieldColumnRearrangeAction" role="menuitem"/);
    assert.match(markup,/class="fieldColumnRearrangeAction" role="menuitem">Rearrange<\/button>/);
    assert.doesNotMatch(markup,/<button[^>]*class="fieldColumnRearrangeAction"[^>]*>[\s\S]*?<svg/);
    assert.ok(markup.indexOf('id="quickAddBtn"')<markup.indexOf("listViewMenuBtn"),"overflow button should follow Add item");
    assert.match(markup,/>⋮<\/button>/);
    assert.match(markup,/data-column-action="edit"/);
    assert.match(markup,/data-column-action="delete"/);
    assert.doesNotMatch(markup,/class="fieldColumnDragHandle" draggable="true"/);
  }
  assert.match(app,/const toolbar=table\.closest\("\.listWrap"\)\?\.querySelector\("\.listViewToolbarActions"\)/);
  assert.match(app,/table\.classList\.toggle\("rearrangingColumns",mode==="all"\)/);
  assert.match(app,/table\.classList\.toggle\("rearrangingSingleColumn",mode==="single"\)/);
  assert.match(app,/columnAction\.onclick=event=>/);
  assert.match(app,/menu\.className="menu action-menu action-menu--project fieldColumnMenu"/);
  assert.match(app,/menu\.classList\.remove\("action-menu--field"\);\s*menu\.classList\.add\("action-menu--project"\)/);
  assert.match(app,/columnAction\.className="menu-item fieldColumnRearrangeAction columnRearrangeAction"/);
  assert.match(app,/hideAction\.className="menu-item columnHideAction"/);
  assert.match(app,/hideAction\.setAttribute\("role","menuitem"\)/);
  assert.match(app,/let menuButton=th\.querySelector\("\.fieldColumnMenuBtn:not\(\.columnFilterToggle\)"\)/);
  assert.match(app,/th\.classList\.add\("hasColumnMenu"\)/);
  assert.match(app,/columnAction\.textContent="Rearrange"/);
  assert.doesNotMatch(app,/columnAction\.innerHTML=.*<svg/);
  assert.match(app,/setRearrangeMode\("single",header\)/);
  assert.match(app,/handle\.draggable=mode==="all"\|\|\(mode==="single"&&header===source\)/);
  assert.match(app,/addEventListener\("click",event=>\{\s*if \(!rearrangeMode \|\| event\.target\.closest\("th\[data-column-id\],\.fieldColumnRearrangeAction"\)\) return;\s*setRearrangeMode\(null\);/);
  assert.match(app,/reorderTableColumn\(project,viewType,getColumnIds\(\),sourceId,th\.dataset\.columnId,position\)/);
  assert.match(app,/scheduleSave\(\);\s*applyTableColumnOrder\(table,project,viewType\);/);
  assert.doesNotMatch(app,/applyTableColumnOrder\(table,project,viewType\);\s*if \(rearrangeMode==="single"/);
  assert.doesNotMatch(app,/reorderTableColumn\(project,viewType,getColumnIds\(\),sourceId,th\.dataset\.columnId,position\)\)\{\s*scheduleSave\(\);\s*render\(\);/);
  assert.match(styles,/\.listTable\.rearrangingColumns \.fieldColumnDragHandle,.listTable\.rearrangingSingleColumn \.columnRearrangeSource \.fieldColumnDragHandle\{display:inline-flex;\}/);
  assert.match(styles,/\.listViewToolbarActions\{position:relative;display:flex;align-items:center;gap:8px;margin-left:auto;\}/);
  assert.match(styles,/\.listViewMenuWrap\{position:relative;display:flex;align-items:center;\}/);
  assert.match(actionMenuStyles,/\.action-menu--view\{[^}]*min-width:160px;/);
  assert.match(actionMenuStyles,/\.action-menu button\{[^}]*padding:8px 9px;[^}]*font-size:12\.5px;[^}]*font-weight:400;/);
  assert.doesNotMatch(actionMenuStyles,/\.action-menu--(?:field|view) \.menu-item\{[^}]*font-size/);
  assert.match(styles,/\.listTable\.rearrangingColumns th\.fieldColumnHeader\[data-column-id\]\{padding-right:58px!important;\}/);
});

test("Table and List columns can be hidden individually or through a searchable checkbox manager",()=>{
  for (const [markup,viewLabel] of [[template,"Table"],[listTemplate,"List"]]){
    assert.match(markup,/class="manageColumnsToggle"[^>]*>Manage columns<\/button>/);
    assert.match(markup,/class="manageColumnsSearch" type="search" placeholder="Search columns"/);
    assert.match(markup,new RegExp(`class="manageColumnsOptions" role="group" aria-label="${viewLabel} columns"`));
  }
  assert.match(app,/hideAction\.className="menu-item columnHideAction"/);
  assert.match(app,/setTableColumnHidden\(project,viewType,th\.dataset\.columnId,true\)/);
  assert.match(app,/checkbox\.checked=!hidden\.has\(header\.dataset\.columnId\)/);
  assert.match(app,/setTableColumnHidden\(project,viewType,header\.dataset\.columnId,!checkbox\.checked\)/);
  assert.match(app,/applyTableColumnVisibility\(table,project,viewType\)/);
  assert.match(app,/table\.querySelectorAll\("\[data-table-empty-cell\],\[data-list-empty-cell\]"\)/);
  assert.match(listView,/applyTableColumnVisibility\(table,project,"list"\)/);
  assert.match(view,/applyTableColumnVisibility\(table,project,"table"\)/);
  assert.match(styles,/\.manageColumnsOption\{display:flex;align-items:center;gap:8px;/);
});

test("all board, list, and table menu delete actions share danger menu-item classes",()=>{
  assert.match(boardTemplate,/data-group-action="delete" class="danger menu-item menu-item--danger" role="menuitem">Delete<\/button>/);
});

test("Table field controls preserve the supported editable field types",()=>{
  for (const fieldType of ["priority","select","multi-select","relation","checkbox","number","url","email","date","start-date","due-date"]){
    assert.ok(view.includes(`"${fieldType}"`),`missing ${fieldType} behavior`);
  }
  assert.ok(view.includes("window.BeforeworkFieldTypes.normalizeInput(field,"));
});
