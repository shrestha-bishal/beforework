export class CalendarView {
  constructor(dependencies){
    this.dependencies=dependencies;
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
    const year = getCalendarCursor().getFullYear();
    const month = getCalendarCursor().getMonth();
    const monthLabel = getCalendarCursor().toLocaleDateString(undefined,{month:"long",year:"numeric"});
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const today = todayStr(0);
    const lanesByWeek = Array.from({length:6},()=>new Map());
    for (let week=0; week<6; week++){
      const weekStart = calendarDateKey(new Date(year, month, 1-firstDay+week*7));
      const weekEnd = calendarDateKey(new Date(year, month, 7-firstDay+week*7));
      const weekEntries = entries.filter(entry=>entry.date<=weekEnd && entry.endDate>=weekStart && itemMatchesFilter(entry.project, entry.item, entry.group))
        .sort((a,b)=>a.date.localeCompare(b.date) || b.endDate.localeCompare(a.endDate) || (a.item.title||"").localeCompare(b.item.title||""));
      const laneEnds = [];
      weekEntries.forEach(entry=>{
        let lane = laneEnds.findIndex(endDate=>endDate<entry.date);
        if (lane===-1) lane = laneEnds.length;
        laneEnds[lane] = entry.endDate;
        lanesByWeek[week].set(entry,lane);
      });
    }
    const cells = [];
    for (let index=0; index<42; index++){
      const dayOffset = index - firstDay;
      const cell = new Date(year, month, dayOffset + 1);
      const dateNumber = cell.getDate();
      const cellDate = calendarDateKey(cell);
      const inMonth = dayOffset >= 0 && dayOffset < daysInMonth;
      const weekLanes = lanesByWeek[Math.floor(index/7)];
      const dayEntries = entries.filter(entry=>cellDate>=entry.date && cellDate<=entry.endDate && itemMatchesFilter(entry.project, entry.item, entry.group))
        .sort((a,b)=>weekLanes.get(a)-weekLanes.get(b));
      const day = view.querySelector("#calendarDayTemplate").content.firstElementChild.cloneNode(true);
      day.dataset.date = cellDate;
      day.classList.toggle("muted", !inMonth);
      day.classList.toggle("today", cellDate===today);
      day.querySelector(".calendarDayNumber").textContent = String(dateNumber);
      dayEntries.forEach(entry=>{
        const event = view.querySelector("#calendarEventTemplate").content.firstElementChild.cloneNode(true);
        const isEvent = entry.item.calendarType==="event";
        const isCompleted = isItemCompleted(entry.item);
        const isMultiDay = entry.endDate>entry.date;
        event.classList.toggle("event", isEvent);
        event.classList.toggle("task", !isEvent);
        event.classList.toggle("completed", isCompleted);
        event.classList.toggle("multiDay", isMultiDay);
        if (isMultiDay){
          const startsSegment = cellDate===entry.date || index%7===0;
          const endsSegment = cellDate===entry.endDate || index%7===6;
          event.classList.toggle("multiDayStart", startsSegment);
          event.classList.toggle("multiDayEnd", endsSegment);
          event.classList.toggle("multiDayLabel", startsSegment);
          event.classList.toggle("multiDayOrigin", cellDate===entry.date);
        }
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
        if (scopeProject || !entry.project) projectName.remove();
        else {
          projectName.textContent = entry.project.name;
          projectName.title = entry.project.name;
          projectName.hidden = false;
        }
        day.appendChild(event);
      });
      cells.push(day);
    }
    view.querySelector("[data-calendar-month]").textContent = monthLabel;
    view.querySelector("[data-calendar-scope]").textContent = scopeProject ? scopeProject.name : "All projects";
    view.querySelectorAll("[data-calendar-global]").forEach(element=>{ element.hidden = !!scopeProject; });
    view.querySelector("[data-calendar-sync-status]").textContent = getState().googleLastSyncAt ? `Last synced ${new Date(getState().googleLastSyncAt).toLocaleString()}` : "Not synced yet";
    const grid = view.querySelector(".calendarGrid");
    cells.forEach(day=>grid.appendChild(day));
    wrap.appendChild(view);
    updateGoogleCalendarButtons();
    wrap.querySelector('[data-calendar-action="prev"]').onclick = () => { setCalendarCursor(new Date(year, month-1, 1)); render(); };
    wrap.querySelector('[data-calendar-action="next"]').onclick = () => { setCalendarCursor(new Date(year, month+1, 1)); render(); };
    wrap.querySelector('[data-calendar-action="today"]').onclick = () => { const now = new Date(); setCalendarCursor(new Date(now.getFullYear(), now.getMonth(), 1)); render(); };
    wrap.querySelector('[data-calendar-action="new"]').onclick = () => openNewCalendarItemModal(scopeProject, todayStr(0));
    wrap.querySelector('[data-calendar-action="ics"]').onclick = () => exportCalendarIcs(scopeProject);
    const integrationsButton = wrap.querySelector('[data-calendar-action="integrations"]');
    if (integrationsButton) integrationsButton.onclick = navigateToIntegrations;
    const googleButton = wrap.querySelector('[data-calendar-action="google"]');
    if (googleButton) googleButton.onclick = () => connectGoogleCalendar(null);
    updateGoogleCalendarStatus();
    wrap.querySelectorAll(".calendarDay").forEach(day=>{
      day.addEventListener("click", event=>{
        if (event.target.closest(".calendarEvent")) return;
        if (!day.classList.contains("muted")) openNewCalendarItemModal(scopeProject, day.dataset.date);
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
