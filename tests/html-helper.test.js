"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const source=fs.readFileSync(path.join(__dirname,"../js/helpers/html.js"),"utf8");

function createHelper(){
  const window={};
  vm.runInNewContext(source,{window},{filename:"html.js"});
  return window.BeforeworkHtml;
}

test("shared HTML helper escapes every HTML-sensitive character",()=>{
  const html=createHelper();

  assert.equal(html.escapeHtml(`<tag attr="x">&'`),"&lt;tag attr=&quot;x&quot;&gt;&amp;&#39;");
});

test("shared HTML helper preserves the existing String conversion behavior",()=>{
  const html=createHelper();

  assert.equal(html.escapeHtml(null),"null");
  assert.equal(html.escapeHtml(undefined),"undefined");
  assert.equal(html.escapeHtml(42),"42");
});
