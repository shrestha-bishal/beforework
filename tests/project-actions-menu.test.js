"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const source=fs.readFileSync(path.join(__dirname,"../js/ui/project-actions-menu.js"),"utf8");
const app=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
const index=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");

function makeElement(id){
  const classes=new Set();
  const listeners={};
  const attributes={};
  return {
    id,
    onclick:null,
    hidden:false,
    attributes,
    listeners,
    setAttribute(name,value){ attributes[name]=value; },
    classList:{
      add(name){ classes.add(name); },
      remove(name){ classes.delete(name); },
      contains(name){ return classes.has(name); },
      toggle(name){
        if (classes.has(name)){ classes.delete(name); return false; }
        classes.add(name);
        return true;
      }
    },
    addEventListener(name,callback){ listeners[name]=callback; }
  };
}

function createHarness(){
  const button=makeElement("projectMenuBtn");
  const menu=makeElement("projectMenu");
  const documentListeners={};
  const documentRef={
    getElementById(id){ return id==="projectMenuBtn" ? button : menu; },
    addEventListener(name,callback){ documentListeners[name]=callback; }
  };
  const window={
    BeforeworkActionMenu:{
      create:()=>({
        register(registeredButton,registeredMenu){
          return {
            close(){
              registeredMenu.classList.remove("open");
              registeredMenu.hidden=true;
              registeredButton.classList.remove("active");
              registeredButton.setAttribute("aria-expanded","false");
            }
          };
        }
      })
    }
  };
  vm.runInNewContext(source,{window},{filename:"project-actions-menu.js"});
  const controller=window.BeforeworkProjectActionsMenu.create({documentRef});
  controller.wire();
  return {button,menu,documentListeners,controller};
}

test("project actions menu delegates shared state and exposes a close controller",()=>{
  const harness=createHarness();
  harness.menu.classList.add("open");
  harness.menu.hidden=false;
  harness.button.classList.add("active");
  harness.controller.close();
  assert.equal(harness.menu.classList.contains("open"),false);
  assert.equal(harness.menu.hidden,true);
  assert.equal(harness.button.classList.contains("active"),false);
  assert.equal(harness.button.attributes["aria-expanded"],"false");
  assert.equal(harness.button.onclick,null);
});

test("project actions menu defaults to the global document when options are omitted",()=>{
  const button=makeElement("projectMenuBtn");
  const menu=makeElement("projectMenu");
  const documentRef={
    getElementById(id){ return id==="projectMenuBtn" ? button : menu; },
    addEventListener(){}
  };
  const window={
    document:documentRef,
    BeforeworkActionMenu:{create:()=>({register:()=>({close(){}})})}
  };
  vm.runInNewContext(source,{window},{filename:"project-actions-menu.js"});
  const controller=window.BeforeworkProjectActionsMenu.create();

  assert.equal(typeof controller.wire,"function");
  assert.equal(typeof controller.close,"function");
});

test("selecting a project action closes the menu without replacing action handlers",()=>{
  const {button,menu}=createHarness();
  let actionCalled=false;
  const actionButton={onclick(){ actionCalled=true; }};
  actionButton.onclick();
  menu.listeners.click({target:{closest:selector=>selector==="button" ? actionButton : null}});
  assert.equal(actionCalled,true);
  assert.equal(menu.classList.contains("open"),false);
  assert.equal(button.classList.contains("active"),false);
});

test("outside clicks and the print action close the project actions menu",()=>{
  const harness=createHarness();
  harness.menu.classList.add("open");
  harness.menu.hidden=false;
  harness.controller.close();
  assert.equal(harness.menu.classList.contains("open"),false);
  assert.equal(harness.button.classList.contains("active"),false);

  assert.match(app,/window\.BeforeworkProjectActionsMenu\.create\(/);
  assert.doesNotMatch(app,/document\.getElementById\("projectMenuBtn"\)\.onclick/);
  assert.ok(index.indexOf('src="js/ui/project-actions-menu.js"')<index.indexOf('src="js/app.js"'));
});

test("project-level custom field actions are labeled Add field",()=>{
  assert.match(index,/<button class="btn btn-sm btn-invisible" id="addFieldBtn">Add field<\/button>/);
  assert.match(index,/data-project-action="delete" class="danger menu-item menu-item--danger" id="deleteProjectBtn" role="menuitem">Delete<\/button>/);
  assert.match(app,/<button type="button" data-project-action="add-field">Add field<\/button>/);
  assert.match(app,/data-project-action="delete" class="danger menu-item menu-item--danger" role="menuitem">Delete<\/button>/);
  assert.match(app,/data-folder-action="delete" class="danger menu-item menu-item--danger" role="menuitem">Delete<\/button>/);
  assert.match(app,/const addFieldBtn = document\.getElementById\("addFieldBtn"\)/);
  assert.match(app,/action === "add-field"[\s\S]*?addFieldFlow\(await ensureProjectLoaded\(p\.id\)\)/);
  assert.match(app,/title:"Add field", fields:\[\s*\{label:"Field type"/);
  assert.doesNotMatch(app,/manageFieldsBtn|data-project-action="add-column"|addColumnFlow/);
});

test("project menu offers a reversible Overview visibility action",()=>{
  assert.match(app,/data-project-action="overview-visibility"/);
  assert.match(app,/\$\{p\.hiddenFromOverview\?"Show on Overview":"Hide from Overview"\}/);
  assert.match(app,/async function toggleProjectOverviewVisibility\(projectId\)/);
  assert.match(app,/project\.hiddenFromOverview=!project\.hiddenFromOverview/);
  assert.match(app,/if \(state\.folderLazy\) registerProjectSummary\(project\)/);
  assert.match(app,/getElementById\("projectOverviewVisibilityBtn"\)/);
  assert.match(app,/overviewVisibilityBtn\.onclick=\(\)=>toggleProjectOverviewVisibility\(project\.id\)/);
  assert.match(index,/<button class="btn btn-sm btn-invisible" id="projectOverviewVisibilityBtn">Hide from Overview<\/button>/);
});

test("project action menus group project, work, and utility actions before Delete",()=>{
  const headerMenuStart=index.indexOf('<div class="menu action-menu action-menu--project" id="projectMenu"');
  const headerMenuEnd=index.indexOf(">Delete</button>",headerMenuStart);
  const headerMenu=index.slice(headerMenuStart,headerMenuEnd+">Delete</button>".length);
  const sidebarMenu=app.match(/menu\.innerHTML = `([\s\S]*?)`;/)?.[1]||"";
  const orderedActions=["Edit project","Overview","Move to folder","Duplicate project","New group","Add field","Import from CSV","Undo","Print / PDF","Delete"];

  for (const menu of [headerMenu,sidebarMenu]){
    let previous=-1;
    for (const label of orderedActions){
      const position=menu.indexOf(label);
      assert.ok(position>previous,`${label} should follow the preceding project menu actions`);
      previous=position;
    }
    assert.equal((menu.match(/action-menu__separator/g)||[]).length,3);
  }
  assert.match(app,/action === "import-csv"[\s\S]*?openCsvImportDialog\("existing",p\.id\)/);
});
