"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const source=fs.readFileSync(path.join(__dirname,"../js/ui/navigation.js"),"utf8");
const app=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
const index=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");

function makeElement(id){
  const classes=new Set();
  return {
    id,
    onclick:null,
    hidden:false,
    attributes:{},
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
    setAttribute(name,value){ this.attributes[name]=value; },
    addEventListener(){}
  };
}

function createHarness(){
  const ids=[
    "overviewNav","brandHomeBtn","calendarNav","roadmapNav","integrationsNav","settingsNav","supportNav",
    "workspaceSwitcherBtn","workspaceSwitcherMenu","workspaceSwitchBtn","workspaceNewBtn","sidebar",
    "sidebarScrim","sidebarToggle"
  ];
  const elements=Object.fromEntries(ids.map(id=>[id,makeElement(id)]));
  const calls=[];
  const documentListeners={};
  const documentRef={
    getElementById:id=>elements[id],
    addEventListener(name,callback){ documentListeners[name]=callback; }
  };
  const window={
    BeforeworkActionMenu:{
      create:()=>({
        register(button,menu){
          return {
            close(){
              menu.classList.remove("open");
              menu.hidden=true;
              button.classList.remove("active");
              button.setAttribute("aria-expanded","false");
            }
          };
        }
      })
    }
  };
  vm.runInNewContext(source,{window},{filename:"navigation.js"});
  const navigation=window.BeforeworkNavigation.create({
    documentRef,
    onOverview:()=>calls.push("overview"),
    onCalendar:()=>calls.push("calendar"),
    onRoadmap:()=>calls.push("roadmap"),
    onIntegrations:()=>calls.push("integrations"),
    onSettings:()=>calls.push("settings"),
    onSupport:()=>calls.push("support"),
    switchWorkspace:async()=>calls.push("switch"),
    createWorkspace:async()=>calls.push("create")
  });
  navigation.wire();
  return {elements,calls,documentListeners,navigation};
}

test("sidebar does not include the removed Tags section",()=>{
  assert.doesNotMatch(index,/tagsSection|tagsSectionLabel|sideTagsList|manageTagsBtn/);
  assert.doesNotMatch(app,/renderSidebarTags|tagDotHtml|manageTagsBtn|Manage tags in/);
});

test("navigation controls delegate each destination to its app callback",()=>{
  const harness=createHarness();
  for (const id of ["overviewNav","brandHomeBtn","calendarNav","roadmapNav","integrationsNav","settingsNav","supportNav"]){
    harness.elements[id].onclick();
  }
  assert.deepEqual(harness.calls,["overview","overview","calendar","roadmap","integrations","settings","support"]);
});

test("workspace switcher closes before invoking workspace actions",async()=>{
  const harness=createHarness();
  const {workspaceSwitcherBtn,workspaceSwitcherMenu,workspaceSwitchBtn,workspaceNewBtn}=harness.elements;
  workspaceSwitcherMenu.classList.add("open");
  workspaceSwitcherMenu.hidden=false;
  workspaceSwitcherBtn.setAttribute("aria-expanded","true");
  assert.equal(workspaceSwitcherBtn.attributes["aria-expanded"],"true");

  await workspaceSwitchBtn.onclick();
  assert.equal(workspaceSwitcherMenu.classList.contains("open"),false);
  assert.equal(workspaceSwitcherBtn.attributes["aria-expanded"],"false");
  workspaceSwitcherMenu.classList.add("open");
  workspaceSwitcherMenu.hidden=false;
  workspaceSwitcherBtn.setAttribute("aria-expanded","true");
  await workspaceNewBtn.onclick();
  assert.deepEqual(harness.calls,["switch","create"]);
  assert.equal(workspaceSwitcherMenu.classList.contains("open"),false);
});

test("navigation owns mobile sidebar open and close interactions",()=>{
  const harness=createHarness();
  const {sidebar,sidebarScrim,sidebarToggle}=harness.elements;
  sidebarToggle.onclick();
  assert.equal(sidebar.classList.contains("open"),true);
  assert.equal(sidebarScrim.classList.contains("show"),true);
  sidebarScrim.onclick();
  assert.equal(sidebar.classList.contains("open"),false);
  assert.equal(sidebarScrim.classList.contains("show"),false);
  harness.navigation.toggleSidebar();
  harness.navigation.closeSidebarOnMobile();
  assert.equal(sidebar.classList.contains("open"),false);
  assert.equal(sidebarScrim.classList.contains("show"),false);
});

test("workspace switcher uses the shared action menu component",()=>{
  const harness=createHarness();
  const {workspaceSwitcherBtn,workspaceSwitcherMenu}=harness.elements;
  workspaceSwitcherMenu.classList.add("open");
  workspaceSwitcherMenu.hidden=false;
  workspaceSwitcherBtn.setAttribute("aria-expanded","true");
  harness.navigation.closeSidebarOnMobile();
  harness.elements.workspaceSwitchBtn.onclick();
  assert.equal(workspaceSwitcherMenu.classList.contains("open"),false);
  assert.equal(workspaceSwitcherBtn.attributes["aria-expanded"],"false");

  assert.match(source,/BeforeworkActionMenu\.create\(\{documentRef\}\)[\s\S]*?\.register\(workspaceSwitcherBtn,workspaceSwitcherMenu,\{styleTrigger:false\}\)/);
  assert.match(index,/class="menu action-menu action-menu--workspace workspaceSwitcherMenu"/);
  assert.ok(index.indexOf('src="js/ui/action-menu.js"')<index.indexOf('src="js/app.js"'));
  assert.match(app,/window\.BeforeworkNavigation\.create\(/);
  assert.doesNotMatch(app,/document\.getElementById\("workspaceSwitcherBtn"\)\.onclick/);
  assert.doesNotMatch(app,/document\.getElementById\("sidebarToggle"\)\.onclick/);
  assert.ok(index.indexOf('src="js/ui/navigation.js"')<index.indexOf('src="js/app.js"'));
});
