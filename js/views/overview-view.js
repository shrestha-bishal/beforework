export class OverviewView {
  constructor({getState,model,actions,overviewDetailsView,cloneTemplate}){
    this.getState=getState;
    this.model=model;
    this.actions=actions;
    this.overviewDetailsView=overviewDetailsView;
    this.cloneTemplate=cloneTemplate;
  }

  render(board){
    const state=this.getState();
    const {overviewDetailsView,cloneTemplate}=this;
    const {allItemsFlat,isItemCompleted,dueDateField,priorityField,priorityOptions,todayStr,projectRecords,formatUpdatedAt,priorityColor}=this.model;
    const {scheduleSave,selectProject,openItemModal,openStandaloneCalendarItemModal,showNotice,openNewCalendarItemModal,showDialog,ensureProjectLoaded,addItem,navigateCalendar}=this.actions;

    const wrap = document.createElement("div");
    wrap.className = "overviewWrap";
    const projects=this.model.visibleProjects(projectRecords());
    const hiddenProjectIds=new Set(projectRecords().filter(project=>project.hiddenFromOverview).map(project=>project.id));
    const flat = allItemsFlat();
    const activeItems = flat.filter(row=>!row.item.archived&&!hiddenProjectIds.has(row.project.id));
    const openItems = activeItems.filter(row=>!isItemCompleted(row.item));
    const completedItems = activeItems.filter(row=>isItemCompleted(row.item));
    function dueOf(row){
      const field = dueDateField(row.project);
      return field ? row.item.values[field.id] : row.item.endDate||"";
    }
    function priorityOf(r){ const f = priorityField(r.project); return f ? (r.item.values[f.id]||"") : ""; }
    function priorityLabelOf(row){
      const value=priorityOf(row);
      return priorityOptions(row.project).find(option=>option.id===value)?.label||value;
    }
    const today = todayStr(0);
    const weekEnd = todayStr(7);
    const overdue = openItems.filter(row=>dueOf(row) && dueOf(row)<today);
    const dueThisWeek = openItems.filter(row=>dueOf(row)>=today && dueOf(row)<=weekEnd);
    const recent = [...activeItems].sort((a,b)=>b.item.updatedAt-a.item.updatedAt).slice(0,5);

    function priorityBreakdown(){
      const counts=new Map();
      let noneCount=0;
      projects.forEach(project=>{
        priorityOptions(project).forEach(option=>{
          const key=`${option.label}\u0000${option.color}`;
          if (!counts.has(key)) counts.set(key,{label:option.label,color:option.color,rank:option.rank,count:0});
        });
      });
      openItems.forEach(row=>{
        const value=priorityOf(row);
        const option=priorityOptions(row.project).find(candidate=>candidate.id===value);
        if (!option){ noneCount++; return; }
        const key=`${option.label}\u0000${option.color}`;
        const current=counts.get(key)||{label:option.label,color:option.color,rank:option.rank,count:0};
        current.count++;
        counts.set(key,current);
      });
      const rows=[...counts.values()].sort((first,second)=>
        (second.rank??0)-(first.rank??0)||first.label.localeCompare(second.label)
      );
      rows.push({label:"No priority",color:"var(--color-neutral-muted)",count:noneCount});
      const max=Math.max(1,...rows.map(row=>row.count));
      const fragment = document.createDocumentFragment();
      rows.forEach((row,index)=>{
        if (index) fragment.appendChild(cloneElement("overviewDividerTemplate"));
        const element = cloneElement("overviewPriorityRowTemplate");
        element.querySelector("[data-priority-label]").textContent=row.label;
        const fill = element.querySelector("[data-priority-fill]");
        fill.style.width=`${row.count/max*100}%`;
        fill.style.background=row.color;
        element.querySelector("[data-priority-count]").textContent=String(row.count);
        fragment.appendChild(element);
      });
      return fragment;
    }
    function projectBreakdown(){
      const fragment=document.createDocumentFragment();
      if (!projects.length){
        fragment.appendChild(quietMessage(projectRecords().length?"All projects are hidden from Overview.":"No projects yet."));
        return fragment;
      }
      projects.forEach((project,index)=>{
        const projectItems = state.folderLazy
          ? project.itemIndex.filter(item=>!item.archived)
          : [
            ...project.groups.flatMap(group=>group.items.filter(item=>!item.archived).map(item=>({group,item}))),
            ...(project.items||[]).filter(item=>!item.archived).map(item=>({item,group:{name:"Unassigned"}}))
          ];
        const complete = projectItems.filter(row=>isItemCompleted(row.item)).length;
        const percent = projectItems.length ? Math.round(complete/projectItems.length*100) : 0;
        if (index) fragment.appendChild(cloneElement("overviewDividerTemplate"));
        const element=cloneElement("overviewProjectRowTemplate");
        element.dataset.overviewProject=project.id;
        element.querySelector("[data-project-name]").textContent=project.name;
        element.querySelector("[data-project-percent]").textContent=`${percent}%`;
        const progress=element.querySelector("[data-project-progress]");
        progress.setAttribute("aria-label",`${project.name} progress`);
        progress.setAttribute("aria-valuemin","0");
        progress.setAttribute("aria-valuemax","100");
        progress.setAttribute("aria-valuenow",String(percent));
        progress.querySelector("[data-project-fill]").style.width=`${percent}%`;
        element.querySelector("[data-project-meta]").textContent=`${complete} of ${projectItems.length} complete`;
        fragment.appendChild(element);
      });
      return fragment;
    }
    function focusSummary(){
      const now = Date.now();
      const weekStart = new Date(now);
      weekStart.setHours(0,0,0,0);
      weekStart.setDate(weekStart.getDate()-((weekStart.getDay()+6)%7));
      const sessions = (state.focusSessions||[]).filter(session=>session &&
        Number.isFinite(session.completedAt) && session.completedAt>=weekStart.getTime() && session.completedAt<=now &&
        Number.isFinite(session.durationSeconds) && session.durationSeconds>0 &&
        !hiddenProjectIds.has(session.projectId));
      const byProject = new Map();
      let totalSeconds = 0;
      sessions.forEach(session=>{
        const project = projects.find(candidate=>candidate.id===session.projectId);
        const key = project ? project.id : (session.projectId ? `deleted:${session.projectId}` : "__unassigned__");
        const name = project ? project.name : (session.projectId ? "Deleted project" : "Unassigned");
        const entry = byProject.get(key) || {name, seconds:0, count:0};
        entry.seconds += session.durationSeconds;
        entry.count++;
        totalSeconds += session.durationSeconds;
        byProject.set(key, entry);
      });
      const formatDuration = seconds=>{
        const totalMinutes = Math.floor(seconds/60);
        const hours = Math.floor(totalMinutes/60);
        const minutes = totalMinutes%60;
        return hours ? `${hours}h${minutes?` ${minutes}m`:""}` : `${totalMinutes}m`;
      };
      const summary=cloneElement("overviewFocusSummaryTemplate");
      summary.querySelector("[data-focus-total]").textContent=formatDuration(totalSeconds);
      summary.querySelector("[data-focus-count]").textContent=`${sessions.length} completed session${sessions.length===1?"":"s"}`;
      const rows=summary.querySelector("[data-focus-rows]");
      const entries=[...byProject.values()].sort((a,b)=>b.seconds-a.seconds);
      if (!entries.length){
        rows.appendChild(quietMessage("Completed sessions will appear here."));
        return summary;
      }
      entries.forEach((entry,index)=>{
        if (index) rows.appendChild(cloneElement("overviewDividerTemplate"));
        const row=cloneElement("overviewFocusRowTemplate");
        row.querySelector("[data-focus-project]").textContent=entry.name;
        row.querySelector("[data-focus-duration]").textContent=formatDuration(entry.seconds);
        row.querySelector("[data-focus-sessions]").textContent=`${entry.count} focus session${entry.count===1?"":"s"}`;
        rows.appendChild(row);
      });
      return summary;
    }
    function workloadChart(rows){
      const counts = rows.map(day=>scheduled.filter(row=>row.date===day.date).length);
      const max = Math.max(1,...counts);
      const svg=cloneElement("overviewWorkloadChartTemplate");
      const bars=svg.querySelector("[data-workload-bars]");
      const svgNamespace="http://www.w3.org/2000/svg";
      rows.forEach((day,index)=>{
        const x = 46+index*72;
        const height = counts[index] ? counts[index]/max*104 : 2;
        const y = 132-height;
        const label = new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined,{weekday:"short"});
        const group=document.createElementNS(svgNamespace,"g");
        group.setAttribute("class","overviewChartBar");
        const title=document.createElementNS(svgNamespace,"title");
        title.textContent=`${label}: ${counts[index]} item${counts[index]===1?"":"s"}`;
        const rect=document.createElementNS(svgNamespace,"rect");
        rect.setAttribute("x",String(x));
        rect.setAttribute("y",String(y));
        rect.setAttribute("width","34");
        rect.setAttribute("height",String(height));
        rect.setAttribute("rx","5");
        rect.setAttribute("fill","var(--accent)");
        rect.setAttribute("opacity",counts[index]?".82":".18");
        const dayLabel=document.createElementNS(svgNamespace,"text");
        dayLabel.setAttribute("x",String(x+17));
        dayLabel.setAttribute("y","151");
        dayLabel.setAttribute("text-anchor","middle");
        dayLabel.textContent=label;
        const count=document.createElementNS(svgNamespace,"text");
        count.setAttribute("class","overviewChartValue");
        count.setAttribute("x",String(x+17));
        count.setAttribute("y",String(Math.max(18,y-7)));
        count.setAttribute("text-anchor","middle");
        count.textContent=String(counts[index]);
        group.append(title,rect,dayLabel,count);
        bars.appendChild(group);
      });
      return svg;
    }
    function taskStatusChart(){
      const total = openItems.length+completedItems.length;
      const circumference = 2*Math.PI*48;
      const completeLength = total ? completedItems.length/total*circumference : 0;
      const fragment=cloneTemplateElement("overviewStatusChartTemplate");
      fragment.querySelector("[data-status-label]").setAttribute("aria-label",`${openItems.length} open and ${completedItems.length} completed items`);
      fragment.querySelector("[data-status-complete]").setAttribute("stroke-dasharray",`${completeLength} ${circumference}`);
      fragment.querySelector("[data-status-total]").textContent=String(total);
      fragment.querySelector("[data-status-open]").textContent=String(openItems.length);
      fragment.querySelector("[data-status-completed]").textContent=String(completedItems.length);
      return fragment;
    }

    const view = cloneTemplate();
    function cloneTemplateElement(id){
      const template=view.querySelector(`#${id}`);
      if (!template) throw new Error(`Missing overview template: ${id}`);
      return template.content.cloneNode(true);
    }
    function cloneElement(id){ return cloneTemplateElement(id).firstElementChild; }
    function quietMessage(message){
      const element=cloneElement("overviewQuietTemplate");
      element.textContent=message;
      return element;
    }
    const statRows = [
      {value:projects.length,label:"Projects",detail:"Across your workspace",icon:"mdi:folder-multiple-outline",tone:"projects",searchable:true},
      {value:openItems.length,label:"Open items",detail:"Ready for your attention",icon:"mdi:progress-clock",tone:"open",searchable:true},
      {value:overdue.length,label:"Overdue",detail:overdue.length ? "Past their due date" : "You're all caught up",icon:"mdi:alert-circle-outline",tone:"overdue",searchable:true},
      {value:completedItems.length,label:"Completed",detail:"Marked complete",icon:"mdi:check-circle-outline",tone:"completed",searchable:true}
    ];
    function openOverviewStatDetails(tone){
      overviewDetailsView.open({
        tone,
        stats:statRows,
        data:{projects,openItems,overdueItems:overdue,completedItems,isItemCompleted,dueOf,priorityOf,priorityLabelOf},
        actions:{openProject:selectProject,openItem:openItemModal}
      }).catch(error=>showNotice("Couldn't load overview details",error.message));
    }
    const stats = view.querySelector("[data-overview-stats]");
    statRows.forEach(({value,label,detail,icon,tone},index)=>{
      const row = cloneElement("overviewStatTemplate");
      row.classList.add(`overviewStat-${tone}`);
      if (tone==="overdue") row.classList.add(overdue.length?"has-overdue":"is-clear");
      row.dataset.overviewStat=tone;
      row.setAttribute("aria-label",`${value} ${label}. Show details`);
      const iconElement = row.querySelector("[data-stat-icon]");
      iconElement.setAttribute("icon",icon);
      row.querySelector("[data-stat-value]").textContent=String(value);
      row.querySelector("[data-stat-label]").textContent=label;
      row.querySelector("[data-stat-detail]").textContent=detail;
      stats.appendChild(row);
      if (index===1){
        const divider=cloneElement("overviewDividerTemplate");
        divider.classList.add("overviewStatsDivider");
        stats.appendChild(divider);
      }
    });
    const scheduled = [];
    openItems.forEach(row=>{
      const date = dueOf(row);
      if (date && date>=today && date<=weekEnd) scheduled.push({...row,date,source:"project"});
    });
    (state.calendarItems||[]).filter(item=>!item.archived).forEach(item=>{
      const startDate = item.startDate || item.endDate;
      const endDate = item.endDate && item.endDate>=startDate ? item.endDate : startDate;
      if (!startDate || endDate<today || startDate>weekEnd) return;
      for (let offset=0; offset<7; offset++){
        const date = todayStr(offset);
        if (date>=startDate && date<=endDate) scheduled.push({item,date,project:null,group:null,source:"calendar"});
      }
    });
    scheduled.sort((a,b)=>a.date.localeCompare(b.date) || (a.item.startTime||"").localeCompare(b.item.startTime||""));
    const timeline=view.querySelector("[data-overview-timeline]");
    const timelineDays=document.createDocumentFragment();
    Array.from({length:7},(_,offset)=>{
      const date = todayStr(offset);
      const items = scheduled.filter(row=>row.date===date);
      const day = new Date(`${date}T00:00:00`);
      const dayElement=cloneElement("overviewTimelineDayTemplate");
      if (offset===0) dayElement.classList.add("today");
      dayElement.querySelector("[data-day-name]").textContent=day.toLocaleDateString(undefined,{weekday:"short"});
      dayElement.querySelector("[data-day-number]").textContent=String(day.getDate());
      const entryContainer=dayElement.querySelector("[data-day-entries]");
      items.slice(0,3).forEach(row=>{
        const entry=cloneElement("overviewTimelineItemTemplate");
        if (row.source==="project"){
          entry.dataset.pid=row.project.id;
          entry.dataset.gid=row.group.id;
          entry.dataset.iid=row.item.id;
        }else entry.dataset.calendarId=row.item.id;
        entry.querySelector("[data-timeline-title]").textContent=row.item.title||"Untitled item";
        entry.querySelector("[data-timeline-subtitle]").textContent=row.source==="project"
          ? `${row.project.name} / ${row.group.name}`
          : "Calendar item";
        entryContainer.appendChild(entry);
      });
      dayElement.querySelector("[data-day-empty]").hidden=items.length>0;
      const more=dayElement.querySelector("[data-day-more]");
      more.hidden=items.length<=3;
      if (items.length>3) more.textContent=`+${items.length-3} more`;
      timelineDays.appendChild(dayElement);
    });
    timeline.replaceChildren(timelineDays);
    const chart=view.querySelector("[data-overview-week-chart]");
    chart.replaceChildren(workloadChart(Array.from({length:7},(_,offset)=>({date:todayStr(offset)}))));
    view.querySelector("[data-overview-status-chart]").replaceChildren(taskStatusChart());
    view.querySelector("[data-overview-projects]").replaceChildren(projectBreakdown());
    view.querySelector("[data-overview-priorities]").replaceChildren(priorityBreakdown());
    view.querySelector("[data-overview-focus]").replaceChildren(focusSummary());
    const recentList=view.querySelector("[data-overview-recent]");
    if (!recent.length) recentList.appendChild(quietMessage("No project activity yet."));
    recent.forEach((row,index)=>{
      if (index) recentList.appendChild(cloneElement("overviewDividerTemplate"));
      const element=cloneElement("overviewRecentRowTemplate");
      element.dataset.pid=row.project.id;
      element.dataset.gid=row.group.id;
      element.dataset.iid=row.item.id;
      element.querySelector("[data-recent-title]").textContent=row.item.title;
      element.querySelector("[data-recent-project-group]").textContent=`${row.project.name} / ${row.group.name}`;
      element.querySelector("[data-recent-updated]").textContent=`· ${formatUpdatedAt(row.item.updatedAt)}`;
      const priority=priorityOf(row);
      const priorityDot=element.querySelector("[data-recent-priority]");
      priorityDot.hidden=!priority;
      if (priority){
        const color=priorityColor(row.project,priority);
        priorityDot.style.background=color;
        priorityDot.title=`${priorityLabelOf(row)} ${priorityField(row.project)?.label||"Priority"}`;
      }
      recentList.appendChild(element);
    });
    const cardContainer = view.querySelector("[data-overview-reorder-container]");
    const cardOrder = Array.isArray(state.overviewCardOrder) ? state.overviewCardOrder : [];
    const cards = [...cardContainer.querySelectorAll("[data-overview-card]")];
    cards.sort((a,b)=>{
      const aIndex = cardOrder.indexOf(a.dataset.overviewCard);
      const bIndex = cardOrder.indexOf(b.dataset.overviewCard);
      return (aIndex<0 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex<0 ? Number.MAX_SAFE_INTEGER : bIndex);
    }).forEach(card=>cardContainer.appendChild(card));
    const cardLayouts = state.overviewCardLayouts && typeof state.overviewCardLayouts==="object" ? state.overviewCardLayouts : {};
    const clamp = (value,min,max)=>Math.max(min,Math.min(max,value));
    function getGridMetrics(){
      const bounds = cardContainer.getBoundingClientRect();
      const style = getComputedStyle(cardContainer);
      const trackSizes = style.gridTemplateColumns.trim().split(/\s+/).map(parseFloat);
      return {width:bounds.width,tracks:trackSizes.length,trackWidth:trackSizes[0]||bounds.width,gap:parseFloat(style.columnGap)||0};
    }
    function setCardColumns(card,columns,metrics=getGridMetrics()){
      const minWidth = Number(card.dataset.overviewMinWidth)||260;
      const savedWidth = Number.parseFloat(card.style.getPropertyValue("--overview-card-width"))||0;
      const requiredWidth = Math.min(metrics.width,Math.max(minWidth,savedWidth));
      const columnWidth = metrics.trackWidth+metrics.gap;
      const requiredColumns = Math.ceil((requiredWidth+metrics.gap)/Math.max(columnWidth,1));
      const safeColumns = clamp(Math.max(Math.round(columns),requiredColumns),1,metrics.tracks);
      card.style.setProperty("--overview-card-columns",String(safeColumns));
      card.style.setProperty("--overview-card-min-width",`${minWidth}px`);
    }
    function getCardColumns(card){
      return Number(card.style.getPropertyValue("--overview-card-columns"))||1;
    }
    function getOrderedCards(){
      return [...cardContainer.querySelectorAll("[data-overview-card]")];
    }
    function arrangeCards(metrics=getGridMetrics()){
      const occupiedRows = [];
      getOrderedCards().forEach(card=>{
        const span = Math.min(getCardColumns(card),metrics.tracks);
        let rowIndex = 0;
        let start = 1;
        while (true){
          const occupied = occupiedRows[rowIndex]||[];
          start = 1;
          while (start+span-1<=metrics.tracks && occupied.some(range=>start<=range.end && start+span-1>=range.start)) start++;
          if (start+span-1<=metrics.tracks) break;
          rowIndex++;
        }
        if (!occupiedRows[rowIndex]) occupiedRows[rowIndex]=[];
        occupiedRows[rowIndex].push({start,end:start+span-1});
        card.style.gridColumn = `${start} / span ${span}`;
        card.style.gridRow = String(rowIndex+1);
        const areaWidth = span*metrics.trackWidth+Math.max(0,span-1)*metrics.gap;
        card.style.width = `${areaWidth}px`;
      });
    }
    function refreshOverviewLayout(){
      const containerWidth = cardContainer.getBoundingClientRect().width;
      if (containerWidth>0){
        const trackCount = Math.max(1,Math.floor(containerWidth/15));
        cardContainer.style.gridTemplateColumns = `repeat(${trackCount},minmax(1px,1fr))`;
        cardContainer.style.columnGap = "10px";
      }
      const metrics = getGridMetrics();
      getOrderedCards().forEach(card=>setCardColumns(card,getCardColumns(card),metrics));
      arrangeCards(metrics);
    }
    function saveCardLayout(card){
      if (!state.overviewCardLayouts || typeof state.overviewCardLayouts!=="object") state.overviewCardLayouts = {};
      state.overviewCardLayouts[card.dataset.overviewCard] = {
        version:2,
        columns:Number(card.style.getPropertyValue("--overview-card-columns"))||1,
        width:Number.parseFloat(card.style.getPropertyValue("--overview-card-width"))||null,
        height:Number.parseFloat(card.style.getPropertyValue("--overview-card-height"))||null
      };
      scheduleSave();
    }
    cards.forEach(card=>{
      const saved = cardLayouts[card.dataset.overviewCard];
      const savedColumns = saved && Number.isFinite(saved.columns) ? (saved.version===2 ? saved.columns : saved.columns>4 ? Math.round(saved.columns/6) : saved.columns) : null;
      const initialColumns = savedColumns || Number(card.style.getPropertyValue("--overview-card-columns"))||1;
      const minWidth = Number(card.dataset.overviewMinWidth)||260;
      if (saved && Number.isFinite(saved.width)) card.style.setProperty("--overview-card-width",`${Math.max(saved.width,minWidth)}px`);
      setCardColumns(card,initialColumns);
      if (saved && Number.isFinite(saved.height)) card.style.setProperty("--overview-card-height",`${Math.max(saved.height,180)}px`);
    });
    refreshOverviewLayout();
    const updateCardColumns = ()=>{
      const metrics = getGridMetrics();
      cards.forEach(card=>setCardColumns(card,Number(card.style.getPropertyValue("--overview-card-columns"))||1,metrics));
      arrangeCards(metrics);
    };
    if ("ResizeObserver" in window) new ResizeObserver(updateCardColumns).observe(cardContainer);
    else window.addEventListener("resize",updateCardColumns);
    let dragState = null;
    cards.forEach(card=>{
      const header = card.querySelector(".overviewPanelHeader");
      const dragHandle = document.createElement("span");
      dragHandle.className = "overviewDragHandle";
      dragHandle.setAttribute("role","button");
      dragHandle.setAttribute("aria-label","Drag to rearrange");
      dragHandle.title = "Drag to rearrange";
      dragHandle.tabIndex = 0;
      const dragIcon = document.createElement("iconify-icon");
      dragIcon.setAttribute("icon","mdi:drag-vertical");
      dragIcon.setAttribute("aria-hidden","true");
      dragHandle.appendChild(dragIcon);
      header.appendChild(dragHandle);
      dragHandle.addEventListener("pointerdown",event=>{
        if (event.button!==0 || dragState) return;
        event.preventDefault();
        const bounds = card.getBoundingClientRect();
        dragState = {card,handle:dragHandle,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,
          offsetX:event.clientX-bounds.left,offsetY:event.clientY-bounds.top,bounds,gridColumn:card.style.gridColumn,gridRow:card.style.gridRow,placeholder:null,dropPreview:null,dropReference:null,moved:false};
        const currentDrag = dragState;
        currentDrag.windowPointerUp = pointerEvent=>{
          if (dragState===currentDrag && currentDrag.pointerId===pointerEvent.pointerId) finishDrag(pointerEvent);
        };
        currentDrag.windowPointerCancel = pointerEvent=>{
          if (dragState===currentDrag && currentDrag.pointerId===pointerEvent.pointerId) finishDrag(pointerEvent,true);
        };
        window.addEventListener("pointerup",currentDrag.windowPointerUp);
        window.addEventListener("pointercancel",currentDrag.windowPointerCancel);
        dragHandle.setPointerCapture(event.pointerId);
      });
      dragHandle.addEventListener("pointermove",event=>{
        if (!dragState || dragState.handle!==dragHandle || dragState.pointerId!==event.pointerId) return;
        const deltaX = event.clientX-dragState.startX;
        const deltaY = event.clientY-dragState.startY;
        if (!dragState.moved && Math.hypot(deltaX,deltaY)<5) return;
        event.preventDefault();
        const dragged = dragState.card;
        if (!dragState.moved){
          dragState.moved = true;
          const placeholder = document.createElement("div");
          placeholder.className = "overviewDropPlaceholder";
          placeholder.style.setProperty("--overview-card-columns",dragged.style.getPropertyValue("--overview-card-columns"));
          placeholder.style.setProperty("--overview-card-min-width",dragged.style.getPropertyValue("--overview-card-min-width"));
          placeholder.style.gridColumn = dragged.style.gridColumn;
          placeholder.style.gridRow = dragged.style.gridRow;
          placeholder.style.boxSizing = "border-box";
          placeholder.style.alignSelf = "start";
          placeholder.style.minWidth = `${dragState.bounds.width}px`;
          placeholder.style.maxWidth = "none";
          placeholder.style.width = `${dragState.bounds.width}px`;
          placeholder.style.minHeight = `${dragState.bounds.height}px`;
          placeholder.style.maxHeight = `${dragState.bounds.height}px`;
          placeholder.style.height = `${dragState.bounds.height}px`;
          dragged.after(placeholder);
          dragState.placeholder = placeholder;
          const dropPreview = document.createElement("div");
          dropPreview.className = "overviewDropPreview";
          dropPreview.style.width = "4px";
          dropPreview.style.height = `${dragState.bounds.height}px`;
          document.body.appendChild(dropPreview);
          dragState.dropPreview = dropPreview;
          dragged.style.removeProperty("transform");
          dragged.classList.add("dragging");
          dragged.style.position = "fixed";
          dragged.style.boxSizing = "border-box";
          dragged.style.minWidth = `${dragState.bounds.width}px`;
          dragged.style.maxWidth = "none";
          dragged.style.width = `${dragState.bounds.width}px`;
          dragged.style.minHeight = `${dragState.bounds.height}px`;
          dragged.style.maxHeight = `${dragState.bounds.height}px`;
          dragged.style.height = `${dragState.bounds.height}px`;
          dragged.style.zIndex = "100";
          dragged.style.pointerEvents = "none";
          dragged.style.gridColumn = "auto";
          dragged.style.margin = "0";
        }
        dragged.style.left = `${event.clientX-dragState.offsetX}px`;
        dragged.style.top = `${event.clientY-dragState.offsetY}px`;
        const draggedBounds = dragged.getBoundingClientRect();
        const targetX = draggedBounds.left+draggedBounds.width/2;
        const targetY = draggedBounds.top+draggedBounds.height/2;
        const rows = [];
        cards.forEach(candidate=>{
          if (candidate===dragged) return;
          const bounds = candidate.getBoundingClientRect();
          let row = rows.find(entry=>Math.abs(entry.top-bounds.top)<6);
          if (!row){ row={top:bounds.top,cards:[]}; rows.push(row); }
          row.cards.push({card:candidate,bounds});
        });
        rows.sort((a,b)=>a.top-b.top);
        rows.forEach(row=>row.cards.sort((a,b)=>a.bounds.left-b.bounds.left));
        const rowIndex = Math.max(0,rows.findIndex((row,index)=>targetY<(rows[index+1]?.top??Infinity)));
        const row = rows[rowIndex];
        const beforeCard = row?.cards.find(entry=>targetX<entry.bounds.left+entry.bounds.width/2)?.card;
        const reference = beforeCard || rows[rowIndex+1]?.cards[0]?.card || null;
        cards.forEach(candidate=>candidate.classList.remove("dropTarget"));
        const placeholder = dragState.placeholder;
        if (reference) reference.classList.add("dropTarget");
        dragState.dropReference = reference;
        const previewTarget = reference || row?.cards[row.cards.length-1]?.card;
        const dropPreview = dragState.dropPreview;
        if (dropPreview && previewTarget){
          const previewBounds = previewTarget.getBoundingClientRect();
          dropPreview.style.left = `${reference ? previewBounds.left-7 : previewBounds.right+7}px`;
          dropPreview.style.top = `${previewBounds.top}px`;
          dropPreview.hidden = false;
        }else if (dropPreview){
          dropPreview.hidden = true;
        }
      });
      const finishDrag = (event,cancelled=false)=>{
        if (!dragState || dragState.handle!==dragHandle || (event && dragState.pointerId!==event.pointerId)) return;
        const currentDrag = dragState;
        const {card:dragged,placeholder,dropPreview,dropReference,moved} = currentDrag;
        dragState = null;
        window.removeEventListener("pointerup",currentDrag.windowPointerUp);
        window.removeEventListener("pointercancel",currentDrag.windowPointerCancel);
        if (moved && !cancelled && placeholder && placeholder.isConnected){
          placeholder.remove();
          if (dropReference && dropReference.isConnected && dropReference!==dragged){
            cardContainer.insertBefore(dragged,dropReference);
          }else if (!dropReference){
            cardContainer.appendChild(dragged);
          }
          state.overviewCardOrder = [...cardContainer.querySelectorAll("[data-overview-card]")].map(candidate=>candidate.dataset.overviewCard);
          scheduleSave();
        }else if (placeholder && placeholder.isConnected){ placeholder.remove(); }
        if (dropPreview && dropPreview.isConnected) dropPreview.remove();
        ["position","left","top","width","height","min-width","max-width","min-height","max-height","box-sizing","z-index","pointer-events","margin"].forEach(property=>dragged.style.removeProperty(property));
        if (moved && !cancelled){
          refreshOverviewLayout();
          wrap.scrollLeft = 0;
          requestAnimationFrame(refreshOverviewLayout);
        }
        else {
          dragged.style.gridColumn = currentDrag.gridColumn;
          dragged.style.gridRow = currentDrag.gridRow;
        }
        cards.forEach(candidate=>candidate.classList.remove("dragging","dropTarget"));
      };
      dragHandle.addEventListener("pointerup",finishDrag);
      dragHandle.addEventListener("pointercancel",event=>finishDrag(event,true));
      dragHandle.addEventListener("lostpointercapture",event=>finishDrag(event));
      dragHandle.addEventListener("keydown",event=>{
        const step = {ArrowLeft:-1,ArrowUp:-1,ArrowRight:1,ArrowDown:1}[event.key];
        if (!step) return;
        event.preventDefault();
        const siblings = [...cardContainer.querySelectorAll("[data-overview-card]")];
        const index = siblings.indexOf(card);
        const next = siblings[index+step];
        if (!next) return;
        cardContainer.insertBefore(card,step<0 ? next : next.nextSibling);
        state.overviewCardOrder = [...cardContainer.querySelectorAll("[data-overview-card]")].map(candidate=>candidate.dataset.overviewCard);
        arrangeCards();
        scheduleSave();
      });

      const resizeHandle = document.createElement("span");
      resizeHandle.className = "overviewResizeHandle";
      resizeHandle.setAttribute("role","button");
      resizeHandle.setAttribute("aria-label",`Resize ${card.querySelector("h3")?.textContent||"overview card"}`);
      resizeHandle.setAttribute("aria-keyshortcuts","ArrowLeft ArrowRight ArrowUp ArrowDown");
      resizeHandle.title = "Drag to resize; use arrow keys when focused";
      resizeHandle.tabIndex = 0;
      card.appendChild(resizeHandle);
      let resizeState = null;
      resizeHandle.addEventListener("pointerdown",event=>{
        if (event.button!==0 || resizeState || dragState) return;
        event.preventDefault();
        const metrics = getGridMetrics();
        const minWidth = Math.min(Number(card.dataset.overviewMinWidth)||260,metrics.width);
        resizeState = {pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,
          columns:getCardColumns(card),tracks:metrics.tracks,trackWidth:metrics.trackWidth,gridGap:metrics.gap,
          minWidth,
          initialColumns:Number(card.style.getPropertyValue("--overview-card-columns"))||1,
          initialWidth:card.style.getPropertyValue("--overview-card-width"),width:card.getBoundingClientRect().width,
          initialHeight:card.style.getPropertyValue("--overview-card-height"),height:card.getBoundingClientRect().height,gridWidth:metrics.width,changed:false};
        card.style.removeProperty("width");
        resizeHandle.setPointerCapture(event.pointerId);
      });
      resizeHandle.addEventListener("pointermove",event=>{
        if (!resizeState || resizeState.pointerId!==event.pointerId) return;
        event.preventDefault();
        const tracks = resizeState.tracks;
        const widthStep = resizeState.trackWidth+resizeState.gridGap;
        const width = clamp(resizeState.width+(event.clientX-resizeState.startX),resizeState.minWidth,resizeState.gridWidth);
        const columns = clamp(Math.ceil((width+resizeState.gridGap)/Math.max(widthStep,1)),1,tracks);
        const height = resizeState.height+(event.clientY-resizeState.startY);
        card.style.setProperty("--overview-card-width",`${width}px`);
        setCardColumns(card,columns);
        card.style.setProperty("--overview-card-height",`${Math.max(height,180)}px`);
        resizeState.changed = Math.abs(width-resizeState.width)>=1 || Math.abs(height-resizeState.height)>=1;
      });
      const finishResize = (event,cancelled=false)=>{
        if (!resizeState || (event && resizeState.pointerId!==event.pointerId)) return;
        const {changed,initialColumns,initialWidth,initialHeight} = resizeState;
        resizeState = null;
        if (cancelled){
          if (initialWidth) card.style.setProperty("--overview-card-width",initialWidth);
          else card.style.removeProperty("--overview-card-width");
          setCardColumns(card,initialColumns);
          if (initialHeight) card.style.setProperty("--overview-card-height",initialHeight);
          else card.style.removeProperty("--overview-card-height");
        }else if (changed){ saveCardLayout(card); }
        refreshOverviewLayout();
      };
      resizeHandle.addEventListener("pointerup",finishResize);
      resizeHandle.addEventListener("pointercancel",event=>finishResize(event,true));
      resizeHandle.addEventListener("lostpointercapture",event=>finishResize(event,true));
      resizeHandle.addEventListener("keydown",event=>{
        const step = {ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-40],ArrowDown:[0,40]}[event.key];
        if (!step) return;
        event.preventDefault();
        if (step[0]){
          const metrics = getGridMetrics();
          const minWidth = Math.min(Number(card.dataset.overviewMinWidth)||260,metrics.width);
          const width = clamp(card.getBoundingClientRect().width+step[0],minWidth,metrics.width);
          const nextColumns = clamp(Math.ceil((width+metrics.gap)/(metrics.trackWidth+metrics.gap)),1,metrics.tracks);
          card.style.setProperty("--overview-card-width",`${width}px`);
          setCardColumns(card,nextColumns);
        }
        const currentHeight = Number.parseFloat(card.style.getPropertyValue("--overview-card-height"))||card.getBoundingClientRect().height;
        card.style.setProperty("--overview-card-height",`${Math.max(currentHeight+step[1],180)}px`);
        saveCardLayout(card);
        refreshOverviewLayout();
      });
    });
    wrap.appendChild(view);
    wrap.querySelectorAll(".overviewRecentRow[data-iid]").forEach(el=>{
      el.onclick = () => {
        openItemModal(el.dataset.pid,el.dataset.gid,el.dataset.iid);
      };
    });
    wrap.querySelectorAll(".overviewTimelineItem[data-iid]").forEach(el=>{
      el.onclick = () => openItemModal(el.dataset.pid,el.dataset.gid,el.dataset.iid);
    });
    wrap.querySelectorAll(".overviewTimelineItem[data-calendar-id]").forEach(el=>{
      el.onclick = () => {
        const item = (state.calendarItems||[]).find(candidate=>candidate.id===el.dataset.calendarId);
        if (item) openStandaloneCalendarItemModal(item);
      };
    });
    wrap.querySelectorAll("[data-overview-project]").forEach(el=>{
      el.onclick = () => selectProject(el.dataset.overviewProject);
    });
    wrap.querySelectorAll("[data-overview-stat]").forEach(button=>{
      button.onclick=()=>openOverviewStatDetails(button.dataset.overviewStat);
    });
    wrap.querySelectorAll("[data-overview-action]").forEach(button=>{
      button.onclick = async () => {
        if (button.dataset.overviewAction==="project"){
          document.getElementById("addProjectBtn").click();
          return;
        }
        if (button.dataset.overviewAction==="calendar"){
          navigateCalendar(); return;
        }
        if (button.dataset.overviewAction==="event"){
          openNewCalendarItemModal(null,today);
          return;
        }
        if (!projectRecords().length){
          await showNotice("Create a project first","Tasks are organized inside project groups.");
          return;
        }
        const result = await showDialog({title:"New task",fields:[
          {label:"Task name",placeholder:"What needs to get done?"},
          {label:"Project",type:"select",options:projectRecords().map(project=>({value:project.id,label:project.name})),value:projectRecords()[0].id}
        ],confirmLabel:"Create task"});
        if (!result) return;
        const [title,projectId] = result;
        const project = await ensureProjectLoaded(projectId);
        const group = project ? this.model.projectGroups(project)[0] : null;
        if (!title.trim() || !project || !group) return;
        const item = addItem(project.id,group.id,title.trim());
        openItemModal(project.id,group.id,item.id);
      };
    });
    board.appendChild(wrap);
    requestAnimationFrame(refreshOverviewLayout);
  }
}
