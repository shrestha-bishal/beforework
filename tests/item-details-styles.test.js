"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");

const appStyles=fs.readFileSync(path.join(__dirname,"../styles/app.css"),"utf8");
const itemDetailsStyles=fs.readFileSync(path.join(__dirname,"../styles/item-details.css"),"utf8");
const stylesManifest=fs.readFileSync(path.join(__dirname,"../styles/manifest.css"),"utf8");

test("item comments and activity styles are isolated and included in the manifest",()=>{
  assert.doesNotMatch(appStyles,/#[Cc]ommentsList|\.comment(?:Row|Body|Meta|Text|Empty)\b|\.itemDetail(?:Tabs|Tab|Panel)\b|#activityList|\.activity(?:Row|Meta|Badge)\b/);
  assert.match(itemDetailsStyles,/#commentsList/);
  assert.match(itemDetailsStyles,/#activityList/);
  assert.match(itemDetailsStyles,/\.itemDetailTabs/);
  assert.match(stylesManifest,/@import url\("item-details\.css"\);/);
});

test("Markdown description editor and preview fill the available column width",()=>{
  assert.match(itemDetailsStyles,/\.itemDescriptionEditor\{width:100%;min-width:0;\}/);
  assert.match(itemDetailsStyles,/#itemDescInput,\.itemDescriptionPreview\{display:block;width:100%;min-width:0;box-sizing:border-box;\}/);
  assert.match(itemDetailsStyles,/\.itemDescriptionPreview\{min-height:48px;padding:14px;border:0;background:transparent/);
  assert.match(itemDetailsStyles,/#itemDescInput\[hidden\],\.itemDescriptionPreview\[hidden\]\{display:none!important;\}/);
  assert.match(itemDetailsStyles,/\.itemDescriptionCard\{overflow:visible;border:1px solid var\(--border\);border-radius:10px;background:var\(--bg\);transition:border-color/);
  assert.match(itemDetailsStyles,/\.itemDescriptionCard:focus-within\{border-color:var\(--accent\);box-shadow:0 0 0 2px var\(--accent-soft\);\}/);
  assert.match(itemDetailsStyles,/\.itemDescriptionMenuButton iconify-icon\{font-size:18px;\}/);
  assert.match(itemDetailsStyles,/\.itemDescriptionMenuButton:focus-visible\{outline:2px solid var\(--accent\);outline-offset:2px;\}/);
  assert.match(itemDetailsStyles,/\.itemDescriptionCopyStatus\{position:absolute;width:1px;height:1px/);
  assert.match(appStyles,/\.itemModalActions\{position:relative;display:flex;align-items:center;gap:2px/);
});
