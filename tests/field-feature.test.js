"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");
const appScripts=require("./helpers/app-script-order");
const {createFieldTypes}=require("./helpers/field-types");

const source=fs.readFileSync(path.join(__dirname,"../js/features/fields.js"),"utf8");
const definitions=[
  {value:"group",label:"Group",description:"Group items",storageType:"select",allowRename:false,maxPerProject:1},
  {value:"select",label:"Select",description:"Choose one option",colors:["red","blue"]},
  {value:"multi-select",label:"Multi-select",description:"Choose multiple options",colors:["red","blue"]},
  {value:"date",label:"Date",description:"A date"},
  {value:"currency",label:"Currency",description:"Store and display a monetary amount."},
  {value:"priority",label:"Priority",description:"Best for urgency or ranking",allowRename:false,maxPerProject:1},
  {value:"tags",label:"Tags",description:"Tags",allowRename:false,maxPerProject:1},
  {value:"location",label:"Location",description:"Location",allowRename:false},
  {value:"schedule",label:"Schedule",description:"Schedule",allowRename:false}
];
const defaultPriorityOptions=[
  {id:"high",label:"High",color:"red",rank:3},
  {id:"medium",label:"Medium",color:"blue",rank:2},
  {id:"low",label:"Low",color:"red",rank:1}
];

