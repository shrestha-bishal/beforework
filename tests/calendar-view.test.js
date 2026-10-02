"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const app=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
const view=fs.readFileSync(path.join(__dirname,"../js/views/calendar-view.js"),"utf8");
const template=fs.readFileSync(path.join(__dirname,"../pages/calendar.html"),"utf8");

test("Calendar renderer is wired as a separate view and reuses its page template",()=>{
  for (const id of ["calendarDayTemplate","calendarEventTemplate"]){
    assert.ok(view.includes(`#${id}`),`Calendar renderer does not use ${id}`);
    assert.ok(template.includes(`id="${id}"`),`Calendar template is missing ${id}`);
  }
  assert.ok(template.includes('class="calendarGrid"'));
  assert.ok(template.includes("data-calendar-month"));
  assert.ok(app.includes('cloneTemplate:()=>window.BeforeworkViewTemplates.clone("calendar")'));
  assert.ok(app.includes('import("./views/calendar-view.js")'));
  assert.ok(!app.includes("function renderCalendar("));
});

test("Calendar view receives app-owned calendar state and mutation callbacks",()=>{
  for (const dependency of [
    "calendarEntries",
    "getCalendarCursor",
    "setCalendarCursor",
    "getState",
    "toggleCalendarTaskCompletion",
    "exportCalendarIcs",
    "connectGoogleCalendar",
    "openStandaloneCalendarItemModal"
  ]){
    assert.ok(view.includes(dependency),`missing ${dependency}`);
  }
  assert.ok(app.includes("getCalendarCursor:()=>calendarCursor"));
  assert.ok(app.includes("setCalendarCursor:value=>{ calendarCursor=value; }"));
  assert.ok(app.includes("calendarView.render(board, null)"));
  assert.ok(app.includes("calendarView.render(board, project)"));
});

test("calendar completion loads lazy projects and refreshes their summary index",async()=>{
  const start=app.indexOf("async function toggleCalendarTaskCompletion");
  const end=app.indexOf("function tagById",start);
  assert.ok(start>=0&&end>start,"calendar completion action is missing");
  const item={id:"task-1",calendarType:"task",completedAt:null,updatedAt:0};
  const project={id:"project-1",groups:[{id:"group-1",name:"Tasks",items:[item]}]};
  const state={
    folderLazy:true,
    projects:[],
    projectSummaries:[{id:project.id,groups:[{id:"group-1",name:"Tasks"}],itemIndex:[{id:item.id,completedAt:null}]}]
  };
  const activities=[];
  let loads=0;
  let saves=0;
  const context={
    state,
    getLoadedProject:id=>state.projects.find(candidate=>candidate.id===id),
    getProject:id=>state.projectSummaries.find(candidate=>candidate.id===id),
    async ensureProjectLoaded(){ loads++; state.projects.push(project); return project; },
    registerProjectSummary(loaded){
      const summary=state.projectSummaries.find(candidate=>candidate.id===loaded.id);
      summary.itemIndex=loaded.groups.flatMap(group=>group.items.map(loadedItem=>({
        id:loadedItem.id,
        completedAt:loadedItem.completedAt
      })));
    },
    isItemCompleted:value=>Number.isFinite(value.completedAt)&&value.completedAt>0,
    recordItemActivity:(value,type)=>activities.push({id:value.id,type}),
    scheduleSave:()=>{ saves++; },
    async showNotice(){ throw new Error("Unexpected notice"); }
  };
  const toggle=vm.runInNewContext(`${app.slice(start,end)}; toggleCalendarTaskCompletion`,context);

  assert.equal(await toggle({projectId:project.id,groupId:"group-1",itemId:item.id}),true);
  assert.equal(loads,1);
  assert.ok(item.completedAt>0);
  assert.ok(state.projectSummaries[0].itemIndex[0].completedAt>0);
  assert.deepEqual(activities,[{id:item.id,type:"completed"}]);
  assert.equal(saves,1);

  assert.equal(await toggle({projectId:project.id,groupId:"group-1",itemId:item.id}),true);
  assert.equal(item.completedAt,null);
  assert.equal(state.projectSummaries[0].itemIndex[0].completedAt,null);
  assert.deepEqual(activities,[{id:item.id,type:"completed"},{id:item.id,type:"reopened"}]);
  assert.equal(saves,2);
});

test("calendar completion also toggles standalone tasks",async()=>{
  const start=app.indexOf("async function toggleCalendarTaskCompletion");
  const end=app.indexOf("function tagById",start);
  const item={id:"calendar-task",calendarType:"task",completedAt:null,updatedAt:0};
  let saves=0;
  const context={
    state:{folderLazy:false,calendarItems:[item]},
    isItemCompleted:value=>Number.isFinite(value.completedAt)&&value.completedAt>0,
    recordItemActivity(){},
    scheduleSave(){ saves++; },
    async showNotice(){ throw new Error("Unexpected notice"); }
  };
  const toggle=vm.runInNewContext(`${app.slice(start,end)}; toggleCalendarTaskCompletion`,context);

  assert.equal(await toggle({projectId:"",itemId:item.id}),true);
  assert.ok(item.completedAt>0);
  assert.equal(saves,1);
});

