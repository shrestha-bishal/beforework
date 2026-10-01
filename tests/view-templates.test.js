"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

function loadTemplatesModule(){
  const requests=[];
  const window={};
  const sandbox={
    window,
    fetch:async url=>{
      requests.push(url);
      return {ok:true,text:async()=>`<template>${url}</template>`};
    },
    document:{
      createElement:()=>({
        content:{cloneNode:()=>({cloned:true})}
      })
    }
  };
  const source=fs.readFileSync(path.join(__dirname,"../js/ui/templates.js"),"utf8");
  vm.runInNewContext(source,sandbox,{filename:"templates.js"});
  return {loader:window.BeforeworkViewTemplates,requests};
}

test("loads dialog templates on demand through the shared cache",async()=>{
  const {loader,requests}=loadTemplatesModule();

  await loader.loadAll();
  assert.equal(requests.includes("pages/dialogs.html"),false);
  assert.equal(requests.includes("pages/overview-details.html"),false);
  assert.equal(requests.filter(url=>url==="pages/focus-timer.html").length,1);
  assert.equal(requests.filter(url=>url==="pages/list-view.html").length,1);
  assert.equal(requests.filter(url=>url==="pages/table-view.html").length,1);
  assert.equal(requests.filter(url=>url==="pages/board-view.html").length,1);
  assert.equal(requests.filter(url=>url==="pages/calendar.html").length,1);

  await Promise.all([
    loader.load("dialogs"),
    loader.load("dialogs"),
    loader.load("overviewDetails"),
    loader.load("overviewDetails"),
    loader.load("csvImport"),
    loader.load("focusTimer"),
    loader.load("focusTimer")
  ]);
  assert.equal(requests.filter(url=>url==="pages/dialogs.html").length,1);
  assert.equal(requests.filter(url=>url==="pages/overview-details.html").length,1);
  assert.equal(requests.filter(url=>url==="pages/csv-import.html").length,1);
  assert.equal(requests.filter(url=>url==="pages/focus-timer.html").length,1);
  assert.equal(requests.filter(url=>url==="pages/list-view.html").length,1);
  assert.equal(requests.filter(url=>url==="pages/table-view.html").length,1);
  assert.equal(requests.filter(url=>url==="pages/board-view.html").length,1);
  assert.equal(requests.filter(url=>url==="pages/calendar.html").length,1);
  assert.deepEqual(loader.clone("dialogs"),{cloned:true});
});