"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");

const app=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
const view=fs.readFileSync(path.join(__dirname,"../js/views/table-view.js"),"utf8");
const template=fs.readFileSync(path.join(__dirname,"../pages/table-view.html"),"utf8");
const listTemplate=fs.readFileSync(path.join(__dirname,"../pages/list-view.html"),"utf8");
const styles=fs.readFileSync(path.join(__dirname,"../styles/app.css"),"utf8");

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
});

test("Table and List expose column rearranging through their context menus",()=>{
  for (const markup of [template,listTemplate]){
    assert.match(markup,/class="btn btn-invisible btn-sm listViewMenuBtn"/);
    assert.match(markup,/class="fieldColumnRearrangeAction" role="menuitem"/);
    assert.match(markup,/<span>Rearrange<\/span>/);
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
  assert.match(styles,/\.listTable\.rearrangingColumns th\.fieldColumnHeader\[data-column-id\]\{padding-right:58px!important;\}/);
});

test("Table field controls preserve the supported editable field types",()=>{
  for (const fieldType of ["priority","select","multi-select","relation","checkbox","number","url","email","date","start-date","due-date"]){
    assert.ok(view.includes(`"${fieldType}"`),`missing ${fieldType} behavior`);
  }
  assert.ok(view.includes('["multi-select","relation"].includes(field?.type)'));
});
