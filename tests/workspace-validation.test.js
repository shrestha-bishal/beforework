"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const {createElement,createPickerTestEnvironment}=require("./helpers/date-time-picker-dom");
const {createItemFieldRenderer}=require("./helpers/item-fields");
const {createFieldTypes}=require("./helpers/field-types");

const fieldTypes=createFieldTypes();

const source = fs.readFileSync(path.join(__dirname,"../js/core/workspace-validation.js"),"utf8");
const storageSource = fs.readFileSync(path.join(__dirname,"../js/services/storage/storage.js"),"utf8");
const sandbox = {window:{BeforeworkFieldTypes:fieldTypes}};
vm.runInNewContext(source,sandbox,{filename:"workspace-validation.js"});
const validate = sandbox.window.BeforeworkWorkspaceValidation.validate;
const seederSandbox = {window:{},Blob};
const seederSource = fs.readFileSync(path.join(__dirname,"../js/demo/demo-seeder.js"),"utf8");
vm.runInNewContext(seederSource,seederSandbox,{filename:"demo-seeder.js"});

test("clears stale remembered folder handles when workspace reconnection fails",()=>{
  const start=storageSource.indexOf("async function tryReconnectFile()");
  const end=storageSource.indexOf("async function reconnectPendingFile()",start);
  const reconnectSource=storageSource.slice(start,end);
  assert.match(reconnectSource,/if \(missingHandle\)\{[\s\S]*?await clearRememberedWorkspaceSelection\(\);/);
});

test("clears a missing remembered workspace root before create or open can reuse it",async()=>{
  const start=storageSource.indexOf("async function rememberWorkspaceSelection(");
  const end=storageSource.indexOf("async function readRecoverySnapshots()",start);
  const rememberedWorkspaceSource=storageSource.slice(start,end);
  const storedValues=[];
  const sandbox={
    idbGet:async key=>key==="workspaceName" ? "Old workspace" : null,
    idbSet:async(key,value)=>storedValues.push([key,value]),
    getFolderWorkspace:()=>({isWorkspace:async()=>false}),
    root:{getDirectoryHandle:async()=>{
      const error=new Error("A requested file or directory could not be found at the time an operation was processed.");
      error.name="NotFoundError";
      throw error;
    }},
    workspaceRootHandle:null,
    fileHandle:{name:"stale"},
    pendingReconnectHandle:{name:"stale"}
  };
  const result=await vm.runInNewContext(`
    ${rememberedWorkspaceSource}
    findRememberedWorkspace(root);
  `,sandbox);

  assert.equal(result,null);
  assert.equal(sandbox.workspaceRootHandle,null);
  assert.equal(sandbox.fileHandle,null);
  assert.equal(sandbox.pendingReconnectHandle,null);
  assert.deepEqual(storedValues,[["workspaceRootHandle",null],["fileHandle",null],["workspaceName",null]]);
});

test("reuses a valid remembered root for create and open without showing the picker",async()=>{
  const helperStart=storageSource.indexOf("function isMissingWorkspaceHandleError(");
  const helperEnd=storageSource.indexOf("async function readRecoverySnapshots()",helperStart);
  const helperSource=storageSource.slice(helperStart,helperEnd);
  let pickerCalls=0;
  const rememberedRoot={
    name:"Workspace root",
    requestPermission:async()=> "granted",
    values:()=>({next:async()=>({done:true})})
  };
  const sandbox={
    window:{showDirectoryPicker:async()=>{ pickerCalls++; throw new Error("Picker should not be shown."); }},
    idbSet:async()=>{},
    workspaceRootHandle:rememberedRoot,
    getFolderWorkspace:()=>({isWorkspace:async()=>false})
  };
  const roots=await vm.runInNewContext(`
    ${helperSource}
    Promise.all([chooseWorkspaceRoot(),chooseWorkspaceRoot({forCreate:true})]);
  `,sandbox);

  assert.equal(roots[0],rememberedRoot);
  assert.equal(roots[1],rememberedRoot);
  assert.equal(pickerCalls,0);
});

test("falls back to the folder picker when the remembered root is stale",async()=>{
  const helperStart=storageSource.indexOf("function isMissingWorkspaceHandleError(");
  const helperEnd=storageSource.indexOf("async function readRecoverySnapshots()",helperStart);
  const helperSource=storageSource.slice(helperStart,helperEnd);
  const stored=[];
  let pickerCalls=0;
  const selectedRoot={
    name:"Fresh folder",
    requestPermission:async()=> "granted",
    values:()=>({next:async()=>({done:true})})
  };
  const staleRoot={
    name:"Stale folder",
    requestPermission:async()=> "granted",
    values:()=>({next:async()=>{
      const error=new Error("A requested file or directory could not be found at the time an operation was processed.");
      error.name="NotFoundError";
      throw error;
    }})
  };
  const sandbox={
    window:{showDirectoryPicker:async options=>{
      pickerCalls++;
      assert.deepEqual(JSON.parse(JSON.stringify(options)),{mode:"readwrite"});
      return selectedRoot;
    }},
    idbSet:async(key,value)=>stored.push([key,value]),
    workspaceRootHandle:staleRoot,
    getFolderWorkspace:()=>({isWorkspace:async()=>false})
  };
  const root=await vm.runInNewContext(`
    ${helperSource}
    chooseWorkspaceRoot();
  `,sandbox);
  const createStart=storageSource.indexOf("async function chooseWorkspaceDirectory()");
  const createEnd=storageSource.indexOf("async function chooseWorkspaceFromRoot(",createStart);
  const createSource=storageSource.slice(createStart,createEnd);
  const openStart=storageSource.indexOf("async function openExistingWorkspaceFolder()");
  const openEnd=storageSource.indexOf("async function openExistingFile()",openStart);
  const openSource=storageSource.slice(openStart,openEnd);

  assert.equal(root,selectedRoot);
  assert.equal(pickerCalls,1);
  assert.equal(sandbox.workspaceRootHandle,selectedRoot);
  assert.deepEqual(stored.map(([key,value])=>[key,value?.name||null]),[
    ["workspaceRootHandle",null],
    ["workspaceRootHandle","Fresh folder"]
  ]);
  assert.match(createSource,/chooseWorkspaceRoot\(\{forCreate:true\}\)/);
  assert.match(openSource,/chooseWorkspaceRoot\(\)/);
});

test("accepts valid legacy workspaces without a schema version", ()=>{
  const result = validate({projects:[{
    id:"project-1",name:"Launch",groups:[{
      id:"group-1",name:"Tasks",items:[{id:"task-1",title:"Prepare release"}]
    }]
  }]},7);

  assert.deepEqual(JSON.parse(JSON.stringify(result)),{valid:true,errors:[]});
});

test("accepts nullable project descriptions and rejects other types", ()=>{
  const base={projects:[{id:"project-1",name:"Launch",groups:[]}]};
  assert.equal(validate(base,7).valid,true);
  assert.equal(validate({...structuredClone(base),projects:[{...base.projects[0],description:null}]},7).valid,true);
  assert.equal(validate({...structuredClone(base),projects:[{...base.projects[0],description:"Release planning"}]},7).valid,true);

  const result=validate({...structuredClone(base),projects:[{...base.projects[0],description:42}]},7);
  assert.equal(result.valid,false);
  assert.ok(result.errors.some(error=>error==="projects[0].description must be a string or null."));
});

test("validates optional project Overview visibility",()=>{
  const project={id:"project-1",name:"Launch",groups:[]};
  assert.equal(validate({projects:[project]},7).valid,true);
  assert.equal(validate({projects:[{...project,hiddenFromOverview:true}]},7).valid,true);

  const result=validate({projects:[{...project,hiddenFromOverview:"yes"}]},7);
  assert.equal(result.valid,false);
  assert.ok(result.errors.some(error=>error==="projects[0].hiddenFromOverview must be a boolean."));
});

test("validates optional project archive status",()=>{
  const project={id:"project-1",name:"Launch",groups:[]};
  assert.equal(validate({projects:[project]},7).valid,true);
  assert.equal(validate({projects:[{...project,archived:true}]},7).valid,true);

  const result=validate({projects:[{...project,archived:"yes"}]},7);
  assert.equal(result.valid,false);
  assert.ok(result.errors.some(error=>error==="projects[0].archived must be a boolean."));
});

test("validates currency field codes and decimal precision",()=>{
  const project={id:"project-1",name:"Launch",groups:[],fields:[
    {id:"budget",label:"Budget",type:"currency",currency:"AUD",decimalPlaces:2}
  ]};
  assert.equal(validate({projects:[project]},7).valid,true);
  const invalidCurrency=validate({projects:[{
    ...project,fields:[{...project.fields[0],currency:"NOT"}]
  }]},7);
  assert.ok(invalidCurrency.errors.some(error=>error.includes("currency must be a supported currency code")));
  const invalidPrecision=validate({projects:[{
    ...project,fields:[{...project.fields[0],decimalPlaces:7}]
  }]},7);
  assert.ok(invalidPrecision.errors.some(error=>error.includes("decimalPlaces must be an integer")));
});

test("validates project document metadata and markdown content",()=>{
  const project={id:"project-1",name:"Launch",groups:[],documents:[
    {id:"brief",title:"Project brief",content:"# Goals",createdAt:1,updatedAt:2}
  ]};
  assert.equal(validate({projects:[project]},7).valid,true);
  const invalid=validate({projects:[{
    ...project,documents:[{id:"",title:" ",content:42}]
  }]},7);
  assert.ok(invalid.errors.some(error=>error==="projects[0].documents[0] must have an id, title, and string content."));
  const duplicate=validate({projects:[{
    ...project,documents:[project.documents[0],{...project.documents[0]}]
  }]},7);
  assert.ok(duplicate.errors.some(error=>error==="projects[0].documents[1].id must be unique within the project."));
  const invalidActive=validate({projects:[{...project,activeDocumentId:"missing"}]},7);
  assert.ok(invalidActive.errors.some(error=>error==="projects[0].activeDocumentId must reference a project document."));
  const invalidTitle=validate({projects:[{
    ...project,documents:[{...project.documents[0],title:"x".repeat(161)}]
  }]},7);
  assert.ok(invalidTitle.errors.some(error=>error==="projects[0].documents[0].title must be 160 characters or fewer."));
});

test("validates project-owned items and allows projects without groups",()=>{
  const project={id:"project-1",name:"Simple",groups:[],items:[{id:"task-1",title:"Plan"}]};
  assert.equal(validate({projects:[project]},9).valid,true);
  const malformed=validate({projects:[{...project,items:{id:"task-1"}}]},9);
  assert.equal(malformed.valid,false);
  assert.ok(malformed.errors.some(error=>error==="projects[0].items must be an array."));

  const invalidItem=validate({projects:[{...project,items:[{id:"task-1",title:""}]}]},9);
  assert.equal(invalidItem.valid,false);
  assert.ok(invalidItem.errors.some(error=>error==="projects[0].items[0].title must be a non-empty string."));
});

test("validates project milestones and task references", ()=>{
  const project={id:"project-1",name:"Launch",milestones:[{id:"milestone-1",title:"First release",dueDate:"2026-10-01"}],
    groups:[{id:"group-1",name:"Tasks",items:[{id:"task-1",title:"Prepare release",milestoneId:"milestone-1"}]}]};
  assert.equal(validate({projects:[project]},7).valid,true);
  assert.equal(validate({projects:[{...project,milestones:[{...project.milestones[0],dueDate:null}]}]},7).valid,true);

  const invalidDate=validate({projects:[{...project,milestones:[{...project.milestones[0],dueDate:"2026-02-30"}]}]},7);
  assert.ok(invalidDate.errors.some(error=>error.includes("milestones[0].dueDate")));
  const missingMilestone=validate({projects:[{...project,groups:[{...project.groups[0],items:[{...project.groups[0].items[0],milestoneId:"missing"}]}]}]},7);
  assert.ok(missingMilestone.errors.some(error=>error.includes("items[0].milestoneId")));
});

test("validates optional task start dates", ()=>{
  const base={projects:[{id:"project-1",name:"Launch",groups:[{id:"group-1",name:"Tasks",items:[
    {id:"task-1",title:"Prepare release",startDate:"2026-09-25"}
  ]}]}]};
  assert.equal(validate(base,7).valid,true);

  const invalid=structuredClone(base);
  invalid.projects[0].groups[0].items[0].startDate="2026-02-30";
  const result=validate(invalid,7);
  assert.ok(result.errors.some(error=>error==="projects[0].groups[0].items[0].startDate must be a valid date string or null."));
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

test("seeds a full-featured demo workspace with validated examples", async ()=>{
  let nextId=0;
  const workspace=seederSandbox.window.BeforeworkDemoSeeder.create({
    schemaVersion:8,
    uid:()=>`demo-${++nextId}`,
    viewLabel:type=>type,
    tagColors:Array(8).fill("#0969da"),
    todayStr:offsetDays=>{
      const date=new Date("2026-09-29T00:00:00");
      date.setDate(date.getDate()+(offsetDays||0));
      return date.toISOString().slice(0,10);
    }
  });

  assert.equal(validate(workspace,8).valid,true);
  const launch=workspace.projects.find(project=>project.name==="Product launch");
  assert.ok(launch.description);
  const launchStartDate=launch.fields.find(field=>field.type==="start-date");
  const launchDueDate=launch.fields.find(field=>field.type==="due-date");
  const launchReviewDate=launch.fields.find(field=>field.label==="Review date");
  assert.ok(launchStartDate);
  assert.ok(launchDueDate);
  assert.equal(launchReviewDate.type,"date");
  assert.ok(launch.fields.indexOf(launchStartDate)<launch.fields.indexOf(launchDueDate));
  const launchItems=launch.groups.flatMap(group=>group.items);
  assert.ok(launchItems.every(item=>!item.values[launchStartDate.id]||!item.values[launchDueDate.id]
    || item.values[launchStartDate.id]<=item.values[launchDueDate.id]));
  assert.ok(launchItems.some(item=>item.title==="Explore post-launch improvements"
    && item.values[launchStartDate.id]&&!item.values[launchDueDate.id]));
  assert.ok(launchItems.some(item=>item.title==="Confirm the support handoff"
    && !item.values[launchStartDate.id]&&item.values[launchDueDate.id]));
  assert.ok(launchItems.some(item=>item.values[launchReviewDate.id]));
  assert.ok(launchItems.some(item=>item.title==="Collect customer feedback"
    && !item.values[launchStartDate.id]&&!item.values[launchDueDate.id]&&item.values[launchReviewDate.id]));
  assert.equal(launch.milestones.length,3);
  assert.ok(launch.views.some(view=>view.type==="milestones"));
  assert.ok(launch.views.some(view=>view.type==="table"));
  assert.ok(launch.views.some(view=>view.type==="roadmap"));
  assert.ok(launch.views.some(view=>view.type==="documents"));
  assert.equal(launch.documents.length,2);
  assert.equal(launch.activeDocumentId,launch.documents[0].id);
  assert.match(launch.documents[0].content,/^# Product launch/m);
  const relatedItemsField=launch.fields.find(field=>field.type==="relation");
  const locationField=launch.fields.find(field=>field.type==="location");
  const scheduleField=launch.fields.find(field=>field.type==="schedule");
  assert.ok(relatedItemsField);
  assert.ok(locationField);
  assert.ok(scheduleField);
  assert.ok(launchItems.some(item=>item.values[relatedItemsField.id]?.length>0));
  assert.ok(launchItems.some(item=>item.values[locationField.id]==="https://beforework.netlify.app/"));
  const reminderItem=launchItems.find(item=>item.reminderAt);
  assert.ok(reminderItem);
  assert.ok(Number.isFinite(Date.parse(reminderItem.reminderAt)));
  assert.ok(launchItems.find(item=>item.title==="Publish the release overview").activity
    .some(entry=>entry.type==="updated"));
  const betaMilestone=launch.milestones.find(milestone=>milestone.title==="Beta readiness");
  const betaTasks=launch.groups.flatMap(group=>group.items).filter(item=>item.milestoneId===betaMilestone.id);
  assert.equal(betaTasks.length,3);
  assert.equal(betaTasks.filter(item=>item.completedAt).length,1);
  const releaseOverview=launchItems.find(item=>item.title==="Publish the release overview");
  assert.match(releaseOverview.description,/^## What's included/m);
  assert.match(releaseOverview.description,/Beforework is a \*\*private, local-first workspace\*\*/);
  assert.match(releaseOverview.description,/- \[x\] Confirm the release scope/);
  assert.match(releaseOverview.description,/- \[ \] Explore \[Beforework\]\(https:\/\/beforework\.netlify\.app\/\)/);
  assert.ok(releaseOverview.comments.some(comment=>comment.text.includes("**Support**")));
  assert.equal(releaseOverview.subitems.filter(subitem=>subitem.done).length,1);
  assert.equal(releaseOverview.subitems.length,2);
  const onboarding=workspace.projects.find(project=>project.name==="Customer onboarding");
  assert.ok(onboarding.description);
  const checkboxField=onboarding.fields.find(field=>field.type==="checkbox");
  const urlField=onboarding.fields.find(field=>field.type==="url");
  const emailField=onboarding.fields.find(field=>field.type==="email");
  const numberField=onboarding.fields.find(field=>field.type==="number");
  const multiSelectField=onboarding.fields.find(field=>field.type==="multi-select");
  assert.ok(checkboxField);
  assert.ok(urlField);
  assert.ok(emailField);
  assert.ok(numberField);
  assert.ok(multiSelectField);
  assert.ok(onboarding.groups[0].items.some(item=>item.values[checkboxField.id]==="true"));
  assert.ok(onboarding.groups[0].items.some(item=>item.values[checkboxField.id]===""));
  assert.ok(onboarding.groups[0].items.some(item=>item.values[urlField.id].startsWith("https://")));
  assert.ok(onboarding.groups[0].items.some(item=>item.values[emailField.id]==="alex@example.com"));
  assert.ok(onboarding.groups[0].items.some(item=>item.values[numberField.id]===0));
  assert.ok(onboarding.groups[0].items.some(item=>item.values[multiSelectField.id].length>1));

  const personal=workspace.projects.find(project=>project.name==="Personal planning");
  assert.ok(personal.description);
  const targetDate=personal.fields.find(field=>field.label==="Target date");
  const overdueOpenItems=personal.groups.flatMap(group=>group.items).filter(item=>
    item.values[targetDate.id]<"2026-09-29" && !item.completedAt
  );
  assert.ok(overdueOpenItems.length>0);
  const seededItems=workspace.projects.flatMap(project=>project.groups.flatMap(group=>group.items));
  assert.ok(workspace.focusSessions.length>=3);
  assert.ok(workspace.focusSessions.every(session=>session.completedAt&&session.durationSeconds>0));
  assert.ok(workspace.focusSessions.every(session=>workspace.projects.some(project=>project.id===session.projectId)));
  assert.ok(seededItems.every(item=>Array.isArray(item.attachments)));
  const releaseItem=seededItems.find(item=>item.title==="Publish the release overview");
  const [attachment]=releaseItem.attachments;
  assert.equal(attachment.name,"project-notes.txt");
  const written=[];
  await seederSandbox.window.BeforeworkDemoSeeder.writeAttachments(workspace,async(id,file)=>{
    written.push({id,size:file.size,type:file.type,content:await file.text()});
  });
  assert.equal(written.length,1);
  assert.equal(written[0].id,attachment.id);
  assert.equal(written[0].size,attachment.size);
  assert.equal(written[0].type,attachment.type);
  assert.match(written[0].content,/Project planning notes/);
  assert.match(written[0].content,/Spreadsheets, images, reports, and more/);
});

test("renders checkbox custom fields as boolean controls", ()=>{
  const html=createItemFieldRenderer().render(
    {id:"field-checkbox",label:"Approved",type:"checkbox"},
    {values:{}},
    {}
  );
  assert.match(html, /type="checkbox"/i);
  assert.match(html, /data-fieldid="field-checkbox"/i);
  assert.match(html, /sideItemCheckbox/i);
  assert.match(html, /checkboxFieldValue/i);
});

test("renders URL, email, number, and multi-select field controls", ()=>{
  const renderer=createItemFieldRenderer();
  const html=[
    renderer.render({id:"url-field",label:"Reference",type:"url"},{values:{}},{}),
    renderer.render({id:"email-field",label:"Contact",type:"email"},{values:{}},{}),
    renderer.render({id:"number-field",label:"Estimate",type:"number"},{values:{"number-field":0}},{}),
    renderer.render({id:"multi-field",label:"Areas",type:"multi-select",options:[{id:"docs",label:"Docs"},{id:"design",label:"Design"}]},{values:{"multi-field":["design"]}},{}),
    renderer.render({id:"start-field",label:"Start date",type:"start-date"},{values:{}},{}),
    renderer.render({id:"due-field",label:"Due date",type:"due-date"},{values:{}},{}),
    renderer.render({id:"custom-date-field",label:"Review date",type:"date"},{values:{}},{})
  ];

  assert.match(html[0],/type="url"/);
  assert.match(html[1],/type="email"/);
  assert.match(html[2],/type="number"/);
  assert.match(html[2],/value="0"/);
  assert.match(html[3],/value="docs"/);
  assert.match(html[3],/value="design" selected/);
  assert.match(html[3],/select multiple class="form-control fieldInput"/);
  assert.match(html[4],/data-fieldid="start-field"/);
  assert.match(html[4],/type="date"/);
  assert.match(html[5],/data-fieldid="due-field"/);
  assert.match(html[5],/type="date"/);
  assert.match(html[6],/data-fieldid="custom-date-field"/);
  assert.match(html[6],/type="date"/);
});

test("renders currency fields with numeric inputs",()=>{
  const html=createItemFieldRenderer().render(
    {id:"currency-field",label:"Budget",type:"currency",currency:"AUD"},
    {values:{"currency-field":125.5}},
    {}
  );
  assert.match(html,/type="number"/);
  assert.match(html,/value="125.5"/);
});

test("renders safe URL links and searchable multi-select labels", ()=>{
  const appSource=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
  const start=appSource.indexOf("function fieldChipHtml");
  const end=appSource.indexOf("function itemMatchesFilter");
  const snippet=appSource.slice(start,end);
  const context={URL,fieldTypes,escapeHtml:value=>String(value).replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])),duePillHtml:()=>""};
  const result=JSON.parse(vm.runInNewContext(`${snippet}; JSON.stringify({
    safe:fieldCellHtml({type:"url"},"https://example.com/docs"),
    unsafe:fieldCellHtml({type:"url"},"javascript:alert(1)"),
    email:fieldCellHtml({type:"email"},"alex@example.com"),
    invalidEmail:fieldCellHtml({type:"email"},"not-an-email"),
    zero:fieldCellHtml({type:"number"},0),
    currency:fieldCellHtml({type:"currency",currency:"AUD",decimalPlaces:0},1250),
    groupText:fieldCellHtml({type:"select",label:"Group",options:[{id:"new",label:"New",color:"red"}]},"new"),
    statusChip:fieldCellHtml({type:"select",label:"Status",options:[{id:"todo",label:"To do",color:"blue"}]},"todo"),
    choices:fieldCellHtml({type:"multi-select",options:[{id:"docs",label:"Docs"},{id:"design",label:"Design"}]},["docs","design"]),
    numericSort:fieldSortValue({type:"number"},2)<fieldSortValue({type:"number"},10)
  });`,context));

  assert.match(result.safe,/href="https:\/\/example\.com\/docs"/);
  assert.match(result.safe,/rel="noopener noreferrer"/);
  assert.doesNotMatch(result.unsafe,/href=/);
  assert.match(result.email,/href="mailto:alex@example\.com"/);
  assert.doesNotMatch(result.invalidEmail,/href=/);
  assert.equal(result.zero,"0");
  assert.equal(result.currency,new Intl.NumberFormat(undefined,{
    style:"currency",currency:"AUD",minimumFractionDigits:0,maximumFractionDigits:0
  }).format(1250));
  assert.equal(result.groupText,"New");
  assert.doesNotMatch(result.groupText,/<span|dot/);
  assert.match(result.statusChip,/Label Label--secondary/);
  assert.match(result.choices,/Docs/);
  assert.match(result.choices,/Design/);
  assert.equal(result.numericSort,true);
});

test("duplicates projects with remapped milestone links", async()=>{
  const appSource=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
  const start=appSource.indexOf("async function duplicateProject(project)");
  const end=appSource.indexOf("function addGroup",start);
  const snippet=appSource.slice(start,end);
  let nextId=0;
  const context={
    showDialog:async()=> "Launch copy",
    state:{folderLazy:false,projects:[]},
    uid:()=>`copy-${++nextId}`,
    scheduleSave:()=>{},
    renderAll:()=>{},
    registerProjectSummary:()=>{},
    persistActiveLocation:()=>{}
  };
  await vm.runInNewContext(`${snippet}; duplicateProject(project);`,{
    ...context,
    project:{
      id:"project-1",name:"Launch",milestones:[{id:"milestone-1",title:"First release",dueDate:null}],
      fields:[{id:"related",type:"relation",options:[]}],tags:[],groups:[{id:"group-1",items:[
        {id:"task-1",title:"Prepare release",milestoneId:"milestone-1",values:{related:["task-2"]}},
        {id:"task-2",title:"Publish release",values:{related:["task-1"]}}
      ]}],
      views:[{id:"view-1",type:"list",name:"List"}],activeViewId:"view-1"
    }
  });

  const copy=context.state.projects[0];
  assert.notEqual(copy.milestones[0].id,"milestone-1");
  assert.equal(copy.groups[0].items[0].milestoneId,copy.milestones[0].id);
  assert.deepEqual(copy.groups[0].items[0].values[copy.fields[0].id],[copy.groups[0].items[1].id]);
  assert.deepEqual(copy.groups[0].items[1].values[copy.fields[0].id],[copy.groups[0].items[0].id]);
});

test("milestones view renders linked task progress", ()=>{
  const source=fs.readFileSync(path.join(__dirname,"../js/views/milestones-view.js"),"utf8")
    .replace("export class MilestonesView","class MilestonesView");
  const createNode=()=>({
    children:[],dataset:{},style:{},className:"",textContent:"",hidden:false,attributes:{},classes:{},
    classList:{toggle(name,value){this.owner.classes[name]=value;}},
    appendChild(child){this.children.push(child);},
    setAttribute(name,value){this.attributes[name]=value;}
  });
  const createCard=()=>{
    const card=createNode();
    card.classList.owner=card;
    const title=createNode();
    const due=createNode();
    const progress=createNode();
    const percent=createNode();
    const fill=createNode();
    const list=createNode();
    const noTasks=createNode();
    const actions={
      edit:createNode(),delete:createNode(),addTask:createNode()
    };
    card.querySelector=selector=>({
      "[data-milestone-title]":title,
      "[data-milestone-due]":due,
      "[data-milestone-progress]":progress,
      "[data-milestone-percent]":percent,
      "[data-milestone-fill]":fill,
      "[data-milestone-task-list]":list,
      "[data-milestone-no-tasks]":noTasks,
      '[data-action="editMilestone"]':actions.edit,
      '[data-action="deleteMilestone"]':actions.delete,
      '[data-action="addMilestoneTask"]':actions.addTask
    })[selector];
    return {card,title,due,progress,percent,fill,list,noTasks,actions};
  };
  const createTask=()=>{
    const task=createNode();
    const button=createNode();
    button.classList={toggle(name,value){button.classes[name]=value;}};
    task.querySelector=()=>button;
    return {task,button};
  };
  const renderedCard=createCard();
  const renderedTask=createTask();
  const grid=createNode();
  const empty=createNode();
  const createButton=createNode();
  const wrap=createNode();
  wrap.querySelector=selector=>({
    "[data-milestone-grid]":grid,
    "[data-milestone-empty]":empty,
    '[data-action="createMilestone"]':createButton
  })[selector];
  const viewFragment={
    querySelector:selector=>({
      ".milestonesWrap":wrap,
      "#milestoneCardTemplate":{content:{cloneNode:()=>({querySelector:()=>renderedCard.card})}},
      "#milestoneTaskTemplate":{content:{cloneNode:()=>({querySelector:()=>renderedTask.task})}}
    })[selector]
  };
  const board={replaceChildren(fragment){this.fragment=fragment;}};
  const sandbox={globalThis:null};
  sandbox.globalThis=sandbox;
  vm.runInNewContext(`${source}; globalThis.MilestonesView=MilestonesView;`,sandbox);
  const opened=[];
  const projectGroups=project=>project.groups;
  const projectItemEntries=project=>project.groups.flatMap(group=>group.items.map(item=>({group,item})));
  const view=new sandbox.MilestonesView({cloneTemplate:()=>viewFragment,projectGroups,projectItemEntries});
  view.render({
    id:"project-1",
    milestones:[{id:"milestone-1",title:"First release",dueDate:"2026-10-01"}],
    groups:[{id:"group-1",items:[{id:"task-1",title:"Prepare release",milestoneId:"milestone-1",calendarType:"task"}]}]
  },board,{
    isItemCompleted:()=>true,
    fmtDate:()=> "Oct 1",
    todayStr:()=> "2026-09-30",
    createMilestone:()=>{},
    editMilestone:()=>{},
    deleteMilestone:()=>{},
    openNewItem:()=>{},
    openItem:(...args)=>opened.push(args)
  });

  assert.equal(board.fragment,viewFragment);
  assert.equal(renderedCard.title.textContent,"First release");
  assert.equal(renderedCard.progress.textContent,"1 of 1 tasks complete");
  assert.equal(renderedCard.fill.style.width,"100%");
  assert.equal(renderedTask.button.textContent,"Prepare release");
  renderedTask.button.onclick();
  assert.deepEqual(opened,[["project-1","group-1","task-1"]]);
});

test("date picker month arrows navigate in both directions", ()=>{
  const pickerSource=fs.readFileSync(path.join(__dirname,"../js/ui/date-time-picker.js"),"utf8");
  const {document,window,cloneTemplate}=createPickerTestEnvironment();
  const input=createElement();
  input.type="date";
  input.value="2026-09-30";
  const parent=createElement();
  parent.appendChild(input);
  const sandbox={document,window,Event};
  vm.runInNewContext(pickerSource,sandbox);
  const picker=window.BeforeworkDateTimePickers.create({
    dateTime:{getTimeFormat:()=>"12",formatTimeValue:value=>value},
    cloneTemplate,
    documentRef:document,
    windowRef:window
  });
  picker.enhanceDateInput(input);
  const wrapper=input.parentNode;
  const button=wrapper.children.find(child=>child.className==="datePickerButton");
  const popover=document.body.children[0];
  button.onclick({stopPropagation(){}});
  const clickAction=action=>{
    const control=popover.querySelector(`[data-date-action="${action}"]`);
    popover.listeners.click({
    target:{closest:selector=>selector==="[data-date-action]"?control:null},
    preventDefault(){},
    stopPropagation(){}
  });
  };

  assert.match(popover.querySelector("[data-date-month]").textContent,/September 2026/);
  assert.equal(popover.querySelector("[data-date-grid]").children.length,42);
  clickAction("next");
  assert.match(popover.querySelector("[data-date-month]").textContent,/October 2026/);
  clickAction("previous");
  assert.match(popover.querySelector("[data-date-month]").textContent,/September 2026/);
});

test("persists independent List and Table column orders", ()=>{
  const appSource=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
  const start=appSource.indexOf("function orderedTableColumns");
  const end=appSource.indexOf("function columnDragHandleHtml",start);
  const snippet=appSource.slice(start,end);
  const result=JSON.parse(vm.runInNewContext(`${snippet};
    const project={fields:[{id:"a"},{id:"b"}],columnOrders:{}};
    const listIds=["title","group","field:a","field:b","tags","progress","updated"];
    const tableIds=["title","group","field:a","field:b","tags"];
    const before=reorderTableColumn(project,"list",listIds,"field:b","title","before");
    const same=reorderTableColumn(project,"list",listIds,"title","title","after");
    const after=reorderTableColumn(project,"list",listIds,"field:b","updated","after");
    const tableOrder=orderedTableColumns(project,"table",tableIds);
    JSON.stringify({before,same,after,listOrder:project.columnOrders.list,tableOrder,fields:project.fields.map(field=>field.id)});`));

  assert.deepEqual(result,{
    before:true,
    same:false,
    after:true,
    listOrder:["title","group","field:a","tags","progress","updated","field:b"],
    tableOrder:["title","group","field:a","field:b","tags"],
    fields:["a","b"]
  });
});

test("bulk completion updates selected items consistently", ()=>{
  const itemFeatureSource=fs.readFileSync(path.join(__dirname,"../js/features/item.js"),"utf8");
  const runBulkCompletion=(completed)=>{
    const context={window:{}};
    vm.runInNewContext(itemFeatureSource,context);
    const selectedItemIds=new Set(["a","b"]);
    const feature=context.window.BeforeworkItemFeature.create({
      uid:()=> "activity",getProject:()=>null,tagColorOptions:[],selectedItemIds,
      boardFilterTags:new Set(),hasTagsField:()=>false,queueGoogleEventDeletes:()=>{},
      showConfirm:async()=>false,showDialog:async()=>null,scheduleSave:()=>{},render:()=>{},
      renderAll:()=>{},renderProjectList:()=>{}
    });
    const project={groups:[{items:[
      {id:"a",completedAt:completed?null:999,updatedAt:0},
      {id:"b",completedAt:completed?123:123,updatedAt:0},
      {id:"c",completedAt:null,updatedAt:0}
    ]}]};
    feature.bulkSetCompleted(project,completed);
    return JSON.stringify(project.groups[0].items.map(item=>({id:item.id,completedAt:item.completedAt})));
  };
  const result=runBulkCompletion(true);
  const completedRows = JSON.parse(result);
  assert.ok(completedRows.find(item => item.id === "a").completedAt > 0);
  assert.equal(completedRows.find(item => item.id === "b").completedAt, 123);
  assert.equal(completedRows.find(item => item.id === "c").completedAt, null);

  const reopened = runBulkCompletion(false);
  const reopenedRows = JSON.parse(reopened);
  assert.equal(reopenedRows.find(item => item.id === "a").completedAt, null);
  assert.equal(reopenedRows.find(item => item.id === "b").completedAt, null);
  assert.equal(reopenedRows.find(item => item.id === "c").completedAt, null);
});