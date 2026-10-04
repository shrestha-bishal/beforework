"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const source=fs.readFileSync(path.join(__dirname,"../js/ui/project-actions-menu.js"),"utf8");
const app=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
const index=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");

function makeElement(tagName){
  const classes=new Set();
  const attributes={};
  const listeners={};
  const children=[];
  return {
    tagName,
    children,
    dataset:{},
    attributes,
    listeners,
    className:"",
    textContent:"",
    hidden:false,
    type:"",
    classList:{
      add(...names){ names.forEach(name=>classes.add(name)); },
      remove(...names){ names.forEach(name=>classes.delete(name)); },
      contains(name){ return classes.has(name); }
    },
    setAttribute(name,value){ attributes[name]=value; },
    addEventListener(name,callback){ listeners[name]=callback; },
    append(...elements){ children.push(...elements); },
    appendChild(element){ children.push(element); return element; },
    querySelector(selector){
      const match=selector.match(/data-project-action="([^"]+)"/);
      return children.find(child=>match&&child.dataset.projectAction===match[1])||null;
    }
  };
}

function createHarness(){
  const container=makeElement("div");
  const documentRef={createElement:makeElement};
  const window={
    BeforeworkActionMenu:{
      create:()=>({
        register(button,menu){
          return {
            close(){
              menu.hidden=true;
              button.setAttribute("aria-expanded","false");
            }
          };
        }
      })
    }
  };
  vm.runInNewContext(source,{window},{filename:"project-actions-menu.js"});
  const calls=[];
  const actions=Object.fromEntries(
    ["edit","overview-visibility","archive","move","duplicate","documents","add-field","import-csv","undo","print","delete"]
      .map(action=>[action,(project)=>calls.push([action,project])])
  );
  const menu=window.BeforeworkProjectActionsMenu.create({
    documentRef,container,project:{id:"project-1",name:"Launch"},
    actions
  });
  return {container,menu,calls,actions};
}

test("both project action menu variants are generated from the same ordered action catalog",()=>{
  const {container}=createHarness();
  const labels=container.children[1].children.map(item=>item.textContent);

  assert.deepEqual(labels,[
    "Edit","Hide from Overview","Move to folder","Duplicate","","Documents","",
    "Add field","Import from CSV","",
    "Undo","Print / PDF","",
    "Archive","Delete"
  ]);

  const sourceWindow={BeforeworkActionMenu:{create:()=>({register:()=>({close(){}})})}};
  vm.runInNewContext(source,{window:sourceWindow});
  const sidebarContainer=makeElement("div");
  sourceWindow.BeforeworkProjectActionsMenu.create({
    documentRef:{createElement:makeElement},
    container:sidebarContainer,
    variant:"sidebar",
    project:{id:"project-2",name:"Tax Return",hiddenFromOverview:true},
    actions:createHarness().actions
  });
  assert.deepEqual(
    sidebarContainer.children[1].children.map(item=>item.textContent),
    ["Edit","Show on Overview","Move to folder","Duplicate","","Documents","","Add field","Import from CSV","","Undo","Print / PDF","","Archive","Delete"]
  );
  assert.equal(sidebarContainer.children[1].children.some(item=>item.textContent==="New group"),false);
});

test("project archive menu action toggles its label based on project state",()=>{
  const {container,menu}=createHarness();
  const archive=container.children[1].querySelector('[data-project-action="archive"]');
  assert.equal(archive.textContent,"Archive");

  menu.setProject({id:"project-1",name:"Launch",archived:true});

  assert.equal(archive.textContent,"Unarchive");
});

test("project visibility action label tracks the selected project",()=>{
  const {container,menu}=createHarness();
  const visibility=container.children[1].querySelector('[data-project-action="overview-visibility"]');
  assert.equal(visibility.textContent,"Hide from Overview");

  menu.setProject({id:"project-1",name:"Launch",hiddenFromOverview:true});

  assert.equal(visibility.textContent,"Show on Overview");
  assert.equal(container.children[0].attributes["aria-label"],"Project actions for Launch");
});

test("selecting a project action calls its matching handler with the current project",()=>{
  const {container,calls,menu}=createHarness();
  const item=container.children[1].querySelector('[data-project-action="edit"]');
  let stopped=false;
  container.children[1].listeners.click({
    target:{closest:selector=>selector==='[data-project-action]'?item:null},
    stopPropagation(){ stopped=true; }
  });

  assert.deepEqual(JSON.parse(JSON.stringify(calls)),[["edit",{id:"project-1",name:"Launch"}]]);
  assert.equal(stopped,true);
  menu.close();
  assert.equal(container.children[1].hidden,true);
  assert.equal(container.children[0].attributes["aria-expanded"],"false");
});

test("app uses the shared component for header and sidebar menus, keeping operations in app",()=>{
  assert.match(app,/BeforeworkProjectActionsMenu\.create\(\{[\s\S]*container:wrap,[\s\S]*variant:"sidebar"/);
  assert.match(app,/BeforeworkProjectActionsMenu\.create\(\{[\s\S]*container,[\s\S]*variant:"header"/);
  assert.match(app,/const projectActionHandlers=\{/);
  assert.match(app,/edit:async project=>\{[\s\S]*?ensureProjectLoaded\(project\.id\)/);
  assert.match(app,/"overview-visibility":project=>toggleProjectOverviewVisibility\(project\.id\)/);
  assert.match(app,/archive:project=>toggleProjectArchive\(project\.id\)/);
  assert.match(app,/async function toggleProjectArchive\(projectId\)[\s\S]*?project\.archived=!project\.archived/);
  assert.doesNotMatch(app,/if \(project\.archived&&activeProjectId===projectId\)/);
  assert.match(app,/const archivedProjects=projects\.filter\(project=>project\.archived\)/);
  assert.match(app,/name\.textContent="Archived"/);
  assert.doesNotMatch(app,/showArchivedToggle|showArchived=/);
  assert.match(app,/delete:async project=>\{[\s\S]*?deleteProject\(project\.id\)/);
  assert.match(app,/documents:async project=>\{[\s\S]*?candidate\.type==="documents"/);
  assert.doesNotMatch(app,/handleProjectAction/);
  assert.doesNotMatch(app,/menu\.innerHTML = `[\s\S]*data-project-action/);
});

test("index contains only a mount point for the generated header actions menu",()=>{
  assert.match(index,/<div class="projectMenuWrap" id="projectMenuWrap"><\/div>/);
  assert.doesNotMatch(index,/showArchivedToggle|> Archived/);
  assert.doesNotMatch(index,/data-project-action=|id="editProjectBtn"|id="importProjectCsvBtn"/);
  assert.ok(index.indexOf('src="js/ui/project-actions-menu.js"')<index.indexOf('src="js/app.js"'));
});
