"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");

const appStyles=fs.readFileSync(path.join(__dirname,"../styles/app.css"),"utf8");
const settingsStyles=fs.readFileSync(path.join(__dirname,"../styles/settings.css"),"utf8");
const settingsTemplate=fs.readFileSync(path.join(__dirname,"../pages/settings.html"),"utf8");
const stylesManifest=fs.readFileSync(path.join(__dirname,"../styles/manifest.css"),"utf8");

test("Settings page styles are isolated and included in the stylesheet manifest",()=>{
  assert.doesNotMatch(appStyles,/\.settings(?:Wrap|Intro|Grid|Section|SectionHead|Row|RecoveryEntry|Select)\b|#settingsRecoveryList|#board:has\(\.settingsWrap\)/);
  assert.match(settingsStyles,/\.settingsWrap/);
  assert.match(settingsStyles,/\.settingsRecoveryEntry/);
  assert.match(settingsStyles,/@container \(min-width:700px\)/);
  assert.match(stylesManifest,/@import url\("settings\.css"\);/);
  assert.match(stylesManifest,/@import url\("item-details\.css"\);/);
});

test("Settings cards share row heights while Storage has its own row",()=>{
  assert.match(settingsStyles,/\.settingsWrap\{container-type:inline-size;[^}]*max-width:1480px;\}/);
  assert.match(settingsStyles,/\.settingsGrid\{display:grid;grid-template-columns:1fr;gap:18px;\}/);
  assert.match(settingsStyles,/@container \(min-width:700px\)\{\s*\.settingsGrid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\);\}\s*\}/);
  assert.match(settingsStyles,/@container \(min-width:1050px\)\{\s*\.settingsGrid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\);\}\s*\}/);
  assert.match(settingsStyles,/\.settingsStorageSection\{margin-top:18px;\}/);
  assert.ok(settingsTemplate.indexOf("<h4>Tools</h4>")<settingsTemplate.indexOf("<h4>Reminders</h4>"));
  assert.match(settingsTemplate,/<\/div>\s*<section class="Box settingsSection settingsStorageSection" id="settingsStorageSection">/);
  assert.match(settingsTemplate,/<h4>Support Beforework<\/h4>/);
});
