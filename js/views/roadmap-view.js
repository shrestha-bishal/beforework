export class RoadmapView {
  constructor(){
    const now=new Date();
    this.startMonth=new Date(now.getFullYear(),now.getMonth()-2,1);
  }

  render(board,rows,{scope,onOpenProject,onOpenItem,onOpenMilestone,fmtDate}){
    const root=document.createElement("section");
    root.className="roadmapView";
    const header=document.createElement("header");
    header.className="roadmapHeader";
    const heading=document.createElement("div");
    const title=document.createElement("h3");
    title.textContent=scope==="workspace"?"Workspace roadmap":"Project roadmap";
    const description=document.createElement("p");
    description.textContent="Task bars span the start and due dates. Milestones and one-date tasks use markers.";
    heading.append(title,description);
    const controls=document.createElement("div");
    controls.className="roadmapControls";
    const range=document.createElement("strong");
    range.className="roadmapRange";
    const previous=document.createElement("button");
    previous.type="button";
    previous.className="btn btn-sm";
    previous.setAttribute("aria-label","Show previous roadmap dates");
    previous.textContent="‹";
    const next=document.createElement("button");
    next.type="button";
    next.className="btn btn-sm";
    next.setAttribute("aria-label","Show next roadmap dates");
    next.textContent="›";
    const today=document.createElement("button");
    today.type="button";
    today.className="btn btn-sm";
    today.textContent="Today";
    controls.append(previous,range,next,today);
    header.append(heading,controls);
    root.appendChild(header);

    const content=document.createElement("div");
    content.className="roadmapScroll";
    const timeline=document.createElement("div");
    timeline.className="roadmapTimeline";
    const lanes=document.createElement("div");
    lanes.className="roadmapLanes";
    timeline.appendChild(lanes);
    content.appendChild(timeline);
    root.appendChild(content);
    let activePopover=null;
    let popoverHideTimer=0;
    let popoverId=0;
    const schedulePopoverHide=anchor=>{
      clearTimeout(popoverHideTimer);
      popoverHideTimer=window.setTimeout(()=>{
        if (anchor.matches(":hover,:focus")||activePopover?.element.matches(":hover")) return;
        hidePopover();
      },160);
    };
    const hidePopover=()=>{
      clearTimeout(popoverHideTimer);
      if (!activePopover) return;
      activePopover.anchor.removeAttribute("aria-describedby");
      activePopover.anchor.removeAttribute("aria-controls");
      activePopover.anchor.removeAttribute("aria-haspopup");
      activePopover.anchor.setAttribute("aria-expanded","false");
      activePopover.element.remove();
      activePopover=null;
    };
    const positionPopover=(anchorElement,popover)=>{
      const anchor=anchorElement.getBoundingClientRect();
      const box=popover.getBoundingClientRect();
      const margin=12;
      let left=anchor.left;
      if (left+box.width>window.innerWidth-margin) left=anchor.right-box.width;
      left=Math.max(margin,Math.min(left,window.innerWidth-box.width-margin));
      let top=anchor.bottom+8;
      if (top+box.height>window.innerHeight-margin) top=anchor.top-box.height-8;
      top=Math.max(margin,Math.min(top,window.innerHeight-box.height-margin));
      popover.style.left=`${left}px`;
      popover.style.top=`${top}px`;
    };
    const showPopover=(anchor,row)=>{
      clearTimeout(popoverHideTimer);
      if (activePopover?.anchor===anchor) return;
      hidePopover();
      const popover=document.createElement("div");
      popover.className="calendarContextPopover";
      popover.id=`roadmap-context-${++popoverId}`;
      popover.setAttribute("role","dialog");
      popover.setAttribute("aria-label",`${row.kind==="milestone"?"Milestone":"Task"} details`);
      const header=document.createElement("div");
      header.className="calendarContextHeader";
      const heading=document.createElement("div");
      heading.className="calendarContextHeading";
      const type=document.createElement("span");
      type.className="calendarContextType";
      type.textContent=row.kind==="milestone"?"Milestone":"Task";
      const title=document.createElement("strong");
      title.className="calendarContextTitle";
      title.textContent=row.title||"Untitled item";
      heading.append(type,title);
      header.appendChild(heading);
      popover.appendChild(header);
      const facts=document.createElement("div");
      facts.className="calendarContextFacts";
      const addFact=(label,value)=>{
        if (!value) return;
        const fact=document.createElement("div");
        fact.className="calendarContextFact";
        const factLabel=document.createElement("span");
        factLabel.className="calendarContextFactLabel";
        factLabel.textContent=label;
        const factValue=document.createElement("span");
        factValue.className="calendarContextFactValue";
        factValue.textContent=value;
        fact.append(factLabel,factValue);
        facts.appendChild(fact);
      };
      if (row.startDate) addFact("Start",fmtDate(row.startDate));
      if (row.fieldLabel!=="Start date"){
        addFact(row.kind==="task"?(row.fieldLabel||"Due"):"Date",fmtDate(row.date));
      }
      if (row.kind==="task") addFact("Status",row.completed?"Completed":"Open");
      addFact("Project",row.projectName);
      addFact("Group",row.groupName);
      addFact("Date field",row.fieldLabel);
      popover.appendChild(facts);
      if (row.description){
        const description=document.createElement("p");
        description.className="calendarContextDescription";
        description.textContent=row.description;
        popover.appendChild(description);
      }
      document.body.appendChild(popover);
      activePopover={anchor,element:popover};
      anchor.setAttribute("aria-describedby",popover.id);
      anchor.setAttribute("aria-haspopup","dialog");
      anchor.setAttribute("aria-controls",popover.id);
      anchor.setAttribute("aria-expanded","true");
      positionPopover(anchor,popover);
      const scheduleHide=()=>{
        clearTimeout(popoverHideTimer);
        popoverHideTimer=window.setTimeout(()=>{
          if (anchor.matches(":hover,:focus")||popover.matches(":hover")) return;
          hidePopover();
        },160);
      };
      popover.addEventListener("pointerenter",()=>clearTimeout(popoverHideTimer));
      popover.addEventListener("pointerleave",scheduleHide);
      popover.addEventListener("keydown",event=>{
        if (event.key!=="Escape") return;
        hidePopover();
        anchor.focus();
      });
    };
    content.addEventListener("scroll",hidePopover,{passive:true});

    const draw=()=>{
      hidePopover();
      const months=Array.from({length:12},(_,index)=>new Date(this.startMonth.getFullYear(),this.startMonth.getMonth()+index,1));
      const end=new Date(this.startMonth.getFullYear(),this.startMonth.getMonth()+12,1);
      const positionForDate=(date,dayOffset=0)=>{
        const monthIndex=(date.getFullYear()-this.startMonth.getFullYear())*12+date.getMonth()-this.startMonth.getMonth();
        const monthDays=new Date(date.getFullYear(),date.getMonth()+1,0).getDate();
        return (monthIndex+(date.getDate()-1+dayOffset)/monthDays)/months.length*100;
      };
      range.textContent=`${months[0].toLocaleDateString(undefined,{month:"short",year:"numeric"})} - ${new Date(end.getTime()-86400000).toLocaleDateString(undefined,{month:"short",year:"numeric"})}`;
      timeline.style.setProperty("--roadmap-month-count",String(months.length));
      lanes.replaceChildren();
      const monthHeader=document.createElement("div");
      monthHeader.className="roadmapMonthHeader";
      const spacer=document.createElement("div");
      spacer.className="roadmapLaneLabel";
      spacer.textContent=scope==="workspace"?"Project / item":"Milestone / task";
      const monthTrack=document.createElement("div");
      monthTrack.className="roadmapMonthTrack";
      months.forEach(month=>{
        const label=document.createElement("div");
        label.className="roadmapMonth";
        label.textContent=month.toLocaleDateString(undefined,{month:"short",year:month.getMonth()===0?"numeric":undefined});
        monthTrack.appendChild(label);
      });
      const todayDate=new Date();
      const todayPosition=positionForDate(todayDate,.5);
      if (todayDate>=this.startMonth&&todayDate<end){
        const todayLine=document.createElement("div");
        todayLine.className="roadmapTodayLine";
        todayLine.style.left=`${todayPosition}%`;
        todayLine.setAttribute("aria-hidden","true");
        const todayLabel=document.createElement("span");
        todayLabel.className="roadmapTodayLabel";
        todayLabel.textContent="Today";
        todayLine.appendChild(todayLabel);
        monthTrack.appendChild(todayLine);
      }
      monthHeader.append(spacer,monthTrack);
      lanes.appendChild(monthHeader);

      const visible=rows.filter(row=>{
        const date=new Date(`${row.date}T00:00:00`);
        const startDate=new Date(`${row.startDate||row.date}T00:00:00`);
        return Number.isFinite(date.getTime())&&Number.isFinite(startDate.getTime())&&startDate<end&&date>=this.startMonth;
      });
      if (!visible.length){
        const empty=document.createElement("p");
        empty.className="roadmapEmpty";
        empty.textContent=rows.length
          ? "No dated tasks or milestones in this range. Use the arrows to browse other dates."
          : "Add start or due dates to tasks, or due dates to milestones, to see them on the roadmap.";
        lanes.appendChild(empty);
        return;
      }

      visible.forEach(row=>{
        const lane=document.createElement("div");
        lane.className=`roadmapLane${row.completed?" completed":""}`;
        const label=document.createElement("div");
        label.className="roadmapLaneLabel";
        const projectName=document.createElement("button");
        projectName.type="button";
        projectName.className="roadmapProjectName";
        projectName.textContent=scope==="workspace"?row.projectName:(row.groupName||row.kind);
        projectName.title=row.projectName;
        projectName.onclick=()=>onOpenProject?.(row.projectId);
        const itemName=document.createElement("button");
        itemName.type="button";
        itemName.className="roadmapItemName";
        itemName.textContent=row.title;
        itemName.title=row.title;
        if (row.itemId) itemName.onclick=()=>onOpenItem?.(row.projectId,row.groupId,row.itemId);
        else if (row.milestoneId) itemName.onclick=()=>onOpenMilestone?.(row.projectId,row.milestoneId);
        else itemName.disabled=true;
        label.append(projectName,itemName);

        const track=document.createElement("div");
        track.className="roadmapTrack";
        months.forEach(()=>track.appendChild(document.createElement("div")) );
        if (todayDate>=this.startMonth&&todayDate<end){
          const todayLine=document.createElement("div");
          todayLine.className="roadmapTodayLine";
          todayLine.style.left=`${todayPosition}%`;
          todayLine.setAttribute("aria-hidden","true");
          track.appendChild(todayLine);
        }
        const date=new Date(`${row.date}T00:00:00`);
        const position=positionForDate(date,.5);
        const startDate=new Date(`${row.startDate||row.date}T00:00:00`);
        let durationBar=null;
        if (row.kind==="task"&&row.startDate&&row.startDate<row.date){
          const visibleStart=startDate<this.startMonth?this.startMonth:startDate;
          const afterEnd=new Date(date.getFullYear(),date.getMonth(),date.getDate()+1);
          const visibleEnd=afterEnd>end?end:afterEnd;
          durationBar=document.createElement("button");
          durationBar.type="button";
          durationBar.className="roadmapDuration";
          durationBar.style.left=`${positionForDate(visibleStart)}%`;
          durationBar.style.width=`${Math.max(0,positionForDate(visibleEnd)-positionForDate(visibleStart))}%`;
          durationBar.title=`${row.title}: ${fmtDate(row.startDate)} to ${fmtDate(row.date)}`;
          durationBar.setAttribute("aria-label",`Task: ${row.title}, ${fmtDate(row.startDate)} to ${fmtDate(row.date)}. Click to open task.`);
          durationBar.onclick=()=>{ hidePopover(); onOpenItem?.(row.projectId,row.groupId,row.itemId); };
          track.appendChild(durationBar);
        }
        const marker=document.createElement("button");
        marker.type="button";
        marker.className=`roadmapMarker ${row.kind}`;
        marker.style.left=`${position}%`;
        const itemType=row.kind==="milestone"?"Milestone":"Task";
        const dateDescription=row.startDate&&row.startDate<row.date
          ? `${fmtDate(row.startDate)} to ${fmtDate(row.date)}`
          : fmtDate(row.date);
        marker.title=row.milestoneId
          ? `Edit milestone: ${row.title}, ${dateDescription}`
          : `${itemType}: ${row.title}, ${dateDescription}`;
        marker.setAttribute("aria-label",row.milestoneId
          ? `${itemType}: ${row.title}, ${dateDescription}. Click to edit milestone.`
          : `${itemType}: ${row.title}, ${dateDescription}. Hover or focus for details.`);
        marker.textContent=String(date.getDate());
        if (row.itemId) marker.onclick=()=>{ hidePopover(); onOpenItem?.(row.projectId,row.groupId,row.itemId); };
        else if (row.milestoneId) marker.onclick=()=>{ hidePopover(); onOpenMilestone?.(row.projectId,row.milestoneId); };
        else marker.onclick=()=>{ hidePopover(); onOpenProject?.(row.projectId); };
        if (date>=this.startMonth&&date<end){
          marker.onpointerenter=()=>showPopover(marker,row);
          marker.onpointerleave=()=>schedulePopoverHide(marker);
          marker.onfocus=()=>showPopover(marker,row);
          marker.onblur=()=>schedulePopoverHide(marker);
          marker.onkeydown=event=>{
            if (event.key==="Escape"&&activePopover?.anchor===marker) hidePopover();
          };
          track.appendChild(marker);
        }
        if (durationBar){
          durationBar.onpointerenter=()=>showPopover(durationBar,row);
          durationBar.onpointerleave=()=>schedulePopoverHide(durationBar);
          durationBar.onfocus=()=>showPopover(durationBar,row);
          durationBar.onblur=()=>schedulePopoverHide(durationBar);
          durationBar.onkeydown=event=>{
            if (event.key==="Escape"&&activePopover?.anchor===durationBar) hidePopover();
          };
        }
        lane.append(label,track);
        lanes.appendChild(lane);
      });
    };

    previous.onclick=()=>{ this.startMonth=new Date(this.startMonth.getFullYear(),this.startMonth.getMonth()-6,1); draw(); };
    next.onclick=()=>{ this.startMonth=new Date(this.startMonth.getFullYear(),this.startMonth.getMonth()+6,1); draw(); };
    today.onclick=()=>{ const now=new Date(); this.startMonth=new Date(now.getFullYear(),now.getMonth()-2,1); draw(); };
    draw();
    board.replaceChildren(root);
  }
}
