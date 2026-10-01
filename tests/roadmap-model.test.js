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
    fields:[{id:"due",label:"Due date",type:"date"},{id:"text",label:"Notes",type:"text"}],
    milestones:[{id:"milestone-1",title:"Release",dueDate:"2026-10-20"},{id:"milestone-2",title:"No date"}],
    groups:[{id:"group-1",name:"To do",items:[
      {id:"task-1",title:"Prepare",description:"Get signoff",values:{due:"2026-10-10"},completedAt:null},
      {id:"task-2",title:"Archived",values:{due:"2026-10-01"},archived:true},
      {id:"task-3",title:"Event",values:{due:"2026-10-02"},calendarType:"event"}
    ]}]
  };
  const rows=roadmap.rowsForProject(project);
  assert.deepEqual(JSON.parse(JSON.stringify(rows.map(({title,description,date,kind,groupName,milestoneId})=>({title,description,date,kind,groupName,milestoneId})))),[
    {title:"Prepare",description:"Get signoff",date:"2026-10-10",kind:"task",groupName:"To do"},
    {title:"Release",date:"2026-10-20",kind:"milestone",milestoneId:"milestone-1"}
  ]);
});

test("collects dated workspace rows from lazy project summaries",()=>{
  const projects=[{
    id:"project-2",name:"Migration",
    fields:[{id:"due",label:"Due date",type:"date"}],
    milestones:[{id:"milestone-2",title:"Cutover",dueDate:"2026-11-01"}],
    groups:[{id:"group-2",name:"Plan"}],
    itemIndex:[{id:"task-2",title:"Audit data",groupId:"group-2",groupName:"Plan",values:{due:"2026-10-15"},completedAt:Date.now()}]
  }];
  const rows=roadmap.rowsForWorkspace(projects);
  assert.deepEqual(JSON.parse(JSON.stringify(rows.map(({projectName,title,date,kind,completed})=>({projectName,title,date,kind,completed})))),[
    {projectName:"Migration",title:"Audit data",date:"2026-10-15",kind:"task",completed:true},
    {projectName:"Migration",title:"Cutover",date:"2026-11-01",kind:"milestone",completed:false}
  ]);
});
