"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

function createTimePicker(timeFormat,value,timers=[]){
  const appSource=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
  const start=appSource.indexOf("function enhanceTimeInput(input)");
  const end=appSource.indexOf("function enhanceTimeInputs(root=document)",start);
  const snippet=appSource.slice(start,end);
  const makeElement=()=>{
    const listeners={};
    const classNames=new Set();
    return {
      children:[],dataset:{},style:{},attributes:{},classList:{
        add(name){classNames.add(name);},
        toggle(name,enabled){if(enabled) classNames.add(name); else classNames.delete(name);},
        contains(name){return classNames.has(name);}
      },listeners,
      setAttribute(name,value){this.attributes[name]=value;},
      getAttribute(name){return this.attributes[name]||null;},
      appendChild(child){this.children.push(child);child.parentNode=this;return child;},
      append(...children){children.forEach(child=>this.appendChild(child));},
      insertBefore(child,reference){
        const index=this.children.indexOf(reference);
        this.children.splice(index<0?this.children.length:index,0,child);
        child.parentNode=this;
        return child;
      },
      addEventListener(type,listener){listeners[type]=listener;},
      getBoundingClientRect(){return {width:160,left:20,right:180,top:20,bottom:54};},
      querySelectorAll(selector){
        if (this.className==="timePickerPopover"&&selector===".timePickerOptions") return Object.values(this.wheels||{});
        if (this.className==="timePickerOptions"&&selector===".timePickerOption") return this.options||[];
        return [];
      },
      querySelector(selector){
        const wheel=selector.match(/data-time-wheel="(hour|minute|period)"/)?.[1];
        return wheel?this.wheels?.[wheel]||null:null;
      },
      innerHTML:"",
      focus(){this.focused=true;}
    };
  };
  const document={createElement:makeElement,body:makeElement()};
  const input=makeElement();
  input.type="time";
  input.value=value;
  input.events=[];
  input.dispatchEvent=event=>input.events.push(event.type);
  const parent=makeElement();
  parent.appendChild(input);
  const sandbox={
    document,
    window:{innerWidth:1200,innerHeight:900},
    getTimeFormat:()=>timeFormat,
    formatTime:date=>date.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:timeFormat==="12"}),
    formatTimeValue:time=>{
      const [hours,minutes]=time.split(":").map(Number);
      return sandbox.formatTime(new Date(2000,0,1,hours,minutes));
    },
    Event:function(type){this.type=type;},
    clearTimeout(timer){if (timer) timer.cancelled=true;},
    setTimeout(callback){const timer={callback,cancelled:false};timers.push(timer);return timer;}
  };
  vm.runInNewContext(`${snippet}; enhanceTimeInput(input);`,{...sandbox,input});

  const button=input.parentNode.children.find(child=>child.className==="datePickerButton timePickerButton");
  const popover=document.body.children[0];
  const makeOptions=count=>Array.from({length:count},()=>{
    const option=makeElement();
    option.classList={toggle(name,value){option.selected=value;}};
    return option;
  });
  popover.wheels={
    hour:Object.assign(makeElement(),{dataset:{timeWheel:"hour",optionCount:timeFormat==="12"?12:24},options:makeOptions(timeFormat==="12"?12:24)}),
    minute:Object.assign(makeElement(),{dataset:{timeWheel:"minute",optionCount:60},options:makeOptions(60)}),
    period:Object.assign(makeElement(),{dataset:{timeWheel:"period",optionCount:2},options:makeOptions(2)})
  };
  popover.wheels.hour.querySelectorAll=()=>popover.wheels.hour.options;
  popover.wheels.minute.querySelectorAll=()=>popover.wheels.minute.options;
  popover.wheels.period.querySelectorAll=()=>popover.wheels.period.options;
  return {button,input,popover};
}

function clickTarget(popover,selector,dataset){
  popover.listeners.click({target:{
    closest(candidate){return candidate===selector?{dataset}:null;}
  }});
}

test("time wheel follows 24-hour preference and only saves on confirmation",()=>{
  const {button,input,popover}=createTimePicker("24","");
  assert.equal(button.classList.contains("is-placeholder"),true);
  button.onclick({stopPropagation(){}});
  assert.match(popover.innerHTML,/Select time/);
  assert.match(popover.innerHTML,/role="listbox" aria-label="Hour"/);
  assert.match(popover.innerHTML,/role="listbox" aria-label="Minute"/);
  assert.doesNotMatch(popover.innerHTML,/data-time-period/);
  assert.match(popover.innerHTML,/data-time-action="cancel"/);
  assert.match(popover.innerHTML,/data-time-action="save"/);

  clickTarget(popover,"[data-time-hour]",{timeHour:"17"});
  clickTarget(popover,"[data-time-minute]",{timeMinute:"45"});
  assert.equal(input.value,"08:15");
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

test("time wheel follows 12-hour preference and saves AM/PM selection",()=>{
  const {button,input,popover}=createTimePicker("12","08:15");
  button.onclick({stopPropagation(){}});
  assert.match(popover.innerHTML,/data-time-hour="12"/);
  assert.doesNotMatch(popover.innerHTML,/data-time-hour="13"/);
  assert.match(popover.innerHTML,/data-time-period="AM"/);

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
  const periodWheel=popover.wheels.period;
  periodWheel.scrollTop=0;
  popover.listeners.scroll({target:{closest:()=>periodWheel}});
  assert.equal(input.value,"17:15");
  timers.filter(timer=>!timer.cancelled).forEach(timer=>timer.callback());
  clickTarget(popover,"[data-time-action]",{timeAction:"save"});

  assert.equal(input.value,"05:15");
});
