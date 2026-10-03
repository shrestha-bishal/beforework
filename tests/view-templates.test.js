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
      return {ok:true,text:async()=>url==="pages/item-modal.html"
        ? "<div>{{value}}</div>"
        : url==="pages/item-fields.html"
          ? '<template data-view-partial="label"><b>{{label}}</b></template>'
          : `<template>${url}</template>`};
    },
    document:{
      createElement:()=>{
        let html="";
        const content={
          cloneNode:()=>({cloned:true}),
          querySelectorAll:selector=>selector==="template[data-view-partial]"
            ? [...html.matchAll(/<template data-view-partial="([^"]+)">([\s\S]*?)<\/template>/g)]
              .map(([,name,innerHTML])=>({dataset:{viewPartial:name},innerHTML}))
            : []
        };
        return {
          get innerHTML(){ return html; },
          set innerHTML(value){ html=value; },
          content
        };
      }
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
  assert.equal(requests.filter(url=>url==="pages/item-modal.html").length,1);
  assert.equal(requests.filter(url=>url==="pages/item-fields.html").length,1);
  assert.equal(requests.filter(url=>url==="pages/shortcuts-modal.html").length,1);

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
  assert.equal(requests.filter(url=>url==="pages/item-modal.html").length,1);
  assert.equal(requests.filter(url=>url==="pages/item-fields.html").length,1);
  assert.equal(requests.filter(url=>url==="pages/shortcuts-modal.html").length,1);
  assert.deepEqual(loader.clone("dialogs"),{cloned:true});
});

test("renders named values into loaded templates and rejects missing values",async()=>{
  const {loader}=loadTemplatesModule();
  await loader.loadAll();

  assert.equal(loader.render("itemModal",{value:"task"}),"<div>task</div>");
  assert.throws(()=>loader.render("itemModal",{}),/Missing value "value"/);
});

test("renders named partials from loaded HTML and reports unknown or missing values",async()=>{
  const {loader}=loadTemplatesModule();
  await loader.load("itemFields");

  assert.equal(loader.renderPartial("itemFields","label",{label:"Priority"}),"<b>Priority</b>");
  assert.throws(()=>loader.renderPartial("itemFields","label",{}),/Missing value "label"/);
  assert.throws(()=>loader.renderPartial("itemFields","unknown",{}),/Unknown partial "unknown"/);
});