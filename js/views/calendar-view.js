export class CalendarView {
  constructor(dependencies){
    this.dependencies=dependencies;
    this.mode="month";
  }

  render(board,scopeProject){
    const {
      calendarEntries,
      getCalendarCursor,
      setCalendarCursor,
      getState,
      todayStr,
      calendarDateKey,
      itemMatchesFilter,
      isItemCompleted,
      formatTimeValue,
      googleCalendarUrl,
      updateGoogleCalendarButtons,
      updateGoogleCalendarStatus,
      render,
      openNewCalendarItemModal,
      exportCalendarIcs,
      navigateToIntegrations,
      connectGoogleCalendar,
      getItem,
      scheduleSave,
      uid,
      toggleCalendarTaskCompletion,
      openItemModal,
      openStandaloneCalendarItemModal,
      cloneTemplate
    }=this.dependencies;
    const wrap = document.createElement("div");
    wrap.className = "calendarWrap";
    const view = cloneTemplate();
    const entries = calendarEntries(scopeProject);
    const cursor=getCalendarCursor();
    const mode=this.mode;
    const year=cursor.getFullYear();
    const month=cursor.getMonth();
    const monthLabel=cursor.toLocaleDateString(undefined,{month:"long",year:"numeric"});
    const today = todayStr(0);
    const dateKey=date=>calendarDateKey(date);
    const visibleDates=()=>{
      if (mode==="day") return [new Date(year,month,cursor.getDate())];
      if (mode==="week"){
        const start=new Date(year,month,cursor.getDate()-cursor.getDay());
        return Array.from({length:7},(_,index)=>new Date(start.getFullYear(),start.getMonth(),start.getDate()+index));
      }
      const firstDay=new Date(year,month,1).getDay();
      return Array.from({length:42},(_,index)=>new Date(year,month,index-firstDay+1));
    };
    const dates=visibleDates();
    const filteredEntries=entries.filter(entry=>itemMatchesFilter(entry.project,entry.item,entry.group));
    const makeEvent=(entry,{cellDate,index,weekLanes,compact=false}={})=>{
        const event = view.querySelector("#calendarEventTemplate").content.firstElementChild.cloneNode(true);
        const isEvent = entry.item.calendarType==="event";
        const isCompleted = isItemCompleted(entry.item);
        const isMultiDay = entry.endDate>entry.date;
        event.classList.toggle("event", isEvent);
        event.classList.toggle("task", !isEvent);
        event.classList.toggle("completed", isCompleted);
        event.classList.toggle("multiDay", isMultiDay);
        if (isMultiDay&&typeof index==="number"){
          const startsSegment = cellDate===entry.date || index%7===0;
          const endsSegment = cellDate===entry.endDate || index%7===6;
          event.classList.toggle("multiDayStart", startsSegment);
          event.classList.toggle("multiDayEnd", endsSegment);
          event.classList.toggle("multiDayLabel", startsSegment);
          event.classList.toggle("multiDayOrigin", cellDate===entry.date);
        }
        if (compact) event.classList.add("calendarScheduleEvent");
        event.dataset.pid = entry.project ? entry.project.id : "";
        event.dataset.gid = entry.group ? entry.group.id : "";
        event.dataset.iid = entry.item.id;
        event.dataset.fid = entry.field.id;
        event.dataset.start = entry.date;
        event.dataset.end = entry.endDate;
        const startTime = formatTimeValue(entry.item.startTime);
        const endTime = formatTimeValue(entry.item.endTime);
        const timeRange = startTime && endTime ? `${startTime} – ${endTime}` : startTime || endTime;
        const openButton = event.querySelector(".calendarEventOpen");
        openButton.setAttribute("aria-label",`Open ${entry.item.title||"Untitled item"} details`);
        event.querySelector(".eventTitle").textContent = `${timeRange ? timeRange+" " : ""}${entry.item.title}`;
        const startDateLabel = new Date(`${entry.date}T00:00:00`).toLocaleDateString(undefined,{dateStyle:"medium"});
        const endDateLabel = entry.endDate===entry.date ? "" : new Date(`${entry.endDate}T00:00:00`).toLocaleDateString(undefined,{dateStyle:"medium"});
        const dateRange = `${startDateLabel}${endDateLabel ? ` – ${endDateLabel}` : ""}`;
        const description = String(entry.item.description||"").trim();
        const eventDetails = [
          entry.item.title,
          `Date: ${dateRange}`,
          timeRange ? `Time: ${timeRange}` : "All day",
          entry.project ? `Project: ${entry.project.name}` : "",
          entry.group ? `Group: ${entry.group.name}` : "",
          entry.item.location ? `Location: ${entry.item.location}` : "",
          description
        ].filter(Boolean).join("\n");
        event.setAttribute("aria-label",eventDetails.replace(/\n/g,". "));
        event.calendarTooltipDetails = {
          type:isEvent ? "Event" : "Task",
          title:entry.item.title||"Untitled item",
          date:dateRange,
          time:timeRange||"All day",
          project:entry.project?.name||"",
          group:entry.group?.name||"",
          location:entry.item.location||"",
          description,
          googleUrl:googleCalendarUrl(entry),
          projectId:entry.project?.id||"",
          groupId:entry.group?.id||"",
          itemId:entry.item.id,
          isCompleted
        };
        const projectName = event.querySelector(".eventProject");
        if (compact || scopeProject || !entry.project) projectName.remove();
        else {
          projectName.textContent = entry.project.name;
          projectName.title = entry.project.name;
          projectName.hidden = false;
        }
        return event;
    };
    const grid=view.querySelector("[data-calendar-grid]");
    grid.replaceChildren();
    grid.classList.toggle("calendarGridMonth",mode==="month");
    grid.classList.toggle("calendarGridSchedule",mode!=="month");
    if (mode==="month"){
      const firstDay=new Date(year,month,1).getDay();
      const daysInMonth=new Date(year,month+1,0).getDate();
      const lanesByWeek=Array.from({length:6},()=>new Map());
      for (let week=0;week<6;week++){
        const weekStart=dateKey(new Date(year,month,1-firstDay+week*7));
        const weekEnd=dateKey(new Date(year,month,7-firstDay+week*7));
        const weekEntries=filteredEntries.filter(entry=>entry.date<=weekEnd&&entry.endDate>=weekStart)
          .sort((a,b)=>a.date.localeCompare(b.date)||b.endDate.localeCompare(a.endDate)||(a.item.title||"").localeCompare(b.item.title||""));
        const laneEnds=[];
        weekEntries.forEach(entry=>{
          let lane=laneEnds.findIndex(endDate=>endDate<entry.date);
          if (lane===-1) lane=laneEnds.length;
          laneEnds[lane]=entry.endDate;
          lanesByWeek[week].set(entry,lane);
        });
      }
      ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach(label=>{
        const weekday=document.createElement("div");
        weekday.className="calendarWeekday";
        weekday.textContent=label;
        grid.appendChild(weekday);
      });
      dates.forEach((cell,index)=>{
        const cellDate=dateKey(cell);
        const dayOffset=index-firstDay;
        const day=view.querySelector("#calendarDayTemplate").content.firstElementChild.cloneNode(true);
        day.dataset.date=cellDate;
        day.classList.toggle("muted",dayOffset<0||dayOffset>=daysInMonth);
        day.classList.toggle("today",cellDate===today);
        day.querySelector(".calendarDayNumber").textContent=String(cell.getDate());
        filteredEntries.filter(entry=>cellDate>=entry.date&&cellDate<=entry.endDate)
          .sort((a,b)=>(lanesByWeek[Math.floor(index/7)].get(a)??0)-(lanesByWeek[Math.floor(index/7)].get(b)??0))
          .forEach(entry=>day.appendChild(makeEvent(entry,{cellDate,index})));
        grid.appendChild(day);
      });
    }else{
      grid.classList.add(mode==="day"?"calendarGridDay":"calendarGridWeek");
      const schedule=document.createElement("div");
      schedule.className=`calendarSchedule calendarSchedule-${mode}`;
      const header=document.createElement("div");
      header.className="calendarScheduleHeader";
      const headerSpacer=document.createElement("div");
      headerSpacer.className="calendarScheduleGutter";
      header.appendChild(headerSpacer);
      dates.forEach(date=>{
        const key=dateKey(date);
        const dayHeader=document.createElement("div");
        dayHeader.className=`calendarScheduleDayHeader${key===today?" today":""}`;
        dayHeader.dataset.date=key;
        const weekday=document.createElement("span");
        weekday.textContent=date.toLocaleDateString(undefined,{weekday:"short"});
        const dayNumber=document.createElement("strong");
        dayNumber.textContent=String(date.getDate());
        dayHeader.append(weekday,dayNumber);
        header.appendChild(dayHeader);
      });
      const scheduleColumns=`60px repeat(${dates.length},minmax(${mode==="week"?"96px":"240px"},1fr))`;
      header.style.gridTemplateColumns=scheduleColumns;
      schedule.appendChild(header);
      const allDay=document.createElement("div");
      allDay.className="calendarAllDayRow";
      const allDayLabel=document.createElement("div");
      allDayLabel.className="calendarScheduleGutter calendarAllDayLabel";
      allDayLabel.textContent="All day";
      allDay.appendChild(allDayLabel);
      dates.forEach(date=>{
        const key=dateKey(date);
        const lane=document.createElement("div");
        lane.className=`calendarAllDayLane${key===today?" today":""}`;
        lane.dataset.date=key;
        filteredEntries.filter(entry=>key>=entry.date&&key<=entry.endDate&&(!entry.item.startTime||entry.endDate>entry.date))
          .forEach(entry=>lane.appendChild(makeEvent(entry,{cellDate:key,compact:true})));
        allDay.appendChild(lane);
      });
      allDay.style.gridTemplateColumns=scheduleColumns;
      schedule.appendChild(allDay);
      const timeGrid=document.createElement("div");
      timeGrid.className="calendarTimeGrid";
      const axis=document.createElement("div");
      axis.className="calendarTimeAxis";
      for (let hour=0;hour<24;hour++){
        const label=document.createElement("span");
        label.textContent=new Date(2000,0,1,hour).toLocaleTimeString(undefined,{hour:"numeric"});
        label.style.top=`${hour*60}px`;
        axis.appendChild(label);
      }
      timeGrid.appendChild(axis);
      dates.forEach(date=>{
        const key=dateKey(date);
        const lane=document.createElement("div");
        lane.className=`calendarTimeLane${key===today?" today":""}`;
        lane.dataset.date=key;
        const timed=filteredEntries.filter(entry=>key>=entry.date&&key<=entry.endDate
          &&entry.item.startTime&&entry.endDate===entry.date);
        const blocks=timed.map(entry=>{
          const [hour=9,minute=0]=entry.item.startTime.split(":").map(Number);
          const [endHour,endMinute]=entry.item.endTime?entry.item.endTime.split(":").map(Number):[hour+1,minute];
          const startMinutes=hour*60+minute;
          const endMinutes=Math.max(startMinutes+30,Math.min(1440,endHour*60+endMinute));
          return {entry,startMinutes,endMinutes,lane:0};
        }).sort((a,b)=>a.startMinutes-b.startMinutes||a.endMinutes-b.endMinutes);
        const laneEnds=[];
        blocks.forEach(block=>{
          let overlapLane=laneEnds.findIndex(end=>end<=block.startMinutes);
          if (overlapLane===-1) overlapLane=laneEnds.length;
          block.lane=overlapLane;
          laneEnds[overlapLane]=block.endMinutes;
        });
        blocks.forEach(block=>{
          const event=makeEvent(block.entry,{cellDate:key,compact:true});
          event.style.top=`${block.startMinutes}px`;
          event.style.height=`${Math.max(30,block.endMinutes-block.startMinutes)}px`;
          event.style.left=`${block.lane*100/Math.max(1,laneEnds.length)}%`;
          event.style.width=`${100/Math.max(1,laneEnds.length)}%`;
          lane.appendChild(event);
        });
        timeGrid.appendChild(lane);
      });
      timeGrid.style.gridTemplateColumns=scheduleColumns;
      schedule.appendChild(timeGrid);
      grid.appendChild(schedule);
    }
    const rangeStart=dates[0];
    const rangeEnd=dates[dates.length-1];
    const rangeLabel=mode==="month"?monthLabel:mode==="day"
      ?cursor.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric"})
      :rangeStart.getMonth()===rangeEnd.getMonth()
      ?`${rangeStart.toLocaleDateString(undefined,{month:"short",day:"numeric"})} – ${rangeEnd.toLocaleDateString(undefined,{day:"numeric",year:"numeric"})}`
      :`${rangeStart.toLocaleDateString(undefined,{month:"short",day:"numeric",...(rangeStart.getFullYear()!==rangeEnd.getFullYear()?{year:"numeric"}:{})})} – ${rangeEnd.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})}`;
    view.querySelector("[data-calendar-month]").textContent=rangeLabel;
    wrap.dataset.calendarView=mode;
    view.querySelectorAll("[data-calendar-view]").forEach(button=>{
      const selected=button.dataset.calendarView===mode;
      button.setAttribute("aria-pressed",String(selected));
      button.classList.toggle("selected",selected);
      button.onclick=()=>{ this.mode=button.dataset.calendarView; render(); };
    });
    const navigationUnit=mode==="month"?"month":mode;
    ["prev","next"].forEach(direction=>{
      const button=view.querySelector(`[data-calendar-action="${direction}"]`);
      const label=direction==="prev"?"Previous":"Next";
      button.setAttribute("aria-label",`${label} ${navigationUnit}`);
    });
    view.querySelector("[data-calendar-scope]").textContent = scopeProject ? scopeProject.name : "All projects";
    view.querySelectorAll("[data-calendar-global]").forEach(element=>{ element.hidden = !!scopeProject; });
    view.querySelector("[data-calendar-sync-status]").textContent = getState().googleLastSyncAt ? `Last synced ${new Date(getState().googleLastSyncAt).toLocaleString()}` : "Not synced yet";
    wrap.appendChild(view);
    updateGoogleCalendarButtons();
    const shiftCursor=amount=>{
      if (mode==="day") return new Date(year,month,cursor.getDate()+amount);
      if (mode==="week") return new Date(year,month,cursor.getDate()+amount*7);
      const targetMonth=month+amount;
      return new Date(year,targetMonth,Math.min(cursor.getDate(),new Date(year,targetMonth+1,0).getDate()));
    };
    wrap.querySelector('[data-calendar-action="prev"]').onclick = () => { setCalendarCursor(shiftCursor(-1)); render(); };
    wrap.querySelector('[data-calendar-action="next"]').onclick = () => { setCalendarCursor(shiftCursor(1)); render(); };
    wrap.querySelector('[data-calendar-action="today"]').onclick = () => { const now = new Date(); setCalendarCursor(new Date(now.getFullYear(),now.getMonth(),now.getDate())); render(); };
    wrap.querySelector('[data-calendar-action="new"]').onclick = () => openNewCalendarItemModal(scopeProject, todayStr(0));
    wrap.querySelector('[data-calendar-action="ics"]').onclick = () => exportCalendarIcs(scopeProject);
    const calendarMenuButton=wrap.querySelector(".calendarToolbarMenuBtn");
    const calendarMenu=wrap.querySelector(".calendarToolbarMenu");
    window.BeforeworkActionMenu.create().register(calendarMenuButton,calendarMenu);
    const integrationsButton = wrap.querySelector('[data-calendar-action="integrations"]');
    if (integrationsButton) integrationsButton.onclick = navigateToIntegrations;
    const googleButton = wrap.querySelector('[data-calendar-action="google"]');
    if (googleButton) googleButton.onclick = () => connectGoogleCalendar(null);
    updateGoogleCalendarStatus();
    wrap.querySelectorAll(".calendarDay,.calendarAllDayLane,.calendarTimeLane").forEach(day=>{
      day.addEventListener("click", event=>{
        if (event.target.closest(".calendarEvent")) return;
        if (!day.classList.contains("muted")&&day.dataset.date) openNewCalendarItemModal(scopeProject, day.dataset.date);
      });
      day.addEventListener("dragover", event=>{ event.preventDefault(); day.classList.add("dragover"); });
      day.addEventListener("dragleave", ()=>day.classList.remove("dragover"));
      day.addEventListener("drop", event=>{
        event.preventDefault(); day.classList.remove("dragover");
        const data = JSON.parse(event.dataTransfer.getData("text/plain"));
        const item = data.pid
          ? getItem(data.pid,data.gid,data.iid)
          : (getState().calendarItems||[]).find(candidate=>candidate.id===data.iid);
        if (!item) return;
        if (data.fid === "__standalone__") item.startDate = day.dataset.date;
        else if (data.fid === "__schedule__") item.endDate = day.dataset.date;
        else item.values[data.fid] = day.dataset.date;
        const start = new Date(`${data.start}T00:00:00`);
        const end = new Date(`${data.end}T00:00:00`);
        const duration = Math.max(0, Math.round((end-start)/86400000));
        item.endDate = calendarDateKey(new Date(new Date(`${day.dataset.date}T00:00:00`).getTime() + duration*86400000));
        item.updatedAt = Date.now();
        scheduleSave(); render();
      });
    });
    let activeCalendarPopover = null;
    let calendarPopoverHideTimer = 0;
    let suppressCalendarPopoverFocus = false;
    const hideCalendarPopover = () => {
      clearTimeout(calendarPopoverHideTimer);
      if (!activeCalendarPopover) return;
      activeCalendarPopover.trigger.removeAttribute("aria-describedby");
      activeCalendarPopover.trigger.removeAttribute("aria-controls");
      activeCalendarPopover.trigger.removeAttribute("aria-haspopup");
      activeCalendarPopover.trigger.setAttribute("aria-expanded","false");
      activeCalendarPopover.element.remove();
      activeCalendarPopover = null;
    };
    const positionCalendarPopover = (anchor,popover) => {
      const anchorRect = anchor.getBoundingClientRect();
      const popoverRect = popover.getBoundingClientRect();
      const margin = 12;
      let left = anchorRect.left;
      if (left+popoverRect.width>window.innerWidth-margin) left = anchorRect.right-popoverRect.width;
      left = Math.max(margin,Math.min(left,window.innerWidth-popoverRect.width-margin));
      let top = anchorRect.bottom+8;
      if (top+popoverRect.height>window.innerHeight-margin) top = anchorRect.top-popoverRect.height-8;
      top = Math.max(margin,Math.min(top,window.innerHeight-popoverRect.height-margin));
      popover.style.left = `${left}px`;
      popover.style.top = `${top}px`;
    };
    wrap.addEventListener("scroll",hideCalendarPopover,{passive:true});
    wrap.querySelectorAll(".calendarEvent").forEach(event=>{
      const schedulePopoverHide = () => {
        clearTimeout(calendarPopoverHideTimer);
        calendarPopoverHideTimer = window.setTimeout(()=>{
          if (activeCalendarPopover?.anchor!==event) return;
          if (event.matches(":hover,:focus-within") || activeCalendarPopover.element.matches(":hover") || activeCalendarPopover.element.contains(document.activeElement)) return;
          hideCalendarPopover();
        },160);
      };
      const showCalendarPopover = () => {
        clearTimeout(calendarPopoverHideTimer);
        if (activeCalendarPopover?.anchor===event) return;
        hideCalendarPopover();
        const details = event.calendarTooltipDetails;
        const trigger = event.querySelector(".calendarEventOpen");
        const popover = document.createElement("div");
        popover.className = "calendarContextPopover";
        popover.id = `calendar-context-${uid()}`;
        popover.setAttribute("role","dialog");
        popover.setAttribute("aria-label",`${details.type} details`);
        const header = document.createElement("div");
        header.className = "calendarContextHeader";
        const heading = document.createElement("div");
        heading.className = "calendarContextHeading";
        const type = document.createElement("span");
        type.className = "calendarContextType";
        type.textContent = details.type;
        const title = document.createElement("strong");
        title.className = "calendarContextTitle";
        title.textContent = details.title;
        heading.append(type,title);
        header.appendChild(heading);
        const googleLink = document.createElement("a");
        googleLink.className = "calendarContextGoogleLink";
        googleLink.href = details.googleUrl;
        googleLink.target = "_blank";
        googleLink.rel = "noopener";
        googleLink.title = "Add to Google Calendar";
        const googleIcon = document.createElement("iconify-icon");
        googleIcon.setAttribute("icon","mdi:open-in-new");
        googleIcon.setAttribute("aria-hidden","true");
        const googleLabel = document.createElement("span");
        googleLabel.textContent = "Google Calendar";
        googleLink.append(googleIcon,googleLabel);
        header.appendChild(googleLink);
        popover.appendChild(header);
        const facts = document.createElement("div");
        facts.className = "calendarContextFacts";
        const addFact = (label,value) => {
          if (!value) return;
          const row = document.createElement("div");
          row.className = "calendarContextFact";
          const factLabel = document.createElement("span");
          factLabel.className = "calendarContextFactLabel";
          factLabel.textContent = label;
          const factValue = document.createElement("span");
          factValue.className = "calendarContextFactValue";
          factValue.textContent = value;
          row.append(factLabel,factValue);
          facts.appendChild(row);
        };
        addFact("Date",details.date);
        addFact("Time",details.time);
        if (details.type==="Task") addFact("Status",details.isCompleted ? "Completed" : "Open");
        addFact("Project",details.project);
        addFact("Group",details.group);
        addFact("Location",details.location);
        popover.appendChild(facts);
        if (details.description){
          const description = document.createElement("div");
          description.className = "calendarContextDescription markdownBody";
          description.innerHTML = window.BeforeworkMarkdown.render(details.description);
          popover.appendChild(description);
        }
        if (details.type==="Task"){
          const footer = document.createElement("div");
          footer.className = "calendarContextFooter";
          const completeButton = document.createElement("button");
          completeButton.type = "button";
          completeButton.className = `btn btn-sm calendarContextCompleteBtn${details.isCompleted?" isCompleted":" btn-primary"}`;
          completeButton.setAttribute("aria-label",details.isCompleted ? "Reopen task" : "Mark task complete");
          const completeIcon = document.createElement("iconify-icon");
          completeIcon.setAttribute("icon",details.isCompleted ? "mdi:check-circle" : "mdi:check-circle-outline");
          completeIcon.setAttribute("aria-hidden","true");
          const completeLabel = document.createElement("span");
          completeLabel.textContent = details.isCompleted ? "Reopen" : "Mark complete";
          completeButton.append(completeIcon,completeLabel);
          completeButton.onclick = async click=>{
            click.stopPropagation();
            if (!await toggleCalendarTaskCompletion(details)) return;
            hideCalendarPopover();
            render();
          };
          footer.appendChild(completeButton);
          popover.appendChild(footer);
        }
        document.body.appendChild(popover);
        activeCalendarPopover = {anchor:event,element:popover,type:details.type};
        activeCalendarPopover.trigger = trigger;
        trigger.setAttribute("aria-describedby",popover.id);
        trigger.setAttribute("aria-haspopup","dialog");
        trigger.setAttribute("aria-controls",popover.id);
        trigger.setAttribute("aria-expanded","true");
        positionCalendarPopover(event,popover);
        popover.addEventListener("pointerenter",()=>clearTimeout(calendarPopoverHideTimer));
        popover.addEventListener("pointerleave",schedulePopoverHide);
        popover.addEventListener("keydown",keyEvent=>{
          if (keyEvent.key!=="Escape") return;
          hideCalendarPopover();
          suppressCalendarPopoverFocus = true;
          trigger.focus();
          suppressCalendarPopoverFocus = false;
        });
      };
      event.addEventListener("pointerenter",showCalendarPopover);
      event.addEventListener("pointerleave",schedulePopoverHide);
      event.addEventListener("focusin",()=>{ if (!suppressCalendarPopoverFocus) showCalendarPopover(); });
      event.addEventListener("focusout",focusEvent=>{
        if (!event.contains(focusEvent.relatedTarget)) schedulePopoverHide();
      });
      event.addEventListener("keydown",keyEvent=>{
        if (keyEvent.key==="ArrowDown" && activeCalendarPopover?.anchor===event){
          const actionButton = activeCalendarPopover.element.querySelector(".calendarContextCompleteBtn,.calendarContextGoogleLink");
          if (actionButton){ actionButton.focus(); keyEvent.preventDefault(); }
        } else if (keyEvent.key==="Escape" && activeCalendarPopover?.anchor===event){
          hideCalendarPopover();
          suppressCalendarPopoverFocus = true;
          event.querySelector(".calendarEventOpen").focus();
          suppressCalendarPopoverFocus = false;
        }
      });
      event.addEventListener("dragstart", dragEvent=>{
        dragEvent.dataTransfer.setData("text/plain", JSON.stringify({pid:event.dataset.pid,gid:event.dataset.gid,iid:event.dataset.iid,fid:event.dataset.fid,start:event.dataset.start,end:event.dataset.end}));
      });
      event.onclick = click => {
        if (click.target.closest("a")) return;
        hideCalendarPopover();
        if (event.dataset.pid) openItemModal(event.dataset.pid,event.dataset.gid,event.dataset.iid);
        else {
          const item = (getState().calendarItems||[]).find(candidate=>candidate.id===event.dataset.iid);
          if (item) openStandaloneCalendarItemModal(item);
        }
      };
    });
    board.appendChild(wrap);
    updateGoogleCalendarButtons();
  }
}
