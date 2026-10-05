"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const manifestSource=fs.readFileSync(path.join(__dirname,"../js/manifest.js"),"utf8");
const manifest=require("./helpers/app-script-order");

test("app manifest contains each app dependency once and ends with bootstrap",()=>{
  assert.equal(new Set(manifest).size,manifest.length);
  assert.equal(manifest.at(-2),"app.js");
  assert.equal(manifest.at(-1),"bootstrap.js");
  assert.ok(manifest.includes("services/csv-export.js"));
  assert.match(manifestSource,/^import "\.\/core\/error-utils\.js";/);
  assert.match(manifestSource,/^import "\.\/bootstrap\.js";\s*$/m);
  assert.doesNotMatch(manifestSource,/^import\(["']/m);
});
