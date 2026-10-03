"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");

const app=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
const view=fs.readFileSync(path.join(__dirname,"../js/views/board-view.js"),"utf8");
const template=fs.readFileSync(path.join(__dirname,"../pages/board-view.html"),"utf8");
const index=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");
const styles=fs.readFileSync(path.join(__dirname,"../styles/app.css"),"utf8");

test("Board columns and cards are supplied by the page template",()=>{
  for (const id of ["boardGroupTemplate","boardCardTemplate"]){
    assert.ok(template.includes(`id="${id}"`),`missing ${id}`);
    assert.ok(view.includes(`#${id}`),`view does not use ${id}`);
  }
  assert.ok(app.includes('cloneTemplate:()=>window.BeforeworkViewTemplates.clone("boardView")'));
  assert.ok(!app.includes("function renderKanban("));
  assert.ok(!app.includes("function renderCard("));
});

test("Board view retains app-owned group actions and drag-and-drop",()=>{
  for (const dependency of [
    "itemMatchesFilter",
    "projectItemEntries",
    "scheduleSave",
    "renderProjectList",
    "editGroupName",
    "confirmDeleteGroup",
    "openNewItemModal",
    "moveItem",
    "setItemFieldValue",
    "openItemModal"
  ]){
    assert.ok(view.includes(dependency),`missing ${dependency}`);
  }
  assert.ok(view.includes('setData("text/plain"'));
  assert.ok(view.includes('getData("text/plain")'));
  assert.ok(app.includes('else boardView.render(project, board, activeView)'));
  assert.ok(view.includes("view?.groupByFieldId"));
  assert.ok(view.includes("groupingField.id,group.fieldOptionId"));
  assert.ok(view.includes("hiddenInField:option.hiddenInField===true"));
  assert.ok(view.includes("!column.hiddenInField||column.entries.length"));
  assert.ok(view.includes("addItemButton.hidden=!!group.hiddenInField"));
  assert.ok(view.includes("if (group.hiddenInField) return;"));
  assert.doesNotMatch(index,/boardGroupBy/);
  assert.doesNotMatch(app,/getElementById\("boardGroupBy/);
  assert.ok(app.includes("boardView.render(project, board, activeView)"));
  assert.ok(app.includes('import("./views/board-view.js")'));
});

test("Board lanes and cards use the app's restrained surface and action styling",()=>{
  assert.match(styles,/\.group\{[^}]*width:292px;[^}]*border:1px solid var\(--border\);[^}]*border-radius:10px;[^}]*background:var\(--bg-soft\);/);
  assert.match(styles,/\.groupHead\{[^}]*border-bottom:1px solid var\(--border\);[^}]*background:var\(--bg\);/);
  assert.match(styles,/\.card\{[^}]*border:1px solid var\(--border\);[^}]*border-radius:8px;[^}]*background:var\(--bg\);/);
  assert.match(styles,/\.addItemBtn\{[^}]*border:0;[^}]*background:transparent;/);
  assert.doesNotMatch(styles,/\.addItemBtn\{[^}]*dashed/);
  assert.match(styles,/\.groupHead input\.groupTitle:focus\{[^}]*border-color:var\(--accent\);[^}]*box-shadow:0 0 0 2px var\(--accent-soft\);/);
  assert.match(template,/class="btn addItemBtn"[^>]*><iconify-icon icon="mdi:plus"/);
  assert.match(template,/mdi:comment-outline/);
  assert.doesNotMatch(template,/💬/);
});
