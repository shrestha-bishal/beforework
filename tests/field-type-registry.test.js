"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const {createFieldTypes}=require("./helpers/field-types");

const fieldTypes=createFieldTypes();
const root=path.join(__dirname,"..");
const index=fs.readFileSync(path.join(root,"index.html"),"utf8");
const app=fs.readFileSync(path.join(root,"js/app.js"),"utf8");

test("every field type is registered once with its own catalog metadata",()=>{
  const definitions=fieldTypes.list();
  const values=definitions.map(definition=>definition.value);

  assert.equal(new Set(values).size,values.length);
  assert.ok(values.includes("tags"));
  assert.ok(values.includes("priority"));
  assert.ok(definitions.every(definition=>definition.label&&definition.description));
  assert.deepEqual(
    [...fieldTypes.get("tags").colorOptions].map(option=>option.label),
    ["Blue","Purple","Pink","Green","Red","Amber","Forest","Grey","Teal","Orange","Coral"]
  );
  assert.deepEqual(
    [...fieldTypes.get("tags").colorOptions].map(option=>option.value),
    ["#0969da","#8250df","#bf3989","#1a7f37","#cf222e","#9a6700","#116329","#6e7781","#0f766e","#bc4c00","#cf4a2c"]
  );
  assert.deepEqual(
    [...fieldTypes.get("priority").options].map(option=>option.id),
    ["high","medium","low"]
  );
  assert.equal(fieldTypes.get("tags").colors.length,fieldTypes.get("tags").colorOptions.length);
  const registryPosition=index.indexOf('src="js/core/fields/registry.js"');
  const appPosition=index.indexOf('src="js/app.js"');
  for (const definition of definitions){
    const typePosition=index.indexOf(`src="js/core/fields/types/${definition.value}.js"`);
    assert.ok(typePosition>registryPosition&&typePosition<appPosition,
      `field type ${definition.value} must load after the registry and before app.js`);
  }
  assert.doesNotMatch(app,/const FIELD_TYPE_OPTIONS\s*=\s*\[/);
  assert.throws(()=>fieldTypes.register({value:"text",label:"Duplicate"}),/already registered/);
  assert.throws(()=>fieldTypes.register({
    value:"incomplete",label:"Incomplete",choiceEditor:{getChoices:()=>[]}
  }),/incomplete choice editor/);
});

test("field definitions declare project-level instance limits",()=>{
  const singleInstanceTypes=["priority","group","tags","location","schedule","start-date","due-date"];
  const allTypes=fieldTypes.list().map(definition=>definition.value);

  for (const type of singleInstanceTypes){
    assert.equal(fieldTypes.get(type).maxPerProject,1,type);
    assert.equal(fieldTypes.canAddToProject(type,[]),true,type);
    assert.equal(fieldTypes.canAddToProject(type,[{type}]),false,type);
  }
  for (const type of allTypes.filter(value=>!singleInstanceTypes.includes(value))){
    assert.equal(fieldTypes.get(type).maxPerProject,undefined,type);
    assert.equal(fieldTypes.canAddToProject(type,[{type},{type}]),true,type);
  }
  assert.equal(fieldTypes.canAddToProject("group",[{type:"select",label:"Group"}]),false);
  assert.equal(fieldTypes.canAddToProject("group",[{type:"select",label:"Status"}]),true);
  assert.equal(fieldTypes.canAddToProject("group",[{type:"select",offeringType:"group",label:"Board lane"}]),false);
});

test("field definitions control whether their names can be customized",()=>{
  const fixedNameTypes=["group","start-date","due-date","priority","tags","location","schedule"];

  for (const type of fixedNameTypes){
    assert.equal(fieldTypes.get(type).allowRename,false,type);
    assert.equal(fieldTypes.canRename({type}),false,type);
  }
  assert.equal(fieldTypes.canRename({type:"select",offeringType:"group"}),false);
  assert.equal(fieldTypes.canRename({type:"select",label:"Group"}),false);
  assert.equal(fieldTypes.canRename({type:"select",label:"Status"}),true);
  assert.equal(fieldTypes.canRename({type:"text",label:"Description"}),true);
});

test("field definitions control whether their settings can be edited",()=>{
  for (const type of ["start-date","due-date","location","schedule"]){
    assert.equal(fieldTypes.get(type).isEditable,false,type);
    assert.equal(fieldTypes.isEditable({type}),false,type);
  }
  assert.equal(fieldTypes.isEditable({type:"date"}),true);
  assert.equal(fieldTypes.isEditable({type:"select",offeringType:"start-date"}),false);
});

test("field types own their filter matching and column values",()=>{
  const number={id:"estimate",type:"number"};
  const currency={id:"budget",type:"currency",currency:"USD"};
  const multiSelect={id:"areas",type:"multi-select"};
  const checkbox={id:"done",type:"checkbox"};
  const date={id:"due",type:"due-date"};
  const text={id:"notes",type:"text"};
  const tags={id:"tags",type:"tags"};

  assert.equal(fieldTypes.matchesFilter(number,{value:0,mode:"0"}),true);
  assert.equal(fieldTypes.matchesFilter(number,{value:0,mode:"2"}),false);
  assert.equal(fieldTypes.matchesFilter(currency,{value:0,mode:"0"}),true);
  assert.equal(fieldTypes.matchesFilter(multiSelect,{value:["docs","design"],mode:["design"]}),true);
  assert.equal(fieldTypes.matchesFilter(checkbox,{value:"true",mode:["true"]}),true);
  assert.equal(fieldTypes.matchesFilter(date,{value:"2026-10-10",mode:"2026-10-10"}),true);
  assert.equal(fieldTypes.matchesFilter(text,{value:"Review project",mode:"project"}),true);
  assert.equal(fieldTypes.matchesFilter(text,{value:"Review project",mode:["Review project"]}),true);
  assert.equal(fieldTypes.matchesFilter(text,{value:"Review project",mode:["Review"]}),false);
  assert.equal(fieldTypes.matchesFilter(date,{
    value:"2026-10-10",mode:["2026-10-10"],dateKey:value=>value
  }),true);
  assert.deepEqual(
    [...fieldTypes.getFilterValues(tags,{item:{tagIds:["release"]},noneValue:"__none__"})],
    ["release"]
  );
  assert.deepEqual(
    [...fieldTypes.getFilterOptions({type:"priority"},{})].map(option=>option.value),
    ["high","medium","low"]
  );
  assert.equal(fieldTypes.matchesFilter(tags,{
    item:{tagIds:["release","urgent"]},mode:["release"]
  }),true);
});

test("field types own input normalization, sorting, and CSV formatting",()=>{
  const number={id:"estimate",type:"number"};
  const currency={id:"budget",type:"currency",currency:"USD",decimalPlaces:0};
  const multiSelect={id:"areas",type:"multi-select",options:[{id:"docs",label:"Docs"}]};
  const checkbox={id:"done",type:"checkbox"};
  const select={id:"status",type:"select",options:[{id:"ready",label:"Ready"}]};

  assert.equal(fieldTypes.normalizeInput(number,{input:{value:"2.5"}}),2.5);
  assert.equal(fieldTypes.normalizeInput(currency,{input:{value:"1250"}}),1250);
  assert.deepEqual(
    [...fieldTypes.normalizeInput(multiSelect,{selectedOptions:[{value:"docs"}]})],
    ["docs"]
  );
  assert.equal(fieldTypes.normalizeInput(checkbox,{input:{checked:true}}),"true");
  assert.equal(fieldTypes.sortValue(number,{value:2})<fieldTypes.sortValue(number,{value:10}),true);
  assert.equal(fieldTypes.sortValue(currency,{value:2})<fieldTypes.sortValue(currency,{value:10}),true);
  assert.equal(
    fieldTypes.formatValue(currency,{field:currency,value:1250}),
    new Intl.NumberFormat(undefined,{style:"currency",currency:"USD",minimumFractionDigits:0,maximumFractionDigits:0}).format(1250)
  );
  assert.equal(fieldTypes.formatValue(select,{field:select,value:"ready"}),"Ready");
  assert.equal(fieldTypes.formatValue(checkbox,{value:"true"}),"Yes");
});

test("field modules own their optional settings and apply settings generically",()=>{
  const currency={id:"budget",label:"Budget",type:"currency"};
  const settings=fieldTypes.getSettings(currency,{mode:"create"});

  assert.equal(settings[0].label,"Currency");
  assert.ok(settings[0].options.some(option=>option.value==="USD"));
  assert.equal(settings[1].label,"Decimal places");
  fieldTypes.applySettings(currency,{mode:"create"},["JPY","0"]);
  assert.equal(currency.currency,"JPY");
  assert.equal(currency.decimalPlaces,0);
  assert.throws(
    ()=>fieldTypes.applySettings(currency,{mode:"edit"},["NOT",""]),
    /supported currency/
  );
  assert.deepEqual([...fieldTypes.getSettings({type:"number"})],[]);
  assert.equal(fieldTypes.applySettings({type:"number"},{mode:"edit"},[]),undefined);
});

test("field modules own display labels, input types, summary metadata, and validation",()=>{
  const currency={id:"budget",label:"Budget",type:"currency",currency:"JPY",decimalPlaces:0};
  assert.equal(fieldTypes.getDisplayLabel(currency),"Budget (JPY)");
  assert.equal(fieldTypes.getInputType(currency),"number");
  assert.deepEqual(
    JSON.parse(JSON.stringify(fieldTypes.getSummaryMetadata(currency))),
    {currency:"JPY",decimalPlaces:0}
  );
  assert.deepEqual([...fieldTypes.validateField(currency,{path:"fields[0]"})],[]);
  assert.ok(fieldTypes.validateField(
    {...currency,currency:"NOT",decimalPlaces:7},
    {path:"fields[0]"}
  ).length>0);
  assert.equal(fieldTypes.getDisplayLabel({label:"Estimate",type:"number"}),"Estimate");
  assert.equal(fieldTypes.getInputType({type:"number"}),"number");
  assert.deepEqual(JSON.parse(JSON.stringify(fieldTypes.getSummaryMetadata({type:"number"}))),{});
});

test("choice editors are declared by option-owning field types only",()=>{
  const tags={id:"tags-field",type:"tags"};
  const priority={id:"priority",type:"priority",options:[]};
  const select={id:"status",type:"select",options:[
    {id:"ready",label:"Ready"},
    {id:"hidden",label:"Hidden",hiddenInField:true}
  ]};
  const project={tags:[
    {id:"release",name:"Release"},
    {id:"hidden-tag",name:"Hidden tag",hiddenInField:true}
  ]};

  assert.deepEqual(
    JSON.parse(JSON.stringify(fieldTypes.getEditableChoices(tags,{project}))),
    [
      {id:"release",label:"Release",hiddenInField:false},
      {id:"hidden-tag",label:"Hidden tag",hiddenInField:true}
    ]
  );
  assert.equal(fieldTypes.getEditableChoices({id:"notes",type:"text"},{project}),null);
  assert.deepEqual(
    JSON.parse(JSON.stringify(fieldTypes.getChoiceEditorCopy(tags,{project}))),
    {
      itemLabel:"tag",
      heading:"Tags",
      description:"Hidden tags stay assigned to existing items but aren't offered for new assignments.",
      addLabel:"Add tag",
      inputPlaceholder:"Tag name"
    }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(fieldTypes.getChoiceEditorCopy(select,{project}))),
    {
      itemLabel:"option",
      heading:"Options",
      description:"Hidden options stay assigned to existing items but aren't offered for new selections.",
      addLabel:"Add option",
      inputPlaceholder:"Option name"
    }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(fieldTypes.getInputChoices(select,{project,selected:[]}))),
    [{id:"ready",label:"Ready"}]
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(fieldTypes.getInputChoices(priority,{project,selected:[]}))),
    [
      {id:"high",label:"High",color:"var(--color-danger-fg)",rank:3},
      {id:"medium",label:"Medium",color:"var(--color-attention-fg)",rank:2},
      {id:"low",label:"Low",color:"var(--color-fg-muted)",rank:1}
    ]
  );
  assert.equal(fieldTypes.getInputChoices(priority,{project,selected:["high"]})[0].id,"high");
  assert.equal(fieldTypes.getEditableChoices(priority,{project}).length,3);
  assert.deepEqual(
    JSON.parse(JSON.stringify(fieldTypes.getFilterOptions(select,{field:select}))),
    [{value:"ready",label:"Ready"},{value:"hidden",label:"Hidden"}]
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(fieldTypes.getInputChoices(select,{project,selected:["hidden"]}))),
    [
      {id:"ready",label:"Ready"},
      {id:"hidden",label:"Hidden",hiddenInField:true}
    ]
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(fieldTypes.getChoiceDeleteConfirmation(select,{choices:[{label:"Ready"}]}))),
    {
      title:"Delete option: Ready",
      message:"This removes this option from the field and clears it from item values."
    }
  );
});

