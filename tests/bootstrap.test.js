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
  assert.match(index,/<a class="btn btn-sm btn-primary demoTryLink" id="tryBeforeworkLink" href="https:\/\/beforework\.netlify\.app\/" target="_blank" rel="noopener noreferrer" hidden>Try Beforework<\/a>/);
  assert.match(app,/window\.BEFOREWORK_CONFIG\.initialWorkspace==="demo"/);
  assert.match(app,/tryBeforeworkLink\.hidden=false/);
  assert.ok(index.indexOf('src="js/app.js"')<index.indexOf('src="js/bootstrap.js"'));
});
