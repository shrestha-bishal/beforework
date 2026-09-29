"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/workspace-commands.js"), "utf8");
const sandbox = {window:{}};
vm.runInNewContext(source,sandbox,{filename:"workspace-commands.js"});
const createCommands = sandbox.window.BeforeworkWorkspaceCommands.create;

test("provides quick actions and workspace search entries", ()=>{
  const project = {
    id:"project-1",
    name:"Product launch",
    icon:"mdi:rocket-launch-outline",
    tags:[{id:"tag-1",name:"release"}],
    fields:[{id:"field-1",label:"Status",options:[{id:"option-1",label:"In review"}]}],
    groups:[{id:"group-1",name:"Review",items:[{
      id:"item-1",title:"Review calendar behavior",description:"Check recurring dates",calendarType:"task",
      values:{"field-1":"option-1"},tagIds:["tag-1"],subitems:[{title:"Check month ends"}]
    }]}]
  };
  const called = [];
  const commands = createCommands({getState:()=>({projects:[project],calendarItems:[]}),actions:{
    navigate:value=>called.push(["navigate",value]),
    addTask:()=>called.push(["addTask"]),
    createProject:()=>called.push(["createProject"]),
    createFolder:()=>called.push(["createFolder"]),
    createEvent:()=>called.push(["createEvent"]),
    toggleTheme:()=>called.push(["toggleTheme"]),
    toggleTimer:()=>called.push(["toggleTimer"]),
    showShortcuts:()=>called.push(["showShortcuts"]),
    openProject:value=>called.push(["openProject",value.id]),
    openGroup:(p,g)=>called.push(["openGroup",p.id,g.id]),
    openProjectItem:(p,g,i)=>called.push(["openProjectItem",p.id,g.id,i.id]),
    openTag:(p,t)=>called.push(["openTag",p.id,t.id]),
    openCalendarItem:item=>called.push(["openCalendarItem",item.id])
  }});
  const entries = commands.getCommands();

  assert.ok(entries.some(entry=>entry.id==="action:new-project"));
  assert.ok(entries.some(entry=>entry.id==="project:project-1"));
  const itemEntry = entries.find(entry=>entry.id==="item:project-1:group-1:item-1");
  assert.match(itemEntry.keywords,/Check month ends/);
  assert.match(itemEntry.keywords,/Status In review/);
  itemEntry.run();
  entries.find(entry=>entry.id==="tag:project-1:tag-1").run();
  assert.deepEqual(called,[
    ["openProjectItem","project-1","group-1","item-1"],
    ["openTag","project-1","tag-1"]
  ]);
});
