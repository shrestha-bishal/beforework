"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");

const appStyles=fs.readFileSync(path.join(__dirname,"../styles/app.css"),"utf8");
const calendarStyles=fs.readFileSync(path.join(__dirname,"../styles/calendar.css"),"utf8");
const stylesManifest=fs.readFileSync(path.join(__dirname,"../styles/manifest.css"),"utf8");

test("Calendar styles, including responsive and print rules, are isolated in the manifest",()=>{
  assert.doesNotMatch(appStyles,/\.calendar(?:Wrap|Toolbar|Grid|Weekday|Day|Event|Context|Empty|Sync|DateTimeGroup|LocationRow)\b|#board:has\(\.calendarWrap\)/);
  assert.match(calendarStyles,/\.calendarGrid/);
  assert.match(calendarStyles,/\.calendarContextPopover/);
  assert.match(calendarStyles,/@media print[\s\S]*\.calendarWrap/);
  assert.match(calendarStyles,/@media \(max-width:480px\)[\s\S]*\.calendarEvent \.eventProject/);
  assert.match(stylesManifest,/@import url\("calendar\.css"\);/);
  assert.match(stylesManifest,/@import url\("documents\.css"\);\s*$/);
  assert.match(appStyles,/#calendarNav/);
});
