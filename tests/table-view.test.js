"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");

const app=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
const view=fs.readFileSync(path.join(__dirname,"../js/views/table-view.js"),"utf8");
const template=fs.readFileSync(path.join(__dirname,"../pages/table-view.html"),"utf8");

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

test("Table field controls preserve the supported editable field types",()=>{
  for (const fieldType of ["priority","select","multi-select","relation","checkbox","number","url","email","date","start-date","due-date"]){
    assert.ok(view.includes(`"${fieldType}"`),`missing ${fieldType} behavior`);
  }
  assert.ok(view.includes('["multi-select","relation"].includes(field?.type)'));
});
