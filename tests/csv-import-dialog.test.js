"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const source=fs.readFileSync(path.join(__dirname,"../js/ui/csv-import-dialog.js"),"utf8");
const appSource=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
const templateSource=fs.readFileSync(path.join(__dirname,"../pages/csv-import.html"),"utf8");

function createElement(tagName,selectorMap={}){
  const listeners={};
  return {
    tagName,
    children:[],
    dataset:{},
    appendChild(child){ this.children.push(child.root||child); return child; },
    append(...children){ this.children.push(...children); },
    replaceChildren(...children){ this.children=children; },
    addEventListener(name,callback){ listeners[name]=callback; },
    dispatch(name){ listeners[name]?.(); },
    querySelector(selector){ return selectorMap[selector]||null; }
  };
}

function createMappingFieldTemplate(){
  const caption=createElement("label");
  const select=createElement("select");
  const skip=createElement("option");
  skip.value="";
  skip.textContent="Don't import";
  select.appendChild(skip);
  const label=createElement("div",{
    "[data-csv-mapping-caption]":caption,
    "[data-csv-mapping-select]":select
  });
  label.append(caption,select);
  return {
    root:label,
    querySelector(selector){
      return selector===".csvImportField" ? label : label.querySelector(selector);
    }
  };
}

function createDateFormatTemplate(){
  const select=createElement("select");
  select.id="csvImportDateFormat";
  const control=createElement("div",{"[data-csv-date-format]":select});
  control.hidden=true;
  control.appendChild(select);
  return {
    root:control,
    querySelector(selector){
      return selector===".csvImportDateFormatControl" ? control : control.querySelector(selector);
    }
  };
}

function createTemplate(factory){
  return {content:{cloneNode:factory}};
}

function createHarness(){
  const mappingFields=createElement("div");
  let changed=0;
  const context={
    parsed:{headers:["Task","Due","Review date"]},
    project:{id:"project-1"}
  };
  const makeTargets=()=>[
    {key:"title",kind:"title",label:"Task title",required:true},
    {key:"dueDate",kind:"dueDate",label:"Due date"},
    {key:"customDate:2",kind:"customDate",label:"Date - Review"}
  ];
  const guessTarget=(target,header)=>target.kind==="title"&&header==="Task"
    || target.kind==="dueDate"&&header==="Due";
  const window={};
  vm.runInNewContext(source,{window},{filename:"csv-import-dialog.js"});
  const renderer=window.BeforeworkCsvImportDialog.createMappingRenderer({
    documentRef:{createElement},
    mappingFields,
    mappingFieldTemplate:createTemplate(createMappingFieldTemplate),
    dateFormatTemplate:createTemplate(createDateFormatTemplate),
    makeTargets,
    guessTarget,
    onChange:()=>changed++
  });
  return {renderer,mappingFields,context,getChanged:()=>changed};
}

test("CSV mapping renderer creates fields, guesses headers, and exposes date controls",()=>{
  const harness=createHarness();
  harness.renderer.render(harness.context);

  assert.deepEqual(harness.context.targets.map(target=>target.key),["title","dueDate","customDate:2"]);
  assert.equal(harness.mappingFields.children.length,3);
  const titleSelect=harness.mappingFields.children[0].children[1];
  assert.equal(titleSelect.id,"csvImportTarget-title");
  assert.equal(titleSelect.children[1].selected,true);
  assert.equal(titleSelect.children[1].textContent,"Task");
  assert.equal(harness.renderer.dateFormatSelect.id,"csvImportDateFormat");
  assert.equal(harness.renderer.dateFormatControl.hidden,true);
  assert.deepEqual([...harness.renderer.dateFormatTargetKeys],["dueDate","customDate:2"]);
  assert.equal(harness.getChanged(),1);
  titleSelect.dispatch("change");
  assert.equal(harness.getChanged(),2);
});

test("CSV mapping renderer clears previous fields and skips missing parsed data",()=>{
  const harness=createHarness();
  harness.renderer.render(harness.context);
  const priorDateSelect=harness.renderer.dateFormatSelect;

  harness.context.parsed=null;
  harness.renderer.render(harness.context);
  assert.equal(harness.renderer.dateFormatSelect,priorDateSelect);
  assert.equal(harness.getChanged(),1);

  harness.context.parsed={headers:["Task"]};
  harness.renderer.render(harness.context);
  assert.equal(harness.mappingFields.children.length,3);
  assert.notEqual(harness.renderer.dateFormatSelect,priorDateSelect);
  assert.deepEqual([...harness.renderer.dateFormatTargetKeys],["dueDate","customDate:2"]);
});

test("app delegates column mapping rendering to the CSV import UI module",()=>{
  assert.match(appSource,/window\.BeforeworkCsvImportDialog\.createMappingRenderer\(\{/);
  assert.match(appSource,/mappingFieldTemplate,/);
  assert.match(appSource,/dateFormatTemplate,/);
  assert.match(appSource,/mappingRenderer\.render\(context\)/);
  assert.doesNotMatch(appSource,/function renderMapping\(\)\{[\s\S]{0,500}createElement\("select"\)/);
});

test("CSV mapping field and date controls are defined in the dialog HTML template",()=>{
  const dialogEnd=templateSource.indexOf("</template>");
  const mappingTemplate=templateSource.indexOf('<template id="csvImportMappingFieldTemplate">');
  const dateTemplate=templateSource.indexOf('<template id="csvImportDateFormatTemplate">');
  assert.ok(dialogEnd>=0&&mappingTemplate>dialogEnd&&dateTemplate>dialogEnd,"mapping templates should be siblings of the dialog template");
  assert.match(templateSource,/data-csv-mapping-caption/);
  assert.match(templateSource,/data-csv-mapping-select/);
  assert.match(templateSource,/data-csv-date-format/);
  assert.match(appSource,/templateFragment\.querySelector\("#csvImportMappingFieldTemplate"\)/);
  assert.match(appSource,/templateFragment\.querySelector\("#csvImportDateFormatTemplate"\)/);
  assert.doesNotMatch(source,/innerHTML\s*=/);
});

test("CSV mapping renderer validates its required dependencies",()=>{
  const window={};
  vm.runInNewContext(source,{window},{filename:"csv-import-dialog.js"});
  assert.throws(
    ()=>window.BeforeworkCsvImportDialog.createMappingRenderer(),
    /requires a mapping-fields element/
  );
  assert.throws(
    ()=>window.BeforeworkCsvImportDialog.createMappingRenderer({
      mappingFields:createElement("div"),
      makeTargets(){},
      guessTarget(){},
      onChange(){}
    }),
    /requires mapping field and date format templates/
  );
});
