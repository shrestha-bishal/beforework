"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const storageSource=fs.readFileSync(path.join(__dirname,"../js/services/storage/storage.js"),"utf8");
const demoKey="beforework_demo_workspace_v1";

function createHarness(){
  const values=new Map();
  const statuses=[];
  const context={
    document:{getElementById(){ return null; }},
    localStorage:{
      getItem(key){ return values.get(key)??null; },
      setItem(key,value){ values.set(key,String(value)); }
    },
    BeforeworkWorkspaceValidation:{
      validate(workspace,schemaVersion){
        const valid=workspace?.schemaVersion===schemaVersion&&Array.isArray(workspace.projects);
        return {valid,errors:valid?[]:["Invalid demo workspace."]};
      }
    },
    BeforeworkErrorUtils:{getMessage(error){ return error.message; }},
    BeforeworkCommandPaletteInstance:{refreshCommands(){}},
    SCHEMA_VERSION:8,
    fileHandle:null,
    state:null,
    saveTimer:null,
    lastSavedState:null,
    undoStack:[],
    googleAccessToken:null,
    migrateState:workspace=>workspace,
    setTimeout(){ return 1; },
    clearTimeout(){},
    setSyncStatus(status){ statuses.push(status); }
  };
  context.window=context;
  vm.runInNewContext(storageSource,context,{filename:"storage.js"});
  return {context,values,statuses,storage:context.BeforeworkStorage};
}

test("demo workspace is initialized from sample data and loaded from browser storage",()=>{
  const harness=createHarness();
  const sample={schemaVersion:8,projects:[{id:"sample-project"}]};
  const first=harness.storage.loadDemoWorkspace(sample);

  assert.equal(JSON.stringify(first),JSON.stringify(sample));
  assert.equal(JSON.parse(harness.values.get(demoKey)).projects[0].id,"sample-project");

  const saved={schemaVersion:8,projects:[{id:"edited-project"}]};
  harness.values.set(demoKey,JSON.stringify(saved));
  assert.equal(JSON.stringify(harness.storage.loadDemoWorkspace(sample)),JSON.stringify(saved));
});

test("saved demo projects with documents gain the Documents view without replacing user data",()=>{
  const harness=createHarness();
  const saved={
    schemaVersion:8,
    projects:[{
      id:"launch",
      name:"Product launch",
      description:"My customized project",
      documents:[{id:"brief",title:"My brief",content:"# Keep this"}],
      views:[{id:"list",type:"list",name:"List"}]
    }]
  };
  harness.values.set(demoKey,JSON.stringify(saved));

  const loaded=harness.storage.loadDemoWorkspace({schemaVersion:8,projects:[]});
  const project=loaded.projects[0];
  assert.equal(project.description,"My customized project");
  assert.equal(project.documents[0].content,"# Keep this");
  assert.ok(project.views.some(view=>view.type==="documents"&&view.name==="Documents"));
  assert.ok(JSON.parse(harness.values.get(demoKey)).projects[0].views.some(view=>view.type==="documents"));
});

test("demo edits persist in browser storage without writing a workspace file",async()=>{
  const harness=createHarness();
  harness.context.fileHandle={kind:"demo",name:"Demo workspace"};
  harness.context.state={schemaVersion:8,projects:[{id:"sample-project",name:"Updated"}]};
  harness.context.lastSavedState=JSON.stringify({schemaVersion:8,projects:[]});

  harness.context.scheduleSave();
  assert.equal(await harness.context.flushSave(),true);
  assert.equal(JSON.parse(harness.values.get(demoKey)).projects[0].name,"Updated");
  assert.equal(harness.context.getSyncStatusText(),"Demo changes saved in this browser.");
});

test("invalid saved demo data is surfaced instead of silently accepted",()=>{
  const harness=createHarness();
  harness.values.set(demoKey,JSON.stringify({schemaVersion:8,projects:"invalid"}));

  assert.throws(()=>harness.storage.loadDemoWorkspace({schemaVersion:8,projects:[]}),/Invalid demo workspace/);
});
