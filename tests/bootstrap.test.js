"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");
const appScripts=require("./helpers/app-script-order");

const bootstrap=fs.readFileSync(path.join(__dirname,"../js/bootstrap.js"),"utf8");
const app=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
const index=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");
const build=fs.readFileSync(path.join(__dirname,"../scripts/build-site.js"),"utf8");

test("bootstrap is the single application startup entry point",()=>{
  const calls=[];
  const startPromise=Promise.resolve();
  const window={
    BeforeworkApp:{start(options){ calls.push(options); return startPromise; }}
  };
  vm.runInNewContext(bootstrap,{window},{filename:"bootstrap.js"});

  assert.equal(calls.length,1);
  assert.equal(typeof calls[0].loadViewModules,"function");
  assert.equal(window.BeforeworkBootstrap.start(),startPromise);
  assert.equal(calls.length,1);
  assert.match(app,/window\.BeforeworkApp\s*=\s*\{/);
  assert.doesNotMatch(app,/\bboot\(\);/);
  assert.doesNotMatch(app,/BeforeworkBootstrap/);
  assert.match(app,/await loadViewModules\(\)/);
  assert.ok(app.indexOf('await window.BeforeworkViewTemplates.load("dateTimePickers")')<app.indexOf("dateTimePickers.enhanceDateInputs()"));
  const errorUtils=appScripts.indexOf("core/error-utils.js");
  assert.ok(errorUtils>=0);
  const position=file=>appScripts.indexOf(file);
  const appPosition=position("app.js");
  assert.ok(position("helpers/date-time.js")>errorUtils);
  assert.ok(position("helpers/html.js")>errorUtils);
  assert.ok(position("helpers/date-time.js")<position("ui/date-time-picker.js"));
  assert.ok(position("ui/date-time-picker.js")<appPosition);
  assert.ok(position("ui/select-control.js")<appPosition);
  assert.ok(position("ui/select-control.js")>position("helpers/html.js"));
  assert.ok(position("services/csv-import.js")<position("ui/csv-import-dialog.js"));
  assert.ok(position("services/csv-export.js")<appPosition);
  assert.ok(position("ui/csv-import-dialog.js")<appPosition);
  assert.ok(position("ui/templates.js")<appPosition);
  assert.ok(position("helpers/html.js")<appPosition);
  assert.ok(position("features/recurrence.js")<appPosition);
  for (const script of [
    "services/storage/storage.js",
    "services/storage/workspace-recovery.js",
    "services/google-calendar/google-calendar.js",
    "app.js"
  ]) assert.ok(errorUtils<position(script),`${script} must load after the shared error utility`);
  assert.equal(index.match(/<script type="module" src="js\/manifest\.js"><\/script>/g)?.length,1);
  assert.match(build,/src="js\/app\.min\.js"/);
  assert.match(index,/<a class="btn btn-sm btn-primary demoTryLink" id="tryBeforeworkLink" href="https:\/\/beforework\.netlify\.app\/" target="_blank" rel="noopener noreferrer" hidden>Use your own workspace<\/a>/);
  assert.match(index,/<button class="btn btn-sm demoTryLink" id="resetDemoBtn" type="button" hidden>Reset demo<\/button>/);
  assert.match(app,/const demoMode=window\.BEFOREWORK_CONFIG\.initialWorkspace==="demo"/);
  assert.match(app,/tryBeforeworkLink\.hidden=false/);
  assert.match(app,/workspaceSwitcherButton\.disabled=true/);
  assert.match(app,/loadDemoWorkspace\(defaultState\(\)\)/);
  assert.match(app,/async function resetDemoWorkspace\(\)/);
  assert.ok(appPosition<position("bootstrap.js"));
});
