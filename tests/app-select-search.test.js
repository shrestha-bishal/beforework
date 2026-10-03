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
const positionStart=appSource.indexOf("function positionFloatingSelectMenu(button,menu)");
const positionEnd=appSource.indexOf("function openFloatingSelectMenu",positionStart);
const positionSnippet=appSource.slice(positionStart,positionEnd);
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
    getAttribute(name){ return this.attributes[name]; },
    addEventListener(name,callback){ listeners[name]=callback; },
    appendChild(child){
      if (child.parentNode){
        const index=child.parentNode.children.indexOf(child);
        if (index>=0) child.parentNode.children.splice(index,1);
      }
      this.children.push(child);
      child.parentNode=this;
      return child;
    },
    append(...children){ children.forEach(child=>this.appendChild(child)); },
    replaceChildren(...children){
      this.children.forEach(child=>{ child.parentNode=null; });
      this.children.splice(0,this.children.length);
      children.forEach(child=>this.appendChild(child));
    },
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

function createHarness({multiple=false,selectDataset={}}={}){
  const document={createElement,body:createElement(),activeElement:null};
  activeDocument=document;
  const select=createElement();
  select.multiple=multiple;
  select.dataset.appSelectPlaceholder="Select options";
  Object.assign(select.dataset,selectDataset);
  select.options=[
    {value:"todo",textContent:"To do",selected:true},
    {value:"doing",textContent:"In progress",selected:false},
    {value:"done",textContent:"Done",selected:false}
  ];
  if (selectDataset.emptyOptions) select.options=[];
  select.selectedIndex=0;
  select.value="todo";
  select.closest=()=>null;
  select.parentNode=createElement();
  select.parentNode.appendChild(select);
  select.classList=Object.assign(select.classList,{add(){}});
  select.dispatchEvent=event=>{
    if (event.type==="change"){
      if (!multiple) select.selectedIndex=select.options.findIndex(option=>option.value===select.value);
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
  const button=wrapper.children.find(child=>child.getAttribute("aria-haspopup")==="listbox");
  const menu=wrapper.children.find(child=>child.className==="appSelectMenu");
  const search=menu.children.find(child=>child.className==="appSelectSearch");
  const optionList=menu.children.find(child=>child.className==="appSelectOptions");
  return {button,document,menu,optionList,search,select,wrapper,options:optionList.children};
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

test("multiple appSelect toggles options, stays open, and preserves option order",()=>{
  const {button,menu,search,select,options,optionList}=createHarness({multiple:true});
  assert.equal(optionList.attributes["aria-multiselectable"],"true");
  assert.equal(button.children[0].textContent,"To do");
  button.onclick({stopPropagation(){}});
  assert.equal(button.getAttribute("aria-expanded"),"true");
  search.value="gress";
  search.listeners.input();
  options[1].onclick();
  assert.equal(select.options[1].selected,true);
  assert.equal(button.children[0].textContent,"To do, In progress");
  assert.equal(menu.hidden,false);
  assert.equal(button.getAttribute("aria-expanded"),"true");
  assert.deepEqual(optionList.children.map(option=>option.dataset.value),["todo","doing","done"]);
  assert.deepEqual(optionList.children.map(option=>option.hidden),[true,false,true]);
  assert.equal(optionList.children[0].getAttribute("aria-selected"),"true");

  options[0].onclick();
  assert.equal(select.options[0].selected,false);
  assert.equal(button.children[0].textContent,"In progress");
  assert.deepEqual(optionList.children.map(option=>option.dataset.value),["todo","doing","done"]);
  assert.equal(menu.hidden,false);
});

test("appSelect accepts a column-filter icon, class, title, and search label",()=>{
  const {button,menu,search,wrapper}=createHarness({multiple:true,selectDataset:{
    appSelectWrapClass:"columnFilterSelectWrap",
    appSelectButtonClass:"fieldColumnMenuBtn columnFilterToggle",
    appSelectIcon:"mdi:filter-outline",
    appSelectMenuWidth:"320",
    appSelectMenuTitle:"Filter by relation",
    appSelectSearchPlaceholder:"Filter relations"
  }});
  const menuTitle=menu.children.find(child=>child.className==="appSelectMenuTitle");
  assert.equal(wrapper.className,"appSelectWrap columnFilterSelectWrap");
  assert.equal(button.className,"fieldColumnMenuBtn columnFilterToggle");
  assert.equal(button.children[1].getAttribute("icon"),"mdi:filter-outline");
  assert.equal(menu.dataset.selectWidth,"320");
  assert.equal(menuTitle.textContent,"Filter by relation");
  assert.equal(search.placeholder,"Filter relations");
});

test("appSelect can widen a tag selector menu beyond its chevron trigger",()=>{
  const {menu}=createHarness({multiple:true,selectDataset:{
    appSelectWrapClass:"tagSelectWrap",
    appSelectButtonClass:"appSelectButton tagSelectButton",
    appSelectMenuWidth:"240",
    appSelectButtonLabel:"Add tags",
    appSelectButtonClass:"appSelectButton tagSelectButton"
  }});

  assert.equal(menu.dataset.selectWidth,"240");
});

test("appSelect keeps a custom button label while multi-select values change",()=>{
  const {button,options}=createHarness({multiple:true,selectDataset:{
    appSelectButtonLabel:"Add tags"
  }});

  assert.equal(button.getAttribute("aria-label"),"Add tags");
  assert.equal(button.title,"Add tags");
  assert.equal(button.children[0].textContent,"Add tags");
  button.onclick({stopPropagation(){}});
  options[1].onclick();
  assert.equal(button.children[0].textContent,"Add tags");
});

test("appSelect displays an empty state without options when explicitly enabled",()=>{
  const {button,menu,select,options}=createHarness({multiple:true,selectDataset:{
    appSelectEnhanceEmpty:"true",
    appSelectEmptyLabel:"No tags yet",
    emptyOptions:true
  }});
  const empty=menu.children.find(child=>child.className==="appSelectEmpty");

  button.onclick({stopPropagation(){}});
  assert.equal(empty.textContent,"No tags yet");
  assert.equal(empty.hidden,false);
  assert.equal(options.length,0);
  assert.equal(select.dataset.appSelectEnhanced,"true");
});

test("appSelect refreshes changed native options each time it opens",()=>{
  const {button,options,select}=createHarness({multiple:true});
  select.options.push({value:"new",textContent:"New tag",selected:false});

  button.onclick({stopPropagation(){}});

  assert.deepEqual(options.map(option=>option.textContent),["To do","In progress","Done","New tag"]);
});

test("appSelect can widen a menu beyond its compact header trigger",()=>{
  const button={isConnected:true,getBoundingClientRect:()=>({width:24,left:450,right:474,top:100,bottom:124})};
  const menu={hidden:false,dataset:{selectWidth:"320"},scrollHeight:120,style:{}};
  vm.runInNewContext(`${positionSnippet}; positionFloatingSelectMenu(button,menu);`,{
    window:{innerWidth:1280,innerHeight:800},button,menu
  });
  assert.equal(menu.style.width,"320px");
  assert.equal(menu.style.left,"450px");
});

test("appSelect exposes reusable enhancement methods for other controls",()=>{
  assert.match(appSource,/window\.BeforeworkAppSelect=\{\s*enhance:enhanceSelectControl,\s*enhanceAll:enhanceSelectControls\s*\}/);
  assert.match(snippet,/const isMultiple=select\.multiple/);
});

test("selected option pill remains inside the scrollable option list",()=>{
  assert.match(appStyles,/\.appSelectOption\.selected::before\{left:4px;\}/);
  assert.match(appStyles,/\.appSelectOption\.selected\{padding-left:15px;/);
  assert.match(appStyles,/\.itemModalSidebar \.appSelectButton\[aria-expanded="true"\]\{background:var\(--bg-soft\);\}/);
  assert.match(appStyles,/\.listTable \.columnFilterSelectWrap \.columnFilterToggle\[aria-expanded="true"\]\{opacity:1;visibility:visible;transform:translateX\(0\);background:var\(--bg-soft2\);color:var\(--text\);\}/);
});