test("calendar completion updates an already-loaded project without reloading it",async()=>{
  const start=app.indexOf("async function toggleCalendarTaskCompletion");
  const end=app.indexOf("function tagById",start);
  const item={id:"loaded-task",calendarType:"task",completedAt:null,updatedAt:0};
  const project={id:"loaded-project",groups:[{id:"loaded-group",items:[item]}]};
  let saves=0;
  const context={
    state:{folderLazy:true,projects:[project],projectSummaries:[]},
    getLoadedProject:id=>id===project.id?project:null,
    getProject:()=>null,
    async ensureProjectLoaded(){ throw new Error("Loaded project should not reload"); },
    registerProjectSummary(){},
    isItemCompleted:value=>Number.isFinite(value.completedAt)&&value.completedAt>0,
    recordItemActivity(){},
    scheduleSave(){ saves++; },
    async showNotice(message){ throw new Error(`Unexpected notice: ${message}`); }
  };
  const toggle=vm.runInNewContext(`${app.slice(start,end)}; toggleCalendarTaskCompletion`,context);

  assert.equal(await toggle({projectId:project.id,groupId:"loaded-group",itemId:item.id}),true);
  assert.ok(item.completedAt>0);
  assert.equal(saves,1);
});

test("calendar completion reports missing task data without claiming success",async()=>{
  const start=app.indexOf("async function toggleCalendarTaskCompletion");
  const end=app.indexOf("function tagById",start);
  const notices=[];
  const context={
    state:{folderLazy:false,projects:[],projectSummaries:[],calendarItems:[]},
    getLoadedProject:()=>null,
    getProject:()=>null,
    isItemCompleted:()=>false,
    recordItemActivity(){},
    scheduleSave(){ throw new Error("Missing item must not be saved"); },
    async showNotice(title,message){ notices.push({title,message}); }
  };
  const toggle=vm.runInNewContext(`${app.slice(start,end)}; toggleCalendarTaskCompletion`,context);

  assert.equal(await toggle({projectId:"missing-project",groupId:"missing-group",itemId:"missing-task"}),false);
  assert.deepEqual(notices,[{
    title:"Couldn't update calendar task",
    message:"The task could not be found in its project."
  }]);
});

test("calendar completion reports lazy project loading errors and does not save",async()=>{
  const start=app.indexOf("async function toggleCalendarTaskCompletion");
  const end=app.indexOf("function tagById",start);
  const notices=[];
  const context={
    state:{folderLazy:true,projects:[],projectSummaries:[]},
    getLoadedProject:()=>null,
    async ensureProjectLoaded(){ throw new Error("Folder permission denied"); },
    async showNotice(title,message){ notices.push({title,message}); },
    scheduleSave(){ throw new Error("Failed load must not save"); }
  };
  const toggle=vm.runInNewContext(`${app.slice(start,end)}; toggleCalendarTaskCompletion`,context);

  assert.equal(await toggle({projectId:"project-1",groupId:"group-1",itemId:"task-1"}),false);
  assert.deepEqual(notices,[{
    title:"Couldn't update calendar task",
    message:"Folder permission denied"
  }]);
});

test("new Calendar items default to tasks in standalone and project calendars",async()=>{
  const start=app.indexOf("async function openNewCalendarItemModal");
  const end=app.indexOf("/* ---------- Item modal ---------- */",start);
  assert.ok(start>=0&&end>start,"Calendar item creation function is missing");
  const standaloneItems=[];
  const overlay={addEventListener(){},className:"",id:"",innerHTML:""};
  const context={
    openItemRef:null,
    uid:()=>"new-calendar-item",
    calendarDateFields:project=>project.fields,
    openStandaloneCalendarItemModal:(item,isNew)=>standaloneItems.push({item,isNew}),
    async showNotice(){ throw new Error("Unexpected notice"); },
    createItemModalShell(){},
    document:{
      createElement(){ return overlay; },
      body:{appendChild(){}}
    },
    renderItemModal(){}
  };
  const create=vm.runInNewContext(`${app.slice(start,end)}; openNewCalendarItemModal`,context);

  await create(null,"2026-10-02");
  assert.equal(standaloneItems.length,1);
  assert.equal(standaloneItems[0].item.calendarType,"task");
  assert.equal(standaloneItems[0].item.startDate,"2026-10-02");
  assert.equal(standaloneItems[0].isNew,true);

  const project={
    id:"project-1",
    name:"Project",
    fields:[{id:"due",type:"due-date"}],
    groups:[{id:"group-1",items:[]}]
  };
  await create(project,"2026-10-03");
  assert.equal(context.openItemRef.draft.calendarType,"task");
  assert.equal(context.openItemRef.draft.values.due,"2026-10-03");
  assert.equal(context.openItemRef.draft.startTime,"");
  assert.equal(context.openItemRef.draft.endTime,"");
  assert.equal(context.openItemRef.draft.endDate,"");
});
