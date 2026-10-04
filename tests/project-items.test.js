"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const app=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
const itemFeatureSource=fs.readFileSync(path.join(__dirname,"../js/features/item.js"),"utf8");
const fieldFeatureSource=fs.readFileSync(path.join(__dirname,"../js/features/fields.js"),"utf8");
const groupDefinition=fs.readFileSync(path.join(__dirname,"../js/core/fields/types/group.js"),"utf8");
const templateModuleSource=fs.readFileSync(path.join(__dirname,"../js/core/project-templates.js"),"utf8");
const statusOptionStart=app.indexOf("function ensureStatusOptions(");
const statusOptionEnd=app.indexOf("let calendarCursor",statusOptionStart);
const statusOptionSource=app.slice(statusOptionStart,statusOptionEnd);
const plain=value=>JSON.parse(JSON.stringify(value));

function loadProjectTemplates(){
  const sandbox={window:{}};
  vm.runInNewContext(templateModuleSource,sandbox,{filename:"project-templates.js"});
  let nextId=0;
  return sandbox.window.BeforeworkProjectTemplates.create({
    uid:()=>`template-${++nextId}`,
    tagColors:["tag-blue","tag-purple","tag-pink"],
    selectColors:["select-blue","select-green","select-red"]
  });
}

function loadProjectItemHelpers(){
  const sandbox={window:{}};
  vm.runInNewContext(itemFeatureSource,sandbox);
  const feature=sandbox.window.BeforeworkItemFeature.create({
    uid:()=> "item-id",getProject:()=>null,tagColorOptions:[],selectedItemIds:new Set(),
    boardFilterTags:new Set(),hasTagsField:()=>false,queueGoogleEventDeletes:()=>{},
    showConfirm:async()=>false,showDialog:async()=>null,scheduleSave:()=>{},render:()=>{},
    renderAll:()=>{},renderProjectList:()=>{}
  });
  return feature;
}

test("Simple list, Table, Calendar, and Blank templates start without groups",()=>{
  const templates=loadProjectTemplates();
  for (const name of ["simple","table","calendarTpl","blank"]){
    assert.deepEqual(JSON.parse(JSON.stringify(templates.get(name).groups)),[]);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(templates.get("taskboard").groups)),[]);
  assert.deepEqual(plain(templates.buildFields("simple")),[]);
  assert.deepEqual(plain(templates.buildFields("blank")),[]);
});

test("Table and Calendar templates start with relevant editable fields",()=>{
  const templates=loadProjectTemplates();
  const table=templates.get("table");
  const calendar=templates.get("calendarTpl");
  assert.deepEqual(JSON.parse(JSON.stringify(table.fields)),["status","priority","due","tags"]);
  assert.deepEqual(JSON.parse(JSON.stringify(calendar.fields)),["start","due","location","schedule"]);
  assert.equal(calendar.itemDefaultType,"event");
  assert.deepEqual(JSON.parse(JSON.stringify(table.columnOrders.table)),[
    "title","field:status","field:priority","field:due","tags"
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(calendar.columnOrders.list)),[
    "title","field:start","field:due","field:location","field:schedule","updated"
  ]);
  assert.deepEqual(plain(templates.buildFields("calendarTpl").map(field=>field.type)),[
    "start-date","due-date","location","schedule"
  ]);
  assert.match(app,/projectTemplates\.buildFields\(templateSelect\.value\)/);
});

test("project-management template uses an optional Status field instead of fixed groups",()=>{
  const templates=loadProjectTemplates();
  const taskboard=templates.get("taskboard");
  assert.deepEqual(JSON.parse(JSON.stringify(taskboard.views)),["list","kanban","calendar","roadmap"]);
  assert.deepEqual(JSON.parse(JSON.stringify(taskboard.fields)),["priority","due","status","tags"]);
  assert.deepEqual(JSON.parse(JSON.stringify(taskboard.groups)),[]);
  assert.equal(taskboard.boardGroupBy,"Status");
  assert.deepEqual(plain(templates.statusOptions("simple")),["To do","In progress","Review"]);
  assert.match(app,/projectTemplates\.buildFields\(templateKey\)/);
});

test("project-management template starts with a useful status flow and ordered List/Table columns",()=>{
  const templates=loadProjectTemplates();
  const taskboard=templates.get("taskboard");
  assert.deepEqual(JSON.parse(JSON.stringify(taskboard.statusOptions)),[
    "Backlog","To do","In progress","Review","Blocked"
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(taskboard.tags)),["urgent","follow-up","quick-win"]);
  assert.deepEqual(JSON.parse(JSON.stringify(taskboard.columnOrders.list)),[
    "title","field:status","field:priority","field:due","tags","progress","updated"
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(taskboard.columnOrders.table)),[
    "title","field:status","field:priority","field:due","tags"
  ]);
  const fields=templates.buildFields("taskboard");
  assert.deepEqual(plain(fields.map(field=>field.type)),["priority","due-date","select","tags"]);
  assert.deepEqual(plain(fields[2].options.map(option=>option.label)),plain(taskboard.statusOptions));
  assert.deepEqual(plain(templates.buildTags("taskboard").map(tag=>tag.name)),plain(taskboard.tags));
  assert.deepEqual(plain(templates.buildTags("taskboard").map(tag=>tag.color)),[
    "tag-blue","tag-purple","tag-pink"
  ]);
  assert.match(app,/projectTemplates\.buildTags\(templateKey\)/);
  assert.match(app,/projectTemplates\.entries\(\)\.map\(\(\[value,template\]\)=>\(\{value,label:template\.label\}\)\)/);
  const index=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");
  assert.ok(index.indexOf('src="js/core/project-templates.js"')<index.indexOf('src="js/app.js"'));
});

test("Add field offers an optional Group field backed by single-select options",()=>{
  assert.match(groupDefinition,/value:"group",label:"Group",description:"Create a single-select field for organising items into Board columns\."/);
  assert.match(groupDefinition,/maxPerProject:1/);
  assert.match(fieldFeatureSource,/const fieldTypeOptions=fieldTypes\.list\(\)/);
  assert.match(fieldFeatureSource,/const fieldName=label\?\.trim\(\)\|\|\(type==="group"\?"Group"/);
  assert.match(fieldFeatureSource,/offeringType:type/);
  assert.match(fieldFeatureSource,/if \(storageType==="select"\|\|storageType==="multi-select"\)/);
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
  const feature=loadProjectItemHelpersForProject(project);
  feature.setItemFieldValue("project-1","legacy-group","task-1","status","doing");
  const saved=JSON.stringify({value:item.values.status,groupId:group.id,groupItems:group.items.map(candidate=>candidate.id)});

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
  const result=vm.runInNewContext(`${groupCode};
    deleteGroup("project-1","group-1","__project_items__");
    JSON.stringify({groups:project.groups,items:project.items});`,{
      project,
      UNGROUPED_GROUP_ID:"__project_items__",
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

function loadProjectItemHelpersForProject(project){
  const sandbox={window:{}};
  vm.runInNewContext(itemFeatureSource,sandbox);
  return sandbox.window.BeforeworkItemFeature.create({
    uid:()=> "item-id",getProject:()=>project,tagColorOptions:[],selectedItemIds:new Set(),
    boardFilterTags:new Set(),hasTagsField:()=>false,queueGoogleEventDeletes:()=>{},
    showConfirm:async()=>false,showDialog:async()=>null,scheduleSave:()=>{},render:()=>{},
    renderAll:()=>{},renderProjectList:()=>{}
  });
}
