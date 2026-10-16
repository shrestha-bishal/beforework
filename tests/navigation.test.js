"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");
const appScripts=require("./helpers/app-script-order");

const source=fs.readFileSync(path.join(__dirname,"../js/ui/navigation.js"),"utf8");
const navigationTemplate=fs.readFileSync(path.join(__dirname,"../pages/navigation.html"),"utf8");
const navigationViewSource=fs.readFileSync(path.join(__dirname,"../js/views/navigation-view.js"),"utf8");
const app=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
const index=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");
const styles=fs.readFileSync(path.join(__dirname,"../styles/app.css"),"utf8");

function makeElement(id){
  const classes=new Set();
  const listeners={};
  return {
    id,
    onclick:null,
    dataset:{},
    hidden:false,
    value:"",
    textContent:"",
    attributes:{},
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
    setAttribute(name,value){ this.attributes[name]=value; },
    removeAttribute(name){ delete this.attributes[name]; },
    click(){ this.onclick?.(); },
    replaceChildren(...children){ this.children=children; },
    appendChild(child){ this.children.push(child); return child; },
    contains(child){ return this.children?.includes(child)||false; },
    addEventListener(name,listener){ listeners[name]=listener; },
    dispatch(name){ listeners[name]?.({target:this}); }
  };
}

function createHarness(storage=new Map()){
  const ids=[
    "overviewNav","brandHomeBtn","calendarNav","roadmapNav","focusTimerNav","projectsNav","documentsNav","secondarySidebar",
    "secondarySidebarTitle","secondarySidebarSearch","secondarySidebarSearchInput","secondarySidebarContent","secondarySidebarClose","projectCreateBtn","sidebarProjects","integrationsNav","settingsNav","supportNav","feedbackNav",
    "workspaceSwitcherBtn","workspaceSwitcherLabel","workspaceSidebarActions","workspaceSidebarName","workspaceSwitchBtn","workspaceNewBtn","sidebar",
    "sidebarScrim","sidebarToggle"
  ];
  const elements=Object.fromEntries(ids.map(id=>[id,makeElement(id)]));
  elements.secondarySidebarSearch.hidden=true;
  elements.workspaceSwitcherLabel.textContent="Personal Workspace";
  elements.workspaceSwitcherBtn.setAttribute("aria-expanded","false");
  elements.projectsNav.setAttribute("aria-expanded","false");
  const calls=[];
  const searches=[];
  const documentSearches=[];
  const window={localStorage:{
    getItem(key){ return storage.get(key)||null; },
    setItem(key,value){ storage.set(key,value); },
    removeItem(key){ storage.delete(key); }
  }};
  const secondaryItems=[
    {kind:"secondary",id:"projectsNav",section:"projects",title:"Projects",searchable:true},
    {kind:"secondary",id:"documentsNav",section:"documents",title:"Documents",searchable:true},
    {kind:"secondary",id:"workspaceSwitcherBtn",section:"workspace",title:"Workspace",content:"workspace"}
  ];
  const navigationView={
    items:[
      {kind:"primary",id:"brandHomeBtn",action:"overview"},
      {kind:"primary",id:"overviewNav",action:"overview"},
      ...secondaryItems,
      {kind:"primary",id:"calendarNav",action:"calendar"},
      {kind:"primary",id:"roadmapNav",action:"roadmap"},
      {kind:"primary",id:"focusTimerNav",action:"timer"},
      {kind:"primary",id:"integrationsNav",action:"integrations"},
      {kind:"primary",id:"settingsNav",action:"settings"},
      {kind:"primary",id:"supportNav",action:"support"},
      {kind:"primary",id:"feedbackNav",action:"feedback"}
    ],
    getElement:id=>elements[id],
    getSecondarySection:section=>{
      const item=secondaryItems.find(candidate=>candidate.section===section);
      if (!item) throw new Error(`Missing section ${section}`);
      return {...item,trigger:elements[item.id]};
    }
  };
  vm.runInNewContext(source,{window},{filename:"navigation.js"});
  const navigation=window.BeforeworkNavigation.create({
    navigationView,
    onOverview:()=>calls.push("overview"),
    onCalendar:()=>calls.push("calendar"),
    onRoadmap:()=>calls.push("roadmap"),
    onTimer:()=>calls.push("timer"),
    onIntegrations:()=>calls.push("integrations"),
    onSettings:()=>calls.push("settings"),
    onSupport:()=>calls.push("support"),
    onFeedback:()=>calls.push("feedback"),
    switchWorkspace:async()=>calls.push("switch"),
    createWorkspace:async()=>calls.push("create")
  });

  navigation.wire();
  navigation.registerSecondarySection({
    ...navigationView.getSecondarySection("projects"),
    renderContent:content=>content.replaceChildren(elements.sidebarProjects),
    onSearch:query=>searches.push(query)
  });
  return {elements,calls,navigation,storage,searches,documentSearches};
}

