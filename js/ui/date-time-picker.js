(function(global){
  "use strict";

  function createDateTimePickers({dateTime,cloneTemplate,documentRef=global.document,windowRef=global}={}){
    if (!dateTime || typeof dateTime.getTimeFormat!=="function" || typeof dateTime.formatTimeValue!=="function") throw new TypeError("Date/time pickers require date/time formatting utilities.");
    if (typeof cloneTemplate!=="function") throw new TypeError("Date/time pickers require a template cloning function.");
    const document=documentRef;
    const window=windowRef;
    const {getTimeFormat,formatTimeValue}=dateTime;
    function clonePopover(templateId){
      const fragment=cloneTemplate();
      const template=fragment.querySelector(`#${templateId}`);
      const content=template?.content?.firstElementChild;
      if (!content) throw new Error(`The date/time picker template "${templateId}" is missing.`);
      return content.cloneNode(true);
    }

    function enhanceDateInput(input){
      if (input.dataset.datePickerEnhanced) return;
      input.dataset.datePickerEnhanced="true";
      const isDateTime=input.type==="datetime-local";
      const wrapper=document.createElement("div");
      wrapper.className="datePickerWrap";
      const width=input.getBoundingClientRect().width;
      if (width>0) wrapper.style.width=`${width}px`;
      input.parentNode.insertBefore(wrapper,input);
      wrapper.appendChild(input);
      input.classList.add("datePickerNative");
      const button=document.createElement("button");
      button.type="button";
      button.className="datePickerButton";
      button.setAttribute("aria-haspopup","dialog");
      button.setAttribute("aria-expanded","false");
      if (input.getAttribute("aria-label")) button.setAttribute("aria-label",input.getAttribute("aria-label"));
      const label=document.createElement("span");
      const icon=document.createElement("iconify-icon");
      icon.setAttribute("icon",isDateTime?"mdi:clock-outline":"mdi:calendar-month-outline");
      icon.setAttribute("aria-hidden","true");
      button.append(label,icon);
      const popover=clonePopover("datePickerPopoverTemplate");
      popover.hidden=true;
      popover.setAttribute("aria-label",input.getAttribute("aria-label")||"Choose date");
      wrapper.appendChild(button);
      document.body.appendChild(popover);
      let month=new Date();
      const parseDate=()=>{
        const value=input.value.slice(0,10);
        const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
        return match ? new Date(Number(match[1]),Number(match[2])-1,Number(match[3])) : null;
      };
      const isoDate=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
      const labelDate=()=>{
        const date=parseDate();
        if (!date) return isDateTime ? "Choose date and time" : "Choose date";
        const text=date.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
        return isDateTime && input.value.includes("T") ? `${text} · ${input.value.slice(11,16)}` : text;
      };
      const emitChange=()=>input.dispatchEvent(new Event("change",{bubbles:true}));
      const render=()=>{
        const selected=parseDate();
        const today=new Date();
        const firstDay=new Date(month.getFullYear(),month.getMonth(),1);
        const start=new Date(month.getFullYear(),month.getMonth(),1-firstDay.getDay());
        const grid=popover.querySelector("[data-date-grid]");
        const monthLabel=popover.querySelector("[data-date-month]");
        const timeControl=popover.querySelector("[data-date-time-control]");
        const timeInput=popover.querySelector(".datePickerTimeInput");
        monthLabel.textContent=month.toLocaleDateString(undefined,{month:"long",year:"numeric"});
        timeControl.hidden=!isDateTime;
        if (timeInput) timeInput.value=input.value.slice(11,16);
        grid.replaceChildren();
        for (let index=0;index<42;index++){
          const date=new Date(start.getFullYear(),start.getMonth(),start.getDate()+index);
          const currentMonth=date.getMonth()===month.getMonth();
          const isSelected=selected && date.getTime()===selected.getTime();
          const isToday=date.toDateString()===today.toDateString();
          const day=document.createElement("button");
          day.type="button";
          day.className=`datePickerDay${currentMonth?"":" is-outside"}${isSelected?" is-selected":""}${isToday?" is-today":""}`;
          day.dataset.date=isoDate(date);
          day.setAttribute("aria-label",date.toLocaleDateString());
          day.textContent=String(date.getDate());
          grid.appendChild(day);
        }
        if (timeInput) timeInput.onchange=()=>{ if (input.value.slice(0,10)) { input.value=`${input.value.slice(0,10)}T${timeInput.value}`; label.textContent=labelDate(); emitChange(); } };
      };
      const close=()=>{ popover.hidden=true; button.setAttribute("aria-expanded","false"); };
      popover._popoverClose=close;
      const chooseDate=date=>{
        const time=isDateTime ? (input.value.slice(11,16)||"09:00") : "";
        input.value=`${isoDate(date)}${isDateTime?`T${time}`:""}`;
        label.textContent=labelDate(); emitChange();
        if (!isDateTime) close(); else { month=new Date(date.getFullYear(),date.getMonth(),1); render(); }
      };
      popover.addEventListener("click",event=>{
        const control=event.target.closest("[data-date-action]");
        if (control){
          event.preventDefault();
          event.stopPropagation();
          const action=control.dataset.dateAction;
          if (action==="previous") month=new Date(month.getFullYear(),month.getMonth()-1,1);
          if (action==="next") month=new Date(month.getFullYear(),month.getMonth()+1,1);
          if (action==="clear"){ input.value=""; emitChange(); close(); }
          if (action==="today") chooseDate(new Date());
          if (action==="previous" || action==="next"){
            render();
            popover.querySelector(`[data-date-action="${action}"]`)?.focus();
          }
          return;
        }
        const day=event.target.closest(".datePickerDay");
        if (day){
          event.preventDefault();
          event.stopPropagation();
          chooseDate(new Date(`${day.dataset.date}T00:00:00`));
        }
      });
      const positionPopover=()=>{
        const rect=wrapper.getBoundingClientRect();
        const width=Math.min(278,window.innerWidth-24);
        popover.style.width=`${Math.max(1,width)}px`;
        popover.style.left=`${Math.max(12,Math.min(rect.left,window.innerWidth-width-12))}px`;
        popover.style.top=`${rect.bottom+6}px`;
        const popoverRect=popover.getBoundingClientRect();
        if (popoverRect.bottom>window.innerHeight-12) popover.style.top=`${Math.max(12,rect.top-popoverRect.height-6)}px`;
      };
      button.onclick=event=>{ event.stopPropagation(); if (popover.hidden){ const selected=parseDate(); month=selected?new Date(selected.getFullYear(),selected.getMonth(),1):new Date(); render(); popover.hidden=false; button.setAttribute("aria-expanded","true"); positionPopover(); }else close(); };
      button.onkeydown=event=>{ if (event.key==="Enter" || event.key===" "){ event.preventDefault(); button.click(); } };
      input.addEventListener("change",()=>{ label.textContent=labelDate(); });
      label.textContent=labelDate();
    }
    function enhanceDateInputs(root=document){
      root.querySelectorAll("input[type=date]:not([data-date-picker-enhanced]),input[type=datetime-local]:not([data-date-picker-enhanced])").forEach(enhanceDateInput);
    }
    function enhanceTimeInput(input){
      if (input.dataset.timePickerEnhanced) return;
      input.dataset.timePickerEnhanced="true";
      const wrapper=document.createElement("div");
      wrapper.className="timePickerWrap";
      const width=input.getBoundingClientRect().width;
      if (width>0) wrapper.style.width=`${width}px`;
      input.parentNode.insertBefore(wrapper,input);
      wrapper.appendChild(input);
      input.classList.add("datePickerNative");
      const button=document.createElement("button");
      button.type="button";
      button.className="datePickerButton timePickerButton";
      button.setAttribute("aria-haspopup","dialog");
      button.setAttribute("aria-expanded","false");
      if (input.getAttribute("aria-label")) button.setAttribute("aria-label",input.getAttribute("aria-label"));
      const label=document.createElement("span");
      const icon=document.createElement("iconify-icon");
      icon.setAttribute("icon","mdi:clock-outline");
      icon.setAttribute("aria-hidden","true");
      button.append(label,icon);
      const updateLabel=()=>{
        label.textContent=input.value ? formatTimeValue(input.value) : "Choose time";
        button.classList.toggle("is-placeholder",!input.value);
      };
      const popover=clonePopover("timePickerPopoverTemplate");
      popover.hidden=true;
      popover.setAttribute("aria-label",input.getAttribute("aria-label")||"Choose time");
      wrapper.appendChild(button);
      document.body.appendChild(popover);
      let hour=0;
      let minute=0;
      let uses12Hour=false;
      const parseTime=()=>{
        const match=/^(\d{2}):(\d{2})/.exec(input.value);
        return match ? {hour:Number(match[1]),minute:Number(match[2])} : null;
      };
      const formatTime=()=>input.value ? formatTimeValue(input.value) : "Choose time";
      const emitChange=()=>{
        input.dispatchEvent(new Event("input",{bubbles:true}));
        input.dispatchEvent(new Event("change",{bubbles:true}));
      };
      const hourIndex=()=>uses12Hour?(hour%12||12)-1:hour;
      const makeOption=(label,attribute,value,selected)=>{
        const option=document.createElement("button");
        option.type="button";
        option.className=`timePickerOption${selected?" is-selected":""}`;
        option.setAttribute("role","option");
        option.setAttribute("aria-selected",String(selected));
        option.dataset[attribute]=String(value);
        option.textContent=label;
        return option;
      };
      const scrollSelected=()=>{
        popover.querySelectorAll(".timePickerOptions").forEach(list=>{
          list.scrollTop=Number(list.dataset.selectedIndex||0)*36;
        });
      };
      const syncWheel=(list,index)=>{
        const max=Number(list.dataset.optionCount)-1;
        index=Math.max(0,Math.min(max,index));
        const selectedScrollTop=index*36;
        if (Math.abs(list.scrollTop-selectedScrollTop)>0.5) list.scrollTop=selectedScrollTop;
        list.dataset.selectedIndex=String(index);
        list.querySelectorAll(".timePickerOption").forEach((option,optionIndex)=>{
          const selected=optionIndex===index;
          option.classList.toggle("is-selected",selected);
          option.setAttribute("aria-selected",String(selected));
        });
        const wheel=list.dataset.timeWheel;
        if (wheel==="hour") hour=uses12Hour ? (index+1)%12+(hour>=12?12:0) : index;
        if (wheel==="minute") minute=index;
        if (wheel==="period") hour=hour%12+(index===1?12:0);
      };
      const render=()=>{
        uses12Hour=getTimeFormat()==="12";
        const displayHour=uses12Hour ? hour%12||12 : hour;
        const hourOptions=popover.querySelector('[data-time-wheel="hour"]');
        const minuteOptions=popover.querySelector('[data-time-wheel="minute"]');
        const periodWheel=popover.querySelector('[data-time-wheel="period"]');
        const periodWrap=popover.querySelector("[data-time-period-wrap]");
        hourOptions.dataset.optionCount=String(uses12Hour?12:24);
        hourOptions.dataset.selectedIndex=String(hourIndex());
        minuteOptions.dataset.optionCount="60";
        minuteOptions.dataset.selectedIndex=String(minute);
        periodWheel.dataset.optionCount="2";
        periodWheel.dataset.selectedIndex=String(hour<12?0:1);
        periodWrap.hidden=!uses12Hour;
        hourOptions.replaceChildren();
        minuteOptions.replaceChildren();
        periodWheel.replaceChildren();
        Array.from({length:uses12Hour?12:24},(_,index)=>{
          const value=uses12Hour?index+1:index;
          hourOptions.appendChild(makeOption(String(value).padStart(2,"0"),"timeHour",value,value===displayHour));
        });
        Array.from({length:60},(_,value)=>{
          minuteOptions.appendChild(makeOption(String(value).padStart(2,"0"),"timeMinute",value,value===minute));
        });
        ["AM","PM"].forEach((period,index)=>{
          periodWheel.appendChild(makeOption(period,"timePeriod",period,index===(hour<12?0:1)));
        });
        if (!popover.hidden) scrollSelected();
      };
      const positionPopover=()=>{
        const rect=wrapper.getBoundingClientRect();
        const width=Math.min(278,window.innerWidth-24);
        popover.style.width=`${Math.max(1,width)}px`;
        popover.style.left=`${Math.max(12,Math.min(rect.left,window.innerWidth-width-12))}px`;
        popover.style.top=`${rect.bottom+6}px`;
        const popoverRect=popover.getBoundingClientRect();
        if (popoverRect.bottom>window.innerHeight-12) popover.style.top=`${Math.max(12,rect.top-popoverRect.height-6)}px`;
      };
      popover._timePosition=positionPopover;
      const close=()=>{ popover.hidden=true; button.setAttribute("aria-expanded","false"); };
      popover._popoverClose=close;
      popover.addEventListener("click",event=>{
        const action=event.target.closest("[data-time-action]")?.dataset.timeAction;
        if (action==="cancel"){
          close();
          button.focus();
        }else if (action==="save"){
          input.value=`${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`;
          updateLabel();
          emitChange();
          close();
          button.focus();
        }else{
          const selectedHour=event.target.closest("[data-time-hour]");
          const selectedMinute=event.target.closest("[data-time-minute]");
          const selectedPeriod=event.target.closest("[data-time-period]");
          if (selectedHour) syncWheel(popover.querySelector('[data-time-wheel="hour"]'),Number(selectedHour.dataset.timeHour)-(uses12Hour?1:0));
          if (selectedMinute) syncWheel(popover.querySelector('[data-time-wheel="minute"]'),Number(selectedMinute.dataset.timeMinute));
          if (selectedPeriod) syncWheel(popover.querySelector('[data-time-wheel="period"]'),selectedPeriod.dataset.timePeriod==="PM"?1:0);
        }
      });
      popover.addEventListener("scroll",event=>{
        const list=event.target.closest?.(".timePickerOptions");
        if (list){
          clearTimeout(list._scrollTimer);
          list._scrollTimer=setTimeout(()=>syncWheel(list,Math.round(list.scrollTop/36)),80);
        }
      },true);
      popover.addEventListener("keydown",event=>{
        if (event.key==="Escape"){ event.preventDefault(); close(); button.focus(); }
      });
      button.onclick=event=>{
        event.stopPropagation();
        if (!popover.hidden){ close(); return; }
        const selected=parseTime();
        if (selected){ hour=selected.hour; minute=selected.minute; }
        else { const now=new Date(); hour=now.getHours(); minute=now.getMinutes(); }
        uses12Hour=getTimeFormat()==="12";
        render();
        popover.hidden=false;
        button.setAttribute("aria-expanded","true");
        positionPopover();
        scrollSelected();
      };
      button.onkeydown=event=>{ if (event.key==="Enter" || event.key===" "){ event.preventDefault(); button.click(); } };
      input.addEventListener("change",updateLabel);
      updateLabel();
    }
    function enhanceTimeInputs(root=document){
      const selector='input[type="time"]:not([data-time-picker-enhanced])';
      if (root.matches?.(selector)) enhanceTimeInput(root);
      root.querySelectorAll(selector).forEach(enhanceTimeInput);
    }
    function repositionTimePickers(){
      document.querySelectorAll(".timePickerPopover:not([hidden])").forEach(popover=>popover._timePosition?.());
    }
    function refreshTimePickerLabels(){
      document.querySelectorAll(".timePickerWrap input[type=time]").forEach(input=>{
        const label=input.parentNode.querySelector(".timePickerButton span");
        if (label){
          label.textContent=input.value ? formatTimeValue(input.value) : "Choose time";
          label.parentNode.classList.toggle("is-placeholder",!input.value);
        }
      });
    }

    return Object.freeze({
      enhanceDateInput,
      enhanceDateInputs,
      enhanceTimeInput,
      enhanceTimeInputs,
      repositionTimePickers,
      refreshTimePickerLabels
    });
  }

  global.BeforeworkDateTimePickers=Object.freeze({create:createDateTimePickers});
})(window);
