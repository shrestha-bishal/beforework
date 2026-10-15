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
  assert.match(timerStyles,/#sidebar #focusTimerNav span\{display:block/);
  assert.match(timerStyles,/#sidebar #focusTimerNav\{flex-direction:column;justify-content:center;gap:4px;width:100%;height:56px/);
  assert.match(timerStyles,/#sidebar #focusTimerNav iconify-icon\{font-size:21px;\}/);
  assert.match(timerStyles,/#sidebar #focusTimerNav\.active\{background:var\(--bg-soft\);color:var\(--text\);font-weight:600;\}/);
  assert.match(timerStyles,/#focusTimerNav iconify-icon\{color:var\(--muted\);font-size:16px;\}/);
  assert.match(timerStyles,/#focusTimerNav\.active iconify-icon\{color:var\(--nav-icon-timer,#b77812\);\}/);
  assert.match(appStyles,/--nav-icon-roadmap:#cf514b;/);
  assert.match(appStyles,/#roadmapNav\.active iconify-icon\{color:var\(--nav-icon-roadmap\);\}/);
  assert.match(timerStyles,/#board:has\(\.focusTimerPage\)\{display:block;overflow:auto/);
  assert.match(timerStyles,/\.focusTimerLayout\{display:grid;grid-template-columns:minmax\(0,1\.55fr\) minmax\(300px,\.85fr\)/);
  assert.match(timerStyles,/\.focusTimerDialProgress\{stroke:var\(--accent\);stroke-linecap:round/);
  assert.match(indexHtml,/<button id="focusTimerNav" type="button" title="Focus timer"/);
  assert.doesNotMatch(indexHtml,/focusTimerMount/);
  const timerPage=fs.readFileSync(path.join(__dirname,"../pages/focus-timer.html"),"utf8");
  assert.match(timerPage,/<section class="focusTimerPage" id="focusTimerPage"/);
  assert.match(timerPage,/id="focusTimerProgress"/);
  assert.doesNotMatch(timerPage,/id="focusTimerNav"|focusTimerCloseBtn/);
  assert.match(fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8"),/else if \(activeProjectId===TIMER\) focusTimer\.render\(board\)/);
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
    "focusTimerDisplay","focusStartBtn","focusResetBtn","focusDurationInput","focusDurationApplyBtn","focusTimerQuickOptions",
    "focusTimerProgress","focusTimerModeLabel","focusTimerState","focusTimerStateLabel"
  ].map(id=>[id,makeElement()]));
  Object.values(elements).forEach(element=>element.style={});
  const templateCalls=[];
  const insertedTemplates=[];
  const board={replaceChildren(...children){ this.children=children; insertedTemplates.push(...children); }};
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
  const window={document:documentRef,setInterval,clearInterval};
  vm.runInNewContext(source,{window},{filename:"focus-timer.js"});
  const timer=window.BeforeworkFocusTimer.create({
    getProjectId:()=>"project-1",
    async loadTemplate(name){ templateCalls.push(["load",name]); },
    cloneTemplate(name){ templateCalls.push(["clone",name]); return {name}; },
    onSessionComplete:session=>sessions.push(session),
    onFinished:mode=>finished.push(mode),
    documentRef,
    now:()=>clock,
    setIntervalFn(callback){ const id=++nextIntervalId; intervals.set(id,callback); return id; },
    clearIntervalFn(id){ intervals.delete(id); }
  });
  return {
    board,elements,modeButtons,intervals,sessions,finished,timer,templateCalls,insertedTemplates,
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
  assert.deepEqual(harness.templateCalls,[["load","focusTimer"]]);
  harness.timer.render(harness.board);
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
  assert.equal(harness.elements.focusStartBtn.textContent,"Session complete");
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

test("keeps separate focus and break durations",async()=>{
  const harness=createHarness();
  await harness.timer.init();
  harness.timer.render(harness.board);

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
});

test("rejects custom durations outside one to 180 minutes",async()=>{
  const harness=createHarness();
  await harness.timer.init();
  harness.timer.render(harness.board);
  harness.elements.focusDurationInput.valueAsNumber=181;
  harness.elements.focusDurationApplyBtn.onclick();

  assert.equal(harness.elements.focusDurationInput.validationMessage,"Enter a whole number from 1 to 180.");
  assert.equal(harness.elements.focusDurationInput.reported,true);
  assert.equal(harness.elements.focusTimerDisplay.textContent,"25:00");
});

test("renders the timer page again with the current running state",async()=>{
  const harness=createHarness();
  await harness.timer.init();
  harness.timer.render(harness.board);
  harness.elements.focusDurationInput.valueAsNumber=1;
  harness.elements.focusDurationApplyBtn.onclick();
  harness.elements.focusStartBtn.onclick();
  for (let second=0;second<10;second++) harness.tick();

  harness.timer.render(harness.board);

  assert.equal(harness.elements.focusTimerDisplay.textContent,"00:50");
  assert.equal(harness.elements.focusStartBtn.textContent,"Pause session");
  assert.equal(harness.elements.focusDurationInput.placeholder,"1");
  assert.equal(harness.elements.focusTimerState.dataset.state,"running");
  assert.equal(Number(harness.elements.focusTimerProgress.style.strokeDashoffset)>0,true);
});
