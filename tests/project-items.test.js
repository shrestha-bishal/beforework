"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const app=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
const templateStart=app.indexOf("const PROJECT_TEMPLATES = {");
const templateEnd=app.indexOf("function buildFieldsForTemplate",templateStart);
const templates=app.slice(templateStart,templateEnd);
const helperStart=app.indexOf("const UNGROUPED_GROUP_ID=");
const helperEnd=app.indexOf("function projectRecords()",helperStart);
const helperSource=app.slice(helperStart,helperEnd);

function loadProjectItemHelpers(){
  const sandbox={};
  vm.runInNewContext(`${helperSource}; globalThis.result={projectGroups,projectItemEntries,appendProjectItem};`,sandbox);
  return sandbox.result;
}

test("Simple list, Table, Calendar, and Blank templates start without groups",()=>{
  for (const name of ["simple","table","calendarTpl","blank"]){
    assert.match(templates,new RegExp(`${name}:\\s*\\{[^}]*groups:\\[\\]`));
  }
  assert.match(templates,/taskboard:[\s\S]*?groups:\["To do","In progress","Review"\]/);
});

test("empty group-free projects expose one virtual destination without persisting a group",()=>{
  const helpers=loadProjectItemHelpers();
  const project={groups:[],items:[]};
  const groups=helpers.projectGroups(project);

  assert.equal(groups.length,1);
  assert.equal(groups[0].id,"__project_items__");
  assert.equal(groups[0].virtual,true);
  assert.equal(groups[0].items,project.items);
  assert.deepEqual(JSON.parse(JSON.stringify(project.groups)),[]);
});

test("project-owned items coexist with existing groups and are surfaced as Unassigned",()=>{
  const helpers=loadProjectItemHelpers();
  const grouped={id:"group-task",title:"Grouped"};
  const ungrouped={id:"project-task",title:"Project-owned"};
  const project={
    groups:[{id:"group-1",name:"Doing",items:[grouped]}],
    items:[ungrouped]
  };

  assert.deepEqual(JSON.parse(JSON.stringify(helpers.projectGroups(project).map(group=>group.id))),["group-1","__project_items__"]);
  assert.deepEqual(JSON.parse(JSON.stringify(helpers.projectItemEntries(project).map(row=>[row.item.id,row.group.id]))),[
    ["group-task","group-1"],
    ["project-task","__project_items__"]
  ]);
});

test("adding an ungrouped item persists it directly on the project",()=>{
  const helpers=loadProjectItemHelpers();
  const project={groups:[]};
  const item={id:"new-item"};

  helpers.appendProjectItem(project,"__project_items__",item);

  assert.deepEqual(JSON.parse(JSON.stringify(project.items)),[{id:"new-item"}]);
  assert.deepEqual(JSON.parse(JSON.stringify(project.groups)),[]);
});

test("adding an item to an existing group preserves grouped storage",()=>{
  const helpers=loadProjectItemHelpers();
  const project={groups:[{id:"group-1",items:[]}]};
  const item={id:"new-item"};

  helpers.appendProjectItem(project,"group-1",item);

  assert.deepEqual(JSON.parse(JSON.stringify(project.groups[0].items)),[{id:"new-item"}]);
  assert.equal(project.items,undefined);
});

test("lazy project summaries reconstruct grouped and ungrouped item entries",()=>{
  const helpers=loadProjectItemHelpers();
  const project={
    groups:[{id:"group-1",name:"Doing"}],
    itemIndex:[
      {id:"task-1",groupId:"group-1"},
      {id:"task-2",groupId:"__project_items__",groupName:"Unassigned"}
    ]
  };

  assert.deepEqual(JSON.parse(JSON.stringify(helpers.projectItemEntries(project).map(row=>[row.item.id,row.group.name]))),[
    ["task-1","Doing"],
    ["task-2","Unassigned"]
  ]);
});

test("deleting the final group can preserve its tasks directly in the project",()=>{
  const start=app.indexOf("function deleteGroup(");
  const end=app.indexOf("async function editGroupName",start);
  const groupCode=app.slice(start,end);
  const project={
    id:"project-1",
    groups:[{id:"group-1",name:"To do",items:[{id:"task-1",updatedAt:1}]}]
  };
  const result=vm.runInNewContext(`${helperSource}; ${groupCode};
    deleteGroup("project-1","group-1","__project_items__");
    JSON.stringify({groups:project.groups,items:project.items});`,{
      project,
      getProject:()=>project,
      boardFilterGroups:new Set(),
      scheduleSave(){},
      render(){},
      renderProjectList(){}
    });

  const saved=JSON.parse(result);
  assert.deepEqual(saved.groups,[]);
  assert.equal(saved.items[0].id,"task-1");
  assert.ok(saved.items[0].updatedAt>1);
});