test("priority levels default to High/Medium/Low and then use project-customized choices",()=>{
  const priority={id:"priority",type:"priority",options:[]};
  const item={values:{priority:"medium"}};
  const project={fields:[priority],groups:[{items:[item]}]};
  const filters=new Map([["priority",["high","medium"]]]);
  const columns=new Map([["priority",new Set(["high","medium"])]]);
  let nextId=0;
  const context={
    project,
    uid:()=>`custom-${++nextId}`,
    index:0,
    projectItemEntries:value=>value.groups.flatMap(group=>group.items.map(entry=>({group,item:entry}))),
    getBoardFilterFields:()=>filters,
    getBoardFilterColumns:()=>columns,
    getBoardFilterTags:()=>new Set()
  };
  const originalDefaults=fieldTypes.get("priority").options;
  const custom=fieldTypes.createChoice(priority,context,"Trivial");

  assert.deepEqual(JSON.parse(JSON.stringify(custom.choice)),{
    id:"custom-1",label:"Trivial",color:"var(--color-accent-fg)",rank:0
  });
  fieldTypes.applyChoiceEdits(priority,context,[
    {id:"high",label:"Urgent",hiddenInField:true},
    {id:"medium",label:"Medium",deleted:true},
    {id:"low",label:"Low"},
    custom
  ]);

  assert.equal(priority.priorityOptionsCustomized,true);
  assert.deepEqual(JSON.parse(JSON.stringify(priority.options.map(option=>option.id))),["high","low","custom-1"]);
  assert.equal(priority.options[0].label,"Urgent");
  assert.equal(priority.options[0].hiddenInField,true);
  assert.equal(item.values.priority,undefined);
  assert.deepEqual(JSON.parse(JSON.stringify([...filters])),[["priority",["high"]]]);
  assert.deepEqual(JSON.parse(JSON.stringify([...columns].map(([id,values])=>[id,[...values]]))),[["priority",["high"]]]);
  assert.deepEqual(
    JSON.parse(JSON.stringify(fieldTypes.getInputChoices(priority,{project,selected:[]}))),
    [
      {id:"low",label:"Low",color:"var(--color-fg-muted)",rank:2},
      {id:"custom-1",label:"Trivial",color:"var(--color-accent-fg)",rank:1}
    ]
  );
  assert.equal(fieldTypes.formatValue(priority,{value:"high"}),"Urgent");
  assert.equal(fieldTypes.sortValue(priority,{value:"custom-1"})<fieldTypes.sortValue(priority,{value:"low"}),true);
  assert.deepEqual(
    JSON.parse(JSON.stringify([...fieldTypes.getFilterOptions(priority,{field:priority})].map(option=>option.value))),
    ["high","low","custom-1"]
  );
  assert.deepEqual([...originalDefaults].map(option=>option.id),["high","medium","low"]);

  fieldTypes.applyChoiceEdits(priority,context,priority.options.map(option=>({
    id:option.id,label:option.label,deleted:true
  })));
  assert.deepEqual(JSON.parse(JSON.stringify(priority.options)),[]);
  assert.deepEqual(JSON.parse(JSON.stringify(fieldTypes.getFieldChoices(priority,{project}))),[]);
});

