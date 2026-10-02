"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/features/focus-timer.js"), "utf8");
const appStyles = fs.readFileSync(path.join(__dirname, "../styles/app.css"), "utf8");
const timerStyles = fs.readFileSync(path.join(__dirname, "../styles/focus-timer.css"), "utf8");
const indexHtml = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
const stylesManifest = fs.readFileSync(path.join(__dirname, "../styles/manifest.css"), "utf8");

test("Focus Timer styles are isolated and included after shared application styles",()=>{
  assert.doesNotMatch(appStyles,/focusTimer|#focusTimerNav/);
  assert.match(timerStyles,/#focusTimerNav/);
  assert.match(timerStyles,/#sidebar\.collapsed #focusTimerNav span\{display:none;\}/);
  assert.match(timerStyles,/#sidebar\.collapsed #focusTimerPanel\.open\{position:fixed/);
  assert.match(timerStyles,/\.focusTimerPanel/);
  assert.match(timerStyles,/@media print\s*\{\s*\.focusTimerPanel/);
  assert.match(stylesManifest,/@import url\("app\.css"\);\s*@import url\("focus-timer\.css"\);/);
  assert.match(indexHtml,/<link rel="stylesheet" href="styles\/manifest\.css">/);
  assert.doesNotMatch(indexHtml,/href="styles\/(?:app|focus-timer|support)\.css"/);
});

function makeElement(){
  const listeners={};
  const attributes={};
  const classes=new Set();
  return {
    textContent:"",
    title:"",
    value:"",
    valueAsNumber:NaN,
    placeholder:"",
    dataset:{},
    attributes,
    classList:{
      add(name){ classes.add(name); },
      contains(name){ return classes.has(name); },
      toggle(name,enabled=!classes.has(name)){
        if (enabled) classes.add(name);
        else classes.delete(name);
        return enabled;
      }
    },
    addEventListener(name,callback){ listeners[name]=callback; },
    dispatch(name,event={}){ listeners[name]?.({target:this,preventDefault(){},...event}); },
    setAttribute(name,value){ attributes[name]=value; },
    setCustomValidity(value){ this.validationMessage=value; },
    reportValidity(){ this.reported=true; }
  };
}

function createHarness(){
  const elements=Object.fromEntries([
    "focusTimerNav","focusTimerPanel","focusTimerCloseBtn","focusTimerDisplay","focusStartBtn","focusResetBtn",
    "focusDurationInput","focusDurationApplyBtn","focusTimerQuickOptions","focusTimerMount"
  ].map(id=>[id,makeElement()]));
  const templateCalls=[];
  const insertedTemplates=[];
  elements.focusTimerMount.replaceWith=template=>insertedTemplates.push(template);
  elements.focusTimerQuickOptions.buttons=[];
  Object.defineProperty(elements.focusTimerQuickOptions,"innerHTML",{
    set(html){
      this.html=html;
      this.buttons=[...html.matchAll(/data-focus-quick="(\d+)"/g)].map((match,index)=>{
        const button=makeElement();
        button.dataset.focusQuick=match[1];
        button.onclick=null;
        return button;
      });
    }
  });
  elements.focusTimerQuickOptions.querySelectorAll=()=>elements.focusTimerQuickOptions.buttons;
  const modeButtons=["focus","break"].map(mode=>{
    const button=makeElement();
    button.dataset.focusMode=mode;
    return button;
  });
  const documentRef={
    title:"Beforework",
    getElementById(id){ return elements[id]; },
    querySelectorAll(selector){ return selector==="[data-focus-mode]" ? modeButtons : []; }
  };
  const intervals=new Map();
  let nextIntervalId=0;
  let clock=1000;
  const sessions=[];
  const finished=[];
  let opened=0;
  const window={document:documentRef,setInterval,clearInterval};
  vm.runInNewContext(source,{window},{filename:"focus-timer.js"});
  const timer=window.BeforeworkFocusTimer.create({
    getProjectId:()=>"project-1",
    async loadTemplate(name){ templateCalls.push(["load",name]); },
    cloneTemplate(name){ templateCalls.push(["clone",name]); return {name}; },
    onSessionComplete:session=>sessions.push(session),
    onFinished:mode=>finished.push(mode),
    onOpen:()=>opened++,
    documentRef,
    windowRef:window,
    now:()=>clock,
    setIntervalFn(callback){ const id=++nextIntervalId; intervals.set(id,callback); return id; },
    clearIntervalFn(id){ intervals.delete(id); }
  });
  return {
    elements,modeButtons,intervals,sessions,finished,timer,templateCalls,insertedTemplates,get opened(){return opened;},
    get title(){return documentRef.title;},
    tick(){
      const callback=intervals.values().next().value;
      assert.ok(callback,"timer should be running");
      clock+=1000;
      callback();
    }
  };
}

test("starts, pauses, resumes, and records a completed focus session",async()=>{
  const harness=createHarness();
  await harness.timer.init();
  assert.deepEqual(harness.templateCalls,[["load","focusTimer"],["clone","focusTimer"]]);
  assert.deepEqual(harness.insertedTemplates,[{name:"focusTimer"}]);
  assert.equal(harness.elements.focusTimerDisplay.textContent,"25:00");

  harness.elements.focusDurationInput.valueAsNumber=1;
  harness.elements.focusDurationApplyBtn.onclick();
  assert.equal(harness.elements.focusTimerDisplay.textContent,"01:00");
  harness.elements.focusStartBtn.onclick();
  for (let second=0;second<10;second++) harness.tick();
  harness.elements.focusStartBtn.onclick();
  assert.equal(harness.elements.focusTimerDisplay.textContent,"00:50");
  assert.equal(harness.sessions.length,0);

  harness.elements.focusStartBtn.onclick();
  for (let second=0;second<50;second++) harness.tick();

  assert.equal(harness.elements.focusTimerDisplay.textContent,"00:00");
  assert.equal(harness.elements.focusStartBtn.textContent,"Start");
  assert.equal(harness.sessions.length,1);
  assert.deepEqual({...harness.sessions[0]},{
    projectId:"project-1",
    startedAt:1000,
    completedAt:61000,
    durationSeconds:60
  });
  assert.equal(harness.title,"Beforework");
  assert.deepEqual(harness.finished,["focus"]);
  assert.equal(harness.intervals.size,0);
});

test("keeps separate focus and break durations and toggles the panel",async()=>{
  const harness=createHarness();
  await harness.timer.init();

  harness.modeButtons[1].onclick();
  assert.equal(harness.elements.focusTimerDisplay.textContent,"05:00");
  assert.equal(harness.elements.focusDurationInput.placeholder,"5");
  assert.match(harness.elements.focusTimerQuickOptions.html,/5 minute break/);
  harness.elements.focusDurationInput.valueAsNumber=2;
  harness.elements.focusDurationApplyBtn.onclick();
  assert.equal(harness.elements.focusTimerDisplay.textContent,"02:00");

  harness.modeButtons[0].onclick();
  assert.equal(harness.elements.focusTimerDisplay.textContent,"25:00");
  harness.modeButtons[1].onclick();
  assert.equal(harness.elements.focusTimerDisplay.textContent,"02:00");

  harness.elements.focusTimerNav.onclick();
  assert.equal(harness.elements.focusTimerPanel.classList.contains("open"),true);
  assert.equal(harness.elements.focusTimerNav.attributes["aria-expanded"],"true");
  assert.equal(harness.opened,1);
  harness.elements.focusTimerCloseBtn.onclick();
  assert.equal(harness.elements.focusTimerPanel.classList.contains("open"),false);
  assert.equal(harness.elements.focusTimerNav.classList.contains("active"),false);
  assert.equal(harness.elements.focusTimerNav.attributes["aria-expanded"],"false");
});

test("rejects custom durations outside one to 180 minutes",async()=>{
  const harness=createHarness();
  await harness.timer.init();
  harness.elements.focusDurationInput.valueAsNumber=181;
  harness.elements.focusDurationApplyBtn.onclick();

  assert.equal(harness.elements.focusDurationInput.validationMessage,"Enter a whole number from 1 to 180.");
  assert.equal(harness.elements.focusDurationInput.reported,true);
  assert.equal(harness.elements.focusTimerDisplay.textContent,"25:00");
});
