"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname,"../js/core/workspace-validation.js"),"utf8");
const sandbox = {window:{}};
vm.runInNewContext(source,sandbox,{filename:"workspace-validation.js"});
const validate = sandbox.window.BeforeworkWorkspaceValidation.validate;
const seederSandbox = {window:{},Blob};
const seederSource = fs.readFileSync(path.join(__dirname,"../js/demo/demo-seeder.js"),"utf8");
vm.runInNewContext(seederSource,seederSandbox,{filename:"demo-seeder.js"});

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

test("seeds checkbox, overdue, and downloadable attachment examples", async ()=>{
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
  const betaMilestone=launch.milestones.find(milestone=>milestone.title==="Beta readiness");
  const betaTasks=launch.groups.flatMap(group=>group.items).filter(item=>item.milestoneId===betaMilestone.id);
  assert.equal(betaTasks.length,3);
  assert.equal(betaTasks.filter(item=>item.completedAt).length,1);
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

test("renders URL, email, number, and multi-select field controls", ()=>{
  const appSource=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
  const start=appSource.indexOf("function fieldInputHtml");
  const end=appSource.indexOf("function renderItemModal");
  const snippet=appSource.slice(start,end);
  const context={escapeHtml:value=>String(value).replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))};
  const html=JSON.parse(vm.runInNewContext(`${snippet}; JSON.stringify([
    fieldInputHtml({id:"url-field",label:"Reference",type:"url"},{values:{}}),
    fieldInputHtml({id:"email-field",label:"Contact",type:"email"},{values:{}}),
    fieldInputHtml({id:"number-field",label:"Estimate",type:"number"},{values:{"number-field":0}}),
    fieldInputHtml({id:"multi-field",label:"Areas",type:"multi-select",options:[{id:"docs",label:"Docs"},{id:"design",label:"Design"}]},{values:{"multi-field":["design"]}}),
    fieldInputHtml({id:"start-field",label:"Start date",type:"start-date"},{values:{}}),
    fieldInputHtml({id:"due-field",label:"Due date",type:"due-date"},{values:{}}),
    fieldInputHtml({id:"custom-date-field",label:"Review date",type:"date"},{values:{}})
  ]);`,context));

  assert.match(html[0],/type="url"/);
  assert.match(html[1],/type="email"/);
  assert.match(html[2],/type="number"/);
  assert.match(html[2],/value="0"/);
  assert.match(html[3],/value="docs"/);
  assert.match(html[3],/value="design" checked/);
  assert.match(html[4],/data-fieldid="start-field"/);
  assert.match(html[4],/type="date"/);
  assert.match(html[5],/data-fieldid="due-field"/);
  assert.match(html[5],/type="date"/);
  assert.match(html[6],/data-fieldid="custom-date-field"/);
  assert.match(html[6],/type="date"/);
});

test("renders safe URL links and searchable multi-select labels", ()=>{
  const appSource=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
  const start=appSource.indexOf("function fieldChipHtml");
  const end=appSource.indexOf("function itemMatchesFilter");
  const snippet=appSource.slice(start,end);
  const context={URL,escapeHtml:value=>String(value).replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])),duePillHtml:()=>""};
  const result=JSON.parse(vm.runInNewContext(`${snippet}; JSON.stringify({
    safe:fieldCellHtml({type:"url"},"https://example.com/docs"),
    unsafe:fieldCellHtml({type:"url"},"javascript:alert(1)"),
    email:fieldCellHtml({type:"email"},"alex@example.com"),
    invalidEmail:fieldCellHtml({type:"email"},"not-an-email"),
    zero:fieldCellHtml({type:"number"},0),
    choices:fieldCellHtml({type:"multi-select",options:[{id:"docs",label:"Docs"},{id:"design",label:"Design"}]},["docs","design"]),
    numericSort:fieldSortValue({type:"number"},2)<fieldSortValue({type:"number"},10)
  });`,context));

  assert.match(result.safe,/href="https:\/\/example\.com\/docs"/);
  assert.match(result.safe,/rel="noopener noreferrer"/);
  assert.doesNotMatch(result.unsafe,/href=/);
  assert.match(result.email,/href="mailto:alex@example\.com"/);
  assert.doesNotMatch(result.invalidEmail,/href=/);
  assert.equal(result.zero,"0");
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
      fields:[],tags:[],groups:[{id:"group-1",items:[{id:"task-1",title:"Prepare release",milestoneId:"milestone-1"}]}],
      views:[{id:"view-1",type:"list",name:"List"}],activeViewId:"view-1"
    }
  });

  const copy=context.state.projects[0];
  assert.notEqual(copy.milestones[0].id,"milestone-1");
  assert.equal(copy.groups[0].items[0].milestoneId,copy.milestones[0].id);
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
  const view=new sandbox.MilestonesView({cloneTemplate:()=>viewFragment});
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
  const appSource=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
  const start=appSource.indexOf("function enhanceDateInput(input)");
  const end=appSource.indexOf("function enhanceDateInputs(root=document)",start);
  const snippet=appSource.slice(start,end);
  const makeElement=()=>{
    const listeners={};
    return {
      children:[],dataset:{},style:{},attributes:{},classList:{add(){}},
      setAttribute(name,value){this.attributes[name]=value;},
      getAttribute(name){return this.attributes[name]||null;},
      appendChild(child){this.children.push(child);child.parentNode=this;return child;},
      append(...children){children.forEach(child=>this.appendChild(child));},
      insertBefore(child,reference){
        const index=this.children.indexOf(reference);
        this.children.splice(index<0?this.children.length:index,0,child);
        child.parentNode=this;
        return child;
      },
      addEventListener(type,listener){listeners[type]=listener;},
      getBoundingClientRect(){return {width:160,left:20,right:180,top:20,bottom:54};},
      querySelector(){return null;},
      innerHTML:"",
      listeners
    };
  };
  const document={createElement:makeElement,body:makeElement()};
  const input=makeElement();
  input.type="date";
  input.value="2026-09-30";
  const parent=makeElement();
  parent.appendChild(input);
  const sandbox={document,window:{innerWidth:1200,innerHeight:900},Event};
  vm.runInNewContext(`${snippet}; enhanceDateInput(input);`,{...sandbox,input});
  const wrapper=input.parentNode;
  const button=wrapper.children.find(child=>child.className==="datePickerButton");
  const popover=document.body.children[0];
  button.onclick({stopPropagation(){}});
  const clickAction=action=>popover.listeners.click({
    target:{closest:selector=>selector==="[data-date-action]"?{dataset:{dateAction:action}}:null},
    preventDefault(){},
    stopPropagation(){}
  });

  assert.match(popover.innerHTML,/September 2026/);
  clickAction("next");
  assert.match(popover.innerHTML,/October 2026/);
  clickAction("previous");
  assert.match(popover.innerHTML,/September 2026/);
});

