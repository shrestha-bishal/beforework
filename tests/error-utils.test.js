"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const source=fs.readFileSync(path.join(__dirname,"../js/core/error-utils.js"),"utf8");
const sandbox={window:{}};
vm.runInNewContext(source,sandbox,{filename:"error-utils.js"});
const getMessage=sandbox.window.BeforeworkErrorUtils.getMessage;

test("normalizes errors, primitive throws, and fallback values",()=>{
  assert.equal(getMessage(new Error("Broken")), "Broken");
  assert.equal(getMessage("  Failed  "), "Failed");
  assert.equal(getMessage({name:"NotFoundError"}), "NotFoundError");
  assert.equal(getMessage({code:12}), '{"code":12}');
  assert.equal(getMessage(null), "Unknown error");
  assert.equal(getMessage("", "Custom fallback"), "Custom fallback");
});

test("uses fallback when inspecting a thrown value itself fails",()=>{
  const thrown=new Proxy({},{
    get(){ throw new Error("blocked"); },
    getOwnPropertyDescriptor(){ throw new Error("blocked"); }
  });
  assert.equal(getMessage(thrown, "Operation failed"), "Operation failed");
});
