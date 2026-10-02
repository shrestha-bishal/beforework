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
  const itemModalHeaderRule=appStyles.match(/\.itemModalHeader\{[^}]+\}/)?.[0]||"";
  assert.ok(itemModalHeaderRule);
  assert.doesNotMatch(itemModalHeaderRule,/border-bottom/);
  assert.match(itemDetailsStyles,/\.itemDescriptionEditor\{width:100%;min-width:0;\}/);
  assert.match(itemDetailsStyles,/#itemDescInput,\.itemDescriptionPreview\{display:block;width:100%;min-width:0;box-sizing:border-box;\}/);
  assert.match(itemDetailsStyles,/\.itemDescriptionPreview\{min-height:48px;padding:14px;border:0;background:transparent/);
  assert.match(itemDetailsStyles,/#itemDescInput\[hidden\],\.itemDescriptionPreview\[hidden\]\{display:none!important;\}/);
  assert.match(itemDetailsStyles,/\.itemDescriptionCard\{overflow:visible;border:1px solid var\(--border\);border-radius:10px;background:var\(--bg\);transition:border-color \.16s ease;\}/);
  assert.doesNotMatch(itemDetailsStyles,/\.itemDescriptionCard:focus-within/);
  assert.match(itemDetailsStyles,/\.itemDescriptionMenuButton iconify-icon\{font-size:18px;\}/);
  assert.match(itemDetailsStyles,/\.itemDescriptionMenuButton:focus-visible\{outline:2px solid var\(--accent\);outline-offset:2px;\}/);
  assert.match(itemDetailsStyles,/\.itemDescriptionCopyStatus\{position:absolute;width:1px;height:1px/);
  assert.match(itemDetailsStyles,/\.itemMarkdownToolbar\{display:flex;align-items:center;justify-content:space-between/);
  assert.match(itemDetailsStyles,/\.itemMarkdownTools button:hover\{background:var\(--bg\);color:var\(--text\);\}/);
  assert.match(itemDetailsStyles,/\.itemDescriptionEditControls\{display:flex;justify-content:flex-end;gap:8px;margin-top:-2px;padding:0 2px;\}/);
  assert.match(itemDetailsStyles,/#itemDescInput\{height:220px;min-height:180px;max-height:45vh;padding:12px 14px/);
  assert.match(appStyles,/\.itemModalActions\{position:relative;display:flex;align-items:center;gap:2px/);
});

test("subitems use a compact progress header, structured rows, and a clear add action",()=>{
  const appSource=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
  const itemModalTemplate=fs.readFileSync(path.join(__dirname,"../pages/item-modal.html"),"utf8");
  assert.match(itemModalTemplate,/class="mainSection subitemsSection"/);
  assert.match(itemModalTemplate,/class="mainSectionHead subitemsSectionHead"/);
  assert.match(itemModalTemplate,/class="btn btn-invisible btn-sm subitemAddButton"/);
  assert.match(appSource,/aria-label="Subitem completion" aria-valuemin="0"/);
  assert.match(itemDetailsStyles,/\.subitemsProgressRing\{display:block;width:18px;height:18px;flex:none;transform:rotate\(-90deg\);\}/);
  assert.match(itemDetailsStyles,/\.subitemsProgressValue\{stroke:var\(--color-success-fg\);stroke-dasharray:50\.265;stroke-dashoffset:var\(--subitems-progress-offset,50\.265\);stroke-linecap:round;animation:subitemsProgressFill/);
  assert.match(appSource,/--subitems-progress-offset:\$\{\(1-subPct\/100\)\*50\.265\}/);
  assert.match(itemDetailsStyles,/animation:subitemsProgressFill \.55s cubic-bezier\(\.2,\.7,\.3,1\) both/);
  assert.doesNotMatch(appSource,/\$\{subPct\}%<\/span>/);
  assert.match(itemDetailsStyles,/#subitemsList \.subitemRow:hover\{border-color:var\(--border\);background:var\(--bg-soft\);\}/);
  assert.match(itemDetailsStyles,/\.subitemAddButton:hover\{background:var\(--bg-soft\);color:var\(--accent-strong\);\}/);
});