test("tag and select modules apply their own visibility and deletion semantics",()=>{
  const tagsField={id:"tags-field",type:"tags"};
  const statusField={id:"status",type:"select",options:[
    {id:"ready",label:"Ready"},
    {id:"blocked",label:"Blocked"}
  ]};
  const areasField={id:"areas",type:"multi-select",options:[
    {id:"docs",label:"Docs"},
    {id:"design",label:"Design"}
  ]};
  const tagItem={tagIds:["release","urgent"],values:{}};
  const statusItem={tagIds:[],values:{status:"blocked"}};
  const areasItem={tagIds:[],values:{areas:["docs","design"]}};
  const project={
    tags:[{id:"release",name:"Release"},{id:"urgent",name:"Urgent"}],
    fields:[tagsField,statusField,areasField],
    groups:[{items:[tagItem,statusItem,areasItem]}]
  };
  const boardFilterTags=new Set(["release","urgent"]);
  const boardFilterFields=new Map([
    ["status",["ready","blocked"]],
    ["areas",["docs","design"]]
  ]);
  const boardFilterColumns=new Map([
    ["tags",new Set(["release","urgent"])],
    ["status",new Set(["ready","blocked"])],
    ["areas",new Set(["docs","design"])]
  ]);
  const context={
    project,
    projectItemEntries:value=>value.groups.flatMap(group=>group.items.map(item=>({group,item}))),
    getBoardFilterTags:()=>boardFilterTags,
    getBoardFilterFields:()=>boardFilterFields,
    getBoardFilterColumns:()=>boardFilterColumns
  };

  fieldTypes.applyChoiceEdits(tagsField,context,[
    {id:"release",label:"Release",hiddenInField:true},
    {id:"urgent",label:"Urgent",deleted:true}
  ]);
  fieldTypes.applyChoiceEdits(statusField,context,[
    {id:"ready",label:"Ready",hiddenInField:true},
    {id:"blocked",label:"Blocked",deleted:true}
  ]);
  fieldTypes.applyChoiceEdits(areasField,context,[
    {id:"docs",label:"Docs",hiddenInField:true},
    {id:"design",label:"Design",deleted:true}
  ]);

  assert.deepEqual(project.tags,[{id:"release",name:"Release",hiddenInField:true}]);
  assert.deepEqual(tagItem.tagIds,["release"]);
  assert.deepEqual([...boardFilterTags],["release"]);
  assert.deepEqual(statusField.options,[{id:"ready",label:"Ready",hiddenInField:true}]);
  assert.deepEqual(statusItem.values,{});
  assert.deepEqual(areasField.options,[{id:"docs",label:"Docs",hiddenInField:true}]);
  assert.deepEqual(areasItem.values,{areas:["docs"]});
  assert.deepEqual([...boardFilterFields],[
    ["status",["ready"]],
    ["areas",["docs"]]
  ]);
  assert.deepEqual([...boardFilterColumns].map(([id,values])=>[id,[...values]]),[
    ["tags",["release"]],
    ["status",["ready"]],
    ["areas",["docs"]]
  ]);
});

