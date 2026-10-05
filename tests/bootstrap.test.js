"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const bootstrap=fs.readFileSync(path.join(__dirname,"../js/bootstrap.js"),"utf8");
const app=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
const index=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");

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
  const errorUtils=index.indexOf('src="js/core/error-utils.js"');
  assert.ok(errorUtils>=0);
  assert.ok(index.indexOf('src="js/helpers/date-time.js"')>errorUtils);
  assert.ok(index.indexOf('src="js/helpers/html.js"')>errorUtils);
  assert.ok(index.indexOf('src="js/helpers/html.js"')<index.indexOf('src="js/app.js"'));
  assert.ok(index.indexOf('src="js/features/recurrence.js"')<index.indexOf('src="js/app.js"'));
  for (const script of [
    'src="js/services/storage/storage.js"',
    'src="js/services/storage/workspace-recovery.js"',
    'src="js/services/google-calendar/google-calendar.js"',
    'src="js/app.js"'
  ]) assert.ok(errorUtils<index.indexOf(script),`${script} must load after the shared error utility`);
  assert.match(index,/<a class="btn btn-sm btn-primary demoTryLink" id="tryBeforeworkLink" href="https:\/\/beforework\.netlify\.app\/" target="_blank" rel="noopener noreferrer" hidden>Use your own workspace<\/a>/);
  assert.match(index,/<button class="btn btn-sm demoTryLink" id="resetDemoBtn" type="button" hidden>Reset demo<\/button>/);
  assert.match(app,/const demoMode=window\.BEFOREWORK_CONFIG\.initialWorkspace==="demo"/);
  assert.match(app,/tryBeforeworkLink\.hidden=false/);
  assert.match(app,/workspaceSwitcherButton\.disabled=true/);
  assert.match(app,/loadDemoWorkspace\(defaultState\(\)\)/);
  assert.match(app,/async function resetDemoWorkspace\(\)/);
  assert.ok(index.indexOf('src="js/app.js"')<index.indexOf('src="js/bootstrap.js"'));
});
