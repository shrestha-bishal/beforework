"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const source=fs.readFileSync(path.join(__dirname,"../js/services/google-calendar/google-calendar.js"),"utf8");
const errorUtilsSource=fs.readFileSync(path.join(__dirname,"../js/core/error-utils.js"),"utf8");
const errorUtilsSandbox={window:{}};
vm.runInNewContext(errorUtilsSource,errorUtilsSandbox,{filename:"error-utils.js"});
const errorUtils=errorUtilsSandbox.window.BeforeworkErrorUtils;

test("every sync pulls Google changes before recalculating and pushing local entries",()=>{
  const start=source.indexOf("async function syncGoogleCalendar(scopeProject,");
  const end=source.indexOf("\n  function connectGoogleCalendar",start);
  const sync=source.slice(start,end);
  const pull=sync.indexOf("await importGoogleCalendarEvents({duringSync:true,throwOnError:true})");
  const entries=sync.indexOf("let entries = calendarEntries(scopeProject)");
  const noEntries=sync.indexOf("if (!entries.length)");
  assert.ok(pull>=0,"sync awaits the inbound Google changes");
  assert.ok(entries>pull,"local entries are recalculated after importing Google changes");
  assert.ok(noEntries>entries,"empty local state is handled after pulling Google changes");
  assert.ok(sync.indexOf("googleSyncInFlight = true")<pull,"the full pull/push operation is locked against overlap");
  assert.ok(sync.includes("await processGoogleDeletions()"),"queued deletions are flushed as part of a full sync");
  assert.doesNotMatch(sync,/Nothing to sync/);
});

test("Google item identity and timezone are preserved for conflict-safe reconciliation",()=>{
  assert.match(source,/extendedProperties=\{private:\{beforeworkItemId:entry\.item\.id,beforeworkOwnerId:ownerId,beforeworkFieldId:entry\.field\.id\}\}/);
  assert.match(source,/calendarTimeZone=event\.start\?\.timeZone\|\|event\.end\?\.timeZone/);
  assert.match(source,/item\.calendarTimeZone\s*\|\|\s*Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/);
  assert.match(source,/const localWins=localChanged&&remoteChanged&&localUpdatedAt>remoteTime/);
  assert.match(source,/resolved \$\{conflictCount\} conflict/);
});

test("Google Calendar location imports update the optional Location field",()=>{
  const context={
    window:{BeforeworkErrorUtils:errorUtils},
    calendarDateKey:date=>date.toISOString().slice(0,10),
    Date
  };
  vm.runInNewContext(`${source}\nglobalThis.applyEvent=applyGoogleEventToItem;`,context);
  const item={title:"Site visit",description:"",location:"Old location",values:{location:"Old location"}};

  context.applyEvent({
    item,
    project:{fields:[{id:"location",type:"location"}]},
    field:{id:"__schedule__"}
  },{
    location:"New location",
    start:{dateTime:"2026-10-03T09:00:00+10:00"},
    end:{dateTime:"2026-10-03T10:00:00+10:00"}
  });

  assert.equal(item.location,"New location");
  assert.equal(item.values.location,"New location");
});

test("folder-workspace summaries keep Google reconciliation metadata",()=>{
  const folderWorkspace=fs.readFileSync(path.join(__dirname,"../js/services/storage/folder-workspace.js"),"utf8");
  assert.match(folderWorkspace,/googleEventIds:item\.googleEventIds\|\|\{\}/);
  assert.match(folderWorkspace,/googleSyncMeta:item\.googleSyncMeta\|\|\{\}/);
  assert.match(folderWorkspace,/calendarTimeZone:item\.calendarTimeZone\|\|""/);
});

test("empty local calendars still complete without a misleading error",()=>{
  const start=source.indexOf("async function syncGoogleCalendar(scopeProject,");
  const end=source.indexOf("\n  function connectGoogleCalendar",start);
  const sync=source.slice(start,end);
  assert.match(sync,/Google calendars checked · no dated local items to sync/);
  assert.ok(sync.indexOf("if (!calendarIds.length)")<sync.indexOf("await importGoogleCalendarEvents"),"calendar linkage is validated before import");
});

