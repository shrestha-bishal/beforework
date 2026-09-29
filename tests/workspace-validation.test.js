"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname,"../js/workspace-validation.js"),"utf8");
const sandbox = {window:{}};
vm.runInNewContext(source,sandbox,{filename:"workspace-validation.js"});
const validate = sandbox.window.BeforeworkWorkspaceValidation.validate;
const seederSandbox = {window:{},Blob};
const seederSource = fs.readFileSync(path.join(__dirname,"../js/demo-seeder.js"),"utf8");
vm.runInNewContext(seederSource,seederSandbox,{filename:"demo-seeder.js"});

test("accepts valid legacy workspaces without a schema version", ()=>{
  const result = validate({projects:[{
    id:"project-1",name:"Launch",groups:[{
      id:"group-1",name:"Tasks",items:[{id:"task-1",title:"Prepare release"}]
    }]
  }]},7);

  assert.deepEqual(JSON.parse(JSON.stringify(result)),{valid:true,errors:[]});
});

test("rejects malformed nested workspace data with field paths", ()=>{
  const result = validate({projects:[{id:"project-1",name:"Launch",groups:{}}]},7);

  assert.equal(result.valid,false);
  assert.ok(result.errors.some(error=>error==="projects[0].groups must be an array."));
});

test("rejects malformed items and non-array project collections", ()=>{
  assert.equal(validate({projects:{}},7).valid,false);
  const result = validate({projects:[{
    id:"project-1",name:"Launch",groups:[{id:"group-1",name:"Tasks",items:[{id:"task-1"}]}]
  }]},7);
  assert.ok(result.errors.some(error=>error.includes("items[0].title")));
});

test("validates optional item attachment metadata", ()=>{
  const base={projects:[{id:"project-1",name:"Launch",groups:[{id:"group-1",name:"Tasks",items:[{id:"task-1",title:"Prepare release"}]}]}]};
  const valid=structuredClone(base);
  valid.projects[0].groups[0].items[0].attachments=[{id:"attachment-1",name:"brief.pdf",size:128,type:"application/pdf"}];
  assert.equal(validate(valid,7).valid,true);

  const invalid=structuredClone(valid);
  invalid.projects[0].groups[0].items[0].attachments[0].size=-1;
  const result=validate(invalid,7);
  assert.equal(result.valid,false);
  assert.ok(result.errors.some(error=>error.includes("attachments[0]")));
});

test("rejects future schema versions instead of downgrading them", ()=>{
  const result = validate({schemaVersion:8,projects:[]},7);

  assert.equal(result.valid,false);
  assert.match(result.errors[0],/newer than the supported version/);
});

test("seeds checkbox, overdue, and downloadable attachment examples", async ()=>{
  let nextId=0;
  const workspace=seederSandbox.window.BeforeworkDemoSeeder.create({
    schemaVersion:7,
    uid:()=>`demo-${++nextId}`,
    viewLabel:type=>type,
    tagColors:Array(8).fill("#0969da"),
    todayStr:offsetDays=>{
      const date=new Date("2026-09-29T00:00:00");
      date.setDate(date.getDate()+(offsetDays||0));
      return date.toISOString().slice(0,10);
    }
  });

  assert.equal(validate(workspace,7).valid,true);
  const onboarding=workspace.projects.find(project=>project.name==="Customer onboarding");
  const checkboxField=onboarding.fields.find(field=>field.type==="checkbox");
  assert.ok(checkboxField);
  assert.ok(onboarding.groups[0].items.some(item=>item.values[checkboxField.id]==="true"));
  assert.ok(onboarding.groups[0].items.some(item=>item.values[checkboxField.id]===""));

  const personal=workspace.projects.find(project=>project.name==="Personal planning");
  const targetDate=personal.fields.find(field=>field.label==="Target date");
  const overdueOpenItems=personal.groups.flatMap(group=>group.items).filter(item=>
    item.values[targetDate.id]<"2026-09-29" && !item.completedAt
  );
  assert.ok(overdueOpenItems.length>0);
  const seededItems=workspace.projects.flatMap(project=>project.groups.flatMap(group=>group.items));
  assert.ok(seededItems.every(item=>Array.isArray(item.attachments)));
  const releaseItem=seededItems.find(item=>item.title==="Publish the release overview");
  const [attachment]=releaseItem.attachments;
  assert.equal(attachment.name,"release-brief.txt");
  const written=[];
  await seederSandbox.window.BeforeworkDemoSeeder.writeAttachments(workspace,async(id,file)=>{
    written.push({id,size:file.size,type:file.type,content:await file.text()});
  });
  assert.equal(written.length,1);
  assert.equal(written[0].id,attachment.id);
  assert.equal(written[0].size,attachment.size);
  assert.equal(written[0].type,attachment.type);
  assert.match(written[0].content,/Beforework v2\.1\.0 release brief/);
});

test("renders checkbox custom fields as boolean controls", ()=>{
  const appSource = fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
  const start = appSource.indexOf("function fieldInputHtml");
  const end = appSource.indexOf("function renderItemModal");
  const snippet = appSource.slice(start, end);
  const context = {
    escapeHtml: value => String(value).replace(/[&<>\"']/g, c=>({"&":"&amp;","<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]))
  };
  const html = vm.runInNewContext(`${snippet}; const result = fieldInputHtml({id:"field-checkbox",label:"Approved",type:"checkbox"},{values:{}}); result;`, context);
  assert.match(html, /type="checkbox"/i);
  assert.match(html, /data-fieldid="field-checkbox"/i);
  assert.match(html, /sideItemCheckbox/i);
  assert.match(html, /checkboxFieldValue/i);
});

test("bulk completion updates selected items consistently", ()=>{
  const appSource = fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
  const start = appSource.indexOf("function bulkSetCompleted");
  const end = appSource.indexOf("async function bulkDelete");
  const snippet = appSource.slice(start, end);
  const context = {
    selectedItemIds: new Set(["a","b"]),
    isItemCompleted: item => !!item && Number.isFinite(item.completedAt) && item.completedAt > 0,
    recordItemActivity: () => {},
    scheduleSave: () => {},
    renderAll: () => {}
  };
  const result = vm.runInNewContext(`${snippet}; const project = {groups:[{items:[{id:"a",completedAt:null,updatedAt:0},{id:"b",completedAt:123,updatedAt:0},{id:"c",completedAt:null,updatedAt:0}]}]}; bulkSetCompleted(project, true); JSON.stringify(project.groups[0].items.map(item => ({id:item.id, completedAt:item.completedAt})));`, context);
  const completedRows = JSON.parse(result);
  assert.ok(completedRows.find(item => item.id === "a").completedAt > 0);
  assert.equal(completedRows.find(item => item.id === "b").completedAt, 123);
  assert.equal(completedRows.find(item => item.id === "c").completedAt, null);

  const reopened = vm.runInNewContext(`${snippet}; const project = {groups:[{items:[{id:"a",completedAt:999,updatedAt:0},{id:"b",completedAt:123,updatedAt:0},{id:"c",completedAt:null,updatedAt:0}]}]}; bulkSetCompleted(project, false); JSON.stringify(project.groups[0].items.map(item => ({id:item.id, completedAt:item.completedAt})));`, { ...context, selectedItemIds: new Set(["a","b"]) });
  const reopenedRows = JSON.parse(reopened);
  assert.equal(reopenedRows.find(item => item.id === "a").completedAt, null);
  assert.equal(reopenedRows.find(item => item.id === "b").completedAt, null);
  assert.equal(reopenedRows.find(item => item.id === "c").completedAt, null);
});