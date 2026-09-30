"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/ui/command-palette.js"), "utf8");
const sandbox = {window:{}};
vm.runInNewContext(source,sandbox,{filename:"command-palette.js"});
const fuzzyScore = sandbox.window.BeforeworkCommandPalette.fuzzyScore;
const createCommandPalette = sandbox.window.BeforeworkCommandPalette.create;
const createSearchIndex = sandbox.window.BeforeworkCommandPalette.createSearchIndex;

function createDocumentHarness(){
  let input;
  let results;
  let overlay;
  const listeners = new Map();
  const documentRef = {
    activeElement:null,
    createElement(){ return {className:"",textContent:""}; },
    addEventListener(type,listener){ listeners.set(type,listener); },
    body:{appendChild(){}}
  };
  input = {value:"",addEventListener(){},focus(){documentRef.activeElement=input;},setAttribute(){},removeAttribute(){}};
  results = {replaceChildren(){},appendChild(){}};
  const shortcut = {textContent:""};
  overlay = {hidden:true,querySelector(selector){
    if (selector===".commandPaletteInput") return input;
    if (selector===".commandPaletteResults") return results;
    if (selector==="[data-palette-shortcut]") return shortcut;
  },addEventListener(){}};
  return {documentRef,getInput:()=>input,cloneTemplate:async()=>overlay,dispatchKeydown:event=>listeners.get("keydown")?.(event)};
}

test("ranks exact and prefix matches above fuzzy subsequences", ()=>{
  assert.ok(fuzzyScore("calendar","Open calendar") > fuzzyScore("clndr","Open calendar"));
  assert.ok(fuzzyScore("calendar","Calendar") > fuzzyScore("calendar","Workspace calendar"));
});

test("matches multiple query terms independently", ()=>{
  assert.ok(Number.isFinite(fuzzyScore("cust onb","Customer onboarding")));
  assert.equal(fuzzyScore("cust billing","Customer onboarding"),Number.NEGATIVE_INFINITY);
  assert.equal(fuzzyScore("cal op","Create folder"),Number.NEGATIVE_INFINITY);
});

test("matches text without accents", ()=>{
  assert.ok(Number.isFinite(fuzzyScore("resume","Résumé review")));
});

test("search index retains every fuzzy match while pruning impossible candidates", ()=>{
  const commands=[
    {id:"calendar",title:"Open calendar",category:"Navigate"},
    {id:"customer",title:"Customer onboarding",category:"Projects"},
    {id:"billing",title:"Billing overview",category:"Projects"},
    {id:"launch",title:"🚀 Launch",category:"Projects"}
  ];
  const index=createSearchIndex(commands);

  for (const query of ["calendar","clndr","cust onb","billing","🚀"]){
    const indexed=new Set(index.candidates(query).map(command=>command.id));
    commands.forEach(command=>{
      const text=[command.title,command.subtitle,command.category,command.keywords].filter(Boolean).join(" ");
      if (Number.isFinite(fuzzyScore(query,text))) assert.ok(indexed.has(command.id),`${query} should retain ${command.id}`);
    });
  }
  assert.ok(index.candidates("zzz").length<commands.length);
});

test("opens with the current global search query", async()=>{
  const harness = createDocumentHarness();
  const palette = createCommandPalette({
    getCommands:()=>[],
    getInitialQuery:()=>"calendar",
    cloneTemplate:harness.cloneTemplate,
    documentRef:harness.documentRef,
    storage:null
  });

  await palette.open();
  assert.equal(harness.getInput().value,"calendar");
  palette.close();
  await palette.open("review task");
  assert.equal(harness.getInput().value,"review task");
});

test("opens from the keyboard shortcut before the template is loaded", async()=>{
  const harness=createDocumentHarness();
  const palette=createCommandPalette({
    getCommands:()=>[],
    getInitialQuery:()=>"calendar",
    cloneTemplate:harness.cloneTemplate,
    documentRef:harness.documentRef,
    storage:null
  });
  let prevented=false;
  harness.dispatchKeydown({metaKey:true,ctrlKey:false,key:"k",preventDefault(){prevented=true;},stopPropagation(){}});
  await palette.open();
  assert.equal(prevented,true);
  assert.equal(harness.getInput().value,"calendar");
  assert.equal(palette.isOpen(),true);
});

test("caches commands until workspace changes invalidate the index", async()=>{
  let reads=0;
  const harness=createDocumentHarness();
  const palette=createCommandPalette({
    getCommands:()=>{ reads++; return []; },
    cloneTemplate:harness.cloneTemplate,
    documentRef:harness.documentRef,
    storage:null
  });

  await palette.open();
  palette.close();
  await palette.open();
  assert.equal(reads,1);
  palette.refreshCommands();
  await palette.open();
  assert.equal(reads,2);
});
