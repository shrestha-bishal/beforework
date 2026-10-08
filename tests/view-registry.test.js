"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const source=fs.readFileSync(path.join(__dirname,"../js/views/view-registry.js"),"utf8");
const appSource=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
const appStyles=fs.readFileSync(path.join(__dirname,"../styles/app.css"),"utf8");
const indexSource=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");

function createRegistry(){
  const window={};
  vm.runInNewContext(source,{window});
  return window.BeforeworkViewRegistry;
}

test("view registry exposes supported project view types and labels",()=>{
  const registry=createRegistry();

  assert.deepEqual(
    JSON.parse(JSON.stringify(registry.list().map(({type,label})=>[type,label]))),
    [
      ["list","List"],
      ["table","Table"],
      ["kanban","Board"],
      ["calendar","Calendar"],
      ["milestones","Milestones"],
      ["roadmap","Roadmap"],
      ["documents","Documents"]
    ]
  );
  assert.equal(registry.get("kanban").label,"Board");
  assert.equal(registry.get("unknown"),null);
  assert.equal(registry.label("unknown"),"unknown");
});

test("app uses the view registry rather than defining its own catalog",()=>{
  assert.match(appSource,/const VIEW_DEFS=window\.BeforeworkViewRegistry\.list\(\)/);
  assert.match(appSource,/function viewLabel\(type\)\{ return window\.BeforeworkViewRegistry\.label\(type\); \}/);
  assert.doesNotMatch(appSource,/const VIEW_DEFS\s*=\s*\[\s*\{type:"list"/);
});

test("project views use a selector while retaining add and remove actions",()=>{
  assert.match(indexSource,/<div class="viewTabs" id="viewTabs"/);
  assert.match(appSource,/id="projectViewSelector" aria-label="Project view"/);
  assert.match(appSource,/project\.views\.map\(view=>`<option value="\$\{escapeHtml\(view\.id\)\}"\$\{view\.id===project\.activeViewId\?" selected":""\}>\$\{escapeHtml\(viewLabel\(view\.type\)\)\}<\/option>`\)/);
  assert.match(appSource,/selector\.addEventListener\("change",\(\)=>\{/);
  assert.match(appSource,/id="removeViewBtn"/);
  assert.match(appSource,/id="addViewBtn" title="Add a view" aria-label="Add a view"/);
  assert.match(appStyles,/\.viewSelector\{width:auto;min-width:118px/);
  assert.doesNotMatch(appStyles,/\.viewTabs \.tab\{display:inline-flex/);
});
