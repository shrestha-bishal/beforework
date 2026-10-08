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
    addEventListener(name,callback){ (listeners[name]??=[]).push(callback); },
    setAttribute(name,value){ attributes[name]=value; },
    focus(){ documentRef.activeElement=this; },
    dispatch(name,event={}){
      const dispatchedEvent={...event,target:this,defaultPrevented:false,preventDefault(){ this.defaultPrevented=true; }};
      (listeners[name]||[]).forEach(listener=>listener(dispatchedEvent));
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
  const descriptionMenuButton=makeElement();
  const descriptionMenuItem=makeElement();
  const descriptionMenu=makeElement();
  actionMenu.hidden=true;
  actionMenu.querySelector=()=>menuItem;
  actionMenu.querySelectorAll=()=>[menuItem];
  descriptionMenu.hidden=true;
  descriptionMenu.querySelector=()=>descriptionMenuItem;
  descriptionMenu.querySelectorAll=()=>[descriptionMenuItem];
  const tabs=[makeElement({itemTab:"comments"}),makeElement({itemTab:"attachments"})];
  const panels=[makeElement({itemPanel:"comments"}),makeElement({itemPanel:"attachments"})];
  const listeners={};
  const modal={
    addEventListener(name,callback){ (listeners[name]??=[]).push(callback); },
    querySelector(selector){
      return {
        '[data-action="close"]':closeButton,
        "#itemActionMenu":actionMenu,
        '[data-action="toggleItemMenu"]':actionMenuButton,
        "#descriptionActionMenu":descriptionMenu,
        '[data-action="toggleDescriptionMenu"]':descriptionMenuButton
      }[selector]||null;
    },
    querySelectorAll(selector){
      if (selector===".itemDetailTab") return tabs;
      if (selector===".itemDetailPanel") return panels;
      return [];
    },
    dispatch(name,event){ (listeners[name]||[]).forEach(listener=>listener(event)); }
  };
  const window={document:documentRef};
  const registeredMenus=[];
  window.BeforeworkActionMenu={
    create:()=>({
      register(button,menu){ registeredMenus.push({button,menu}); }
    })
  };
  vm.runInNewContext(source,{window},{filename:"item-modal.js"});
  return {
    modal,
    itemModal:window.BeforeworkItemModal.create({documentRef}),
    closeButton,
    actionMenuButton,
    actionMenu,
    menuItem,
    descriptionMenuButton,
    descriptionMenu,
    descriptionMenuItem,
    registeredMenus,
    tabs,
    panels
  };
}

test("item modal registers its shared action menus and wires detail tabs",()=>{
  const harness=createHarness();
  let closed=0;
  harness.itemModal.wire(harness.modal,{onClose:()=>closed++});

  harness.closeButton.onclick();
  assert.equal(closed,1);

  assert.equal(harness.registeredMenus.length,2);
  assert.equal(harness.registeredMenus[0].button,harness.actionMenuButton);
  assert.equal(harness.registeredMenus[0].menu,harness.actionMenu);
  assert.equal(harness.registeredMenus[1].button,harness.descriptionMenuButton);
  assert.equal(harness.registeredMenus[1].menu,harness.descriptionMenu);

  harness.tabs[1].onclick();
  assert.equal(harness.tabs[0].classList.contains("active"),false);
  assert.equal(harness.tabs[1].classList.contains("active"),true);
  assert.equal(harness.tabs[1].attributes["aria-selected"],"true");
  assert.equal(harness.panels[0].hidden,true);
  assert.equal(harness.panels[1].hidden,false);
});

test("item modal view wiring is connected to app rendering",()=>{
  assert.match(appSource,/window\.BeforeworkItemModal\.create\(\{[\s\S]*?renderTemplate:values=>window\.BeforeworkViewTemplates\.render\("itemModal",values\)/);
  assert.match(appSource,/itemModalView\.render\(modal,\{/);
  assert.match(appSource,/itemModalView\.wire\(modal,\{onClose:closeItemModal\}\)/);
  assert.match(appSource,/function createItemModalShell\(\)\{[\s\S]*?setAttribute\("role","dialog"\)[\s\S]*?setAttribute\("aria-modal","true"\)[\s\S]*?setAttribute\("aria-label","Item details"\)[\s\S]*?modal\.open\(\{id:"itemOverlay",content,onBackdrop:closeItemModal\}\)/);
  assert.match(appSource,/function closeItemModal\(\)\{[\s\S]*?classList\.contains\("itemOverlayClosing"\)[\s\S]*?matchMedia\("\(prefers-reduced-motion: reduce\)"\)[\s\S]*?classList\.add\("itemOverlayClosing"\)[\s\S]*?setTimeout\([\s\S]*?modal\.close\("itemOverlay"\)[\s\S]*?\},320\)/);
  assert.match(appSource,/else if \(top\.id==="itemOverlay"\) closeItemModal\(\);/);
  assert.match(appSource,/function openNewItemModal\([\s\S]*?createItemModalShell\(\);/);
  assert.equal((appSource.match(/querySelectorAll\("\.itemDetailTab"\)/g)||[]).length,0);
});

test("item modal view renders only through injected template callbacks",()=>{
  const window={};
  window.BeforeworkActionMenu={create:()=>({register(){}})};
  vm.runInNewContext(source,{window},{filename:"item-modal.js"});
  const view=window.BeforeworkItemModal.create({
    renderTemplate:values=>`<div>${values.title}</div>`,
    renderPartial:(name,values)=>`${name}:${values.title}`
  });
  const modal={};

  view.render(modal,{title:"Task"});
  assert.equal(modal.innerHTML,"<div>Task</div>");
  assert.equal(view.renderPartial("subitemRow",{title:"Review"}),"subitemRow:Review");
  assert.throws(()=>view.render(null,{}),/requires a DOM element to render into/);
  const withoutPartialRenderer=window.BeforeworkItemModal.create({renderTemplate:()=>""});
  assert.throws(()=>withoutPartialRenderer.renderPartial("subitemRow",{}),/requires its partial template renderer/);
});

test("item modal wiring requires a DOM element",()=>{
  const harness=createHarness();
  assert.throws(()=>harness.itemModal.wire(null),/requires a DOM element/);
});
