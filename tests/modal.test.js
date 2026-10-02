"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const source=fs.readFileSync(path.join(__dirname,"../js/ui/modal.js"),"utf8");

function makeElement(tagName){
  const listeners={};
  return {
    tagName,
    nodeType:1,
    children:[],
    listeners,
    className:"",
    id:"",
    parentNode:null,
    addEventListener(name,callback){ listeners[name]=callback; },
    appendChild(child){ child.parentNode=this; this.children.push(child); },
    remove(){
      if (!this.parentNode) return;
      this.parentNode.children=this.parentNode.children.filter(child=>child!==this);
      this.parentNode=null;
    },
    dispatch(name,event){ listeners[name]?.({target:this,...event}); }
  };
}

function createHarness(){
  const body=makeElement("body");
  const documentRef={
    body,
    createElement:makeElement,
    getElementById(id){ return body.children.find(element=>element.id===id)||null; }
  };
  const window={document:documentRef};
  vm.runInNewContext(source,{window},{filename:"modal.js"});
  return {documentRef,modal:window.BeforeworkModal.create()};
}

test("modal opens parameterized content and closes by id",()=>{
  const {documentRef,modal}=createHarness();
  const content=makeElement("section");
  let backdropClosed=0;
  const overlay=modal.open({
    id:"itemOverlay",
    content,
    onBackdrop:()=>backdropClosed++
  });

  assert.equal(overlay.className,"overlay");
  assert.equal(overlay.id,"itemOverlay");
  assert.equal(overlay.children[0],content);
  assert.equal(documentRef.body.children[0],overlay);
  overlay.dispatch("click",{target:overlay});
  assert.equal(backdropClosed,1);
  overlay.dispatch("click",{target:content});
  assert.equal(backdropClosed,1);
  assert.equal(modal.close("itemOverlay"),true);
  assert.equal(documentRef.body.children.length,0);
  assert.equal(modal.close("itemOverlay"),false);
});

test("modal validates configuration",()=>{
  const {modal}=createHarness();
  assert.throws(()=>modal.open({content:makeElement("section")}),/requires an overlay id/);
  assert.throws(()=>modal.open({id:"invalid",content:{}}),/requires a DOM content node/);
});
