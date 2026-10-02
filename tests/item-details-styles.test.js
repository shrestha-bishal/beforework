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
  assert.match(stylesManifest,/@import url\("item-details\.css"\);\s*$/);
});