function createFeature(overrides={}){
  const window={};
  vm.runInNewContext(source,{window},{filename:"fields.js"});
  const calls={dialogs:[],notices:[],confirms:[],saved:0,rendered:0,refreshedItemModal:0,queuedEvents:[],closedMenus:0};
  const dialogResults=[];
  let nextId=0;
  const boardFilterFields=new Map();
  const boardFilterColumns=new Map();
  const boardFilterTags=new Set();
  let listSort={field:"updated",dir:"desc"};
  const feature=window.BeforeworkFieldFeature.create({
    uid:()=>`generated-${++nextId}`,
    fieldTypes:{
      list:()=>definitions,
      get:type=>definitions.find(definition=>definition.value===type)||null,
      getDisplayLabel:field=>field.label,
      canRename:field=>{
        const type=field.offeringType||field.type;
        const definition=type==="select"&&field.label==="Group"
          ?definitions.find(candidate=>candidate.value==="group")
          :definitions.find(candidate=>candidate.value===type);
        return definition?.allowRename!==false;
      },
      getSettings:(field)=>{
        if (field.type!=="currency") return [];
        return [
          {label:"Currency",type:"select",options:[{value:"USD"},{value:"JPY"},{value:"EUR"}],value:field.currency||"USD"},
          {label:"Decimal places",type:"select",options:[{value:""},{value:"0"},{value:"2"}],value:field.decimalPlaces==null?"":String(field.decimalPlaces)}
        ];
      },
      applySettings:(field,{mode},values)=>{
        if (field.type!=="currency") return;
        field.currency=values[0];
        if (values[1]==="") delete field.decimalPlaces;
        else field.decimalPlaces=Number(values[1]);
      },
      getEditableChoices:(field,{project})=>{
        const choices=field.type==="tags"?project.tags||[]:
          field.type==="priority"&&!field.options?.length?defaultPriorityOptions:field.options||[];
        return ["tags","select","multi-select","priority"].includes(field.type)
          ?choices.map(choice=>({
            id:choice.id,label:field.type==="tags"?choice.name:choice.label,
            hiddenInField:choice.hiddenInField===true
          }))
          :null;
      },
      createChoice:(field,{uid},label)=>{
        const id=uid();
        const choice=field.type==="tags"
          ?{id,name:label.trim(),color:"red"}
          :{id,label:label.trim(),color:"red"};
        return {id,label:field.type==="tags"?choice.name:choice.label,hiddenInField:false,added:true,choice};
      },
      getChoiceEditorCopy:field=>field.type==="tags"
        ?{
          itemLabel:"tag",
          heading:"Tags",
          description:"Hidden tags remain on items that already use them, but won't be available for new assignments.",
          addLabel:"Add tag",
          inputPlaceholder:"Tag name"
        }
        :field.type==="priority"
        ?{
          itemLabel:"priority level",
          heading:"Priority levels",
          description:"Hidden levels remain on items that already use them, but won't be available for new selections.",
          addLabel:"Add priority",
          inputPlaceholder:"Priority name"
        }
        :{
          itemLabel:"option",
          heading:"Options",
          description:"Hidden options remain on items that already use them, but won't be available for new selections.",
          addLabel:"Add option",
          inputPlaceholder:"Option name"
        },
      getChoiceDeleteConfirmation:(field,{choices})=>({
        title:`Delete ${field.type==="tags"?"tag":field.type==="priority"?"priority level":"option"}: ${choices.map(choice=>choice.label).join(", ")}`,
        message:field.type==="tags"
          ?"This deletes this tag and removes it from all item assignments."
          :field.type==="priority"
          ?"This removes this priority level and clears it from item values."
          :"This removes this option from the field and clears it from item values."
      }),
      applyChoiceEdits:(field,context,changes)=>{
        if (field.type==="priority"&&!field.options.length){
          field.options=defaultPriorityOptions.map(option=>({...option}));
        }
        const choices=field.type==="tags"?context.project.tags:field.options;
        changes.forEach(change=>{
          if (change.added){
            if (change.deleted) return;
            if (field.type==="tags") context.project.tags.push(change.choice);
            else field.options.push(change.choice);
            return;
          }
          const choice=choices.find(candidate=>candidate.id===change.id);
          if (!choice) return;
          if (change.deleted){
            if (field.type==="tags"){
              context.project.tags=context.project.tags.filter(candidate=>candidate.id!==choice.id);
              context.projectItemEntries(context.project).forEach(({item})=>{
                item.tagIds=item.tagIds.filter(id=>id!==choice.id);
              });
              context.getBoardFilterTags().delete(choice.id);
            } else {
              field.options=field.options.filter(candidate=>candidate.id!==choice.id);
              context.projectItemEntries(context.project).forEach(({item})=>{
                const value=item.values[field.id];
                if (field.type==="multi-select"&&Array.isArray(value)){
                  item.values[field.id]=value.filter(id=>id!==choice.id);
                } else if (value===choice.id) delete item.values[field.id];
              });
            }
          } else {
            if (field.type==="tags") choice.name=change.label.trim();
            else choice.label=change.label.trim();
            if (change.hiddenInField) choice.hiddenInField=true;
            else delete choice.hiddenInField;
          }
        });
        if (field.type==="tags"){
          changes.filter(change=>change.hiddenInField||change.deleted)
            .forEach(change=>context.getBoardFilterTags().delete(change.id));
        }
      },
      canAddToProject:(type,fields)=>{
        const definition=definitions.find(candidate=>candidate.value===type);
        return !!definition&&(definition.maxPerProject==null||fields.filter(field=>field.type===type).length<definition.maxPerProject);
      }
    },
    projectItemEntries:project=>(project.groups||[]).flatMap(group=>(group.items||[]).map(item=>({group,item}))),
    queueGoogleEventDeletes:item=>calls.queuedEvents.push(item.id),
    getBoardFilterFields:()=>boardFilterFields,
    getBoardFilterColumns:()=>boardFilterColumns,
    getBoardFilterTags:()=>boardFilterTags,
    getListSort:()=>listSort,
    setListSort:value=>{listSort=value;},
    showDialog:async options=>{
      calls.dialogs.push(options);
      const result=dialogResults.shift()??null;
      return typeof result==="function"?result(options):result;
    },
    showNotice:async(...args)=>calls.notices.push(args),
    showConfirm:async(...args)=>{calls.confirms.push(args);return true;},
    scheduleSave:()=>calls.saved++,
    renderAll:()=>calls.rendered++,
    refreshOpenItemModal:()=>calls.refreshedItemModal++,
    closeAllActionMenus:()=>calls.closedMenus++,
    ...overrides
  });
  return {
    feature,calls,boardFilterFields,boardFilterColumns,boardFilterTags,
    setDialogResults(...results){dialogResults.push(...results);},
    getListSort:()=>listSort
  };
}

test("field feature loads before the app entry point",()=>{
  assert.ok(appScripts.indexOf("features/fields.js")<appScripts.indexOf("app.js"));
});

