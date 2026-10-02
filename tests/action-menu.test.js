"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const source=fs.readFileSync(path.join(__dirname,"../js/ui/action-menu.js"),"utf8");

function createHarness(){
  const documentListeners={};
  const documentRef={
    activeElement:null,
    getElementById(){ return null; },
    addEventListener(name,callback){ documentListeners[name]=callback; }
  };
  function element(){
    const classes=new Set();
    const attributes={};
    return {
      attributes,
      dataset:{},
      hidden:false,
      classList:{
        add(name){ classes.add(name); },
        remove(name){ classes.delete(name); },
        contains(name){ return classes.has(name); }
      },
      addEventListener(){},
      className:"",
      hasAttribute(name){ return Object.hasOwn(attributes,name); },
      setAttribute(name,value){ attributes[name]=value; },
      getAttribute(name){ return attributes[name]; },
      focus(){ documentRef.activeElement=this; },
      closest(selector){
        if (selector==='[data-action-menu-trigger]'&&this.dataset.actionMenuTrigger==="true") return this;
        if (selector==='[role="menuitem"],button'&&this.role==="menuitem") return this;
        if (selector==='[role="menuitem"],button'&&this.isButton) return this;
        return null;
      }
    };
  }
  const button=element();
  const menu=element();
  const firstItem=element();
  const secondItem=element();
  const stayOpenItem=element();
  const secondButton=element();
  const secondMenu=element();
  const secondMenuItem=element();
  for (const item of [firstItem,secondItem,stayOpenItem]){
    item.isButton=true;
    item.role="menuitem";
    item.setAttribute("role","menuitem");
  }
  secondItem.classList.add("danger");
  stayOpenItem.setAttribute("data-action-menu-stay-open","");
  menu.querySelectorAll=()=>[firstItem,secondItem,stayOpenItem];
  menu.contains=target=>target===menu||menu.querySelectorAll().includes(target);
  secondMenu.querySelectorAll=()=>[secondMenuItem];
  secondMenu.contains=target=>target===secondMenu||target===secondMenuItem;
  const window={document:documentRef};
  vm.runInNewContext(source,{window},{filename:"action-menu.js"});
  const manager=window.BeforeworkActionMenu.create({documentRef});
  const controller=manager.register(button,menu);
  const secondController=manager.register(secondButton,secondMenu);
  const dispatchClick=target=>{
    const event={target,stopPropagation(){ this.propagationStopped=true; }};
    documentListeners.click(event);
    return event;
  };
  const dispatchKeydown=(target,key)=>{
    const event={target,key,defaultPrevented:false,preventDefault(){ this.defaultPrevented=true; }};
    documentListeners.keydown(event);
    return event;
  };
  return {
    button,menu,firstItem,secondItem,stayOpenItem,secondButton,secondMenu,manager,controller,secondController,documentRef,dispatchClick,dispatchKeydown,
    createManager:window.BeforeworkActionMenu.create
  };
}

test("action menus expose shared semantics and open one menu at a time",()=>{
  const harness=createHarness();
  assert.equal(harness.button.getAttribute("aria-haspopup"),"menu");
  assert.equal(harness.button.getAttribute("aria-controls"),harness.menu.id);
  assert.equal(harness.menu.getAttribute("role"),"menu");
  assert.equal(harness.menu.classList.contains("menu"),true);
  assert.equal(harness.menu.classList.contains("action-menu"),true);
  assert.equal(harness.firstItem.classList.contains("menu-item"),true);
  assert.equal(harness.secondItem.classList.contains("menu-item"),true);
  assert.equal(harness.secondItem.classList.contains("menu-item--danger"),true);
  assert.equal(harness.secondItem.getAttribute("role"),"menuitem");
  assert.equal(harness.menu.hidden,true);

  const triggerEvent=harness.dispatchClick(harness.button);
  assert.equal(triggerEvent.propagationStopped,true);
  assert.equal(harness.menu.classList.contains("open"),true);
  assert.equal(harness.menu.hidden,false);
  assert.equal(harness.button.getAttribute("aria-expanded"),"true");
  assert.equal(harness.documentRef.activeElement,harness.firstItem);
  harness.secondController.open();
  assert.equal(harness.menu.hidden,true);
  assert.equal(harness.secondMenu.classList.contains("open"),true);
});

test("action menus handle dismissal, focus navigation, and stay-open actions",()=>{
  const harness=createHarness();
  harness.dispatchClick(harness.button);
  harness.dispatchClick(harness.stayOpenItem);
  assert.equal(harness.menu.classList.contains("open"),true);

  harness.documentRef.activeElement=harness.firstItem;
  assert.equal(harness.dispatchKeydown(harness.firstItem,"ArrowDown").defaultPrevented,true);
  assert.equal(harness.documentRef.activeElement,harness.secondItem);
  harness.dispatchKeydown(harness.secondItem,"End");
  assert.equal(harness.documentRef.activeElement,harness.stayOpenItem);

  harness.dispatchClick(harness.secondItem);
  assert.equal(harness.menu.hidden,true);
  assert.equal(harness.button.getAttribute("aria-expanded"),"false");

  harness.dispatchClick(harness.button);
  harness.dispatchKeydown(harness.firstItem,"Escape");
  assert.equal(harness.menu.hidden,true);
  assert.equal(harness.button.getAttribute("aria-expanded"),"false");
  assert.equal(harness.documentRef.activeElement,harness.button);

  harness.dispatchClick(harness.button);
  harness.dispatchKeydown(harness.firstItem,"Tab");
  assert.equal(harness.menu.hidden,true);
  assert.equal(harness.documentRef.activeElement,harness.button);
  harness.dispatchClick(harness.button);
  harness.dispatchClick(elementOutside());
  assert.equal(harness.menu.classList.contains("open"),false);
});

test("action menu factory shares a single delegated controller per document",()=>{
  const harness=createHarness();
  assert.equal(harness.manager,harness.createManager({documentRef:harness.documentRef}));
});
function elementOutside(){ return {closest(){ return null; }}; }
