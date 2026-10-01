"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const sandbox={window:{}};
const source=fs.readFileSync(path.join(__dirname,"../js/models/roadmap-model.js"),"utf8");
vm.runInNewContext(source,sandbox,{filename:"roadmap-model.js"});
const roadmap=sandbox.window.BeforeworkRoadmapModel;

test("collects project milestones and dated active tasks in date order",()=>{
  const project={
    id:"project-1",name:"Launch",
    fields:[{id:"start",label:"Start date",type:"start-date"},{id:"due",label:"Due date",type:"due-date"},{id:"other",label:"Review date",type:"date"},{id:"text",label:"Notes",type:"text"}],
    milestones:[{id:"milestone-1",title:"Release",dueDate:"2026-10-20"},{id:"milestone-2",title:"No date"}],
    groups:[{id:"group-1",name:"To do",items:[
      {id:"task-1",title:"Prepare",description:"Get signoff",values:{start:"2026-10-03",due:"2026-10-10",other:"2026-10-08"},completedAt:null},
      {id:"task-2",title:"Archived",values:{due:"2026-10-01"},archived:true},
      {id:"task-3",title:"Event",values:{due:"2026-10-02"},calendarType:"event"}
    ]}]
  };
  const rows=roadmap.rowsForProject(project);
  assert.deepEqual(JSON.parse(JSON.stringify(rows.map(({title,description,startDate,date,kind,groupName,milestoneId})=>({title,description,startDate,date,kind,groupName,milestoneId})))),[
    {title:"Prepare",description:"Get signoff",startDate:"2026-10-03",date:"2026-10-10",kind:"task",groupName:"To do"},
    {title:"Release",date:"2026-10-20",kind:"milestone",milestoneId:"milestone-1"}
  ]);
});

test("collects dated workspace rows from lazy project summaries",()=>{
  const projects=[{
    id:"project-2",name:"Migration",
    fields:[{id:"start",label:"Start date",type:"start-date"},{id:"due",label:"Due date",type:"due-date"}],
    milestones:[{id:"milestone-2",title:"Cutover",dueDate:"2026-11-01"}],
    groups:[{id:"group-2",name:"Plan"}],
    itemIndex:[{id:"task-2",title:"Audit data",groupId:"group-2",groupName:"Plan",values:{start:"2026-10-05",due:"2026-10-15"},completedAt:Date.now()}]
  }];
  const rows=roadmap.rowsForWorkspace(projects);
  assert.deepEqual(JSON.parse(JSON.stringify(rows.map(({projectName,title,startDate,date,kind,completed})=>({projectName,title,startDate,date,kind,completed})))),[
    {projectName:"Migration",title:"Audit data",startDate:"2026-10-05",date:"2026-10-15",kind:"task",completed:true},
    {projectName:"Migration",title:"Cutover",date:"2026-11-01",kind:"milestone",completed:false}
  ]);
});

test("includes tasks with only a start date as a one-day roadmap entry",()=>{
  const rows=roadmap.rowsForProject({
    id:"project-3",
    name:"Research",
    fields:[],
    groups:[{id:"group-3",name:"Plan",items:[
      {id:"task-3",title:"Begin research",values:{start:"2026-10-12"}}
    ]}],
    fields:[{id:"start",label:"Start date",type:"start-date"}]
  });

  assert.deepEqual(JSON.parse(JSON.stringify(rows.map(({startDate,date,fieldLabel})=>({startDate,date,fieldLabel})))),[
    {startDate:"2026-10-12",date:"2026-10-12",fieldLabel:"Start date"}
  ]);
});
