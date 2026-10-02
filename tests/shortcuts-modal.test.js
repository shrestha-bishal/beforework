"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const source=fs.readFileSync(path.join(__dirname,"../js/ui/shortcuts-modal.js"),"utf8");
const appSource=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
const templateSource=fs.readFileSync(path.join(__dirname,"../pages/shortcuts-modal.html"),"utf8");

function createHarness(){
  const buttons=[{},{}];
  const content={
    querySelectorAll(){ return buttons; }
  };
  let opened;
  const closed=[];
  let cloneCalls=0;
  const modal={
    open(options){ opened=options; },
    close(id){ closed.push(id); }
  };
  const window={};
  vm.runInNewContext(source,{window},{filename:"shortcuts-modal.js"});
  const shortcuts=window.BeforeworkShortcutsModal.create({
    modal,
    cloneTemplate(){
      cloneCalls++;
      return content;
    }
  });
  return {shortcuts,buttons,content,getOpened:()=>opened,closed,getCloneCalls:()=>cloneCalls};
}

test("shortcuts modal clones external markup and wires it through the shared modal component",()=>{
  const harness=createHarness();
  harness.shortcuts.open();

  const {content,onBackdrop,id}=harness.getOpened();
  assert.equal(id,"shortcutsOverlay");
  assert.equal(content,harness.content);
  assert.equal(harness.getCloneCalls(),1);
  assert.equal(harness.buttons.length,2);

  harness.buttons[0].onclick();
  assert.deepEqual(harness.closed,["shortcutsOverlay"]);
  onBackdrop();
  assert.deepEqual(harness.closed,["shortcutsOverlay","shortcutsOverlay"]);
});

test("shortcuts modal markup lives in its external HTML template",()=>{
  assert.match(templateSource,/Keyboard shortcuts/);
  assert.match(templateSource,/Ctrl\/⌘ \+ K/);
  assert.equal((templateSource.match(/class="shortcutRow"/g)||[]).length,9);
  assert.doesNotMatch(source,/shortcutRow|Keyboard shortcuts/);
});

test("app keeps the shortcuts trigger and injects the template clone",()=>{
  assert.match(appSource,/window\.BeforeworkShortcutsModal\.create\(\{[\s\S]*?cloneTemplate:\(\)=>window\.BeforeworkViewTemplates\.clone\("shortcutsModal"\)/);
  assert.match(appSource,/function showShortcutsModal\(\)\{\s*shortcutsModal\.open\(\);\s*\}/);
});

test("shortcuts modal requires the shared modal component",()=>{
  const {window}=(()=> {
    const localWindow={};
    vm.runInNewContext(source,{window:localWindow},{filename:"shortcuts-modal.js"});
    return {window:localWindow};
  })();
  assert.throws(()=>window.BeforeworkShortcutsModal.create({}),/requires the shared modal component/);
  assert.throws(()=>window.BeforeworkShortcutsModal.create({modal:{open(){},close(){}}}),/requires a template clone function/);
});