test("choice editor order is persisted for tags, select fields, and priorities",()=>{
  const tagsField={id:"tags",type:"tags"};
  const selectField={id:"status",type:"select",options:[
    {id:"first",label:"First"},{id:"second",label:"Second"}
  ]};
  const multiField={id:"areas",type:"multi-select",options:[
    {id:"first-area",label:"First area"},{id:"second-area",label:"Second area"}
  ]};
  const priorityField={id:"priority",type:"priority",options:[]};
  const project={
    tags:[{id:"first-tag",name:"First tag"},{id:"second-tag",name:"Second tag"}],
    fields:[tagsField,selectField,multiField,priorityField],
    groups:[]
  };
  const context={
    project,
    projectItemEntries:()=>[],
    getBoardFilterTags:()=>new Set(),
    getBoardFilterFields:()=>new Map(),
    getBoardFilterColumns:()=>new Map()
  };

  fieldTypes.applyChoiceEdits(tagsField,context,[
    {id:"second-tag",label:"Second tag"},
    {id:"first-tag",label:"First tag"}
  ]);
  fieldTypes.applyChoiceEdits(selectField,context,[
    {id:"second",label:"Second"},
    {id:"first",label:"First"}
  ]);
  fieldTypes.applyChoiceEdits(multiField,context,[
    {id:"second-area",label:"Second area"},
    {id:"first-area",label:"First area"}
  ]);
  fieldTypes.applyChoiceEdits(priorityField,context,[
    {id:"low",label:"Low"},
    {id:"medium",label:"Medium"},
    {id:"high",label:"High"}
  ]);

  assert.deepEqual(project.tags.map(tag=>tag.id),["second-tag","first-tag"]);
  assert.deepEqual(selectField.options.map(option=>option.id),["second","first"]);
  assert.deepEqual(multiField.options.map(option=>option.id),["second-area","first-area"]);
  assert.deepEqual(priorityField.options.map(option=>option.id),["low","medium","high"]);
  assert.deepEqual(priorityField.options.map(option=>option.rank),[3,2,1]);
  assert.ok(fieldTypes.sortValue(priorityField,{value:"low"})>fieldTypes.sortValue(priorityField,{value:"high"}));
});

