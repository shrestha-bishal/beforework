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

test("field types own their filter matching and column values",()=>{
  const number={id:"estimate",type:"number"};
  const multiSelect={id:"areas",type:"multi-select"};
  const checkbox={id:"done",type:"checkbox"};
  const date={id:"due",type:"due-date"};
  const text={id:"notes",type:"text"};
  const tags={id:"tags",type:"tags"};

  assert.equal(fieldTypes.matchesFilter(number,{value:0,mode:"0"}),true);
  assert.equal(fieldTypes.matchesFilter(number,{value:0,mode:"2"}),false);
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
  const multiSelect={id:"areas",type:"multi-select",options:[{id:"docs",label:"Docs"}]};
  const checkbox={id:"done",type:"checkbox"};
  const select={id:"status",type:"select",options:[{id:"ready",label:"Ready"}]};

  assert.equal(fieldTypes.normalizeInput(number,{input:{value:"2.5"}}),2.5);
  assert.deepEqual(
    [...fieldTypes.normalizeInput(multiSelect,{selectedOptions:[{value:"docs"}]})],
    ["docs"]
  );
  assert.equal(fieldTypes.normalizeInput(checkbox,{input:{checked:true}}),"true");
  assert.equal(fieldTypes.sortValue(number,{value:2})<fieldTypes.sortValue(number,{value:10}),true);
  assert.equal(fieldTypes.formatValue(select,{field:select,value:"ready"}),"Ready");
  assert.equal(fieldTypes.formatValue(checkbox,{value:"true"}),"Yes");
});
