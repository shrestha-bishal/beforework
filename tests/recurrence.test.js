"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");
const appScripts=require("./helpers/app-script-order");

const source=fs.readFileSync(path.join(__dirname,"../js/features/recurrence.js"),"utf8");
const index=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");
const app=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");

function createFeature(){
  const window={};
  vm.runInNewContext(source,{window},{filename:"recurrence.js"});
  return window.BeforeworkRecurrence.create();
}

function json(value){
  return JSON.parse(JSON.stringify(value));
}

test("recurrence feature loads before the app and owns recurrence rules",()=>{
  assert.ok(appScripts.indexOf("features/recurrence.js")<appScripts.indexOf("app.js"));
  assert.match(app,/recurrenceFeature=window\.BeforeworkRecurrence\.create\(\)/);
  assert.doesNotMatch(app,/function (normaliseRecurrence|recurrenceSummary|expandRecurringDates)\(/);
  assert.match(app,/function updateRecurrenceSummary\(/);
});

test("normalizes recurrence rules without mutating the input",()=>{
  const recurrence={frequency:"weekly",interval:0,unit:"week",byDay:["wed","mon","invalid","mon"],until:"2026-01-31",customText:""};
  const original=json(recurrence);
  const feature=createFeature();

  assert.deepEqual(json(feature.normalise(recurrence)),{
    frequency:"weekly",
    interval:1,
    unit:"week",
    byDay:["wed","mon","mon"],
    until:"2026-01-31",
    customText:""
  });
  assert.deepEqual(recurrence,original);
  assert.equal(feature.normalise(null),null);
  assert.equal(feature.normalise({frequency:"none"}),null);
  assert.deepEqual(json(feature.normalise({frequency:"unsupported",unit:"year"})),{
    frequency:"custom",
    interval:1,
    unit:"week",
    byDay:[],
    until:null,
    customText:""
  });
});

test("recurrence summaries retain supported frequency and weekday labels",()=>{
  const feature=createFeature();

  assert.equal(feature.summary(null),"Does not repeat");
  assert.equal(feature.summary({frequency:"daily",interval:2}),"Every 2 days");
  assert.equal(feature.summary({frequency:"weekly",byDay:["mon","wed"],until:"2026-01-31"}),
    "Every week on Mon, Wed · through 2026-01-31");
  assert.equal(feature.summary({frequency:"monthly",interval:1}),"Every month");
  assert.equal(feature.summary({frequency:"custom",unit:"week",interval:2,byDay:["fri"]}),
    "Every 2 weeks on Fri");
});

test("expands daily occurrences through the inclusive end date and preserves duration",()=>{
  const feature=createFeature();
  const occurrences=feature.expandDates("2026-01-01","2026-01-02",{
    frequency:"daily",
    interval:1,
    until:"2026-01-03"
  });

  assert.deepEqual(json(occurrences),[
    {date:"2026-01-01",endDate:"2026-01-02"},
    {date:"2026-01-02",endDate:"2026-01-03"},
    {date:"2026-01-03",endDate:"2026-01-04"}
  ]);
});

test("expands selected weekly weekdays from the start date and honors interval and until",()=>{
  const feature=createFeature();
  const occurrences=feature.expandDates("2026-01-07","2026-01-08",{
    frequency:"weekly",
    interval:1,
    byDay:["mon","wed"],
    until:"2026-01-14"
  });

  assert.deepEqual(json(occurrences),[
    {date:"2026-01-07",endDate:"2026-01-08"},
    {date:"2026-01-12",endDate:"2026-01-13"},
    {date:"2026-01-14",endDate:"2026-01-15"}
  ]);
});

test("monthly occurrences clamp short months and honor occurrence limits",()=>{
  const feature=createFeature();
  const occurrences=feature.expandDates("2026-01-31","2026-01-31",{
    frequency:"monthly",
    interval:1
  },3);

  assert.deepEqual(json(occurrences),[
    {date:"2026-01-31",endDate:"2026-01-31"},
    {date:"2026-02-28",endDate:"2026-02-28"},
    {date:"2026-03-31",endDate:"2026-03-31"}
  ]);
});

test("non-recurring and missing-start inputs preserve existing date ranges",()=>{
  const feature=createFeature();

  assert.deepEqual(json(feature.expandDates("2026-01-01","2026-01-03",null)),[
    {date:"2026-01-01",endDate:"2026-01-03"}
  ]);
  assert.deepEqual(json(feature.expandDates("2026-01-01","",{
    frequency:"none"
  })),[
    {date:"2026-01-01",endDate:"2026-01-01"}
  ]);
  assert.deepEqual(json(feature.expandDates("","",{
    frequency:"daily"
  })),[
    {date:"",endDate:""}
  ]);
});
