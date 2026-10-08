"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const source=fs.readFileSync(path.join(__dirname,"../js/ui/operation-status.js"),"utf8");

function createClassList(){
  const classes=new Set();
  return {
    add:name=>classes.add(name),
    toggle(name,enabled){ if (enabled) classes.add(name); else classes.delete(name); },
    contains:name=>classes.has(name)
  };
}

function createStatus(){
  const root={hidden:false,classList:createClassList()};
  const label={textContent:""};
  const brand={hidden:false};
  const hint={hidden:false};
  const spinner={hidden:false};
  const progress={
    hidden:true,
    max:1,
    value:0,
    removeAttribute(name){ if (name==="value") delete this.value; }
  };
  root.querySelector=selector=>selector==="[data-operation-label]"?label
    :selector==="[data-operation-progress]"?progress
      :selector===".appOperationBrand"?brand
        :selector===".appOperationStatusHint"?hint
          :selector===".appOperationSpinner"?spinner:null;
  const sandbox={
    window:{
      document:{getElementById:id=>id==="appOperationStatus"?root:null},
      setTimeout,
      clearTimeout
    }
  };
  vm.runInNewContext(source,sandbox,{filename:"operation-status.js"});
  return {status:sandbox.window.BeforeworkOperationStatus.create(),root,label,progress,brand,hint,spinner};
}

test("operation status keeps startup branding out of compact busy states",()=>{
  const {status,root,label,progress,brand,hint,spinner}=createStatus();
  assert.equal(root.hidden,false);
  assert.equal(root.classList.contains("is-startup"),true);
  assert.equal(brand.hidden,false);
  assert.equal(spinner.hidden,true);

  status.finishStartup();
  assert.equal(root.hidden,true);
  assert.equal(brand.hidden,true);
  assert.equal(hint.hidden,true);

  const operation=status.begin("Importing workspace…");
  assert.equal(root.hidden,false);
  assert.equal(root.classList.contains("is-startup"),false);
  operation.update("Importing project 2 of 3",{completed:1,total:3});
  assert.equal(label.textContent,"Importing project 2 of 3");
  assert.equal(brand.hidden,true);
  assert.equal(hint.hidden,true);
  assert.equal(spinner.hidden,true);
  assert.equal(progress.hidden,false);
  assert.equal(progress.max,3);
  assert.equal(progress.value,1);

  operation.finish();
  assert.equal(root.hidden,true);

  const saving=status.begin("Saving changes…");
  assert.equal(spinner.hidden,false);
  assert.equal(progress.hidden,true);
  saving.finish();
});

test("finishing a delayed operation before its delay prevents a stale indicator",()=>{
  const {status,root}=createStatus();
  status.finishStartup();
  const operation=status.begin("Saving changes…",{delay:1000});
  operation.finish();
  assert.equal(root.hidden,true);
});
