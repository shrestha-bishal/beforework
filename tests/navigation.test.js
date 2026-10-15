"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");
const appScripts=require("./helpers/app-script-order");

const source=fs.readFileSync(path.join(__dirname,"../js/ui/navigation.js"),"utf8");
const app=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
const index=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");
const styles=fs.readFileSync(path.join(__dirname,"../styles/app.css"),"utf8");

function makeElement(id){
  const classes=new Set();
  return {
    id,
    onclick:null,
    hidden:false,
    textContent:"",
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
    removeAttribute(name){ delete this.attributes[name]; },
    replaceChildren(...children){ this.children=children; },
    addEventListener(){}
  };
}

function createHarness(){
  const ids=[
    "overviewNav","brandHomeBtn","calendarNav","roadmapNav","projectsNav","secondarySidebar",
    "secondarySidebarTitle","secondarySidebarContent","secondarySidebarClose","sidebarProjects","integrationsNav","settingsNav","supportNav",
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

test("Projects list and create controls live in the secondary sidebar",()=>{
  assert.match(index,/<button id="projectsNav"[^>]*aria-controls="secondarySidebar"><iconify-icon icon="mdi:layers-outline"/);
  assert.match(index,/<aside id="secondarySidebar" aria-labelledby="secondarySidebarTitle" aria-hidden="true" inert>[\s\S]*?<div id="secondarySidebarContent">[\s\S]*?<ul class="SideNav" id="projectList"><\/ul>/);
  assert.ok(index.indexOf('id="projectsNav"')>index.indexOf('id="roadmapNav"'));
  assert.ok(index.indexOf('id="projectsNav"')<index.indexOf('id="secondarySidebar"'));
  assert.ok(index.indexOf('class="sidebarProjects"')>index.indexOf('id="secondarySidebarContent"'));
  assert.match(index,/<div class="sidebarProjects" id="sidebarProjects">/);
  assert.match(index,/<div class="secondarySidebarActions">[\s\S]*?<button id="secondarySidebarClose"[\s\S]*?<button class="btn btn-sm btn-invisible projectCreateBtn"[^>]*id="projectCreateBtn"[^>]*aria-controls="projectCreateMenu"/);
  assert.doesNotMatch(index,/<div class="sidebarProjects" id="sidebarProjects">[\s\S]*?projectSectionHeader/);
  assert.match(styles,/#sidebar\.collapsed #projectsNav span,\s*#sidebar\.collapsed #integrationsNav span/);
  assert.match(styles,/#secondarySidebar\.open\{flex-basis:264px;width:264px/);
  assert.match(styles,/\.secondarySidebarActions\{display:flex;flex:none;align-items:center;gap:4px;margin-left:auto;\}/);
  assert.match(styles,/#secondarySidebarClose:hover,.projectCreateBtn:hover,[\s\S]*?\.projectCreateBtn\.active\{background:var\(--bg-soft2\);color:var\(--text\);\}/);
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

test("secondary sidebar preserves the project list when reopening and accepts reusable section content",()=>{
  const harness=createHarness();
  const {projectsNav,secondarySidebar,secondarySidebarTitle,secondarySidebarContent,secondarySidebarClose}=harness.elements;
  secondarySidebarContent.children=["project list"];
  projectsNav.onclick();
  assert.equal(secondarySidebarTitle.textContent,"Projects");
  assert.deepEqual(secondarySidebarContent.children,[harness.elements.sidebarProjects]);
  assert.equal(secondarySidebar.classList.contains("open"),true);
  assert.equal(secondarySidebar.attributes["aria-hidden"],"false");
  assert.equal(secondarySidebar.attributes.inert,undefined);
  assert.equal(projectsNav.attributes["aria-expanded"],"true");

  const content={};
  harness.navigation.openSecondarySidebar({title:"Another section",renderContent:container=>container.replaceChildren(content)});
  assert.equal(secondarySidebarTitle.textContent,"Another section");
  assert.deepEqual(secondarySidebarContent.children,[content]);

  harness.navigation.closeSecondarySidebar();
  projectsNav.onclick();
  assert.deepEqual(secondarySidebarContent.children,[harness.elements.sidebarProjects]);
  secondarySidebarClose.onclick();
  assert.equal(secondarySidebar.classList.contains("open"),false);
  assert.equal(secondarySidebar.attributes["aria-hidden"],"true");
  assert.equal(secondarySidebar.attributes.inert,"");
  assert.equal(projectsNav.attributes["aria-expanded"],"false");
});

test("selecting another navigation destination closes the secondary sidebar",()=>{
  const harness=createHarness();
  harness.elements.projectsNav.onclick();
  harness.elements.calendarNav.onclick();
  assert.equal(harness.elements.secondarySidebar.classList.contains("open"),false);
  assert.equal(harness.elements.projectsNav.attributes["aria-expanded"],"false");
  assert.deepEqual(harness.calls,["calendar"]);
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
  assert.ok(appScripts.indexOf("ui/action-menu.js")<appScripts.indexOf("app.js"));
  assert.match(app,/window\.BeforeworkNavigation\.create\(/);
  assert.doesNotMatch(app,/document\.getElementById\("workspaceSwitcherBtn"\)\.onclick/);
  assert.doesNotMatch(app,/document\.getElementById\("sidebarToggle"\)\.onclick/);
  assert.ok(appScripts.indexOf("ui/navigation.js")<appScripts.indexOf("app.js"));
});
