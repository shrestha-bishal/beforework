"use strict";

function createElement(){
  const listeners={};
  const attributes={};
  const element={
    children:[],
    dataset:{},
    style:{},
    hidden:false,
    textContent:"",
    value:"",
    appendChild(child){
      this.children.push(child);
      child.parentNode=this;
      return child;
    },
    append(...children){ children.forEach(child=>this.appendChild(child)); },
    replaceChildren(...children){
      this.children.forEach(child=>{ child.parentNode=null; });
      this.children=[];
      this.append(...children);
    },
    insertBefore(child,reference){
      const index=this.children.indexOf(reference);
      this.children.splice(index<0?this.children.length:index,0,child);
      child.parentNode=this;
      return child;
    },
    setAttribute(name,value){
      attributes[name]=String(value);
      const dataName=name.match(/^data-(.+)$/)?.[1];
      if (dataName) this.dataset[dataName.replace(/-([a-z])/g,(_match,letter)=>letter.toUpperCase())]=String(value);
    },
    getAttribute(name){ return attributes[name]??null; },
    addEventListener(name,callback){ listeners[name]=callback; },
    querySelector(selector){ return this.querySelectorAll(selector)[0]||null; },
    querySelectorAll(selector){
      return this.children.flatMap(child=>[
        ...(matches(child,selector)?[child]:[]),
        ...child.querySelectorAll(selector)
      ]);
    },
    matches(selector){ return matches(this,selector); },
    getBoundingClientRect(){ return {width:160,left:20,right:180,top:20,bottom:54,height:100}; },
    focus(){ this.focused=true; },
    dispatchEvent(event){ this.events=(this.events||[]).concat(event.type); }
  };
  Object.defineProperty(element,"listeners",{value:listeners});
  Object.defineProperty(element,"classList",{value:{
    add(name){ element.className=[...new Set(`${element.className||""} ${name}`.trim().split(/\s+/))].join(" "); },
    toggle(name,enabled){
      const names=(element.className||"").split(/\s+/).filter(Boolean);
      element.className=enabled
        ? [...new Set([...names,name])].join(" ")
        : names.filter(existing=>existing!==name).join(" ");
    },
    contains(name){ return (element.className||"").split(/\s+/).includes(name); }
  }});
  return element;
}

function matches(element,selector){
  if (selector.startsWith(".")) return (element.className||"").split(/\s+/).includes(selector.slice(1));
  const dataMatch=/^\[data-([\w-]+)(?:="([^"]*)")?\]$/.exec(selector);
  if (dataMatch){
    const key=dataMatch[1].replace(/-([a-z])/g,(_match,letter)=>letter.toUpperCase());
    return Object.prototype.hasOwnProperty.call(element.dataset,key)
      && (dataMatch[2]===undefined||element.dataset[key]===dataMatch[2]);
  }
  return false;
}

function makeTemplateRoot(templateId){
  const root=createElement();
  if (templateId==="datePickerPopoverTemplate"){
    root.className="datePickerPopover";
    const header=createElement();
    const month=createElement();
    month.dataset.dateMonth="";
    header.append(createAction("previous"),month,createAction("next"));
    const weekdays=createElement();
    const grid=createElement();
    grid.className="datePickerGrid";
    grid.dataset.dateGrid="";
    const timeControl=createElement();
    timeControl.dataset.dateTimeControl="";
    const timeInput=createElement();
    timeInput.className="datePickerTimeInput";
    timeControl.appendChild(timeInput);
    const footer=createElement();
    footer.append(createAction("clear"),createAction("today"));
    root.append(header,weekdays,grid,timeControl,footer);
  }else{
    root.className="timePickerPopover";
    const hour=createWheel("hour","Hour");
    const minute=createWheel("minute","Minute");
    const period=createWheel("period","AM or PM");
    const periodWrap=createElement();
    periodWrap.dataset.timePeriodWrap="";
    periodWrap.appendChild(period);
    const wheels=createElement();
    wheels.append(hour,minute,periodWrap);
    const footer=createElement();
    footer.append(createTimeAction("cancel"),createTimeAction("save"));
    root.append(wheels,footer);
  }
  return root;
}

function createAction(action){
  const button=createElement();
  button.dataset.dateAction=action;
  return button;
}

function createTimeAction(action){
  const button=createElement();
  button.dataset.timeAction=action;
  return button;
}

function createWheel(name,label){
  const wheel=createElement();
  wheel.className="timePickerOptions";
  wheel.dataset.timeWheel=name;
  wheel.setAttribute("role","listbox");
  wheel.setAttribute("aria-label",label);
  return wheel;
}

function createPickerTestEnvironment(){
  const document={
    createElement,
    body:createElement(),
    querySelectorAll(){ return []; }
  };
  const window={innerWidth:1200,innerHeight:900};
  const cloneTemplate=()=>({
    querySelector(selector){
      const templateId=selector.slice(1);
      return {
        content:{
          firstElementChild:{
            cloneNode(){ return makeTemplateRoot(templateId); }
          }
        }
      };
    }
  });
  return {document,window,cloneTemplate};
}

module.exports={createElement,createPickerTestEnvironment};
