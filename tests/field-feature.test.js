"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const source=fs.readFileSync(path.join(__dirname,"../js/features/fields.js"),"utf8");
const indexSource=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");
const definitions=[
  {value:"select",label:"Select",description:"Choose one option",colors:["red","blue"]},
  {value:"multi-select",label:"Multi-select",description:"Choose multiple options",colors:["red","blue"]},
  {value:"date",label:"Date",description:"A date"},
  {value:"tags",label:"Tags",description:"Tags",maxPerProject:1},
  {value:"location",label:"Location",description:"Location"},
  {value:"schedule",label:"Schedule",description:"Schedule"}
];

function createFeature(overrides={}){
  const window={};
  vm.runInNewContext(source,{window},{filename:"fields.js"});
  const calls={dialogs:[],notices:[],confirms:[],saved:0,rendered:0,queuedEvents:[],closedMenus:0};
  const dialogResults=[];
  let nextId=0;
  const boardFilterFields=new Map();
  const boardFilterColumns=new Map();
  let listSort={field:"updated",dir:"desc"};
  const feature=window.BeforeworkFieldFeature.create({
    uid:()=>`generated-${++nextId}`,
    fieldTypes:{
      list:()=>definitions,
      get:type=>definitions.find(definition=>definition.value===type)||null,
      canAddToProject:(type,fields)=>{
        const definition=definitions.find(candidate=>candidate.value===type);
        return !!definition&&(definition.maxPerProject==null||fields.filter(field=>field.type===type).length<definition.maxPerProject);
      }
    },
    selectColors:["red","blue"],
    projectItemEntries:project=>(project.groups||[]).flatMap(group=>(group.items||[]).map(item=>({group,item}))),
    queueGoogleEventDeletes:item=>calls.queuedEvents.push(item.id),
    getBoardFilterFields:()=>boardFilterFields,
    getBoardFilterColumns:()=>boardFilterColumns,
    getListSort:()=>listSort,
    setListSort:value=>{listSort=value;},
    showDialog:async options=>{calls.dialogs.push(options);return dialogResults.shift()??null;},
    showNotice:async(...args)=>calls.notices.push(args),
    showConfirm:async(...args)=>{calls.confirms.push(args);return true;},
    scheduleSave:()=>calls.saved++,
    renderAll:()=>calls.rendered++,
    closeAllActionMenus:()=>calls.closedMenus++,
    ...overrides
  });
  return {
    feature,calls,boardFilterFields,boardFilterColumns,
    setDialogResults(...results){dialogResults.push(...results);},
    getListSort:()=>listSort
  };
}

test("field feature loads before the app entry point",()=>{
  assert.ok(indexSource.indexOf('src="js/features/fields.js"')<indexSource.indexOf('src="js/app.js"'));
});

test("adding a field creates its configured options and saves the project",async()=>{
  const project={fields:[]};
  const {feature,calls,setDialogResults}=createFeature();
  setDialogResults(["select","Status"],"Backlog, In progress");

  await feature.addFieldFlow(project);

  assert.equal(calls.dialogs[0].title,"Add field");
  assert.equal(calls.dialogs[0].fields[0].options.length,definitions.length);
  assert.deepEqual(JSON.parse(JSON.stringify(project.fields[0])),{
    id:"generated-1",
    label:"Status",
    type:"select",
    options:[
      {id:"generated-2",label:"Backlog",color:"red"},
      {id:"generated-3",label:"In progress",color:"blue"}
    ]
  });
  assert.equal(calls.saved,1);
  assert.equal(calls.rendered,1);
});

test("field creation rejects reserved date names and duplicate field types",async()=>{
  const project={fields:[{id:"tags",type:"tags",label:"Tags"}]};
  const {feature,calls}=createFeature();

  await feature.addField(project,"Due","date");
  await feature.addField(project,"Labels","tags");

  assert.equal(project.fields.length,1);
  assert.equal(calls.notices.length,2);
  assert.match(calls.notices[0][0],/date-specific/);
  assert.match(calls.notices[1][0],/Tags field already exists/);
  assert.equal(calls.saved,0);
});

test("deleting a field cleans values, field references, filters, and scheduled events",()=>{
  const item={
    id:"item-1",values:{schedule:"value",other:"keep"},startTime:"09:00",endTime:"10:00",
    endDate:"2026-10-05",recurrence:{frequency:"daily"},reminderAt:123
  };
  const project={
    fields:[
      {id:"schedule",type:"schedule",label:"Schedule"},
      {id:"tags",type:"tags",label:"Tags"}
    ],
    groups:[{id:"group-1",items:[item]}],
    views:[{groupByFieldId:"schedule"}]
  };
  const {feature,calls,boardFilterFields,boardFilterColumns,getListSort}=createFeature();
  boardFilterFields.set("schedule","__none__");
  boardFilterColumns.set("tags",new Set(["urgent"]));

  feature.deleteField(project,"schedule");

  assert.deepEqual(project.fields.map(field=>field.id),["tags"]);
  assert.deepEqual(item.values,{other:"keep"});
  assert.equal(item.startTime,"");
  assert.equal(item.endTime,"");
  assert.equal(item.endDate,"");
  assert.equal(item.recurrence,null);
  assert.equal(item.reminderAt,null);
  assert.deepEqual(project.views,[{}]);
  assert.deepEqual([...boardFilterFields],[]);
  assert.deepEqual([...boardFilterColumns.keys()],["tags"]);
  assert.deepEqual(calls.queuedEvents,["item-1"]);
  assert.deepEqual(getListSort(),{field:"updated",dir:"desc"});
  feature.deleteField(project,"tags");
  assert.deepEqual([...boardFilterColumns],[]);
  assert.equal(calls.saved,2);
  assert.equal(calls.rendered,2);
});

test("editing a field saves its trimmed label and closes menus",async()=>{
  const field={id:"status",label:"Old name"};
  const {feature,calls,setDialogResults}=createFeature();
  setDialogResults("  Current status  ");
  let stopped=false;

  await feature.editField({stopPropagation(){stopped=true;}},field,{fields:[field]});

  assert.equal(stopped,true);
  assert.equal(calls.dialogs[0].actionMenu.items[0].label,"Delete");
  assert.equal(calls.dialogs[0].actionMenu.items[0].danger,true);
  assert.equal(field.label,"Current status");
  assert.equal(calls.closedMenus,1);
  assert.equal(calls.saved,1);
  assert.equal(calls.rendered,1);
});

test("edit field dialog menu reuses the existing delete confirmation and cleanup",async()=>{
  const field={id:"status",label:"Status"};
  const project={fields:[field],groups:[{items:[{id:"item-1",values:{status:"active"}}]}]};
  const {feature,calls,setDialogResults}=createFeature();
  setDialogResults(null);

  await feature.editField({stopPropagation(){}},field,project);
  await calls.dialogs[0].actionMenu.items[0].onSelect({stopPropagation(){}});

  assert.deepEqual(calls.confirms[0],[
    "Delete field Status",
    "This removes its values from every item in this project.",
    true
  ]);
  assert.deepEqual(project.fields,[]);
  assert.deepEqual(project.groups[0].items[0].values,{});
  assert.equal(calls.saved,1);
  assert.equal(calls.rendered,1);
});