test("adding a field creates its configured options and saves the project",async()=>{
  const project={fields:[]};
  const {feature,calls,setDialogResults}=createFeature();
  setDialogResults(["select","Status"],options=>({
    values:[],
    choices:[
      options.choiceList.createChoice("Backlog"),
      options.choiceList.createChoice("In progress")
    ]
  }));

  await feature.addFieldFlow(project);

  assert.equal(calls.dialogs[0].title,"Add field");
  assert.equal(calls.dialogs[0].fields[0].searchable,true);
  assert.equal(calls.dialogs[0].fields[0].options[0].description,definitions[0].description);
  assert.equal(calls.dialogs[0].fields[0].options.length,definitions.length);
  assert.equal(calls.dialogs[0].fields.length,2);
  assert.equal(calls.dialogs[0].fields[1].label,"Field name");
  assert.equal(calls.dialogs[0].fields[1].visibleWhen(["select"]),true);
  assert.equal(calls.dialogs[0].fields[1].visibleWhen(["group"]),false);
  assert.equal(calls.dialogs[1].title,"Field options");
  assert.equal(calls.dialogs[1].choiceList.copy.heading,"Options");
  assert.deepEqual(JSON.parse(JSON.stringify(calls.dialogs[1].choiceList.items)),[]);
  assert.deepEqual(JSON.parse(JSON.stringify(project.fields[0])),{
    id:"generated-1",
    label:"Status",
    type:"select",
    options:[
      {id:"generated-2",label:"Backlog",color:"red"},
      {id:"generated-3",label:"In progress",color:"red"}
    ]
  });
  assert.equal(calls.saved,1);
  assert.equal(calls.rendered,1);
});

test("group creation uses its standard name and skips the field-name dialog",async()=>{
  const project={fields:[]};
  const {feature,calls,setDialogResults}=createFeature();
  setDialogResults(["group",""],options=>({
    values:[],
    choices:[options.choiceList.createChoice("To do")]
  }));

  await feature.addFieldFlow(project);

  assert.deepEqual(calls.dialogs.map(dialog=>dialog.title),["Add field","Field options"]);
  assert.equal(project.fields[0].label,"Group");
  assert.equal(project.fields[0].type,"select");
  assert.equal(project.fields[0].offeringType,"group");
  assert.deepEqual(JSON.parse(JSON.stringify(project.fields[0].options.map(option=>option.label))),["To do"]);
});

test("creating a priority field starts with the same default levels as editing",async()=>{
  const project={fields:[]};
  const {feature,calls,setDialogResults}=createFeature();
  setDialogResults(["priority",""],options=>({
    values:[],
    choices:options.choiceList.items
  }));

  await feature.addFieldFlow(project);

  assert.deepEqual(JSON.parse(JSON.stringify(calls.dialogs[1].choiceList.items)),[
    {id:"high",label:"High",hiddenInField:false},
    {id:"medium",label:"Medium",hiddenInField:false},
    {id:"low",label:"Low",hiddenInField:false}
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(project.fields[0].options)),defaultPriorityOptions);
  assert.equal(calls.saved,1);
  assert.equal(calls.rendered,1);
});

test("currency fields store their ISO currency and optional decimal precision",async()=>{
  const project={fields:[]};
  const {feature,calls,setDialogResults}=createFeature();
  setDialogResults(["JPY",""]);
  await feature.addField(project,"Budget","currency");

  assert.equal(calls.dialogs[0].title,"Currency settings");
  assert.deepEqual(JSON.parse(JSON.stringify(project.fields[0])),{
    id:"generated-1",label:"Budget",type:"currency",options:[],currency:"JPY"
  });
  assert.equal(calls.saved,1);
});

test("editing a currency field updates its code and decimal places",async()=>{
  const project={fields:[{id:"budget",label:"Budget",type:"currency",currency:"USD"}]};
  const {feature,calls,setDialogResults}=createFeature();
  setDialogResults(["Budget","EUR","0"]);

  await feature.editField({stopPropagation(){}},project.fields[0],project);

  assert.equal(calls.dialogs[0].fields[1].label,"Currency");
  assert.equal(project.fields[0].currency,"EUR");
  assert.equal(project.fields[0].decimalPlaces,0);
  assert.equal(calls.saved,1);
});

test("field creation rejects reserved date names and duplicate field types",async()=>{
  const project={fields:[{id:"tags",type:"tags",label:"Tags"}]};
  const {feature,calls}=createFeature();

  await feature.addField(project,"Due","date");
  await feature.addField(project,"Labels","tags");

  assert.equal(project.fields.length,1);
  assert.equal(calls.notices.length,2);
  assert.match(calls.notices[0][0],/date-specific/);
  assert.match(calls.notices[1][0],/Tags field already exists/);
  assert.equal(calls.saved,0);
});