test("Projects and Documents sections show search while Workspace keeps it hidden",()=>{
  const harness=createHarness();
  const {projectsNav,secondarySidebarSearch,secondarySidebarSearchInput,documentsNav}=harness.elements;
  harness.navigation.registerSecondarySection({
    section:"documents",
    title:"Documents",
    trigger:documentsNav,
    searchable:true,
    onSearch:query=>harness.documentSearches.push(query),
    renderContent:content=>content.replaceChildren(makeElement("documentsList"))
  });

  assert.equal(secondarySidebarSearch.hidden,true);
  projectsNav.onclick();
  assert.equal(secondarySidebarSearch.hidden,false);
  assert.equal(secondarySidebarSearchInput.placeholder,"Search projects");
  assert.deepEqual(harness.searches,[""]);

  secondarySidebarSearchInput.value="  planning  ";
  secondarySidebarSearchInput.dispatch("input");
  assert.deepEqual(harness.searches,["","planning"]);

  documentsNav.onclick();
  assert.equal(secondarySidebarSearch.hidden,false);
  assert.equal(secondarySidebarSearchInput.placeholder,"Search documents");
  assert.equal(secondarySidebarSearchInput.value,"");
  assert.deepEqual(harness.searches,["","planning",""]);
  assert.deepEqual(harness.documentSearches,[""]);
  secondarySidebarSearchInput.value="  notes  ";
  secondarySidebarSearchInput.dispatch("input");
  assert.deepEqual(harness.documentSearches,["","notes"]);

  harness.elements.workspaceSwitcherBtn.onclick();
  assert.equal(secondarySidebarSearch.hidden,true);
  assert.equal(secondarySidebarSearchInput.value,"");
  assert.deepEqual(harness.documentSearches,["","notes",""]);

  projectsNav.onclick();
  assert.equal(secondarySidebarSearch.hidden,false);
  harness.elements.secondarySidebarClose.onclick();
  assert.equal(secondarySidebarSearch.hidden,true);
  assert.equal(secondarySidebarSearchInput.value,"");
  assert.deepEqual(harness.searches,["","planning","","",""]);
});

test("searchable secondary sections require a query handler",()=>{
  const harness=createHarness();
  const searchableSection={
    section:"searchable-docs",
    title:"Searchable documents",
    trigger:makeElement("searchableDocsNav"),
    renderContent:()=>{},
    searchable:true
  };
  assert.throws(()=>harness.navigation.registerSecondarySection(searchableSection),/requires an onSearch callback/);
  assert.throws(()=>harness.navigation.openSecondarySidebar(searchableSection),/requires an onSearch callback/);
});

