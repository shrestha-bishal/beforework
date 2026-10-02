"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const source=fs.readFileSync(path.join(__dirname,"../js/ui/project-actions-menu.js"),"utf8");
const app=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
const index=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");

function makeElement(id){
  const classes=new Set();
  const listeners={};
  return {
    id,
    onclick:null,
    listeners,
    classList:{
      add(name){ classes.add(name); },
      remove(name){ classes.delete(name); },
      contains(name){ return classes.has(name); },
      toggle(name){
        if (classes.has(name)){ classes.delete(name); return false; }
        classes.add(name);
        return true;
      }
    },
    addEventListener(name,callback){ listeners[name]=callback; }
  };
}

function createHarness(){
  const button=makeElement("projectMenuBtn");
  const menu=makeElement("projectMenu");
  const documentListeners={};
  const documentRef={
    getElementById(id){ return id==="projectMenuBtn" ? button : menu; },
    addEventListener(name,callback){ documentListeners[name]=callback; }
  };
  const window={};
  vm.runInNewContext(source,{window},{filename:"project-actions-menu.js"});
  const controller=window.BeforeworkProjectActionsMenu.create({documentRef});
  controller.wire();
  return {button,menu,documentListeners,controller};
}

test("project actions menu toggles its open state and active button state",()=>{
  const {button,menu}=createHarness();
  button.onclick({stopPropagation(){},currentTarget:button});
  assert.equal(menu.classList.contains("open"),true);
  assert.equal(button.classList.contains("active"),true);
  button.onclick({stopPropagation(){},currentTarget:button});
  assert.equal(menu.classList.contains("open"),false);
  assert.equal(button.classList.contains("active"),false);
});

test("project actions menu defaults to the global document when options are omitted",()=>{
  const button=makeElement("projectMenuBtn");
  const menu=makeElement("projectMenu");
  const documentRef={
    getElementById(id){ return id==="projectMenuBtn" ? button : menu; },
    addEventListener(){}
  };
  const window={document:documentRef};
  vm.runInNewContext(source,{window},{filename:"project-actions-menu.js"});
  const controller=window.BeforeworkProjectActionsMenu.create();

  assert.equal(typeof controller.wire,"function");
  assert.equal(typeof controller.close,"function");
});

test("selecting a project action closes the menu without replacing action handlers",()=>{
  const {button,menu}=createHarness();
  let actionCalled=false;
  const actionButton={onclick(){ actionCalled=true; }};
  button.onclick({stopPropagation(){},currentTarget:button});
  actionButton.onclick();
  menu.listeners.click({target:{closest:selector=>selector==="button" ? actionButton : null}});
  assert.equal(actionCalled,true);
  assert.equal(menu.classList.contains("open"),false);
  assert.equal(button.classList.contains("active"),false);
});

test("outside clicks and the print action close the project actions menu",()=>{
  const harness=createHarness();
  harness.button.onclick({stopPropagation(){},currentTarget:harness.button});
  harness.documentListeners.click({target:{closest:()=>null}});
  assert.equal(harness.menu.classList.contains("open"),false);
  harness.button.onclick({stopPropagation(){},currentTarget:harness.button});
  harness.controller.close();
  assert.equal(harness.button.classList.contains("active"),false);

  assert.match(app,/window\.BeforeworkProjectActionsMenu\.create\(/);
  assert.doesNotMatch(app,/document\.getElementById\("projectMenuBtn"\)\.onclick/);
  assert.ok(index.indexOf('src="js/ui/project-actions-menu.js"')<index.indexOf('src="js/app.js"'));
});
