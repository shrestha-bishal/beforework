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
    description.textContent="Each marker shows the day of its date. Hover for task or milestone details.";
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
    const schedulePopoverHide=marker=>{
      clearTimeout(popoverHideTimer);
      popoverHideTimer=window.setTimeout(()=>{
        if (marker.matches(":hover,:focus")||activePopover?.element.matches(":hover")) return;
        hidePopover();
      },160);
    };
    const hidePopover=()=>{
      clearTimeout(popoverHideTimer);
      if (!activePopover) return;
      activePopover.marker.removeAttribute("aria-describedby");
      activePopover.marker.removeAttribute("aria-controls");
      activePopover.marker.removeAttribute("aria-haspopup");
      activePopover.marker.setAttribute("aria-expanded","false");
      activePopover.element.remove();
      activePopover=null;
    };
    const positionPopover=(marker,popover)=>{
      const anchor=marker.getBoundingClientRect();
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
    const showPopover=(marker,row)=>{
      clearTimeout(popoverHideTimer);
      if (activePopover?.marker===marker) return;
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
      addFact("Date",fmtDate(row.date));
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
      activePopover={marker,element:popover};
      marker.setAttribute("aria-describedby",popover.id);
      marker.setAttribute("aria-haspopup","dialog");
      marker.setAttribute("aria-controls",popover.id);
      marker.setAttribute("aria-expanded","true");
      positionPopover(marker,popover);
      const scheduleHide=()=>{
        clearTimeout(popoverHideTimer);
        popoverHideTimer=window.setTimeout(()=>{
          if (marker.matches(":hover,:focus")||popover.matches(":hover")) return;
          hidePopover();
        },160);
      };
      popover.addEventListener("pointerenter",()=>clearTimeout(popoverHideTimer));
      popover.addEventListener("pointerleave",scheduleHide);
      popover.addEventListener("keydown",event=>{
        if (event.key!=="Escape") return;
        hidePopover();
        marker.focus();
      });
    };
    content.addEventListener("scroll",hidePopover,{passive:true});

    const draw=()=>{
      hidePopover();
      const months=Array.from({length:12},(_,index)=>new Date(this.startMonth.getFullYear(),this.startMonth.getMonth()+index,1));
      const end=new Date(this.startMonth.getFullYear(),this.startMonth.getMonth()+12,1);
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
      monthHeader.append(spacer,monthTrack);
      lanes.appendChild(monthHeader);

      const visible=rows.filter(row=>{
        const date=new Date(`${row.date}T00:00:00`);
        return Number.isFinite(date.getTime())&&date>=this.startMonth&&date<end;
      });
      if (!visible.length){
        const empty=document.createElement("p");
        empty.className="roadmapEmpty";
        empty.textContent=rows.length
          ? "No dated tasks or milestones in this range. Use the arrows to browse other dates."
          : "Add due dates to tasks or milestones to see them on the roadmap.";
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
        const date=new Date(`${row.date}T00:00:00`);
        const monthIndex=(date.getFullYear()-this.startMonth.getFullYear())*12+date.getMonth()-this.startMonth.getMonth();
        const position=(monthIndex+(date.getDate()-1)/new Date(date.getFullYear(),date.getMonth()+1,0).getDate())/months.length*100;
        const marker=document.createElement("button");
        marker.type="button";
        marker.className=`roadmapMarker ${row.kind}`;
        marker.style.left=`${position}%`;
        const itemType=row.kind==="milestone"?"Milestone":"Task";
        marker.title=row.milestoneId
          ? `Edit milestone: ${row.title}, ${fmtDate(row.date)}`
          : `${itemType}: ${row.title}, ${fmtDate(row.date)}`;
        marker.setAttribute("aria-label",row.milestoneId
          ? `${itemType}: ${row.title}, ${fmtDate(row.date)}. Click to edit milestone.`
          : `${itemType}: ${row.title}, ${fmtDate(row.date)}. Hover or focus for details.`);
        marker.textContent=String(date.getDate());
        if (row.itemId) marker.onclick=()=>{ hidePopover(); onOpenItem?.(row.projectId,row.groupId,row.itemId); };
        else if (row.milestoneId) marker.onclick=()=>{ hidePopover(); onOpenMilestone?.(row.projectId,row.milestoneId); };
        else marker.onclick=()=>{ hidePopover(); onOpenProject?.(row.projectId); };
        marker.onpointerenter=()=>showPopover(marker,row);
        marker.onpointerleave=()=>schedulePopoverHide(marker);
        marker.onfocus=()=>showPopover(marker,row);
        marker.onblur=()=>schedulePopoverHide(marker);
        marker.onkeydown=event=>{
          if (event.key==="Escape"&&activePopover?.marker===marker) hidePopover();
        };
        track.appendChild(marker);
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
