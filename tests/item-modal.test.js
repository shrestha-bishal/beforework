"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const source=fs.readFileSync(path.join(__dirname,"../js/ui/item-modal.js"),"utf8");
const appSource=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");

function makeElement(dataset={}){
  const listeners={};
  const classes=new Set();
  const attributes={};
  return {
    dataset,
    hidden:false,
    listeners,
    attributes,
    classList:{
      toggle(name,force){
        const enabled=force===undefined ? !classes.has(name) : force;
        if (enabled) classes.add(name);
        else classes.delete(name);
        return enabled;
      },
      contains(name){ return classes.has(name); }
    },
    addEventListener(name,callback){ listeners[name]=callback; },
    setAttribute(name,value){ attributes[name]=value; },
    focus(){ documentRef.activeElement=this; },
    dispatch(name,event={}){
      const dispatchedEvent={...event,target:this,defaultPrevented:false,preventDefault(){ this.defaultPrevented=true; }};
      listeners[name]?.(dispatchedEvent);
      return dispatchedEvent;
    }
  };
}

let documentRef;
function createHarness(){
  documentRef={activeElement:null};
  const closeButton=makeElement();
  const actionMenuButton=makeElement();
  const menuItem=makeElement();
  const actionMenu=makeElement();
  actionMenu.hidden=true;
  actionMenu.querySelector=()=>menuItem;
  actionMenu.querySelectorAll=()=>[menuItem];
  const tabs=[makeElement({itemTab:"comments"}),makeElement({itemTab:"attachments"})];
  const panels=[makeElement({itemPanel:"comments"}),makeElement({itemPanel:"attachments"})];
  const listeners={};
  const modal={
    addEventListener(name,callback){ listeners[name]=callback; },
    querySelector(selector){
      return {
        '[data-action="close"]':closeButton,
        "#itemModalActionMenu":actionMenu,
        '[data-action="toggleItemMenu"]':actionMenuButton
      }[selector]||null;
    },
    querySelectorAll(selector){
      if (selector===".itemDetailTab") return tabs;
      if (selector===".itemDetailPanel") return panels;
      return [];
    },
    dispatch(name,event){ listeners[name]?.(event); }
  };
  const window={document:documentRef};
  vm.runInNewContext(source,{window},{filename:"item-modal.js"});
  return {
    modal,
    itemModal:window.BeforeworkItemModal.create({documentRef}),
    closeButton,
    actionMenuButton,
    actionMenu,
    menuItem,
    tabs,
    panels
  };
}

test("item modal wires close, accessible action menu, and detail tabs",()=>{
  const harness=createHarness();
  let closed=0;
  harness.itemModal.wire(harness.modal,{onClose:()=>closed++});

  harness.closeButton.onclick();
  assert.equal(closed,1);

  harness.actionMenuButton.onclick();
  assert.equal(harness.actionMenu.hidden,false);
  assert.equal(harness.actionMenuButton.attributes["aria-expanded"],"true");
  assert.equal(documentRef.activeElement,harness.menuItem);

  const arrowEvent=harness.actionMenu.dispatch("keydown",{key:"ArrowDown"});
  assert.equal(arrowEvent.defaultPrevented,true);
  harness.actionMenu.dispatch("keydown",{key:"Escape"});
  assert.equal(harness.actionMenu.hidden,true);
  assert.equal(harness.actionMenuButton.attributes["aria-expanded"],"false");
  assert.equal(documentRef.activeElement,harness.actionMenuButton);

  harness.tabs[1].onclick();
  assert.equal(harness.tabs[0].classList.contains("active"),false);
  assert.equal(harness.tabs[1].classList.contains("active"),true);
  assert.equal(harness.tabs[1].attributes["aria-selected"],"true");
  assert.equal(harness.panels[0].hidden,true);
  assert.equal(harness.panels[1].hidden,false);
});

test("item modal view wiring is connected to app rendering",()=>{
  assert.match(appSource,/window\.BeforeworkItemModal\.create\(\)/);
  assert.match(appSource,/itemModalView\.wire\(modal,\{onClose:closeItemModal\}\)/);
  assert.equal((appSource.match(/querySelectorAll\("\.itemDetailTab"\)/g)||[]).length,0);
});

test("item modal wiring requires a DOM element",()=>{
  const harness=createHarness();
  assert.throws(()=>harness.itemModal.wire(null),/requires a DOM element/);
});