test("polling pushes changed standalone items without syncing project items",async()=>{
  const localItem={
    id:"local-1",title:"Updated local event",description:"",location:"",standalone:true,
    startDate:"2026-10-02",endDate:"2026-10-02",startTime:"10:00",endTime:"11:00",
    updatedAt:Date.parse("2026-10-02T21:00:00.000Z"),
    googleEventIds:{"calendar-1:__calendar__:__standalone__":"event-local"},
    googleSyncMeta:{"calendar-1:__calendar__:__standalone__":{
      googleUpdatedAt:"2026-10-02T20:00:00.000Z",localUpdatedAt:Date.parse("2026-10-02T19:00:00.000Z")
    }}
  };
  const projectItem={
    id:"project-1",title:"Project item",updatedAt:Date.parse("2026-10-02T21:00:00.000Z"),
    googleEventIds:{"calendar-1:project-a:date":"event-project"},
    googleSyncMeta:{"calendar-1:project-a:date":{googleUpdatedAt:"2026-10-02T20:00:00.000Z",localUpdatedAt:0}}
  };
  const requests=[];
  const entries=()=>[
    {project:null,group:null,item:localItem,field:{id:"__standalone__",label:"Calendar",type:"date"},date:localItem.startDate,endDate:localItem.endDate},
    {project:{id:"project-a",name:"Project"},group:{id:"group-a"},item:projectItem,field:{id:"date",label:"Due date",type:"date"},date:"2026-10-02",endDate:"2026-10-02"}
  ];
  const context={
    window:{BeforeworkErrorUtils:errorUtils},
    googleAccessToken:"access-token",
    googleSyncInFlight:false,
    googleImportInFlight:false,
    googleSyncQueued:false,
    googleSyncApplying:false,
    googlePollTimer:1,
    googleAutoSyncTimer:null,
    googleTokenRefreshTimer:null,
    googleDeleteInFlight:false,
    clearTimeout(){},
    state:{googleCalendarLinks:["calendar-1"],googleCalendarCatalog:[{id:"calendar-1",summary:"Work"}],googleCalendarSyncTokens:{"calendar-1":"old-token"},googleDeletedEventIds:[],calendarItems:[localItem]},
    calendarEntries:entries,
    projectRecords:()=>[],
    ensureProjectLoaded:async()=>null,
    calendarDateFields:()=>[],
    scheduleSave(){},
    flushSave:async()=>true,
    renderAll(){},
    showNotice:async()=>{},
    activeProjectId:"",
    URLSearchParams,
    document:{querySelectorAll:()=>[]},
    fetch:async(url,options={})=>{
      const method=options.method||"GET";
      requests.push({url,method,body:options.body});
      let body={};
      if (url.includes("/events?")){
        body={items:[],nextSyncToken:"next-token"};
      } else if (method==="PATCH"){
        body={id:"event-local",updated:"2026-10-02T21:01:00.000Z",...JSON.parse(options.body)};
      } else if (url.includes("/events/event-local")){
        body={id:"event-local",updated:"2026-10-02T20:00:00.000Z",summary:"Old Google title"};
      }
      return {ok:true,status:200,json:async()=>body,text:async()=>""};
    }
  };
  vm.runInNewContext(`${source}\nglobalThis.runPoll=pollGoogleCalendar;`,context,{filename:"google-calendar.js"});
  await vm.runInContext("runPoll()",context);

  const patch=requests.find(request=>request.method==="PATCH");
  assert.ok(patch,"polling sends the local standalone edit to Google");
  assert.match(patch.url,/events\/event-local$/,"polling updates the linked Google event instead of creating a duplicate");
  assert.equal(JSON.parse(patch.body).summary,"Updated local event");
  assert.equal(requests.some(request=>request.url.includes("/events/event-project")),false,"polling does not sync project items");
});

