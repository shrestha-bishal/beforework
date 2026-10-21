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
  const entries=sync.indexOf("calendarEntries(scopeProject).forEach");
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

test("multi-day Google events keep their start and end dates when imported or already linked",async()=>{
  const legacyItem={
    id:"legacy-item",title:"Legacy multi-day event",standalone:true,endDate:"2026-10-09",
    updatedAt:Date.parse("2026-10-02T19:00:00.000Z"),
    googleEventIds:{"calendar-1:__calendar__:__standalone__":"legacy-event"},
    googleSyncMeta:{"calendar-1:__calendar__:__standalone__":{
      googleUpdatedAt:"2026-10-02T20:00:00.000Z",localUpdatedAt:Date.parse("2026-10-02T19:00:00.000Z")
    }}
  };
  const events=[
    {id:"new-event",updated:"2026-10-02T20:00:00.000Z",summary:"New multi-day event",start:{date:"2026-10-04"},end:{date:"2026-10-10"}},
    {
      id:"legacy-event",updated:"2026-10-02T20:00:00.000Z",summary:"Legacy multi-day event",
      start:{date:"2026-10-04"},end:{date:"2026-10-10"},
      extendedProperties:{private:{beforeworkItemId:"legacy-item",beforeworkOwnerId:"__calendar__",beforeworkFieldId:"__standalone__"}}
    }
  ];
  const calendarItems=[legacyItem];
  const requests=[];
  const context={
    window:{BeforeworkErrorUtils:errorUtils},
    googleAccessToken:"access-token",googleImportInFlight:false,googleSyncInFlight:false,googleSyncQueued:false,
    googleSyncApplying:false,
    state:{googleCalendarLinks:["calendar-1"],googleCalendarSyncTokens:{},googleDeletedEventIds:[],calendarItems},
    projectRecords:()=>[],
    scheduleSave(){},
    flushSave:async()=>true,
    renderAll(){},
    updateGoogleCalendarButtons(){},
    document:{querySelectorAll:()=>[]},
    URLSearchParams,Date,
    uid:()=>"new-item",
    fetch:async(url)=>{requests.push(url);return {ok:true,status:200,json:async()=>({items:events,nextSyncToken:"next-token"}),text:async()=>""};}
  };
  vm.runInNewContext(`${source}\nglobalThis.importEvents=importGoogleCalendarEvents;globalThis.readStatus=()=>googleSyncFeedbackMessage;`,context,{filename:"google-calendar.js"});
  const result=await vm.runInContext("importEvents()",context);

  assert.equal(result.importedCount,2,`${context.readStatus()} ${JSON.stringify(requests)}`);
  assert.equal(calendarItems.length,2,"the linked event is reconciled rather than imported as a duplicate");
  assert.equal(calendarItems.find(item=>item.id==="new-item").startDate,"2026-10-04");
  assert.equal(calendarItems.find(item=>item.id==="new-item").endDate,"2026-10-09","Google's exclusive end date is stored as the inclusive final day");
  assert.equal(legacyItem.startDate,"2026-10-04","existing linked items missing a start date are repaired");
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

test("polling syncs standalone events and tasks both ways without syncing project items",async()=>{
  const localItem={
    id:"local-1",title:"Updated local event",description:"",location:"",standalone:true,calendarType:"task",
    startDate:"2026-10-02",endDate:"2026-10-02",startTime:"10:00",endTime:"11:00",
    updatedAt:Date.parse("2026-10-02T21:00:00.000Z"),
    googleEventIds:{"calendar-1:__calendar__:__standalone__":"event-local"},
    googleSyncMeta:{"calendar-1:__calendar__:__standalone__":{
      googleUpdatedAt:"2026-10-02T20:00:00.000Z",localUpdatedAt:Date.parse("2026-10-02T19:00:00.000Z")
    }}
  };
  const remoteChangedItem={
    id:"local-2",title:"Original title",description:"",location:"",standalone:true,calendarType:"event",
    startDate:"2026-10-02",endDate:"2026-10-02",startTime:"10:00",endTime:"11:00",
    updatedAt:Date.parse("2026-10-02T20:00:00.000Z"),
    googleEventIds:{"calendar-1:__calendar__:__standalone__":"event-remote"},
    googleSyncMeta:{"calendar-1:__calendar__:__standalone__":{
      googleUpdatedAt:"2026-10-02T20:00:00.000Z",localUpdatedAt:Date.parse("2026-10-02T20:00:00.000Z")
    }}
  };
  const projectItem={
    id:"project-1",title:"Project item",values:{date:"2026-10-02"},updatedAt:Date.parse("2026-10-02T21:00:00.000Z"),
    googleEventIds:{"calendar-1:project-a:date":"event-project"},
    googleSyncMeta:{"calendar-1:project-a:date":{googleUpdatedAt:"2026-10-02T20:00:00.000Z",localUpdatedAt:0}}
  };
  const project={id:"project-a",name:"Project",groups:[{id:"group-a",name:"Tasks",items:[projectItem]}],fields:[{id:"date",type:"date"}]};
  const remoteEvent={
    id:"event-remote",updated:"2026-10-02T22:00:00.000Z",summary:"Changed in Google",
    start:{dateTime:"2026-10-03T09:00:00+10:00",timeZone:"Australia/Sydney"},
    end:{dateTime:"2026-10-03T10:00:00+10:00",timeZone:"Australia/Sydney"},
    extendedProperties:{private:{beforeworkItemId:"local-2",beforeworkOwnerId:"__calendar__",beforeworkFieldId:"__standalone__"}}
  };
  const remoteProjectEvent={
    id:"event-project",updated:"2026-10-02T22:00:00.000Z",summary:"Changed project item",
    start:{date:"2026-10-04"},end:{date:"2026-10-05"},
    extendedProperties:{private:{beforeworkItemId:"project-1",beforeworkOwnerId:"project-a",beforeworkFieldId:"date"}}
  };
  const requests=[];
  const entries=()=>[
    {project:null,group:null,item:localItem,field:{id:"__standalone__",label:"Calendar",type:"date"},date:localItem.startDate,endDate:localItem.endDate},
    {project:null,group:null,item:remoteChangedItem,field:{id:"__standalone__",label:"Calendar",type:"date"},date:remoteChangedItem.startDate,endDate:remoteChangedItem.endDate},
    {project,group:project.groups[0],item:projectItem,field:{id:"date",label:"Due date",type:"date"},date:"2026-10-02",endDate:"2026-10-02"}
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
    state:{folderLazy:false,projects:[project],googleCalendarLinks:["calendar-1"],googleCalendarCatalog:[{id:"calendar-1",summary:"Work"}],googleCalendarSyncTokens:{"calendar-1":"old-token"},googleDeletedEventIds:[],calendarItems:[localItem,remoteChangedItem]},
    calendarEntries:entries,
    projectRecords:()=>[project],
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
        body={items:[remoteEvent,remoteProjectEvent],nextSyncToken:"next-token"};
      } else if (method==="PATCH"){
        body={id:"event-local",updated:"2026-10-02T21:01:00.000Z",...JSON.parse(options.body)};
      } else if (url.includes("/events/event-local")){
        body={id:"event-local",updated:"2026-10-02T20:00:00.000Z",summary:"Old Google title"};
      } else if (url.includes("/events/event-remote")){
        body=remoteEvent;
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
  assert.equal(remoteChangedItem.title,"Changed in Google","Google event changes are applied to a linked standalone event");
  assert.equal(remoteChangedItem.startDate,"2026-10-03");
  assert.equal(projectItem.title,"Project item","project items are not changed by inbound Google updates");
  assert.equal(projectItem.values.date,"2026-10-02");
  assert.equal(requests.some(request=>request.url.includes("/events/event-project")),false,"polling does not sync project items");
});

test("manual sync resolves remote changes before updating the existing Google event",async()=>{
  const item={
    id:"item-1",title:"Newer local title",description:"",location:"",calendarType:"event",standalone:true,
    endDate:"2026-10-02",startTime:"10:00",endTime:"11:00",calendarTimeZone:"America/New_York",
    updatedAt:Date.parse("2026-10-02T21:00:00.000Z"),
    googleEventIds:{"calendar-1:__calendar__:__standalone__":"event-1"},
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
        body={items:[],nextSyncToken:"new-token"};
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
  assert.equal(item.startDate,"2026-10-02","a linked item missing its start date is repaired using its existing Google event ID");
  assert.equal(patch.extendedProperties.private.beforeworkItemId,"item-1","Google keeps a stable Beforework event identity");
  assert.equal(item.calendarTimeZone,"America/New_York");
  assert.match(context.readSyncStatus(),/resolved 1 conflict by keeping the newest update/);
});
