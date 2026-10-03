"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const app=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
const groupDefinition=fs.readFileSync(path.join(__dirname,"../js/core/fields/types/group.js"),"utf8");
const templateStart=app.indexOf("const PROJECT_TEMPLATES = {");
const templateEnd=app.indexOf("function buildFieldsForTemplate",templateStart);
const templates=app.slice(templateStart,templateEnd);
const helperStart=app.indexOf("const UNGROUPED_GROUP_ID=");
const helperEnd=app.indexOf("function projectRecords()",helperStart);
const helperSource=app.slice(helperStart,helperEnd);
const fieldMutationStart=app.indexOf("function setItemFieldValue(");
const fieldMutationEnd=app.indexOf("function createTag(",fieldMutationStart);
const fieldMutationSource=app.slice(fieldMutationStart,fieldMutationEnd);
const statusOptionStart=app.indexOf("function ensureStatusOptions(");
const statusOptionEnd=app.indexOf("let calendarCursor",statusOptionStart);
const statusOptionSource=app.slice(statusOptionStart,statusOptionEnd);

function loadProjectItemHelpers(){
  const sandbox={};
  vm.runInNewContext(`${helperSource}; globalThis.result={projectGroups,projectItemEntries,appendProjectItem};`,sandbox);
  return sandbox.result;
}

test("Simple list, Table, Calendar, and Blank templates start without groups",()=>{
  for (const name of ["simple","table","calendarTpl","blank"]){
    assert.match(templates,new RegExp(`${name}:\\s*\\{[^}]*groups:\\[\\]`));
  }
  assert.match(templates,/taskboard:[\s\S]*?groups:\[\]/);
});

test("project-management template uses an optional Status field instead of fixed groups",()=>{
  assert.match(templates,/taskboard:\{[^}]*views:\["kanban","list","calendar","roadmap"\][^}]*fields:\[[^\]]*"status"\][^}]*groups:\[\][^}]*boardGroupBy:"Status"/);
  assert.match(app,/const DEFAULT_STATUS_OPTIONS=\["To do","In progress","Review"\]/);
  assert.match(app,/if \(k==="status"\) return \{id:uid\(\), label:"Status", type:"select", options:DEFAULT_STATUS_OPTIONS/);
});

test("Add field offers an optional Group field backed by single-select options",()=>{
  assert.match(groupDefinition,/value:"group",label:"Group",description:"Create a single-select field for organising items into Board columns\."/);
  assert.match(groupDefinition,/maxPerProject:1/);
  assert.match(app,/const FIELD_TYPE_OPTIONS=fieldTypes\.list\(\)/);
  assert.match(app,/const fieldType=FIELD_TYPES\.includes\(type\)\?type:"select"/);
  assert.match(app,/const fieldName=label\?\.trim\(\)\|\|\(type==="group"\?"Group"/);
  assert.match(app,/offeringType:type/);
  assert.match(app,/if \(storageType==="select" \|\| storageType==="multi-select"\)/);
});

test("CSV status values can extend Status options without duplicating case-insensitive matches",()=>{
  const field={id:"status",options:[{id:"todo",label:"To do"}]};
  let nextId=0;
  const optionIds=vm.runInNewContext(`${statusOptionSource}
    JSON.stringify([...ensureStatusOptions(field,["TO DO","Blocked"]).values()].map(option=>option.id));`,{
      field,
      uid:()=>`option-${++nextId}`,
      SELECT_COLORS:["blue","green"]
    });

  assert.deepEqual(JSON.parse(optionIds),["todo","option-1"]);
  assert.deepEqual(JSON.parse(JSON.stringify(field.options.map(option=>option.label))),["To do","Blocked"]);
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

test("dragging a Board card between field columns changes the select value, not its storage group",()=>{
  const item={id:"task-1",values:{status:"todo"},updatedAt:1};
  const group={id:"legacy-group",name:"Legacy",items:[item]};
  const project={fields:[{id:"status",type:"select",options:[{id:"todo",label:"To do"},{id:"doing",label:"In progress"}]}],groups:[group]};
  const saved=vm.runInNewContext(`${fieldMutationSource}
    setItemFieldValue("project-1","legacy-group","task-1","status","doing");
    JSON.stringify({value:item.values.status,groupId:group.id,groupItems:group.items.map(candidate=>candidate.id)});`,{
      project,
      item,
      group,
      getProject:()=>project,
      getItem:()=>item,
      recordItemActivity(){},
      scheduleSave(){},
      render(){},
      Date
    });

  assert.deepEqual(JSON.parse(saved),{value:"doing",groupId:"legacy-group",groupItems:["task-1"]});
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
