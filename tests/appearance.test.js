"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/ui/appearance.js"), "utf8");

function createHarness({preferences={},prefersDark=false,storageThrows=false}={}){
  const values = new Map(Object.entries(preferences));
  const attributes = new Map();
  const elements = {
    themeToggle:{textContent:""},
    sidebar:{
      collapsed:false,
      classList:{
        contains(name){ return name==="collapsed" && elements.sidebar.collapsed; },
        toggle(name,enabled){ if (name==="collapsed") elements.sidebar.collapsed=enabled; }
      }
    },
    sidebarCollapseHandle:{
      textContent:"",
      title:"",
      attributes:{},
      setAttribute(name,value){ this.attributes[name]=value; }
    }
  };
  const window = {
    document:{
      documentElement:{
        setAttribute(name,value){ attributes.set(name,value); },
        getAttribute(name){ return attributes.get(name)||null; }
      },
      getElementById(id){ return elements[id]||null; }
    },
    localStorage:{
      getItem(key){
        if (storageThrows) throw new Error("Storage unavailable");
        return values.get(key)||null;
      },
      setItem(key,value){
        if (storageThrows) throw new Error("Storage unavailable");
        values.set(key,String(value));
      }
    },
    matchMedia(){ return {matches:prefersDark}; }
  };
  vm.runInNewContext(source,{window},{filename:"appearance.js"});
  return {appearance:window.BeforeworkAppearance,attributes,elements,values};
}

test("initializes theme from saved preference before system preference",()=>{
  const harness=createHarness({preferences:{"personal_dashboard_theme_v1":"light"},prefersDark:true});
  harness.appearance.initTheme();

  assert.equal(harness.attributes.get("data-theme"),"light");
  assert.equal(harness.attributes.get("data-color-mode"),"light");
  assert.equal(harness.elements.themeToggle.textContent,"🌙");
});

test("uses system theme when no saved preference and persists theme toggles",()=>{
  const harness=createHarness({prefersDark:true});
  harness.appearance.initTheme();
  assert.equal(harness.attributes.get("data-theme"),"dark");

  harness.appearance.toggleTheme();

  assert.equal(harness.attributes.get("data-theme"),"light");
  assert.equal(harness.values.get("personal_dashboard_theme_v1"),"light");
  assert.equal(harness.elements.themeToggle.textContent,"🌙");
});

test("initializes and toggles the persisted sidebar state",()=>{
  const harness=createHarness({preferences:{"personal_dashboard_sidebar_collapsed_v1":"1"}});
  harness.appearance.initSidebarCollapse();
  assert.equal(harness.elements.sidebar.collapsed,true);
  assert.equal(harness.elements.sidebarCollapseHandle.textContent,"›");
  assert.equal(harness.elements.sidebarCollapseHandle.attributes["aria-label"],"Expand sidebar");

  harness.appearance.toggleSidebarCollapsed();

  assert.equal(harness.elements.sidebar.collapsed,false);
  assert.equal(harness.elements.sidebarCollapseHandle.textContent,"‹");
  assert.equal(harness.values.get("personal_dashboard_sidebar_collapsed_v1"),"0");
});

test("keeps appearance controls usable when local storage is unavailable",()=>{
  const harness=createHarness({prefersDark:true,storageThrows:true});

  harness.appearance.initTheme();
  harness.appearance.toggleSidebarCollapsed();

  assert.equal(harness.attributes.get("data-theme"),"dark");
  assert.equal(harness.elements.sidebar.collapsed,true);
});
