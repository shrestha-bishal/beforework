"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/command-palette.js"), "utf8");
const sandbox = {window:{}};
vm.runInNewContext(source,sandbox,{filename:"command-palette.js"});
const fuzzyScore = sandbox.window.BeforeworkCommandPalette.fuzzyScore;
const createCommandPalette = sandbox.window.BeforeworkCommandPalette.create;

function createDocumentHarness(){
  let input;
  let results;
  let overlay;
  const documentRef = {
    activeElement:null,
    createElement(){
      if (!overlay){
        input = {value:"",addEventListener(){},focus(){},setAttribute(){},removeAttribute(){}};
        results = {replaceChildren(){},appendChild(){}};
        overlay = {hidden:true,set innerHTML(value){},querySelector(selector){return selector===".commandPaletteInput" ? input : results;},addEventListener(){}};
        return overlay;
      }
      return {className:"",textContent:""};
    },
    addEventListener(){},
    body:{appendChild(){}}
  };
  return {documentRef,getInput:()=>input};
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

test("opens with the current global search query", ()=>{
  const harness = createDocumentHarness();
  const palette = createCommandPalette({
    getCommands:()=>[],
    getInitialQuery:()=>"calendar",
    documentRef:harness.documentRef,
    storage:null
  });

  palette.open();
  assert.equal(harness.getInput().value,"calendar");
  palette.close();
  palette.open("review task");
  assert.equal(harness.getInput().value,"review task");
});
