"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");
const {createElement,createPickerTestEnvironment}=require("./helpers/date-time-picker-dom");

function createTimePicker(timeFormat,value,timers=[]){
  const pickerSource=fs.readFileSync(path.join(__dirname,"../js/ui/date-time-picker.js"),"utf8");
  const {document,window,cloneTemplate}=createPickerTestEnvironment();
  const input=createElement();
  input.type="time";
  input.value=value;
  const parent=createElement();
  parent.appendChild(input);
  const sandbox={
    document,
    window,
    formatTime:date=>date.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:timeFormat==="12"}),
    formatTimeValue:time=>{
      const [hours,minutes]=time.split(":").map(Number);
      return sandbox.formatTime(new Date(2000,0,1,hours,minutes));
    },
    Event:function(type){this.type=type;},
    clearTimeout(timer){if (timer) timer.cancelled=true;},
    setTimeout(callback){const timer={callback,cancelled:false};timers.push(timer);return timer;}
  };
  vm.runInNewContext(pickerSource,sandbox);
  const picker=window.BeforeworkDateTimePickers.create({
    dateTime:{getTimeFormat:()=>timeFormat,formatTimeValue:sandbox.formatTimeValue},
    cloneTemplate,
    documentRef:document,
    windowRef:window
  });
  picker.enhanceTimeInput(input);

  const button=input.parentNode.children.find(child=>child.className.includes("datePickerButton timePickerButton"));
  const popover=document.body.children[0];
  return {button,input,popover};
}

function clickTarget(popover,selector,dataset){
  const attribute=Object.keys(dataset)[0].replace(/[A-Z]/g,letter=>`-${letter.toLowerCase()}`);
  const target=popover.querySelector(`[data-${attribute}]`);
  target.dataset=dataset;
  popover.listeners.click({target:{closest(candidate){return candidate===selector?target:null;}}});
}

test("time wheel follows 24-hour preference and only saves on confirmation",()=>{
  const {button,input,popover}=createTimePicker("24","");
  assert.equal(button.classList.contains("is-placeholder"),true);
  button.onclick({stopPropagation(){}});
  assert.equal(popover.querySelector('[data-time-wheel="hour"]').children.length,24);
  assert.equal(popover.querySelector('[data-time-wheel="minute"]').children.length,60);
  assert.equal(popover.querySelector("[data-time-period-wrap]").hidden,true);
  assert.ok(popover.querySelector('[data-time-action="cancel"]'));
  assert.ok(popover.querySelector('[data-time-action="save"]'));

  clickTarget(popover,"[data-time-hour]",{timeHour:"17"});
  clickTarget(popover,"[data-time-minute]",{timeMinute:"45"});
  assert.equal(input.value,"");
  clickTarget(popover,"[data-time-action]",{timeAction:"save"});
  assert.equal(input.value,"17:45");
  assert.equal(button.classList.contains("is-placeholder"),false);
  assert.deepEqual(input.events,["input","change"]);

  button.onclick({stopPropagation(){}});
  clickTarget(popover,"[data-time-hour]",{timeHour:"5"});
  clickTarget(popover,"[data-time-action]",{timeAction:"cancel"});
  assert.equal(input.value,"17:45");
  assert.equal(popover.hidden,true);
  assert.deepEqual(input.events,["input","change"]);
});

test("10px placeholder styling is scoped to the date picker's time control",()=>{
  const css=fs.readFileSync(path.join(__dirname,"../styles/app.css"),"utf8");
  assert.match(css,/\.datePickerPopover \.timePickerWrap \.timePickerButton\.is-placeholder>span\{font-size:10px;\}/);
  assert.doesNotMatch(css,/\.timePickerButton\.is-placeholder>span\{font-size:10px;\}/);
});

test("picker markup is supplied by the shared HTML template",()=>{
  const pickerSource=fs.readFileSync(path.join(__dirname,"../js/ui/date-time-picker.js"),"utf8");
  const templateSource=fs.readFileSync(path.join(__dirname,"../pages/date-time-pickers.html"),"utf8");

  assert.match(pickerSource,/clonePopover\("datePickerPopoverTemplate"\)/);
  assert.match(pickerSource,/clonePopover\("timePickerPopoverTemplate"\)/);
  assert.doesNotMatch(pickerSource,/\.innerHTML\s*=/);
  assert.match(templateSource,/data-date-action="previous"/);
  assert.match(templateSource,/data-time-action="save"/);
});

test("time wheel follows 12-hour preference and saves AM/PM selection",()=>{
  const {button,input,popover}=createTimePicker("12","08:15");
  button.onclick({stopPropagation(){}});
  assert.ok(popover.querySelector('[data-time-hour="12"]'));
  assert.equal(popover.querySelector('[data-time-hour="13"]'),null);
  assert.ok(popover.querySelector('[data-time-period="AM"]'));
  assert.equal(popover.querySelector("[data-time-period-wrap]").hidden,false);

  clickTarget(popover,"[data-time-hour]",{timeHour:"5"});
  clickTarget(popover,"[data-time-period]",{timePeriod:"PM"});
  assert.equal(input.value,"08:15");
  clickTarget(popover,"[data-time-action]",{timeAction:"save"});
  assert.equal(input.value,"17:15");
});

test("scrolling the period wheel from PM to AM changes the saved time",()=>{
  const timers=[];
  const {button,input,popover}=createTimePicker("12","17:15",timers);
  button.onclick({stopPropagation(){}});
  const periodWheel=popover.querySelector('[data-time-wheel="period"]');
  periodWheel.scrollTop=0;
  popover.listeners.scroll({target:{closest:()=>periodWheel}});
  assert.equal(input.value,"17:15");
  timers.filter(timer=>!timer.cancelled).forEach(timer=>timer.callback());
  clickTarget(popover,"[data-time-action]",{timeAction:"save"});

  assert.equal(input.value,"05:15");
});