test("choice creation delegates IDs and type-specific defaults to each field module",()=>{
  const tagsField={id:"tags-field",type:"tags"};
  const statusField={id:"status",type:"select",options:[{id:"ready",label:"Ready"}]};
  const areasField={id:"areas",type:"multi-select",options:[{id:"docs",label:"Docs"}]};
  const project={tags:[],fields:[tagsField,statusField,areasField],groups:[]};
  const context={
    project,
    uid:(()=>{ let id=0; return ()=>`new-${++id}`; })(),
    index:0,
    projectItemEntries:()=>[],
    getBoardFilterTags:()=>new Set(),
    getBoardFilterFields:()=>new Map(),
    getBoardFilterColumns:()=>new Map()
  };
  const newTag=fieldTypes.createChoice(tagsField,context,"Urgent");
  const newStatus=fieldTypes.createChoice(statusField,context,"In progress");
  const newArea=fieldTypes.createChoice(areasField,context,"Design");

  assert.deepEqual(JSON.parse(JSON.stringify(newTag.choice)),{
    id:"new-1",name:"Urgent",color:"#0969da"
  });
  assert.deepEqual(JSON.parse(JSON.stringify(newStatus.choice)),{
    id:"new-2",label:"In progress",color:"var(--color-severe-fg)"
  });
  assert.deepEqual(JSON.parse(JSON.stringify(newArea.choice)),{
    id:"new-3",label:"Design",color:"var(--color-severe-fg)"
  });
  fieldTypes.applyChoiceEdits(tagsField,context,[newTag]);
  fieldTypes.applyChoiceEdits(statusField,context,[
    {id:"ready",label:"Ready"},
    newStatus
  ]);
  fieldTypes.applyChoiceEdits(areasField,context,[
    {id:"docs",label:"Docs"},
    newArea
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(project.tags)),[
    {id:"new-1",name:"Urgent",color:"#0969da"}
  ]);
  assert.equal(statusField.options[1].label,"In progress");
  assert.equal(areasField.options[1].label,"Design");
});
