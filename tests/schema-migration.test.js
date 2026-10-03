"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const moduleSource = fs.readFileSync(path.join(__dirname, "../js/core/schema-migration.js"), "utf8");

function createStorage(){
  const values = new Map();
  return {
    values,
    localStorage:{
      setItem(key, value){ values.set(key, String(value)); },
      getItem(key){ return values.get(key) || null; }
    }
  };
}

function loadMigration(storage=createStorage()){
  const sandbox = {window:{localStorage:storage.localStorage}};
  let nextId = 0;
  vm.runInNewContext(moduleSource, sandbox, {filename:"schema-migration.js"});
  return {
    migration:sandbox.window.BeforeworkSchemaMigration.create({uid:()=>`generated-${++nextId}`}),
    storage
  };
}

test("upgrades a legacy workspace through schema version 10 and saves a backup", ()=>{
  const {migration} = loadMigration();
  const legacy = {
    tags:[{id:"legacy-tag", name:"Research", color:"blue"}],
    projects:[{
      id:"project-1",
      name:"Legacy project",
      groups:[{id:"done-group", name:"Done", items:[
        {id:"done-task", title:"Completed task", priority:"high", dueDate:"2026-10-01", startDate:"2026-09-01", updatedAt:123},
        {id:"event", title:"Calendar event", calendarType:"event"}
      ]}]
    }],
    calendarItems:[{id:"standalone-event", createdAt:456}]
  };

  const upgraded = migration.migrate(legacy, ()=>({projects:[]}));
  const project = upgraded.projects[0];
  const [completedTask, event] = project.groups[0].items;
  const priorityField = project.fields.find(field=>field.type==="priority");
  const dueDateField = project.fields.find(field=>field.type==="due-date");
  const startDateField = project.fields.find(field=>field.type==="start-date");

  assert.equal(upgraded.schemaVersion, 10);
  assert.deepEqual(JSON.parse(JSON.stringify(project.items)),[]);
  assert.equal(project.tags[0].name, "Research");
  assert.equal(completedTask.values[priorityField.id], "high");
  assert.equal(completedTask.values[dueDateField.id], "2026-10-01");
  assert.equal(completedTask.values[startDateField.id], "2026-09-01");
  assert.equal(completedTask.completedAt, 123);
  assert.equal(event.completedAt, null);
  assert.ok(Array.isArray(completedTask.subitems));
  assert.ok(Array.isArray(completedTask.comments));
  assert.ok(Array.isArray(completedTask.activity));
  assert.ok(project.views.length > 0);
  assert.equal(project.folderId, null);
  assert.deepEqual(JSON.parse(JSON.stringify(upgraded.focusSessions)), []);
  assert.ok(Array.isArray(upgraded.calendarItems[0].activity));
  assert.equal(migration.readBackup().fromVersion, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(migration.takeMigrationInfo())), {fromVersion:0, toVersion:10});
  assert.equal(migration.takeMigrationInfo(), null);
});

test("does not create a backup or migration notice for current data", ()=>{
  const {migration} = loadMigration();
  const current = {schemaVersion:10, projects:[], folders:[], calendarItems:[], focusSessions:[]};

  const migrated = migration.migrate(current, ()=>({projects:[]}));

  assert.equal(migrated, current);
  assert.equal(migration.hasBackup(), false);
  assert.equal(migration.readBackup(), null);
  assert.equal(migration.takeMigrationInfo(), null);
});

test("converts legacy due dates but preserves custom date columns",()=>{
  const {migration}=loadMigration();
  const data={
    schemaVersion:7,
    projects:[{
      id:"project-1",
      name:"Launch",
      fields:[
        {id:"due",label:"Due date",type:"date",options:[]},
        {id:"review",label:"Review date",type:"date",options:[]}
      ],
      groups:[{id:"group-1",name:"Tasks",items:[
        {id:"task-1",title:"Prepare",startDate:"2026-09-01",values:{due:"2026-10-01",review:"2026-09-20"}}
      ]}]
    }]
  };

  const upgraded=migration.migrate(data,()=>({projects:[]}));
  const project=upgraded.projects[0];
  const item=project.groups[0].items[0];
  const startField=project.fields.find(field=>field.type==="start-date");

  assert.equal(project.fields.find(field=>field.id==="due").type,"due-date");
  assert.equal(project.fields.find(field=>field.id==="review").type,"date");
  assert.equal(item.values[startField.id],"2026-09-01");
  assert.equal(item.values.review,"2026-09-20");
});

test("uses the supplied default factory for invalid input", ()=>{
  const {migration} = loadMigration();
  let called = false;
  const fallback = {projects:[]};

  assert.equal(migration.migrate(null, ()=>{ called = true; return fallback; }), fallback);
  assert.equal(called, true);
  assert.equal(migration.hasBackup(), false);
});

test("continues upgrading when browser backup storage is unavailable", ()=>{
  const unavailableStorage = {
    localStorage:{
      setItem(){ throw new Error("storage unavailable"); },
      getItem(){ throw new Error("storage unavailable"); }
    }
  };
  const {migration} = loadMigration(unavailableStorage);
  const currentBeforeLastStep = {schemaVersion:7, projects:[], folders:[], calendarItems:[]};

  const upgraded = migration.migrate(currentBeforeLastStep, ()=>({projects:[]}));

  assert.equal(upgraded.schemaVersion, 10);
  assert.equal(migration.hasBackup(), false);
  assert.equal(migration.readBackup(), null);
  assert.deepEqual(JSON.parse(JSON.stringify(migration.takeMigrationInfo())), {fromVersion:7, toVersion:10});
});

test("preserves explicit project items and does not invent a starter group",()=>{
  const {migration}=loadMigration();
  const data={schemaVersion:8,projects:[{
    id:"project-1",name:"Simple",groups:[],
    items:[{id:"task-1",title:"Standalone project task"}]
  }]};

  const upgraded=migration.migrate(data,()=>({projects:[]}));

  assert.equal(upgraded.schemaVersion,10);
  assert.deepEqual(JSON.parse(JSON.stringify(upgraded.projects[0].groups)),[]);
  assert.equal(upgraded.projects[0].items[0].id,"task-1");
});

test("migrates populated legacy Location and Schedule controls into optional project fields",()=>{
  const {migration}=loadMigration();
  const data={schemaVersion:9,projects:[{
    id:"project-1",name:"Planning",
    groups:[{id:"group-1",name:"Tasks",items:[
      {id:"task-1",title:"Visit site",location:"Office",startTime:"09:00",endTime:"10:00",endDate:"2026-10-12",values:{}}
    ]}],
    items:[{id:"task-2",title:"Call vendor",location:"https://example.com",values:{}}]
  }]};

  const upgraded=migration.migrate(data,()=>({projects:[]}));
  const project=upgraded.projects[0];
  const locationField=project.fields.find(field=>field.type==="location");
  const scheduleField=project.fields.find(field=>field.type==="schedule");

  assert.equal(upgraded.schemaVersion,10);
  assert.equal(locationField.label,"Location");
  assert.equal(scheduleField.label,"Schedule");
  assert.equal(project.groups[0].items[0].values[locationField.id],"Office");
  assert.equal(project.items[0].values[locationField.id],"https://example.com");
});

test("does not add optional Location or Schedule fields to clean projects",()=>{
  const {migration}=loadMigration();
  const data={schemaVersion:9,projects:[{id:"project-1",name:"Clean",groups:[],items:[]}]};

  const upgraded=migration.migrate(data,()=>({projects:[]}));

  assert.deepEqual(JSON.parse(JSON.stringify(upgraded.projects[0].fields)),[]);
});
