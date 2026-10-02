"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");

const appStyles=fs.readFileSync(path.join(__dirname,"../styles/app.css"),"utf8");
const supportStyles=fs.readFileSync(path.join(__dirname,"../styles/support.css"),"utf8");
const indexHtml=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");
const stylesManifest=fs.readFileSync(path.join(__dirname,"../styles/manifest.css"),"utf8");

test("Support page styles are isolated and included after shared application styles",()=>{
  assert.doesNotMatch(appStyles,/\.support(?:Wrap|Page|Eyebrow|Intro|Details|SectionIcon|Impact|Offer|Actions|ActionOption|Thanks)\b|#board:has\(\.supportWrap\)/);
  assert.match(supportStyles,/\.supportWrap/);
  assert.match(supportStyles,/\.supportActions/);
  assert.match(supportStyles,/@media \(max-width:700px\)/);
  assert.match(appStyles,/\.typeTabs/);
  assert.match(stylesManifest,/@import url\("support\.css"\);\s*$/);
  assert.match(indexHtml,/<link rel="stylesheet" href="styles\/manifest\.css">/);
  assert.doesNotMatch(indexHtml,/href="styles\/(?:app|focus-timer|support)\.css"/);
});
