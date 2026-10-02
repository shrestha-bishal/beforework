"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const appSource=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
const appStyles=fs.readFileSync(path.join(__dirname,"../styles/app.css"),"utf8");
const start=appSource.indexOf("function enhanceSelectControl(select)");
const end=appSource.indexOf("function enhanceSelectControls(root=document)",start);
const snippet=appSource.slice(start,end);
let activeDocument;

function createElement(){
  const listeners={};
  const classes=new Set();
  return {
    children:[],
    dataset:{},
    attributes:{},
    style:{},
    classList:{
      add(name){ classes.add(name); },
      toggle(name,enabled){ if (enabled) classes.add(name); else classes.delete(name); },
      contains(name){ return classes.has(name); }
    },
    setAttribute(name,value){ this.attributes[name]=value; },
    addEventListener(name,callback){ listeners[name]=callback; },
    appendChild(child){ this.children.push(child); child.parentNode=this; return child; },
    append(...children){ children.forEach(child=>this.appendChild(child)); },
    insertBefore(child,reference){
      const index=this.children.indexOf(reference);
      this.children.splice(index<0?this.children.length:index,0,child);
      child.parentNode=this;
      return child;
    },
    getBoundingClientRect(){ return {width:160}; },
    focus(){ activeDocument.activeElement=this; },
    listeners
  };
}

function createHarness(){
  const document={createElement,body:createElement(),activeElement:null};
  activeDocument=document;
  const select=createElement();
  select.options=[
    {value:"todo",textContent:"To do"},
    {value:"doing",textContent:"In progress"},
    {value:"done",textContent:"Done"}
  ];
  select.selectedIndex=0;
  select.value="todo";
  select.closest=()=>null;
  select.parentNode=createElement();
  select.parentNode.appendChild(select);
  select.classList=Object.assign(select.classList,{add(){}});
  select.dispatchEvent=event=>{
    if (event.type==="change"){
      select.selectedIndex=select.options.findIndex(option=>option.value===select.value);
      select.listeners.change?.();
    }
  };
  const sandbox={
    document,
    Event:function(type){ this.type=type; },
    openFloatingSelectMenu(button,menu){
      menu.hidden=false;
      button.setAttribute("aria-expanded","true");
    },
    closeFloatingSelectMenu(menu){
      menu.hidden=true;
      menu._selectAnchor?.setAttribute("aria-expanded","false");
    }
  };
  vm.runInNewContext(`${snippet}; enhanceSelectControl(select);`,{...sandbox,select});
  const wrapper=select.parentNode;
  const button=wrapper.children.find(child=>child.className==="appSelectButton");
  const menu=wrapper.children.find(child=>child.className==="appSelectMenu");
  const search=menu.children.find(child=>child.className==="appSelectSearch");
  const optionList=menu.children.find(child=>child.className==="appSelectOptions");
  return {button,document,menu,optionList,search,select,options:optionList.children};
}

test("custom select filters options as the search input changes",()=>{
  const {button,document,menu,optionList,search,options}=createHarness();
  button.onclick({stopPropagation(){}});
  assert.equal(document.activeElement,search);

  search.value="gres";
  search.listeners.input();
  assert.deepEqual(options.map(option=>option.hidden),[true,false,true]);
  assert.equal(optionList.hidden,false);

  search.value="missing";
  search.listeners.input();
  assert.equal(optionList.hidden,true);
  assert.equal(menu.children[2].hidden,false);
});

test("custom select resets search when reopened and selecting a result updates the native select",()=>{
  const {button,menu,search,select,options}=createHarness();
  assert.equal(options[0].classList.contains("selected"),true);
  button.onclick({stopPropagation(){}});
  search.value="done";
  search.listeners.input();
  options[2].onclick();
  assert.equal(select.value,"done");
  assert.equal(options[0].classList.contains("selected"),false);
  assert.equal(options[2].classList.contains("selected"),true);
  assert.equal(menu.hidden,true);

  button.onclick({stopPropagation(){}});
  assert.equal(search.value,"");
  assert.deepEqual(options.map(option=>option.hidden),[false,false,false]);
});

test("selected option pill remains inside the scrollable option list",()=>{
  assert.match(appStyles,/\.appSelectOption\.selected::before\{left:4px;\}/);
  assert.match(appStyles,/\.appSelectOption\.selected\{padding-left:15px;/);
});
