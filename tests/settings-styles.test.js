"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");

const appStyles=fs.readFileSync(path.join(__dirname,"../styles/app.css"),"utf8");
const settingsStyles=fs.readFileSync(path.join(__dirname,"../styles/settings.css"),"utf8");
const stylesManifest=fs.readFileSync(path.join(__dirname,"../styles/manifest.css"),"utf8");

test("Settings page styles are isolated and included in the stylesheet manifest",()=>{
  assert.doesNotMatch(appStyles,/\.settings(?:Wrap|Intro|Grid|Section|SectionHead|Row|RecoveryEntry|Select)\b|#settingsRecoveryList|#board:has\(\.settingsWrap\)/);
  assert.match(settingsStyles,/\.settingsWrap/);
  assert.match(settingsStyles,/\.settingsRecoveryEntry/);
  assert.match(settingsStyles,/@media \(max-width:700px\)/);
  assert.match(stylesManifest,/@import url\("settings\.css"\);/);
  assert.match(stylesManifest,/@import url\("item-details\.css"\);\s*$/);
});
