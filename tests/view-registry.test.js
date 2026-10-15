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

test("project views use visible tabs and a categorized add-view menu",()=>{
  assert.match(indexSource,/<div class="projectViewsBar" id="projectViewsBar"[^>]*>\s*<div class="viewTabs" id="viewTabs"/);
  assert.match(appSource,/class="viewTabList" role="tablist" aria-label="Project views"/);
  assert.match(appSource,/class="viewTab\$\{view\.id===project\.activeViewId\?" active":""\}" role="tab"/);
  assert.match(appSource,/tab\.onclick=\(\)=>\{/);
  assert.match(appSource,/class="viewAddMenu" id="addViewMenu" role="group"/);
  assert.match(appSource,/class="viewAddOption" data-add-view=/);
  assert.match(appSource,/addViewBtn\.onclick=\(\)=>\{/);
  assert.match(appSource,/addView\(project,option\.dataset\.addView\)/);
  assert.match(appSource,/class="viewTabMenu" hidden/);
  assert.match(appSource,/data-view-action="remove"/);
  assert.match(appSource,/actionMenus\.register\(trigger,menu\)/);
  assert.match(appSource,/removeView\(project,viewId\)/);
  assert.doesNotMatch(appSource,/removeViewBtn/);
  assert.match(appSource,/!addViewBtn\.contains\(event\.target\)/);
  assert.match(appSource,/id="addViewBtn" title="Add a view" aria-label="Add a view"/);
  assert.match(appStyles,/\.projectViewsBar\{position:relative;z-index:10;display:flex/);
  assert.match(appStyles,/\.viewAddMenu\{position:absolute;z-index:70;top:calc\(100% \+ 7px\);left:0;right:auto;display:grid;width:min\(560px/);
  assert.match(appStyles,/\.viewTabList\{display:flex;flex-wrap:wrap;align-items:stretch/);
  assert.match(appStyles,/\.viewTabList\{display:flex;flex-wrap:wrap;align-items:stretch;gap:2px/);
  assert.match(appStyles,/\.viewTabs \.viewTab\{position:relative;display:inline-flex;align-items:center;gap:7px;flex:none;min-height:48px;padding:0 20px 0 10px/);
  assert.match(appStyles,/\.viewTabItem\{position:relative;display:flex;flex:none;align-items:stretch;padding-right:12px;border-radius:8px;\}/);
  assert.match(appStyles,/\.viewTabItem:hover,\.viewTabItem:focus-within\{background:var\(--bg-soft\);\}/);
  assert.match(appStyles,/\.viewTabs \.viewTabMenuTrigger:hover,\.viewTabs \.viewTabMenuTrigger:focus-visible,\.viewTabs \.viewTabMenuTrigger\[aria-expanded="true"\]\{background:transparent/);
  assert.match(appStyles,/\.viewTabMenu\{top:calc\(100% \+ 3px\);right:0/);
  assert.match(appStyles,/\.viewAddGrid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.doesNotMatch(appSource,/projectViewSelector|viewSelectorLabel/);
});
