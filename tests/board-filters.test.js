"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const source=fs.readFileSync(path.join(__dirname,"../js/ui/board-filters.js"),"utf8");
const app=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
const index=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");

function makeElement(id){
  const listeners={};
  const classes=new Set();
  return {
    id,
    value:"",
    dataset:{},
    onclick:null,
    listeners,
    classList:{
      add(name){ classes.add(name); },
      remove(name){ classes.delete(name); },
      contains(name){ return classes.has(name); },
      toggle(name,force){
        const enabled=force===undefined ? !classes.has(name) : force;
        if (enabled) classes.add(name);
        else classes.delete(name);
        return enabled;
      }
    },
    addEventListener(name,callback){ listeners[name]=callback; },
    dispatch(name,event){ listeners[name]?.(event); }
  };
}

function createHarness(){
  const ids=[
    "boardSearch","clearBoardFilters","filterPanelClear","filterPanel","toggleFilters",
    "closeFilters","filterPanelDone","filterCategoryList"
  ];
  const elements=Object.fromEntries(ids.map(id=>[id,makeElement(id)]));
  const categoryButtons=[
    Object.assign(makeElement("groupFilters"),{dataset:{filterCategory:"groupFilters"}}),
    Object.assign(makeElement("fieldFilters"),{dataset:{filterCategory:"field:priority"}})
  ];
  const sections=["groupFilters","boardTagFilters","fieldFilters"].map(makeElement);
  elements.filterCategoryList.contains=button=>categoryButtons.includes(button);
  const calls={search:[],clears:0,categories:[]};
  const documentListeners={};
  const documentRef={
    getElementById:id=>elements[id],
    addEventListener(name,callback){ documentListeners[name]=callback; },
    querySelectorAll(selector){
      if (selector==="[data-filter-category]") return categoryButtons;
      if (selector==="#filterOptions > div") return sections;
      return [];
    }
  };
  const window={};
  vm.runInNewContext(source,{window},{filename:"board-filters.js"});
  window.BeforeworkBoardFilters.create({
    documentRef,
    onSearchChange:value=>calls.search.push(value),
    onClear:()=>calls.clears++,
    onSelectCategory:category=>calls.categories.push(category)
  }).wire();
  return {elements,categoryButtons,sections,calls,documentListeners};
}

test("board filter search and clear controls delegate filter state to the app",()=>{
  const harness=createHarness();
  harness.elements.boardSearch.dispatch("input",{target:{value:"  sprint  "}});
  harness.elements.clearBoardFilters.onclick();
  harness.elements.filterPanelClear.onclick();

  assert.deepEqual(harness.calls.search,["  sprint  "]);
  assert.equal(harness.calls.clears,2);
});

test("board filter panel controls open and close the panel consistently",()=>{
  const harness=createHarness();
  const {filterPanel,toggleFilters,closeFilters,filterPanelDone}=harness.elements;
  toggleFilters.onclick();
  assert.equal(filterPanel.classList.contains("open"),true);
  assert.equal(toggleFilters.classList.contains("active"),true);
  toggleFilters.onclick();
  assert.equal(filterPanel.classList.contains("open"),false);
  assert.equal(toggleFilters.classList.contains("active"),false);
  toggleFilters.onclick();
  closeFilters.onclick();
  assert.equal(filterPanel.classList.contains("open"),false);
  assert.equal(toggleFilters.classList.contains("active"),false);
  toggleFilters.onclick();
  filterPanelDone.onclick();
  assert.equal(filterPanel.classList.contains("open"),false);
  assert.equal(toggleFilters.classList.contains("active"),false);
});

test("clicking outside the filter panel closes it but clicking inside keeps it open",()=>{
  const harness=createHarness();
  const {filterPanel,toggleFilters}=harness.elements;
  toggleFilters.onclick();
  harness.documentListeners.click({
    target:{closest:selector=>selector==="#filterPanel" ? filterPanel : null}
  });
  assert.equal(filterPanel.classList.contains("open"),true);

  harness.documentListeners.click({target:{closest:()=>null}});
  assert.equal(filterPanel.classList.contains("open"),false);
  assert.equal(toggleFilters.classList.contains("active"),false);
});

test("dynamically rendered filter categories select the matching section",()=>{
  const harness=createHarness();
  const fieldButton=harness.categoryButtons[1];
  harness.elements.filterCategoryList.dispatch("click",{
    target:{closest:()=>fieldButton}
  });

  assert.deepEqual(harness.calls.categories,["field:priority"]);
  assert.equal(fieldButton.classList.contains("active"),true);
  assert.equal(harness.categoryButtons[0].classList.contains("active"),false);
  assert.equal(harness.sections.find(section=>section.id==="fieldFilters").classList.contains("active"),true);
  assert.equal(harness.sections.find(section=>section.id==="groupFilters").classList.contains("active"),false);
});

test("app delegates Board filter UI wiring to the extracted module",()=>{
  assert.match(app,/window\.BeforeworkBoardFilters\.create\(/);
  assert.doesNotMatch(app,/document\.getElementById\("boardSearch"\)\.addEventListener/);
  assert.doesNotMatch(app,/document\.getElementById\("filterPanelClear"\)\.onclick/);
  assert.doesNotMatch(app,/filterPanel\.classList\.contains\("open"\).*filterPanel/);
  assert.ok(index.indexOf('src="js/ui/board-filters.js"')<index.indexOf('src="js/app.js"'));
});
