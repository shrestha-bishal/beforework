"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const app=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
const tableView=fs.readFileSync(path.join(__dirname,"../js/views/table-view.js"),"utf8");
const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[char]));

function runSnippet(startMarker,endMarker,body,context={}){
  const start=app.indexOf(startMarker);
  const end=app.indexOf(endMarker,start);
  assert.notEqual(start,-1,`missing ${startMarker}`);
  assert.notEqual(end,-1,`missing ${endMarker}`);
  return vm.runInNewContext(`${app.slice(start,end)}; ${body}`,context);
}

test("Relations is available as a multi-item custom field",()=>{
  assert.match(app,/value:"relation", label:"Relations", description:"Link this item to other items in the same project\."/);
  assert.match(app,/field\?\.type==="relation" \? \[\.\.\.el\.selectedOptions\]/);
  assert.match(app,/field\?\.type==="multi-select" \? \[\.\.\.modal\.querySelectorAll/);
});

test("relation field editor searches and selects only other project items",()=>{
  const html=runSnippet("function fieldInputHtml","function renderItemModal",`
    fieldInputHtml({id:"related",label:"Related items",type:"relation"},
    {id:"current",values:{related:["second"]}},
      {groups:[
        {name:"Ready",items:[
          {id:"current",title:"Current"},
          {id:"target",title:"Target <one>"}
        ]},
        {name:"Later",items:[{id:"second",title:"Second"}]}
      ]});
  `,{escapeHtml});
  assert.match(html,/<select multiple class="form-control fieldInput relationFieldSelect"/);
  assert.match(html,/data-app-select-placeholder="Select items"/);
  assert.match(html,/value="second" selected/);
  assert.match(html,/Target &lt;one&gt;/);
  assert.doesNotMatch(html,/<input type="checkbox"/);
  assert.doesNotMatch(html,/value="current"/);
});

test("relation values render and export item titles rather than stored IDs",()=>{
  const helpers=runSnippet("function relatedItemTitles","function serializeCsvRows",`
    JSON.stringify({
      cell:fieldCellHtml({id:"related",type:"relation"},["target","missing"],project),
      csv:csvFieldValue({id:"related",type:"relation"},["target","missing"],project)
    });
  `,{
    escapeHtml,
    duePillHtml:()=>"",
    project:{groups:[{items:[{id:"target",title:"Target <one>"}]}]}
  });
  const result=JSON.parse(helpers);
  assert.match(result.cell,/Target &lt;one&gt;/);
  assert.equal(result.csv,"Target <one>");
  assert.doesNotMatch(result.cell,/target/);
  assert.match(tableView,/field\.type==="relation"/);
});

test("deleting an item clears incoming relation values",()=>{
  const project={
    fields:[{id:"links",type:"relation"},{id:"text",type:"text"}],
    groups:[{items:[
      {id:"survivor",updatedAt:0,values:{links:["deleted","other"],text:"keep"}},
      {id:"other",updatedAt:0,values:{links:["deleted"]}}
    ]}]
  };
  const cleaned=runSnippet("function removeItemRelations","function makeDuplicateItem",`
    removeItemRelations(project,["deleted"]);
    JSON.stringify(project.groups[0].items);
  `,{project,Date});
  const result=JSON.parse(cleaned);
  assert.deepEqual(result.map(item=>item.values.links),[["other"],[]]);
  assert.equal(result[0].values.text,"keep");
  assert.ok(result.every(item=>item.updatedAt>0));
});