test("filters numeric values and any selected multi-select option", ()=>{
  const appSource=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
  const start=appSource.indexOf("function itemMatchesFilter");
  const end=appSource.indexOf("function rowsForSelection",start);
  const snippet=appSource.slice(start,end);
  const context={showArchived:false,activeProjectId:"project",completionFilter:"open",isItemCompleted:()=>false,
    boardFilterGroups:new Set(),boardFilterTags:new Set(),boardFilterFields:new Map(),boardFilterText:""};
  const result=JSON.parse(vm.runInNewContext(`${snippet};
    const project={id:"project",fields:[{id:"count",type:"number"},{id:"areas",type:"multi-select"},{id:"contact",type:"email"}]};
    const group={id:"group"};
    boardFilterFields.set("count","0");
    const zeroMatches=itemMatchesFilter(project,{values:{count:0,areas:["docs","design"]}},group);
    boardFilterFields.clear();
    boardFilterFields.set("areas",["design"]);
    const selectedMatches=itemMatchesFilter(project,{values:{count:5,areas:["docs","design"]}},group);
    const otherDoesNotMatch=itemMatchesFilter(project,{values:{count:5,areas:["docs"]}},group);
    boardFilterFields.clear();
    boardFilterFields.set("contact","example.com");
    const emailMatches=itemMatchesFilter(project,{values:{contact:"alex@example.com"}},group);
    JSON.stringify({zeroMatches,selectedMatches,otherDoesNotMatch,emailMatches});`,context));

  assert.deepEqual(result,{zeroMatches:true,selectedMatches:true,otherDoesNotMatch:false,emailMatches:true});
});

test("exports filtered view columns in saved order as safe CSV", ()=>{
  const appSource=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
  const start=appSource.indexOf("function csvFieldValue");
  const end=appSource.indexOf("function exportProjectCsv",start);
  const snippet=appSource.slice(start,end);
  const context={
    PRIORITY_OPTIONS:[{id:"high",label:"High"},{id:"medium",label:"Medium"},{id:"low",label:"Low"}],
    csvTestValue:"Comma, quote \" and newline\nnext",
    orderedTableColumns:(project,viewType,columnIds)=>{
      const saved=project.columnOrders?.[viewType]||[];
      return [...saved.filter(id=>columnIds.includes(id)),...columnIds.filter(id=>!saved.includes(id))];
    },
    formatUpdatedAt:()=>"Today at 9:00 AM"
  };
  const result=vm.runInNewContext(`${snippet};
    const project={
      groups:[{id:"g1"},{id:"g2"}],
      fields:[
        {id:"status",label:"Status",type:"select",options:[{id:"blocked",label:"Blocked"}]},
        {id:"areas",label:"Areas",type:"multi-select",options:[{id:"docs",label:"Docs"},{id:"design",label:"Design"}]},
        {id:"cost",label:"Cost",type:"number"}
      ],
      tags:[{id:"tag1",name:"release"}],
      columnOrders:{table:["tags","title","group","field:status","field:areas","field:cost"]}
    };
    const rows=[{item:{title:"=1+1",values:{status:"blocked",areas:["docs","design"],cost:-12},tagIds:["tag1"],updatedAt:1,subitems:[]},group:{name:"Planning"}}];
    JSON.stringify({
      table:buildProjectCsv(project,"table",false,rows),
      list:buildProjectCsv(project,"list",true,rows),
      escaped:serializeCsvRows([["Header"],[csvTestValue],["=SUM(A1)"]])
    });`,context);
  const resultObject=JSON.parse(result);

  assert.match(resultObject.table,/^"Tags","Title","Group","Status","Areas","Cost"/);
  assert.match(resultObject.table,/"release","'=1\+1","Planning","Blocked","Docs; Design","-12"/);
  assert.match(resultObject.list,/"Progress","Updated"/);
  assert.ok(resultObject.escaped.includes("\"Comma, quote \"\" and newline\nnext\""));
  assert.match(resultObject.escaped,/"'=SUM\(A1\)"/);
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