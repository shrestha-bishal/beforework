"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");

const app=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
const view=fs.readFileSync(path.join(__dirname,"../js/views/board-view.js"),"utf8");
const template=fs.readFileSync(path.join(__dirname,"../pages/board-view.html"),"utf8");

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
    "scheduleSave",
    "renderProjectList",
    "editGroupName",
    "confirmDeleteGroup",
    "openNewItemModal",
    "moveItem",
    "openItemModal"
  ]){
    assert.ok(view.includes(dependency),`missing ${dependency}`);
  }
  assert.ok(view.includes('setData("text/plain"'));
  assert.ok(view.includes('getData("text/plain")'));
  assert.ok(app.includes('else boardView.render(project, board)'));
  assert.ok(app.includes('import("./views/board-view.js")'));
});
