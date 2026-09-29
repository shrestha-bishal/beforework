"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname,"../js/models/overview-details-model.js"),"utf8")
  .replace("export class OverviewDetailsModel", "class OverviewDetailsModel") +
  "\nwindow.OverviewDetailsModel = OverviewDetailsModel;";
const sandbox = {window:{}};
vm.runInNewContext(source,sandbox,{filename:"overview-details-model.js"});
const OverviewDetailsModel = sandbox.window.OverviewDetailsModel;

test("searches overview entries by title and metadata", ()=>{
  const model = new OverviewDetailsModel();
  const entries = [
    {title:"Launch checklist",meta:"Product / Planning"},
    {title:"Review calendar",meta:"Operations / Today"},
    {title:"Release notes",meta:"Product / Completed"}
  ];

  assert.deepEqual(model.searchEntries(entries,"PRODUCT launch"),[entries[0]]);
  assert.deepEqual(model.searchEntries(entries,"review today"),[entries[1]]);
  assert.deepEqual(model.searchEntries(entries,"   "),entries);
});