test("deleting a field cleans values, field references, filters, and scheduled events",()=>{
  const item={
    id:"item-1",values:{schedule:"value",other:"keep"},startTime:"09:00",endTime:"10:00",
    endDate:"2026-10-05",recurrence:{frequency:"daily"},reminderAt:123
  };
  const project={
    fields:[
      {id:"schedule",type:"schedule",label:"Schedule"},
      {id:"tags",type:"tags",label:"Tags"}
    ],
    groups:[{id:"group-1",items:[item]}],
    views:[{groupByFieldId:"schedule"}]
  };
  const {feature,calls,boardFilterFields,boardFilterColumns,getListSort}=createFeature();
  boardFilterFields.set("schedule","__none__");
  boardFilterColumns.set("tags",new Set(["urgent"]));

  feature.deleteField(project,"schedule");

  assert.deepEqual(project.fields.map(field=>field.id),["tags"]);
  assert.deepEqual(item.values,{other:"keep"});
  assert.equal(item.startTime,"");
  assert.equal(item.endTime,"");
  assert.equal(item.endDate,"");
  assert.equal(item.recurrence,null);
  assert.equal(item.reminderAt,null);
  assert.deepEqual(project.views,[{}]);
  assert.deepEqual([...boardFilterFields],[]);
  assert.deepEqual([...boardFilterColumns.keys()],["tags"]);
  assert.deepEqual(calls.queuedEvents,["item-1"]);
  assert.deepEqual(getListSort(),{field:"updated",dir:"desc"});
  assert.equal(calls.refreshedItemModal,1);
  feature.deleteField(project,"tags");
  assert.deepEqual([...boardFilterColumns],[]);
  assert.equal(calls.saved,2);
  assert.equal(calls.rendered,2);
  assert.equal(calls.refreshedItemModal,2);
});

test("editing a field saves its trimmed label and closes menus",async()=>{
  const field={id:"status",label:"Old name"};
  const {feature,calls,setDialogResults}=createFeature();
  setDialogResults("  Current status  ");
  let stopped=false;

  await feature.editField({stopPropagation(){stopped=true;}},field,{fields:[field]});

  assert.equal(stopped,true);
  assert.equal(calls.dialogs[0].actionMenu.items[0].label,"Delete");
  assert.equal(calls.dialogs[0].actionMenu.items[0].danger,true);
  assert.equal(field.label,"Current status");
  assert.equal(calls.closedMenus,1);
  assert.equal(calls.saved,1);
  assert.equal(calls.rendered,1);
});

test("field edit stages choice changes and submits them through the field-type API",async()=>{
  const field={id:"status",label:"Status",type:"select",options:[
    {id:"todo",label:"To do"},
    {id:"done",label:"Done"}
  ]};
  const item={id:"item-1",values:{status:"done"}};
  const project={fields:[field],groups:[{items:[item]}]};
  const {feature,calls,setDialogResults,boardFilterTags}=createFeature();
  setDialogResults({
    values:["Workflow"],
    choices:[
      {id:"todo",label:"In progress",hiddenInField:true},
      {id:"done",label:"Done",deleted:true}
    ]
  });

  await feature.editField({stopPropagation(){}},field,project);

  assert.deepEqual(JSON.parse(JSON.stringify(calls.dialogs[0].choiceList.items)),[
    {id:"todo",label:"To do",hiddenInField:false},
    {id:"done",label:"Done",hiddenInField:false}
  ]);
  assert.equal(field.label,"Workflow");
  assert.equal(field.options[0].label,"In progress");
  assert.equal(field.options[0].hiddenInField,true);
  assert.deepEqual(field.options.map(option=>option.id),["todo"]);
  assert.deepEqual(item.values,{});
  assert.equal(calls.confirms.length,1);
  assert.deepEqual(calls.confirms[0],[
    "Delete option: Done",
    "This removes this option from the field and clears it from item values.",
    true
  ]);
  assert.equal(calls.saved,1);
  assert.equal(calls.rendered,1);
  assert.equal(calls.refreshedItemModal,1);
  assert.deepEqual([...boardFilterTags],[]);
});

test("field edit creates new choices through the field type and saves them",async()=>{
  const field={id:"status",label:"Status",type:"select",options:[{id:"todo",label:"To do"}]};
  const project={fields:[field],groups:[]};
  const {feature,calls,setDialogResults}=createFeature();
  setDialogResults(options=>({
    values:["Status"],
    choices:[...options.choiceList.items,options.choiceList.createChoice("Review")]
  }));

  await feature.editField({stopPropagation(){}},field,project);

  assert.deepEqual(field.options.map(option=>option.label),["To do","Review"]);
  assert.equal(field.options[1].id,"generated-1");
  assert.equal(field.options[1].color,"red");
  assert.equal(calls.saved,1);
});

