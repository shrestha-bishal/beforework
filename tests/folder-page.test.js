"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");

const app=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
const bootstrap=fs.readFileSync(path.join(__dirname,"../js/bootstrap.js"),"utf8");
const view=fs.readFileSync(path.join(__dirname,"../js/views/folder-view.js"),"utf8");
const template=fs.readFileSync(path.join(__dirname,"../pages/folder.html"),"utf8");
const templates=fs.readFileSync(path.join(__dirname,"../js/ui/templates.js"),"utf8");
const styles=fs.readFileSync(path.join(__dirname,"../styles/app.css"),"utf8");

test("folder name and collapse arrow have separate navigation actions",()=>{
  assert.match(app,/folderLink\.onclick=\(\)=>selectFolderPage\(folder\.id\)/);
  assert.match(app,/toggle\.onclick=\(\)=>\{/);
  assert.match(app,/toggle\.append\(chevron\)/);
  assert.match(app,/folderLink\.append\(icon,name,count\)/);
});

test("folder page shows searchable, sortable, read-only project summaries",()=>{
  assert.match(template,/class="form-control folderPageSearch"/);
  assert.match(template,/class="form-control folderPageSort"/);
  assert.match(template,/value="name-asc"/);
  assert.match(template,/value="name-desc"/);
  assert.match(template,/value="updated-desc"/);
  assert.match(template,/class="calendarViewModes folderPageViewControls"[^>]*aria-label="Project display"/);
  assert.match(template,/class="btn btn-sm" type="button" data-folder-view="grid" aria-pressed="true">Grid/);
  assert.match(template,/class="btn btn-sm" type="button" data-folder-view="list" aria-pressed="false">List/);
  assert.match(template,/<template id="folderProjectCardTemplate">/);
  assert.match(template,/class="folderProjectPinned"[^>]*hidden/);
  assert.match(view,/saved\.query\.trim\(\)\.toLocaleLowerCase\(\)/);
  assert.match(view,/function taskCounts\(project\)/);
  assert.match(view,/function projectUpdatedAt\(project\)/);
  assert.match(view,/saved\.view==="list"/);
  assert.match(view,/button\.dataset\.folderView===saved\.view/);
  assert.match(view,/projectCardTemplate\.content\.firstElementChild\.cloneNode\(true\)/);
  assert.doesNotMatch(view,/createElement\("button"\)/);
  assert.match(view,/button\.onclick=\(\)=>onOpenProject\(project\.id\)/);
  assert.match(view,/addButton\.onclick=onAddProject/);
  assert.match(view,/This folder has no projects yet\. Add a project to get started\./);
  assert.match(app,/folderView\.render\(board,folder,projectRecords\(\)/);
  assert.match(app,/onAddProject:\(\)=>createProjectFromMenu\(folder\.id\)/);
  assert.match(bootstrap,/\.\/views\/folder-view\.js/);
  assert.match(view,/const templates=this\.cloneTemplate\(\)/);
  assert.match(view,/templates\.querySelector\("\.folderPage"\)/);
  assert.match(view,/templates\.querySelector\("#folderProjectCardTemplate"\)/);
  assert.match(templates,/folder:"pages\/folder\.html"/);
  assert.doesNotMatch(app,/folderPageSearch|folderProjectCard/);
  assert.match(template,/class="folderPageEmpty" hidden/);
  assert.match(styles,/\.folderProjectDescription\{[^}]*-webkit-line-clamp:2;/);
  assert.match(styles,/\.folderPageProjects\{display:grid;grid-template-columns:repeat\(auto-fill/);
  assert.match(styles,/\.folderPageProjects--list\{grid-template-columns:minmax\(0,1fr\);\}/);
});

test("folder pages restore from saved navigation without loading a project shard",()=>{
  assert.match(app,/function folderPageLocation\(folderId\)/);
  assert.match(app,/function isFolderPageLocation\(location\)/);
  assert.match(app,/folderId!==null&&state\?\.folders\.some\(folder=>folder\.id===folderId\)/);
  assert.match(app,/state\.folderLazy && !isFolderPageLocation\(activeProjectId\)/);
});
