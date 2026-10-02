"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const source=fs.readFileSync(path.join(__dirname,"../js/ui/project-create-menu.js"),"utf8");
const app=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
const index=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");

function makeElement(id){
  const classes=new Set();
  const listeners={};
  return {
    id,
    onclick:null,
    attributes:{},
    listeners,
    classList:{
      add(name){ classes.add(name); },
      remove(name){ classes.delete(name); },
      contains(name){ return classes.has(name); },
      toggle(name,force){
        const enabled=force===undefined ? !classes.has(name) : force;
        if (enabled) classes.add(name);
        else classes.delete(name);
        return enabled;
      }
    },
    setAttribute(name,value){ this.attributes[name]=value; },
    addEventListener(name,callback){ listeners[name]=callback; }
  };
}

function createHarness(){
  const elements=Object.fromEntries([
    "projectCreateBtn","projectCreateMenu","addProjectBtn","importProjectBtn","addFolderBtn"
  ].map(id=>[id,makeElement(id)]));
  const actions=[];
  const documentListeners={};
  const documentRef={
    getElementById:id=>elements[id],
    addEventListener(name,callback){ documentListeners[name]=callback; }
  };
  const window={};
  vm.runInNewContext(source,{window},{filename:"project-create-menu.js"});
  const menu=window.BeforeworkProjectCreateMenu.create({
    documentRef,
    actions:{
      createProject:()=>actions.push("project"),
      importProject:()=>actions.push("import"),
      createFolder:()=>actions.push("folder")
    }
  });
  menu.wire();
  return {elements,actions,documentListeners,menu};
}

test("project creation menu synchronizes open state and accessibility attributes",()=>{
  const {elements}=createHarness();
  const event={stopPropagation(){}};
  elements.projectCreateBtn.onclick(event);
  assert.equal(elements.projectCreateMenu.classList.contains("open"),true);
  assert.equal(elements.projectCreateBtn.classList.contains("active"),true);
  assert.equal(elements.projectCreateBtn.attributes["aria-expanded"],"true");
  elements.projectCreateBtn.onclick(event);
  assert.equal(elements.projectCreateMenu.classList.contains("open"),false);
  assert.equal(elements.projectCreateBtn.classList.contains("active"),false);
  assert.equal(elements.projectCreateBtn.attributes["aria-expanded"],"false");
});

test("menu actions close the menu and invoke the corresponding app callback",()=>{
  const {elements,actions}=createHarness();
  for (const [index,[id,action]] of [
    ["addProjectBtn","project"],
    ["importProjectBtn","import"],
    ["addFolderBtn","folder"]
  ].entries()){
    elements.projectCreateMenu.listeners.click({
      target:{closest:selector=>selector==="button" ? elements[id] : null}
    });
    assert.equal(actions[index],action);
    assert.equal(elements.projectCreateMenu.classList.contains("open"),false);
    elements.projectCreateBtn.onclick({stopPropagation(){}});
  }
});

test("outside clicks dismiss the menu and app delegates its UI wiring",()=>{
  const harness=createHarness();
  harness.elements.projectCreateBtn.onclick({stopPropagation(){}});
  harness.documentListeners.click({target:{closest:()=>null}});
  assert.equal(harness.elements.projectCreateMenu.classList.contains("open"),false);
  assert.equal(harness.elements.projectCreateBtn.attributes["aria-expanded"],"false");

  assert.match(app,/window\.BeforeworkProjectCreateMenu\.create\(/);
  assert.doesNotMatch(app,/projectCreateBtn\.onclick/);
  assert.ok(index.indexOf('src="js/ui/project-create-menu.js"')<index.indexOf('src="js/app.js"'));
});