test("secondary sections render only their own content",()=>{
  const harness=createHarness();
  const {secondarySidebarContent,sidebarProjects,documentsNav}=harness.elements;
  const documentsList=makeElement("documentsList");
  harness.navigation.registerSecondarySection({
    section:"documents",
    title:"Documents",
    trigger:documentsNav,
    renderContent:content=>content.replaceChildren(documentsList)
  });

  documentsNav.onclick();
  assert.deepEqual(secondarySidebarContent.children,[documentsList]);

  harness.navigation.refreshSecondarySection();
  assert.deepEqual(secondarySidebarContent.children,[documentsList]);
});

test("registered secondary-section create action repurposes and restores the header plus",()=>{
  const harness=createHarness();
  const {documentsNav,projectCreateBtn}=harness.elements;
  let created=0;
  harness.navigation.registerSecondarySection({
    section:"documents",
    title:"Documents",
    trigger:documentsNav,
    renderContent:()=>{},
    createLabel:"New document",
    onCreate:()=>{ created++; }
  });

  test("registered secondary sections can open for detail-page navigation without changing route",()=>{
    const harness=createHarness();
    const {projectsNav,secondarySidebar,secondarySidebarTitle,sidebarProjects,secondarySidebarContent}=harness.elements;
    harness.navigation.openSecondarySection("projects");
    assert.equal(secondarySidebar.classList.contains("open"),true);
    assert.equal(secondarySidebar.attributes["aria-hidden"],"false");
    assert.equal(secondarySidebarTitle.textContent,"Projects");
    assert.deepEqual(secondarySidebarContent.children,[sidebarProjects]);
    assert.deepEqual(harness.calls,[]);
    assert.equal(projectsNav.attributes["aria-expanded"],"true");
    assert.throws(()=>harness.navigation.openSecondarySection("unknown"),/No secondary navigation section is registered/);
  });

  documentsNav.onclick();
  assert.equal(projectCreateBtn.title,"New document");
  assert.equal(projectCreateBtn.attributes["aria-label"],"New document");
  assert.equal(projectCreateBtn.attributes["aria-haspopup"],undefined);
  assert.equal(projectCreateBtn.dataset.actionMenuTrigger,undefined);
  projectCreateBtn.click();
  assert.equal(created,1);

  harness.navigation.closeSecondarySidebar();
  assert.equal(projectCreateBtn.title,"Create project or folder");
  assert.equal(projectCreateBtn.attributes["aria-haspopup"],"menu");
  assert.equal(projectCreateBtn.dataset.actionMenuTrigger,"true");
  assert.equal(projectCreateBtn.onclick,null);
});

test("sidebar does not include the removed Tags section",()=>{
  assert.doesNotMatch(index,/tagsSection|tagsSectionLabel|sideTagsList|manageTagsBtn/);
  assert.doesNotMatch(app,/renderSidebarTags|tagDotHtml|manageTagsBtn|Manage tags in/);
});

