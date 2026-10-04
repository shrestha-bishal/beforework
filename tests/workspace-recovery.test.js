"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const errorUtilsSource=fs.readFileSync(path.join(__dirname,"../js/core/error-utils.js"),"utf8");
const source=fs.readFileSync(path.join(__dirname,"../js/services/storage/workspace-recovery.js"),"utf8");

function createRecovery(overrides={}){
  const notices=[];
  const confirmations=[];
  const snapshots=[];
  const replacements=[];
  const migrationBackup={savedAt:1000,fromVersion:1,data:{projects:[],schemaVersion:1}};
  let state={projects:[{id:"current"}],schemaVersion:2};
  let migrationInfo=null;
  const storage={
    getRecoverySnapshots:()=>snapshots,
    saveRecoverySnapshot:async(data,reason)=>snapshots.push({data,reason})
  };
  const dependencies={
    getState:()=>state,
    setState:value=>{state=value;},
    isConnected:()=>true,
    getSchemaVersion:()=>2,
    migrateState:value=>({...value,migrated:true}),
    schemaMigration:{
      takeMigrationInfo:()=>{const value=migrationInfo;migrationInfo=null;return value;},
      hasBackup:()=>!!migrationBackup,
      readBackup:()=>migrationBackup
    },
    storage,
    validation:{validate:()=>({valid:true,errors:[]})},
    showNotice:async(...args)=>notices.push(args),
    showConfirm:async(...args)=>{confirmations.push(args);return true;},
    onWorkspaceReplaced:kind=>replacements.push(kind),
    ...overrides
  };
  const sandbox={window:{Blob,URL,document:{createElement:()=>({click(){}})},setTimeout}};
  vm.runInNewContext(errorUtilsSource,sandbox,{filename:"error-utils.js"});
  vm.runInNewContext(source,sandbox,{filename:"workspace-recovery.js"});
  return {
    recovery:sandbox.window.BeforeworkWorkspaceRecovery.create(dependencies),
    notices,confirmations,snapshots,replacements,
    getState:()=>state,setMigrationInfo:value=>{migrationInfo=value;}
  };
}

test("imports validate and protect the current workspace before replacement",async()=>{
  const fixture=createRecovery();
  await fixture.recovery.importJSON({text:async()=>JSON.stringify({projects:[{id:"imported"}],schemaVersion:2})});

  assert.deepEqual(fixture.snapshots.map(snapshot=>snapshot.reason),["pre-import"]);
  assert.equal(JSON.parse(fixture.snapshots[0].data).projects[0].id,"current");
  assert.equal(fixture.getState().projects[0].id,"imported");
  assert.equal(fixture.getState().migrated,true);
  assert.deepEqual(fixture.replacements,["import"]);
});

test("import cancellation and invalid workspaces do not replace state",async()=>{
  const cancelled=createRecovery({showConfirm:async()=>false});
  await cancelled.recovery.importJSON({text:async()=>JSON.stringify({projects:[]})});
  assert.equal(cancelled.getState().projects[0].id,"current");
  assert.deepEqual(cancelled.snapshots,[]);

  const invalid=createRecovery({validation:{validate:()=>({valid:false,errors:["invalid project"]})}});
  await invalid.recovery.importJSON({text:async()=>JSON.stringify({projects:[]})});
  assert.equal(invalid.getState().projects[0].id,"current");
  assert.match(invalid.notices[0][1],/invalid project/);
});

test("recovery restore validates and snapshots before replacing workspace",async()=>{
  const fixture=createRecovery();
  fixture.snapshots.push({id:"saved",savedAt:1000,data:JSON.stringify({projects:[{id:"restored"}]})});
  await fixture.recovery.restoreRecoverySnapshot("saved");

  assert.deepEqual(fixture.snapshots.filter(snapshot=>snapshot.reason).map(snapshot=>snapshot.reason),["pre-restore"]);
  assert.equal(fixture.getState().projects[0].id,"restored");
  assert.equal(fixture.getState().migrated,true);
  assert.deepEqual(fixture.replacements,["recovery-restore"]);
});

test("migration-backup restore preserves its older schema version and reports upgrade notices",async()=>{
  const fixture=createRecovery();
  await fixture.recovery.restoreMigrationBackup();
  assert.equal(fixture.getState().schemaVersion,1);
  assert.deepEqual(fixture.replacements,["migration-restore"]);
  assert.deepEqual(fixture.snapshots.map(snapshot=>snapshot.reason),["pre-migration-restore"]);

  fixture.setMigrationInfo({fromVersion:1,toVersion:2});
  await fixture.recovery.maybeShowMigrationNotice();
  assert.match(fixture.notices[0][1],/format v1/);
});
