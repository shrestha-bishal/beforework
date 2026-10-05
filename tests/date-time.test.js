"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const source=fs.readFileSync(path.join(__dirname,"../js/helpers/date-time.js"),"utf8");
const TIME_FORMAT_KEY="personal_dashboard_time_format_v1";

function createDateTime({preferences={},now}={}){
  const values=new Map(Object.entries(preferences));
  const storage={
    getItem(key){ return values.get(key)||null; },
    setItem(key,value){ values.set(key,String(value)); }
  };
  const window={localStorage:storage};
  vm.runInNewContext(source,{window},{filename:"date-time.js"});
  return {
    dateTime:window.BeforeworkDateTime.create({storage,now}),
    values
  };
}

test("time format preference reads and writes through the injected storage",()=>{
  const {dateTime,values}=createDateTime({preferences:{[TIME_FORMAT_KEY]:"24"}});

  assert.equal(dateTime.getTimeFormat(),"24");
  dateTime.setTimeFormat("12");
  assert.equal(values.get(TIME_FORMAT_KEY),"12");
  assert.equal(dateTime.getTimeFormat(),"12");
});

test("time format defaults safely when browser storage is unavailable",()=>{
  const storage={
    getItem(){ throw new Error("Storage unavailable"); },
    setItem(){ throw new Error("Storage unavailable"); }
  };
  const window={localStorage:storage};
  vm.runInNewContext(source,{window},{filename:"date-time.js"});
  const dateTime=window.BeforeworkDateTime.create({storage});

  assert.equal(dateTime.getTimeFormat(),"12");
  assert.doesNotThrow(()=>dateTime.setTimeFormat("24"));
});

test("today string and date offsets use local calendar dates",()=>{
  const {dateTime}=createDateTime({
    now:()=>new Date(2026,0,1,0,30)
  });

  assert.equal(dateTime.todayStr(0),"2026-01-01");
  assert.equal(dateTime.todayStr(1),"2026-01-02");
  assert.equal(dateTime.todayStr(-1),"2025-12-31");
});

test("datetime-local values use local wall-clock fields and reject invalid values",()=>{
  const {dateTime}=createDateTime();
  const date=new Date("2026-01-01T00:30:00.000Z");
  const expected=[
    date.getFullYear(),
    String(date.getMonth()+1).padStart(2,"0"),
    String(date.getDate()).padStart(2,"0")
  ].join("-");
  const expectedTime=`${String(date.getHours()).padStart(2,"0")}:${String(date.getMinutes()).padStart(2,"0")}`;

  assert.equal(dateTime.dateTimeLocalValue("2026-01-01T00:30:00.000Z"),`${expected}T${expectedTime}`);
  assert.equal(dateTime.dateTimeLocalValue("not a date"),"");
  assert.equal(dateTime.dateTimeLocalValue(""),"");
});

test("date-only and relative update labels preserve their existing display semantics",()=>{
  const {dateTime}=createDateTime({
    now:()=>new Date(2026,0,1,12)
  });
  const localDate=new Date("2026-01-01T00:00:00");

  assert.equal(dateTime.formatDate("2026-01-01"),localDate.toLocaleDateString(undefined,{
    month:"short",
    day:"numeric"
  }));
  assert.match(dateTime.formatUpdatedAt(new Date(2026,0,1,9).getTime()),/^Today at /);
  assert.equal(dateTime.formatUpdatedAt(Number.NaN),"Unknown");
});

test("time values preserve invalid input and format valid values",()=>{
  const {dateTime}=createDateTime();

  assert.equal(dateTime.formatTimeValue(""),"");
  assert.equal(dateTime.formatTimeValue("noon"),"noon");
  assert.equal(dateTime.formatTimeValue("13:05"),new Date(2000,0,1,13,5).toLocaleTimeString(undefined,{
    hour:"numeric",
    minute:"2-digit",
    hour12:true
  }));
});