test("Projects list and create controls live in the secondary sidebar",()=>{
  assert.match(index,/<div id="navigationMount"><\/div>/);
  assert.match(navigationTemplate,/<button id="projectsNav"[^>]*aria-controls="secondarySidebar"><iconify-icon icon="mdi:layers-outline"/);
  assert.match(navigationTemplate,/<aside id="secondarySidebar" aria-labelledby="secondarySidebarTitle" aria-hidden="true" inert>[\s\S]*?<div id="secondarySidebarContent">[\s\S]*?<ul class="SideNav" id="projectList"><\/ul>/);
  assert.ok(navigationTemplate.indexOf('id="projectsNav"')<navigationTemplate.indexOf('id="secondarySidebar"'));
  assert.ok(navigationTemplate.indexOf('class="sidebarProjects"')>navigationTemplate.indexOf('id="secondarySidebarContent"'));
  assert.match(navigationTemplate,/<div class="sidebarProjects" id="sidebarProjects">/);
  assert.match(navigationTemplate,/<label class="secondarySidebarSearch" id="secondarySidebarSearch" hidden>/);
  assert.match(navigationTemplate,/<input class="form-control" id="secondarySidebarSearchInput" type="search"/);
  assert.match(styles,/\.secondarySidebarSearch input::placeholder\{font-weight:var\(--font-weight-regular\);\}/);
  assert.match(navigationViewSource,/section:"projects",title:"Projects",searchable:true/);
  assert.match(navigationViewSource,/section:"documents",title:"Documents",searchable:true/);
  assert.doesNotMatch(navigationViewSource,/section:"workspace",title:"Workspace",content:"workspace",searchable:true/);
  assert.match(app,/const projectsSidebar=navigationView\.getElement\("sidebarProjects"\);\s*navigation\.registerSecondarySection\(\{\s*\.\.\.navigationView\.getSecondarySection\("projects"\),\s*renderContent:content=>content\.replaceChildren\(projectsSidebar\),[\s\S]*?onSearch:query=>\{\s*projectListSearch=query;\s*renderProjectList\(\);\s*\}/);
  assert.match(app,/onSearch:onWorkspaceDocumentsSearch/);
  assert.match(app,/const matchesProject=project=>!query\|\|project\.name\.toLocaleLowerCase\(\)\.includes\(query\)[\s\S]*?folderById\.get\(project\.folderId\)\?\.name\.toLocaleLowerCase\(\)\.includes\(query\)/);
  assert.match(styles,/\.secondarySidebarSearch\{display:flex;flex:none;align-items:center;gap:8px/);
  assert.match(navigationTemplate,/<button class="workspaceSwitcherBtn" id="workspaceSwitcherBtn" type="button" aria-expanded="false" aria-controls="secondarySidebar">/);
  assert.ok(navigationTemplate.indexOf('id="overviewNav"')<navigationTemplate.indexOf('id="projectsNav"'));
  assert.ok(navigationTemplate.indexOf('id="projectsNav"')<navigationTemplate.indexOf('id="workspaceDocumentsNav"'));
  assert.ok(navigationTemplate.indexOf('id="workspaceDocumentsNav"')<navigationTemplate.indexOf('id="calendarNav"'));
  assert.ok(navigationTemplate.indexOf('id="calendarNav"')<navigationTemplate.indexOf('id="roadmapNav"'));
  assert.match(navigationTemplate,/<span class="workspaceSwitcherCaption">Workspace<\/span>/);
  assert.match(navigationTemplate,/<div class="workspaceSidebarActions" id="workspaceSidebarActions">[\s\S]*?id="workspaceSwitchBtn"[\s\S]*?Open different workspace[\s\S]*?id="workspaceNewBtn"[\s\S]*?Create new workspace/);
  assert.doesNotMatch(navigationTemplate,/id="workspaceSwitcherMenu"/);
  assert.match(navigationTemplate,/<div class="secondarySidebarActions">[\s\S]*?<button id="secondarySidebarClose"[\s\S]*?<button class="btn btn-sm btn-invisible projectCreateBtn"[^>]*id="projectCreateBtn"[^>]*aria-controls="projectCreateMenu"/);
  assert.doesNotMatch(navigationTemplate,/<div class="sidebarProjects" id="sidebarProjects">[\s\S]*?projectSectionHeader/);
  assert.match(navigationViewSource,/kind:"primary"/);
  assert.match(navigationViewSource,/kind:"secondary"/);
  assert.match(navigationViewSource,/getSecondarySection\(section\)/);
  assert.match(styles,/#sidebar #projectsNav span,\s*#sidebar #integrationsNav span/);
  assert.match(styles,/#secondarySidebar\.open\{flex-basis:264px;width:264px/);
  assert.match(styles,/#secondarySidebar\.open\{margin:6px 0;border:1px solid var\(--border\);border-radius:12px;background:var\(--sidebar-card-bg\);box-shadow:var\(--shadow-side\);\}/);
  assert.match(styles,/\.secondarySidebarHeader\{display:flex;flex:none;align-items:center;gap:8px;min-height:56px;padding:10px 14px;\}/);
  assert.match(styles,/#projectList\{[^}]*background:transparent;/);
  assert.match(styles,/#projectList \.SideNav-item\.active\{background:var\(--bg-soft\);color:var\(--text\);font-weight:var\(--font-weight-semibold\);\}/);
  assert.match(styles,/#projectList \.SideNav-item\.active \.projectIcon\{color:var\(--muted\);\}/);
  assert.match(styles,/#projectList \.folderHeading iconify-icon\{flex:none;color:var\(--muted\);font-size:14px;\}/);
  assert.match(styles,/#projectList \.folderHeading:has\(\.folderPageLink\[aria-current="page"\]\)\{border-radius:6px;background:var\(--bg-soft\);\}/);
  assert.match(styles,/\.secondarySidebarActions\{display:flex;flex:none;align-items:center;gap:4px;margin-left:auto;\}/);
  assert.match(styles,/#secondarySidebarClose:hover,.projectCreateBtn:hover,[\s\S]*?\.projectCreateBtn\.active\{background:var\(--bg-soft2\);color:var\(--text\);\}/);
});

test("navigation controls delegate each destination to its app callback",()=>{
  const harness=createHarness();
  for (const id of ["overviewNav","brandHomeBtn","calendarNav","roadmapNav","focusTimerNav","integrationsNav","settingsNav","supportNav","feedbackNav"]){
    harness.elements[id].onclick();
  }
  assert.deepEqual(harness.calls,["overview","overview","calendar","roadmap","timer","integrations","settings","support","feedback"]);
});

test("workspace and project sections are mutually exclusive in the secondary sidebar",()=>{
  const harness=createHarness();
  const {workspaceSwitcherBtn,workspaceSidebarActions,projectsNav,sidebarProjects,secondarySidebar,secondarySidebarTitle,secondarySidebarContent}=harness.elements;
  workspaceSwitcherBtn.onclick();
  assert.equal(secondarySidebarTitle.textContent,"Workspace");
  assert.equal(secondarySidebar.attributes["data-section"],"workspace");
  assert.equal(harness.elements.sidebar.attributes["data-secondary-section"],"workspace");
  assert.deepEqual(secondarySidebarContent.children,[workspaceSidebarActions]);
  assert.equal(harness.elements.workspaceSidebarName.textContent,"Personal Workspace");
  assert.equal(workspaceSwitcherBtn.attributes["aria-expanded"],"true");
  assert.equal(projectsNav.attributes["aria-expanded"],"false");

  projectsNav.onclick();
  assert.equal(secondarySidebarTitle.textContent,"Projects");
  assert.equal(secondarySidebar.attributes["data-section"],"projects");
  assert.equal(harness.elements.sidebar.attributes["data-secondary-section"],"projects");
  assert.deepEqual(secondarySidebarContent.children,[sidebarProjects]);
  assert.equal(workspaceSwitcherBtn.attributes["aria-expanded"],"false");
  assert.equal(projectsNav.attributes["aria-expanded"],"true");

  workspaceSwitcherBtn.onclick();
  assert.equal(secondarySidebarTitle.textContent,"Workspace");
  assert.equal(harness.elements.sidebar.attributes["data-secondary-section"],"workspace");
  assert.deepEqual(secondarySidebarContent.children,[workspaceSidebarActions]);
  assert.equal(workspaceSwitcherBtn.attributes["aria-expanded"],"true");
  assert.equal(projectsNav.attributes["aria-expanded"],"false");

  workspaceSwitcherBtn.onclick();
  assert.equal(secondarySidebar.classList.contains("open"),false);
  assert.equal(harness.elements.sidebar.attributes["data-secondary-section"],undefined);
  assert.equal(workspaceSwitcherBtn.attributes["aria-expanded"],"false");
  assert.equal(projectsNav.attributes["aria-expanded"],"false");
});

test("workspace actions keep their section open while invoking workspace callbacks",async()=>{
  const harness=createHarness();
  const {workspaceSwitcherBtn,workspaceSwitchBtn,workspaceNewBtn,secondarySidebar}=harness.elements;
  workspaceSwitcherBtn.onclick();
  await workspaceSwitchBtn.onclick();
  assert.equal(secondarySidebar.classList.contains("open"),true);
  assert.equal(workspaceSwitcherBtn.attributes["aria-expanded"],"true");
  await workspaceNewBtn.onclick();
  assert.deepEqual(harness.calls,["switch","create"]);
  assert.equal(secondarySidebar.classList.contains("open"),true);
  assert.equal(workspaceSwitcherBtn.attributes["aria-expanded"],"true");
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
  assert.equal(projectsNav.attributes["aria-expanded"],"false");
  assert.equal(secondarySidebar.attributes["data-section"],undefined);

  harness.navigation.closeSecondarySidebar();
  assert.equal(harness.elements.sidebar.attributes["data-secondary-section"],undefined);
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
  harness.elements.workspaceSwitcherBtn.onclick();
  harness.elements.calendarNav.onclick();
  assert.equal(harness.elements.secondarySidebar.classList.contains("open"),false);
  assert.equal(harness.elements.workspaceSwitcherBtn.attributes["aria-expanded"],"false");
  assert.equal(harness.elements.projectsNav.attributes["aria-expanded"],"false");
  assert.deepEqual(harness.calls,["calendar"]);
});

test("workspace controls use the extensible secondary sidebar",()=>{
  const harness=createHarness();
  const {workspaceSwitcherBtn,projectsNav,workspaceSidebarActions,sidebarProjects,secondarySidebar}=harness.elements;
  workspaceSwitcherBtn.onclick();
  assert.deepEqual(harness.elements.secondarySidebarContent.children,[workspaceSidebarActions]);
  assert.equal(secondarySidebar.attributes["data-section"],"workspace");
  projectsNav.onclick();
  assert.deepEqual(harness.elements.secondarySidebarContent.children,[sidebarProjects]);
  assert.equal(secondarySidebar.attributes["data-section"],"projects");
  assert.match(source,/function openSecondarySidebar\(\{title,renderContent,section,trigger,searchable=false,onSearch,searchPlaceholder\}\)/);
  assert.match(source,/activeSecondaryTrigger\.setAttribute\("aria-expanded","false"\)/);
  assert.match(styles,/#sidebar #workspaceSwitcherBtn\[aria-expanded="true"\]\{background:var\(--bg-soft\);color:var\(--text\);font-weight:var\(--font-weight-semibold\);\}/);
  assert.match(styles,/#secondarySidebar\[data-section="workspace"\] \.projectCreateWrap\{display:none;\}/);
  assert.match(styles,/#secondarySidebar\[data-section\]:not\(\[data-section="projects"\]\):not\(\[data-section="workspace"\]\) #sidebarProjects\{display:none;\}/);
  assert.match(styles,/#sidebar\[data-secondary-section\] #overviewNav\.active,[\s\S]*?#sidebar\[data-secondary-section\] #supportNav\.active\{background:transparent;color:var\(--muted\);font-weight:var\(--font-weight-medium\);\}/);
  assert.match(styles,/\.workspaceSidebarIdentity strong\{overflow:hidden;color:var\(--text\);font-size:var\(--font-size-body-sm\);font-weight:var\(--font-weight-semibold\);text-overflow:ellipsis;white-space:nowrap;\}/);
  assert.match(styles,/\.workspaceSidebarActions button\{display:flex;align-items:center;gap:9px;width:100%;min-height:36px;/);
  assert.match(app,/window\.BeforeworkNavigation\.create\(/);
  assert.doesNotMatch(app,/document\.getElementById\("workspaceSwitcherBtn"\)\.onclick/);
  assert.doesNotMatch(app,/document\.getElementById\("sidebarToggle"\)\.onclick/);
  assert.ok(appScripts.indexOf("ui/navigation.js")<appScripts.indexOf("app.js"));
});

test("secondary sidebar section restores after refresh and clears when closed",()=>{
  const first=createHarness();
  first.elements.projectsNav.onclick();
  assert.equal(first.storage.get("beforework_secondary_sidebar_section_v1"),"projects");

  const refreshed=createHarness(first.storage);
  refreshed.navigation.restoreSecondarySection();
  assert.equal(refreshed.elements.secondarySidebar.classList.contains("open"),true);
  assert.equal(refreshed.elements.secondarySidebar.attributes["data-section"],"projects");
  assert.equal(refreshed.elements.projectsNav.attributes["aria-expanded"],"true");
  assert.deepEqual(refreshed.elements.secondarySidebarContent.children,[refreshed.elements.sidebarProjects]);

  refreshed.elements.secondarySidebarClose.onclick();
  assert.equal(first.storage.has("beforework_secondary_sidebar_section_v1"),false);
});

test("secondary sidebar restores any section registered by an extension",()=>{
  const first=createHarness();
  const reportsTrigger=makeElement("reportsNav");
  const reportsContent={};
  first.navigation.registerSecondarySection({
    section:"reports",
    title:"Reports",
    trigger:reportsTrigger,
    renderContent:content=>content.replaceChildren(reportsContent)
  });
  reportsTrigger.onclick();
  assert.equal(first.storage.get("beforework_secondary_sidebar_section_v1"),"reports");

  const refreshed=createHarness(first.storage);
  const refreshedTrigger=makeElement("reportsNav");
  refreshed.navigation.registerSecondarySection({
    section:"reports",
    title:"Reports",
    trigger:refreshedTrigger,
    renderContent:content=>content.replaceChildren(reportsContent)
  });
  refreshed.navigation.restoreSecondarySection();
  assert.equal(refreshed.elements.secondarySidebarTitle.textContent,"Reports");
  assert.deepEqual(refreshed.elements.secondarySidebarContent.children,[reportsContent]);
  assert.equal(refreshedTrigger.attributes["aria-expanded"],"true");
});

test("navigation view mounts template markup and classifies menu items",()=>{
  const context={};
  vm.runInNewContext(
    `${navigationViewSource.replace("export class NavigationView","class NavigationView")}\nglobalThis.NavigationView=NavigationView;`,
    context,
    {filename:"navigation-view.js"}
  );
  const requiredIds=new Set([...navigationTemplate.matchAll(/\bid="([^"]+)"/g)].map(([,id])=>id));
  const elements=new Map([...requiredIds].map(id=>[id,makeElement(id)]));
  const view=new context.NavigationView({
    documentRef:{getElementById:id=>elements.get(id)||null},
    cloneTemplate:()=>({querySelector:selector=>requiredIds.has(selector.slice(1))?{}:null})
  });
  const mount={replaceChildren(fragment){ this.fragment=fragment; }};

  view.mount(mount);
  assert.ok(mount.fragment);
  assert.ok(view.items.filter(item=>item.kind==="primary").length>0);
  assert.ok(view.items.filter(item=>item.kind==="secondary").length>0);
  assert.equal(view.getSecondarySection("documents").trigger.id,"workspaceDocumentsNav");
  assert.equal(view.getSecondarySection("documents").content,undefined);
});

test("demo startup restores the last active page before rendering",()=>{
  const demoBranch=app.slice(app.indexOf("if (demoMode){",app.indexOf("async function boot")));
  assert.match(demoBranch,/restoreActiveLocation\(\);\s*renderAll\(\);\s*restoreSecondaryNavigation\(\);/);
  assert.match(app,/renderAll\(\);\s*restoreSecondaryNavigation\(\);\s*resumeGoogleCalendarSync\(\);/);
});