test("priority choice changes use the shared staged field editor and save action",async()=>{
  const field={id:"priority",label:"Priority",type:"priority",options:[
    {id:"high",label:"High"},
    {id:"medium",label:"Medium"},
    {id:"low",label:"Low"}
  ]};
  const item={id:"item-1",values:{priority:"medium"}};
  const project={fields:[field],groups:[{items:[item]}]};
  const {feature,calls,setDialogResults}=createFeature();
  setDialogResults(options=>({
    values:[],
    choices:[
      {...options.choiceList.items[0],label:"Urgent",hiddenInField:true},
      {...options.choiceList.items[1],deleted:true},
      options.choiceList.items[2],
      options.choiceList.createChoice("Trivial")
    ]
  }));

  await feature.editField({stopPropagation(){}},field,project);

  assert.equal(calls.dialogs[0].choiceList.copy.heading,"Priority levels");
  assert.deepEqual(field.options.map(option=>option.label),["Urgent","Low","Trivial"]);
  assert.equal(field.options[0].hiddenInField,true);
  assert.deepEqual(item.values,{});
  assert.deepEqual(calls.confirms[0],[
    "Delete priority level: Medium",
    "This removes this priority level and clears it from item values.",
    true
  ]);
  assert.equal(calls.saved,1);
});

test("fixed-name fields omit the name input while editing",async()=>{
  const field={
    id:"group",label:"Group",type:"select",
    options:[{id:"todo",label:"To do"}]
  };
  const project={fields:[field],groups:[]};
  const {feature,calls,setDialogResults}=createFeature();
  setDialogResults(options=>({values:[],choices:options.choiceList.items}));

  await feature.editField({stopPropagation(){}},field,project);

  assert.equal(calls.dialogs[0].fields.some(control=>control.label==="Field name"),false);
  assert.equal(field.label,"Group");
  assert.equal(calls.saved,1);
});

test("field edit rejects a new choice that duplicates an existing choice",async()=>{
  const field={id:"status",label:"Status",type:"select",options:[{id:"todo",label:"To do"}]};
  const project={fields:[field],groups:[]};
  const {feature,calls,setDialogResults}=createFeature();
  setDialogResults(options=>({
    values:["Status"],
    choices:[
      ...options.choiceList.items,
      {...options.choiceList.createChoice(" to DO "),label:" to DO "}
    ]
  }));

  await feature.editField({stopPropagation(){}},field,project);

  assert.deepEqual(calls.notices,[["Choice already exists","Each choice must have a unique name."]]);
  assert.deepEqual(field.options.map(option=>option.id),["todo"]);
  assert.equal(calls.saved,0);
});

test("field editor titles identify every registered field type by its field label",async()=>{
  const fieldDefinitions=createFieldTypes().list();
  for (const [index,definition] of fieldDefinitions.entries()){
    const field={
      id:`field-${index}`,
      label:`Custom ${definition.label}`,
      type:definition.value,
      options:[]
    };
    const {feature,calls,setDialogResults}=createFeature();
    setDialogResults(null);

    await feature.editField({stopPropagation(){}},field,{fields:[field]});

    assert.equal(calls.dialogs[0].title,`Edit ${field.label}`,definition.value);
  }
});

test("edit field dialog menu reuses the existing delete confirmation and cleanup",async()=>{
  const field={id:"status",label:"Status"};
  const project={fields:[field],groups:[{items:[{id:"item-1",values:{status:"active"}}]}]};
  const {feature,calls,setDialogResults}=createFeature();
  setDialogResults(null);

  await feature.editField({stopPropagation(){}},field,project);
  await calls.dialogs[0].actionMenu.items[0].onSelect({stopPropagation(){}});

  assert.deepEqual(calls.confirms[0],[
    "Delete field Status",
    "This removes its values from every item in this project.",
    true
  ]);
  assert.deepEqual(project.fields,[]);
  assert.deepEqual(project.groups[0].items[0].values,{});
  assert.equal(calls.saved,1);
  assert.equal(calls.rendered,1);
  assert.equal(calls.refreshedItemModal,1);
});
