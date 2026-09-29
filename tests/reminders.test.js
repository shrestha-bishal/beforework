"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/reminders.js"), "utf8");

function createHarness({permission="default",items=[],currentTime=new Date(2026,8,29,9,5).getTime(),clock={value:currentTime},enabled=false,setIntervalFn=()=>1,clearIntervalFn=()=>{}}={}){
  const values = new Map();
  if (enabled) values.set("beforework_reminders_enabled_v1","1");
  const notifications = [];
  const window = {localStorage:{
    getItem(key){ return values.get(key) || null; },
    setItem(key,value){ values.set(key,String(value)); },
    removeItem(key){ values.delete(key); }
  }};
  vm.runInNewContext(source, {window}, {filename:"reminders.js"});
  class MockNotification {
    static permission = permission;
    static async requestPermission(){
      MockNotification.permission = permission==="default" ? "granted" : permission;
      return MockNotification.permission;
    }
    constructor(title,options){
      this.title = title;
      this.options = options;
      notifications.push(this);
    }
    close(){ this.closed = true; }
  }
  const service = window.BeforeworkReminders.create({
    getItems:()=>items,
    NotificationApi:MockNotification,
    storage:window.localStorage,
    documentRef:null,
    now:()=>clock.value,
    setIntervalFn,
    clearIntervalFn
  });
  return {service, notifications, MockNotification, clock};
}

function todayKey(time){
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

test("enables notifications from a user action and delivers scheduled reminders once", async()=>{
  const currentTime = new Date(2026,8,29,10,0).getTime();
  const reminderAt = new Date(currentTime-1000).toISOString();
  const item = {id:"item-1",title:"Prepare agenda",reminderAt,isTask:false};
  const {service,notifications} = createHarness({items:[item],currentTime});

  const status = await service.enable();

  assert.equal(status.enabled,true);
  assert.equal(notifications.length,1);
  assert.equal(notifications[0].title,"Prepare agenda");
  assert.equal(service.check(),0);
  assert.equal(notifications.length,1);
});

test("sends due-date alerts only for incomplete tasks due today after 9am", async()=>{
  const currentTime = new Date(2026,8,29,9,5).getTime();
  const today = todayKey(currentTime);
  const items = [
    {id:"today",title:"Due today",isTask:true,dueDate:today,projectName:"Product"},
    {id:"tomorrow",title:"Due tomorrow",isTask:true,dueDate:"2026-09-30"},
    {id:"overdue",title:"Already overdue",isTask:true,dueDate:"2026-09-28"},
    {id:"complete",title:"Completed",isTask:true,dueDate:today,completed:true},
    {id:"archived",title:"Archived",isTask:true,dueDate:today,archived:true},
    {id:"event",title:"Event",isTask:false,dueDate:today}
  ];
  const {service,notifications} = createHarness({items,currentTime});
  await service.enable();

  assert.equal(notifications.length,1);
  assert.equal(notifications[0].title,"Due today");
  assert.match(notifications[0].options.body,/Product/);
});

test("does not enable or deliver when notification permission is denied", async()=>{
  const currentTime = new Date(2026,8,29,10,0).getTime();
  const item = {id:"item-1",title:"Prepare agenda",reminderAt:new Date(currentTime-1000).toISOString()};
  const {service,notifications} = createHarness({permission:"denied",items:[item],currentTime});

  const status = await service.enable();

  assert.equal(status.enabled,false);
  assert.equal(status.canEnable,false);
  assert.equal(service.check(),0);
  assert.equal(notifications.length,0);
});

test("polls for due reminders while running and clears its timer on stop", ()=>{
  const currentTime = new Date(2026,8,29,8,59).getTime();
  const clock = {value:currentTime};
  const item = {id:"today",title:"Due today",isTask:true,dueDate:todayKey(currentTime)};
  let poll = null;
  let intervalDelay = null;
  let clearedInterval = null;
  const {service,notifications} = createHarness({
    permission:"granted",
    items:[item],
    clock,
    enabled:true,
    setIntervalFn(callback,delay){ poll=callback; intervalDelay=delay; return 17; },
    clearIntervalFn(id){ clearedInterval=id; }
  });

  service.start();
  assert.equal(intervalDelay,30000);
  assert.equal(notifications.length,0);
  clock.value = new Date(2026,8,29,9,0).getTime();
  poll();
  assert.equal(notifications.length,1);
  service.stop();
  assert.equal(clearedInterval,17);
});
