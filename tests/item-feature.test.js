"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const source=fs.readFileSync(path.join(__dirname,"../js/features/item.js"),"utf8");

function createFeature(project,overrides={}){
  const sandbox={window:{}};
  vm.runInNewContext(source,sandbox);
  let nextId=0;
  const calls={save:0,render:0,renderAll:0,renderProjectList:0,deletedEvents:[]};
  const feature=sandbox.window.BeforeworkItemFeature.create({
    uid:()=>`generated-${++nextId}`,
    getProject:()=>project,
    tagColorOptions:[{value:"#123456"}],
    selectedItemIds:new Set(),
    boardFilterTags:new Set(),
    hasTagsField:()=>false,
    queueGoogleEventDeletes:item=>calls.deletedEvents.push(item.id),
    showConfirm:async()=>false,
    showDialog:async()=>null,
    scheduleSave:()=>calls.save++,
    render:()=>calls.render++,
    renderAll:()=>calls.renderAll++,
    renderProjectList:()=>calls.renderProjectList++,
    ...overrides
  });
  return {feature,calls};
}

test("creating and adding an item preserves project defaults and records lifecycle activity",()=>{
  const project={itemDefaultType:"event",groups:[{id:"group-1",name:"Ready",items:[]}]};
  const {feature,calls}=createFeature(project);

  const item=feature.addItem("project-1","group-1","Review launch");

  assert.equal(project.groups[0].items[0],item);
  assert.equal(item.calendarType,"event");
  assert.equal(item.title,"Review launch");
  assert.equal(item.activity[0].type,"created");
  assert.equal(calls.save,1);
  assert.equal(calls.render,1);
});

test("duplicating an item deep-copies mutable details and removes calendar sync state",()=>{
  const original={
    id:"original",title:"Plan",tagIds:["tag-1"],attachments:[{name:"brief"}],
    values:{status:"ready"},subitems:[{id:"sub-1",title:"Draft",done:true}],
    comments:[{id:"comment-1"}],activity:[{id:"activity-1"}],googleEventIds:["event-1"],
    googleSyncMeta:{etag:"etag"},completedAt:123,archived:true
  };
  const project={groups:[{id:"group-1",name:"Ready",items:[original]}]};
  const {feature,calls}=createFeature(project);

  const copy=feature.duplicateItem("project-1","group-1","original");

  assert.equal(project.groups[0].items[1],copy);
  assert.equal(copy.title,"Plan (copy)");
  assert.notEqual(copy.id,original.id);
  assert.notEqual(copy.attachments[0],original.attachments[0]);
  assert.notEqual(copy.values,original.values);
  assert.notEqual(copy.subitems[0].id,original.subitems[0].id);
  assert.equal(copy.subitems[0].done,false);
  assert.equal(copy.comments.length,0);
  assert.equal(copy.completedAt,null);
  assert.equal(copy.archived,false);
  assert.equal("googleEventIds" in copy,false);
  assert.equal("googleSyncMeta" in copy,false);
  assert.equal(calls.save,1);
  assert.equal(calls.render,1);
});

test("moving an item between groups updates its activity and restores it for invalid destinations",()=>{
  const item={id:"task-1",title:"Task",activity:[],updatedAt:0};
  const project={groups:[
    {id:"from",name:"Backlog",items:[item]},
    {id:"to",name:"Ready",items:[]}
  ]};
  const {feature,calls}=createFeature(project);

  feature.moveItem("project-1","from","to","task-1");

  assert.deepEqual(project.groups[0].items,[]);
  assert.equal(project.groups[1].items[0],item);
  assert.deepEqual(item.activity.map(entry=>[entry.type,entry.from,entry.to]),[["moved","Backlog","Ready"]]);
  assert.equal(calls.save,1);
  assert.equal(calls.render,1);

  feature.moveItem("project-1","to","missing","task-1");

  assert.equal(project.groups[1].items[0],item);
  assert.equal(calls.save,1);
});

test("deleting an item queues its calendar events and removes it from relation fields",()=>{
  const project={
    fields:[{id:"related",type:"relation"}],
    groups:[{id:"group-1",name:"Ready",items:[
      {id:"remove",googleEventIds:["event-1"],values:{related:[]}},
      {id:"keep",values:{related:["remove"]},updatedAt:0}
    ]}]
  };
  const {feature,calls}=createFeature(project);

  feature.deleteItem("project-1","group-1","remove");

  assert.deepEqual(project.groups[0].items.map(item=>item.id),["keep"]);
  assert.deepEqual(project.groups[0].items[0].values.related,[]);
  assert.deepEqual(calls.deletedEvents,["remove"]);
  assert.equal(calls.save,1);
  assert.equal(calls.render,1);
});
