"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname,"../js/models/overview-details-model.js"),"utf8")
  .replace("export class OverviewDetailsModel", "class OverviewDetailsModel") +
  "\nwindow.OverviewDetailsModel = OverviewDetailsModel;";
const sandbox = {window:{}};
vm.runInNewContext(source,sandbox,{filename:"overview-details-model.js"});
const OverviewDetailsModel = sandbox.window.OverviewDetailsModel;

test("searches overview entries by title and metadata", ()=>{
  const model = new OverviewDetailsModel();
  const entries = [
    {title:"Launch checklist",meta:"Product / Planning"},
    {title:"Review calendar",meta:"Operations / Today"},
    {title:"Release notes",meta:"Product / Completed"}
  ];

  assert.deepEqual(model.searchEntries(entries,"PRODUCT launch"),[entries[0]]);
  assert.deepEqual(model.searchEntries(entries,"review today"),[entries[1]]);
  assert.deepEqual(model.searchEntries(entries,"   "),entries);
});

test("hidden projects are excluded from Overview project entries",()=>{
  const model=new OverviewDetailsModel();
  const projects=[
    {id:"visible",name:"Visible",groups:[]},
    {id:"hidden",name:"Hidden",hiddenFromOverview:true,groups:[]}
  ];

  assert.deepEqual(model.visibleProjects(projects),[projects[0]]);
  assert.deepEqual(JSON.parse(JSON.stringify(model.getEntries("projects",{
    projects, isItemCompleted:()=>false
  }))),[{kind:"project",id:"visible",title:"Visible",meta:"0 open / 0 completed"}]);
});

test("overview item details show the configured priority label",()=>{
  const model=new OverviewDetailsModel();
  const project={id:"project-1",name:"Alpha"};
  const row={project,group:{id:"group-1",name:"Planning"},item:{id:"item-1",title:"Ship release",values:{priority:"p1"}}};
  const entries=model.getEntries("open",{
    projects:[project],
    openItems:[row],
    overdueItems:[],
    completedItems:[],
    isItemCompleted:()=>false,
    dueOf:()=>"",
    priorityOf:()=> "p1",
    priorityLabelOf:()=> "Critical"
  });

  assert.equal(entries[0].meta,"Alpha / Planning / Critical priority");
});