test("manual sync resolves remote changes before updating the existing Google event",async()=>{
  const item={
    id:"item-1",title:"Newer local title",description:"",location:"",calendarType:"event",standalone:true,
    startDate:"2026-10-02",endDate:"2026-10-02",startTime:"10:00",endTime:"11:00",
    updatedAt:Date.parse("2026-10-02T21:00:00.000Z"),
    googleEventIds:{},
    googleSyncMeta:{"calendar-1:__calendar__:__standalone__":{
      googleUpdatedAt:"2026-10-02T20:00:00.000Z",localUpdatedAt:Date.parse("2026-10-02T19:00:00.000Z")
    }}
  };
  const remoteEvent={
    id:"event-1",updated:"2026-10-02T20:30:00.000Z",summary:"Remote title",
    start:{dateTime:"2026-10-02T09:00:00-04:00",timeZone:"America/New_York"},
    end:{dateTime:"2026-10-02T10:00:00-04:00",timeZone:"America/New_York"},
    extendedProperties:{private:{beforeworkItemId:"item-1",beforeworkOwnerId:"__calendar__",beforeworkFieldId:"__standalone__"}}
  };
  const requests=[];
  const notices=[];
  const entries=()=>[{project:null,group:null,item,field:{id:"__standalone__",label:"Calendar",type:"date"},date:item.startDate,endDate:item.endDate}];
  const context={
    window:{BeforeworkErrorUtils:errorUtils},
    googleAccessToken:"access-token",
    googleSyncInFlight:false,
    googleImportInFlight:false,
    googleSyncQueued:false,
    googleSyncApplying:false,
    googlePollTimer:1,
    googleAutoSyncTimer:null,
    googleTokenRefreshTimer:null,
    googleDeleteInFlight:false,
    clearTimeout(){},
    state:{googleCalendarLinks:["calendar-1"],googleCalendarCatalog:[{id:"calendar-1",summary:"Work"}],googleCalendarSyncTokens:{ "calendar-1":"old-token" },googleDeletedEventIds:[],calendarItems:[item]},
    calendarEntries:entries,
    projectRecords:()=>[],
    ensureProjectLoaded:async()=>null,
    calendarDateFields:()=>[],
    scheduleSave(){},
    flushSave:async()=>true,
    renderAll(){},
    showNotice:async(...args)=>{ notices.push(args); },
    activeProjectId:"",
    URLSearchParams,
    document:{querySelectorAll:()=>[]},
    fetch:async(url,options={})=>{
      const method=options.method||"GET";
      requests.push({url,method,body:options.body});
      let body={};
      if (url.includes("/events?")){
        body={items:[remoteEvent],nextSyncToken:"new-token"};
      } else if (method==="PATCH"){
        body={...remoteEvent,updated:"2026-10-02T21:01:00.000Z",summary:JSON.parse(options.body).summary};
      } else if (url.includes("/events/event-1")){
        body=remoteEvent;
      }
      return {ok:true,status:200,json:async()=>body,text:async()=>""};
    }
  };
  vm.runInNewContext(`${source}\nglobalThis.runSync=syncGoogleCalendar;globalThis.readSyncStatus=()=>googleSyncFeedbackMessage;`,context,{filename:"google-calendar.js"});
  await vm.runInContext("runSync(null)",context);

  const pullIndex=requests.findIndex(request=>request.url.includes("/events?"));
  const patchIndex=requests.findIndex(request=>request.method==="PATCH");
  assert.ok(pullIndex>=0&&patchIndex>pullIndex,`Google is pulled before the local edit is pushed: ${JSON.stringify({requests,status:context.readSyncStatus(),notices})}`);
  assert.equal(requests.filter(request=>request.method==="POST").length,0,"reconciliation does not create a duplicate event");
  const patch=JSON.parse(requests[patchIndex].body);
  assert.equal(patch.summary,"Newer local title","the newer local edit wins the conflict");
  assert.equal(patch.start.timeZone,"America/New_York","the imported event time zone is preserved");
  assert.equal(patch.extendedProperties.private.beforeworkItemId,"item-1","Google keeps a stable Beforework event identity");
  assert.equal(item.calendarTimeZone,"America/New_York");
  assert.match(context.readSyncStatus(),/resolved 1 conflict by keeping the newest update/);
});
