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

test("collapsed desktop sidebar keeps primary navigation icons visible",()=>{
  assert.match(styles,/@media \(min-width:861px\)\{\s*#sidebar\.collapsed\{width:60px;/);
  assert.match(styles,/#sidebar\.collapsed #overviewNav,\s*#sidebar\.collapsed #calendarNav,\s*#sidebar\.collapsed #roadmapNav/);
  assert.match(styles,/#sidebar\.collapsed #feedbackNav span\{display:none;\}/);
  assert.match(styles,/#sidebar\.collapsed \.workspaceSwitcherBtn\{justify-content:center;width:42px;height:42px/);
  assert.doesNotMatch(styles,/#sidebar\.collapsed #projectList/);
  assert.match(styles,/#sidebar\.collapsed \.sidebarBottomNav \.uiDivider\{display:block;\}/);
  assert.doesNotMatch(styles,/#tagsSection/);
  assert.match(styles,/#sidebar\.collapsed #globalSearch\{position:absolute;inset:0;width:42px;height:42px;padding:0;opacity:0;cursor:pointer;\}/);
  assert.match(index,/<img class="markCollapsed" src="images\/icon\.png" alt="">/);
  assert.match(index,/<input class="form-control" id="globalSearch"[^>]*title="Search or run a command"/);
  assert.match(styles,/@media \(min-width:861px\)\{#sidebar\.collapsed \+ #sidebarCollapseHandle\{left:42px;\}\}/);
  assert.doesNotMatch(styles,/#sidebar\.collapsed\{width:0/);
});

test("sidebar folders can be collapsed, expanded, and remembered",()=>{
  assert.match(app,/const COLLAPSED_FOLDERS_KEY = "personal_dashboard_collapsed_folders_v1"/);
  assert.match(app,/toggle\.setAttribute\("aria-expanded",String\(!folderCollapsed\)\)/);
  assert.match(app,/projectRow\.classList\.toggle\("folderProjectRow--collapsed",folderCollapsed\)/);
  assert.match(app,/projectRow\.inert=folderCollapsed/);
  assert.match(app,/localStorage\.setItem\(COLLAPSED_FOLDERS_KEY,JSON\.stringify\(\[\.\.\.collapsedFolderIds\]\)\)/);
  assert.match(app,/chevron\.setAttribute\("icon","mdi:chevron-right"\)/);
  assert.match(app,/folderLink\.append\(icon,name,count\)/);
  assert.match(app,/toggle\.append\(chevron\)/);
  assert.match(app,/toggle\.disabled=projectCount===0/);
  assert.match(app,/chevron\.hidden=projectCount===0/);
  assert.match(styles,/#projectList \.folderToggle\[aria-expanded="true"\] \.folderChevron\{transform:rotate\(90deg\);\}/);
  assert.match(styles,/#projectList \.SideNav-item\.folderProjectRow\{max-height:48px;overflow:visible;transition:max-height \.2s ease,opacity \.16s ease,padding \.2s ease,transform \.16s ease,visibility 0s linear 0s;\}/);
  assert.match(styles,/#projectList \.SideNav-item\.folderProjectRow--collapsed\{max-height:0;padding-top:0!important;padding-bottom:0!important;opacity:0;overflow:hidden;/);
  assert.match(styles,/@media \(prefers-reduced-motion:reduce\)/);
});

test("selecting a project or folder in the secondary sidebar keeps it open",()=>{
  assert.match(app,/li\.onclick = \(\) => \{ selectProject\(p\.id,\{keepSecondarySidebarOpen:true\}\); \};/);
  assert.match(app,/folderLink\.onclick=\(\)=>selectFolderPage\(folder\.id,\{keepSecondarySidebarOpen:true\}\)/);
  assert.match(app,/async function selectProject\(pid,\{keepSecondarySidebarOpen=false\}=\{\}\)/);
  assert.match(app,/async function selectFolderPage\(folderId,\{keepSecondarySidebarOpen=false\}=\{\}\)/);
  assert.equal((app.match(/if \(!keepSecondarySidebarOpen\) navigation\?\.closeSecondarySidebar\(\);/g)||[]).length,2);
});

test("pinned projects are labeled and folders precede loose projects",()=>{
  assert.match(app,/const appendSectionLabel=label=>\{\s*const heading=document\.createElement\("li"\);\s*heading\.className="projectListSectionLabel";\s*heading\.textContent=label;\s*ul\.appendChild\(heading\);\s*\};[\s\S]*?if \(pinnedProjects\.length\)\{\s*appendSectionLabel\("Pinned"\);\s*\}\s*pinnedProjects\.forEach/);
  assert.match(app,/pinnedProjects\.forEach\(project=>appendProject\(project\)\);[\s\S]*?if \(pinnedProjects\.length&&\(state\.folders\.length\|\|unfiled\.length\)\)\{\s*const divider=document\.createElement\("li"\);\s*divider\.className="projectListPinnedDivider";\s*divider\.setAttribute\("aria-hidden","true"\);\s*ul\.appendChild\(divider\);\s*\}/);
  assert.match(app,/pinnedProjects\.forEach\(project=>appendProject\(project\)\);[\s\S]*?state\.folders\.forEach\(folder=>\{[\s\S]*?unfiled\.forEach\(project=>appendProject\(project\)\);/);
  assert.doesNotMatch(app,/appendSectionLabel\("(?:Projects|Folders)"\)/);
  assert.match(styles,/#projectList \.projectListSectionLabel\{padding:4px 10px;color:var\(--muted\);font-size:10\.5px;font-weight:600;letter-spacing:\.02em;line-height:1\.3;\}/);
  assert.match(styles,/#projectList \.projectListPinnedDivider\{height:0;margin:8px 10px 6px;border-top:1px solid var\(--border\);\}/);
  assert.doesNotMatch(app,/folderHeadingDivider/);
  assert.doesNotMatch(styles,/folderHeadingDivider/);
});

test("sidebar project action trigger keeps shared menu behavior with compact custom styling",()=>{
  assert.match(actionMenuStyles,/\.action-menu__trigger--sidebar\{[^}]*width:24px;[^}]*height:20px;[^}]*flex:0 0 auto;[^}]*padding:2px 4px;[^}]*border-radius:5px;[^}]*font-size:16px;/);
  assert.match(actionMenuStyles,/\.action-menu__trigger--sidebar:hover,[\s\S]*?\.action-menu__trigger--sidebar\.active\{background:var\(--bg-soft\);color:var\(--text\);\}/);
  assert.match(projectActionsMenu,/"projectMenuBtnSmall action-menu__trigger action-menu__trigger--sidebar"/);
  assert.match(app,/menuBtn\.className = "folderMenuBtn action-menu__trigger action-menu__trigger--sidebar"/);
  assert.match(styles,/#projectList \.folderHeading:hover \.folderMenuBtn,[\s\S]*?#projectList \.SideNav-item:has\(\.projectQuickMenu\.open\) \.projectMenuBtnSmall\{opacity:1;visibility:visible;transform:translateX\(0\) scale\(1\);\}/);
  assert.match(styles,/#projectList \.folderHeading:has\(\.folderMenuBtn:focus-visible\) \.folderMenuBtn/);
  assert.doesNotMatch(styles,/#projectList \.folderHeading:focus-within \.folderMenuBtn/);
});

test("keeps appearance controls usable when local storage is unavailable",()=>{
  const harness=createHarness({prefersDark:true,storageThrows:true});

  harness.appearance.initTheme();
  harness.appearance.toggleSidebarCollapsed();

  assert.equal(harness.attributes.get("data-theme"),"dark");
  assert.equal(harness.elements.sidebar.collapsed,true);
});
