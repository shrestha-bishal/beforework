"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");

const template=fs.readFileSync(path.join(__dirname,"../pages/overview.html"),"utf8");
const view=fs.readFileSync(path.join(__dirname,"../js/views/overview-view.js"),"utf8");

test("overview dynamic markup is supplied by page templates",()=>{
  const templateIds=[
    "overviewStatTemplate",
    "overviewDividerTemplate",
    "overviewQuietTemplate",
    "overviewPriorityRowTemplate",
    "overviewProjectRowTemplate",
    "overviewFocusSummaryTemplate",
    "overviewFocusRowTemplate",
    "overviewWorkloadChartTemplate",
    "overviewStatusChartTemplate",
    "overviewTimelineDayTemplate",
    "overviewTimelineItemTemplate",
    "overviewRecentRowTemplate"
  ];

  for (const id of templateIds){
    assert.match(template,new RegExp(`<template id="${id}">`),`missing ${id}`);
    assert.ok(view.includes(`"${id}"`),`view does not use ${id}`);
  }
});

test("overview renderer populates elements instead of parsing generated HTML",()=>{
  assert.doesNotMatch(view,/\binnerHTML\b|insertAdjacentHTML/);
  assert.doesNotMatch(view,/`<\w/);
});
