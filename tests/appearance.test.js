"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/ui/appearance.js"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "../js/app.js"), "utf8");
const projectActionsMenu = fs.readFileSync(path.join(__dirname, "../js/ui/project-actions-menu.js"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "../styles/app.css"), "utf8");
const actionMenuStyles = fs.readFileSync(path.join(__dirname, "../styles/action-menu.css"), "utf8");
const index = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");

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

test("collapsed desktop sidebar keeps navigation and project icons visible",()=>{
  assert.match(styles,/@media \(min-width:861px\)\{\s*#sidebar\.collapsed\{width:60px;/);
  assert.match(styles,/#sidebar\.collapsed #overviewNav,\s*#sidebar\.collapsed #calendarNav,\s*#sidebar\.collapsed #roadmapNav/);
  assert.match(styles,/#sidebar\.collapsed \.workspaceSwitcherBtn\{justify-content:center;width:42px;height:42px/);
  assert.match(styles,/#sidebar\.collapsed \.workspaceSwitcherMenu\{position:fixed;top:72px;left:68px/);
  assert.match(styles,/#sidebar\.collapsed #projectList \.SideNav-item\{justify-content:center/);
  assert.match(styles,/#sidebar\.collapsed \.sidebarProjects\{border-top:1px solid var\(--border\);padding-top:8px;\}/);
  assert.match(styles,/#sidebar\.collapsed \.sidebarBottomNav \.uiDivider\{display:block;\}/);
  assert.doesNotMatch(styles,/#tagsSection/);
  assert.match(styles,/#sidebar\.collapsed #globalSearch\{position:absolute;inset:0;width:42px;height:42px;padding:0;opacity:0;cursor:pointer;\}/);
  assert.match(index,/<img class="markCollapsed" src="images\/icon\.png" alt="">/);
  assert.match(index,/<input class="form-control" id="globalSearch"[^>]*title="Search or run a command"/);
  assert.match(styles,/@media \(min-width:861px\)\{#sidebar\.collapsed \+ #sidebarCollapseHandle\{left:42px;\}\}/);
  assert.doesNotMatch(styles,/#sidebar\.collapsed\{width:0/);
});

test("sidebar project action trigger keeps shared menu behavior with compact custom styling",()=>{
  assert.match(actionMenuStyles,/\.action-menu__trigger--sidebar\{[^}]*width:24px;[^}]*height:20px;[^}]*flex:0 0 auto;[^}]*padding:2px 4px;[^}]*border-radius:5px;[^}]*font-size:16px;/);
  assert.match(actionMenuStyles,/\.action-menu__trigger--sidebar:hover,[\s\S]*?\.action-menu__trigger--sidebar\.active\{background:var\(--bg-soft\);color:var\(--text\);\}/);
  assert.match(projectActionsMenu,/"projectMenuBtnSmall action-menu__trigger action-menu__trigger--sidebar"/);
  assert.match(app,/menuBtn\.className = "folderMenuBtn action-menu__trigger action-menu__trigger--sidebar"/);
  assert.match(styles,/#projectList \.folderHeading:hover \.folderMenuBtn,[\s\S]*?#projectList \.SideNav-item:has\(\.projectQuickMenu\.open\) \.projectMenuBtnSmall\{opacity:1;visibility:visible;transform:translateX\(0\) scale\(1\);\}/);
});

test("keeps appearance controls usable when local storage is unavailable",()=>{
  const harness=createHarness({prefersDark:true,storageThrows:true});

  harness.appearance.initTheme();
  harness.appearance.toggleSidebarCollapsed();

  assert.equal(harness.attributes.get("data-theme"),"dark");
  assert.equal(harness.elements.sidebar.collapsed,true);
});
