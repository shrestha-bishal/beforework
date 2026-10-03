"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");

const app=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
const view=fs.readFileSync(path.join(__dirname,"../js/views/list-view.js"),"utf8");
const template=fs.readFileSync(path.join(__dirname,"../pages/list-view.html"),"utf8");

test("List view keeps shared selection and app actions injected",()=>{
  for (const dependency of [
    "selectedItemIds",
    "rowsForSelection",
    "bulkSetCompleted",
    "bulkMove",
    "bulkDuplicate",
    "bulkTag",
    "bulkDelete",
    "openItemModal"
  ]){
    assert.match(view,new RegExp(`\\b${dependency}\\b`),`missing ${dependency}`);
  }
  assert.ok(app.includes("const selectedItemIds = new Set();"));
  assert.ok(app.includes("bulkSetCompleted,"));
  assert.ok(fs.readFileSync(path.join(__dirname,"../js/features/item.js"),"utf8").includes("function bulkSetCompleted(project,completed)"));
});

test("List sorting stays shared with Table view and is accessed through app state",()=>{
  assert.ok(view.includes("getListSort().field"));
  assert.ok(view.includes("setListSort({field,"));
  assert.ok(app.includes("getListSort:()=>listSort"));
  assert.ok(app.includes("setListSort:value=>{ listSort=value; }"));
  assert.ok(app.includes('cloneTemplate:()=>window.BeforeworkViewTemplates.clone("tableView")'));
  assert.ok(app.includes('import("./views/table-view.js")'));
});

test("project view dispatch uses the extracted List renderer",()=>{
  assert.ok(app.includes('activeView.type === "list") listView.render(project, board)'));
  assert.ok(!app.includes("function renderListView("));
  assert.ok(app.includes('import("./views/list-view.js")'));
});

test("List view structure and reusable row markup live in its page template",()=>{
  for (const id of [
    "listViewTemplate",
    "listViewFieldHeaderTemplate",
    "listViewRowTemplate",
    "listViewEmptyRowTemplate"
  ]){
    assert.ok(template.includes(`id="${id}"`),`missing ${id}`);
    assert.ok(view.includes(`#${id}`),`view does not use ${id}`);
  }
  assert.ok(!view.includes('wrap.innerHTML = `'));
  assert.ok(!view.includes('tbody.innerHTML ='));
  assert.ok(app.includes('cloneTemplate:()=>window.BeforeworkViewTemplates.clone("listView")'));
});

test("List headers stay aligned with optional group and progress cells",()=>{
  assert.ok(view.includes("if (showGroupColumn) groupHeader.hidden=false;"));
  assert.ok(view.includes("if (showProgressColumn) progressHeader.hidden=false;"));
  assert.ok(view.includes("else groupCell.remove();"));
  assert.ok(view.includes("else progressCell.remove();"));
});

test("List multi-select field cells use appSelect and save selections",()=>{
  assert.ok(view.includes('if (field.type==="multi-select"){'));
  assert.ok(view.includes("control.multiple=true;"));
  assert.ok(view.includes('control.className="form-control listMultiSelect";'));
  assert.ok(view.includes('Object.assign(control.dataset,{pid:project.id,gid:group.id,iid:item.id,fieldid:field.id});'));
  assert.ok(view.includes("window.BeforeworkFieldTypes.normalizeInput(field,"));
  assert.ok(view.includes("selectedOptions:[...control.selectedOptions]"));
  assert.ok(view.includes("scheduleSave();"));
  assert.ok(view.includes('if (e.target.closest(".appSelectWrap")) return;'));
  assert.match(app,/listView = new listViewModule\.ListView\(\{[\s\S]*?scheduleSave,[\s\S]*?cloneTemplate:\(\)=>window\.BeforeworkViewTemplates\.clone\("listView"\)/);
});
