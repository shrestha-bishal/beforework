"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const source=fs.readFileSync(path.join(__dirname,"../js/ui/connect-gate.js"),"utf8");
const app=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
const index=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");

function createHarness({windowRef={},pendingReconnectHandle=null,legacyData=false}={}){
  const elements=Object.fromEntries([
    "connectGate","gateNewBtn","gateOpenBtn","gateLegacyFileBtn","gateSupportedActions","gateUnsupported",
    "gateReconnectRow","gateFileName","gateLegacyRow","gateReconnectBtn","gateLegacyBtn"
  ].map(id=>[id,{
    hidden:false,
    textContent:"",
    style:{display:""},
    classList:{
      classes:new Set(),
      add(name){ this.classes.add(name); },
      remove(name){ this.classes.delete(name); }
    }
  }]));
  const documentRef={getElementById:id=>elements[id]};
  const calls=[];
  let connected=false;
  let syncStatus="No workspace connected.";
  const actions={
    createWorkspace:async()=>calls.push("create"),
    openWorkspace:async()=>calls.push("open"),
    openLegacyFile:async()=>calls.push("open-legacy"),
    reconnect:()=>calls.push("reconnect"),
    migrateLegacyData:()=>calls.push("migrate")
  };
  const window={};
  vm.runInNewContext(source,{window},{filename:"connect-gate.js"});
  const gate=window.BeforeworkConnectGate.create({
    documentRef,
    windowRef,
    getSyncStatusText:()=>syncStatus,
    setSyncStatus:value=>{ syncStatus=value; },
    getPendingReconnectHandle:()=>pendingReconnectHandle,
    hasLegacyData:()=>legacyData,
    hasConnectedWorkspace:()=>connected,
    actions
  });
  return {
    elements,gate,calls,actions,
    get syncStatus(){ return syncStatus; },
    set connected(value){ connected=value; }
  };
}

test("connect gate shows only supported actions and available recovery options",()=>{
  const harness=createHarness({
    windowRef:{showDirectoryPicker(){},showOpenFilePicker(){},showSaveFilePicker(){}},
    pendingReconnectHandle:{name:"work.beforework"},
    legacyData:true
  });
  harness.gate.show();

  assert.equal(harness.elements.connectGate.classList.classes.has("open"),true);
  assert.equal(harness.elements.gateNewBtn.hidden,false);
  assert.equal(harness.elements.gateOpenBtn.hidden,false);
  assert.equal(harness.elements.gateLegacyFileBtn.hidden,false);
  assert.equal(harness.elements.gateSupportedActions.style.display,"flex");
  assert.equal(harness.elements.gateUnsupported.style.display,"none");
  assert.equal(harness.elements.gateReconnectRow.style.display,"block");
  assert.equal(harness.elements.gateFileName.textContent,"work.beforework");
  assert.equal(harness.elements.gateLegacyRow.style.display,"block");
  assert.equal(harness.syncStatus,"No workspace folder connected. Create or open one, or choose an older JSON workspace.");
});

test("connect gate explains unsupported browsers and wires workspace actions",async()=>{
  const harness=createHarness();
  harness.gate.wire();
  harness.gate.show();

  assert.equal(harness.elements.gateNewBtn.hidden,true);
  assert.equal(harness.elements.gateOpenBtn.hidden,true);
  assert.equal(harness.elements.gateLegacyFileBtn.hidden,true);
  assert.equal(harness.elements.gateSupportedActions.style.display,"none");
  assert.equal(harness.elements.gateUnsupported.style.display,"block");
  assert.equal(harness.elements.gateReconnectRow.style.display,"none");
  assert.equal(harness.elements.gateLegacyRow.style.display,"none");

  harness.connected=true;
  await harness.elements.gateNewBtn.onclick();
  assert.deepEqual(harness.calls,["create"]);
  assert.equal(harness.elements.connectGate.classList.classes.has("open"),false);

  harness.connected=false;
  await harness.elements.gateOpenBtn.onclick();
  assert.deepEqual(harness.calls,["create","open"]);
  assert.equal(harness.elements.connectGate.classList.classes.has("open"),true);
  harness.elements.gateLegacyFileBtn.onclick();
  harness.elements.gateReconnectBtn.onclick();
  harness.elements.gateLegacyBtn.onclick();
  assert.deepEqual(harness.calls,["create","open","open-legacy","reconnect","migrate"]);
});

test("app delegates connect gate behavior to its UI module",()=>{
  assert.match(app,/window\.BeforeworkConnectGate\.create\(/);
  assert.match(app,/function hideConnectGate\(\)\s*\{\s*connectGate\.hide\(\);\s*\}/);
  assert.doesNotMatch(app,/function wireConnectGate/);
  assert.ok(index.indexOf('src="js/ui/connect-gate.js"')<index.indexOf('src="js/app.js"'));
});
