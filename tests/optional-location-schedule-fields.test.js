"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");
const {createItemFieldRenderer}=require("./helpers/item-fields");

const appSource=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");

function loadFunctions(source,context){
  const sandbox={
    window:{},
    startDateField:project=>project.fields.find(field=>field.type==="start-date"),
    dueDateField:project=>project.fields.find(field=>field.type==="due-date"),
    ...context
  };
  vm.runInNewContext(`${source}\nwindow.functions={fieldCellHtml,scheduleFieldValue};`,sandbox);
  return sandbox.window.functions;
}

const renderStart=appSource.indexOf("  function fieldCellHtml(");
const renderEnd=appSource.indexOf("\n  function safeUrlHref",renderStart);
const renderSource=appSource.slice(renderStart,renderEnd);
const functionSource=renderSource;

function escapeHtml(value){
  return String(value??"").replace(/[&<>"']/g,char=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[char]);
}

test("Location is a plain text field and Schedule is rendered as a derived read-only value",()=>{
  const functions=loadFunctions(functionSource,{
    escapeHtml,
    fmtDate:value=>value,
    formatTimeValue:value=>value
  });
  const renderer=createItemFieldRenderer();
  const location=renderer.renderLocation(
    {id:"location",label:"Location"},
    {values:{},location:"Office"}
  );
  const locationCell=functions.fieldCellHtml(
    {id:"location",label:"Location",type:"location"},
    "Office",
    {},
    {}
  );
  const scheduleField={id:"schedule",label:"Schedule",type:"schedule"};
  const project={
    fields:[
      {id:"start",label:"Start date",type:"start-date"},
      {id:"due",label:"Due date",type:"due-date"},
      scheduleField
    ]
  };
  const item={
    values:{start:"2026-10-10",due:"2026-10-12"},
    startTime:"09:00",
    endTime:"10:00"
  };

  assert.match(location,/type="text"/);
  assert.match(location,/value="Office"/);
  assert.equal(locationCell,"Office");
  assert.equal(renderer.render(scheduleField,item,project),"");
  assert.equal(functions.scheduleFieldValue(project,item),"2026-10-10 – 2026-10-12 · 09:00–10:00");
});

test("Location cell output is escaped plain text",()=>{
  const functions=loadFunctions(functionSource,{
    escapeHtml,
    fmtDate:value=>value,
    formatTimeValue:value=>value
  });

  const html=functions.fieldCellHtml(
    {id:"location",type:"location"},
    "<img src=x>",
    {},
    {}
  );

  assert.equal(html,"&lt;img src=x&gt;");
});

test("Schedule summary output is escaped before rendering",()=>{
  const functions=loadFunctions(functionSource,{
    escapeHtml,
    fmtDate:()=>"<img src=x onerror=alert(1)>",
    formatTimeValue:value=>value
  });
  const html=functions.fieldCellHtml(
    {id:"schedule",type:"schedule"},
    "",
    {fields:[]},
    {endDate:"2026-10-12"}
  );

  assert.doesNotMatch(html,/<img/);
  assert.match(html,/&lt;img/);
});
