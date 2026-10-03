(function(global){
  "use strict";

  function createWorkspaceCommands({getState,actions}){
    function getCommands(){
      const commands = [
        {id:"navigate:overview",title:"Go to overview",category:"Navigate",subtitle:"Workspace summary",keywords:"home dashboard",icon:"mdi:view-dashboard-outline",pinned:true,run:()=>actions.navigate("overview")},
        {id:"navigate:calendar",title:"Open calendar",category:"Navigate",subtitle:"All projects and events",keywords:"schedule dates",icon:"mdi:calendar-month-outline",pinned:true,run:()=>actions.navigate("calendar")},
        {id:"navigate:roadmap",title:"Open roadmap",category:"Navigate",subtitle:"Project milestones and dated tasks",keywords:"timeline projects milestones",icon:"mdi:chart-gantt",run:()=>actions.navigate("roadmap")},
        {id:"navigate:settings",title:"Open settings",category:"Navigate",subtitle:"Preferences and workspace data",keywords:"configuration preferences",icon:"mdi:cog-outline",pinned:true,run:()=>actions.navigate("settings")},
        {id:"navigate:integrations",title:"Open integrations",category:"Navigate",subtitle:"Connected services",keywords:"Google Calendar sync",icon:"mdi:connection",run:()=>actions.navigate("integrations")},
        {id:"action:new-task",title:"Add task to current project",category:"Create",subtitle:"Quick-add to the open project",keywords:"new task item",icon:"mdi:plus-circle-outline",shortcut:"N",pinned:true,run:actions.addTask},
        {id:"action:new-project",title:"Create project",category:"Create",subtitle:"Start a project workspace",keywords:"new project board",icon:"mdi:view-grid-plus-outline",pinned:true,run:actions.createProject},
        {id:"action:new-folder",title:"Create folder",category:"Create",subtitle:"Organise projects",keywords:"new folder group",icon:"mdi:folder-plus-outline",run:actions.createFolder},
        {id:"action:new-event",title:"Create calendar event",category:"Create",subtitle:"Add an event for today",keywords:"new meeting appointment",icon:"mdi:calendar-plus-outline",run:actions.createEvent},
        {id:"action:theme",title:"Toggle colour mode",category:"Actions",subtitle:"Switch between light and dark",keywords:"theme appearance dark light",icon:"mdi:theme-light-dark",run:actions.toggleTheme},
        {id:"action:timer",title:"Toggle focus timer",category:"Actions",subtitle:"Start or open the focus timer",keywords:"pomodoro focus break",icon:"mdi:timer-outline",shortcut:"T",run:actions.toggleTimer},
        {id:"action:shortcuts",title:"Show keyboard shortcuts",category:"Help",subtitle:"View available shortcuts",keywords:"help commands keys",icon:"mdi:keyboard-outline",shortcut:"?",run:actions.showShortcuts}
      ];
      const state = getState?.();
      if (!state) return commands;

      const projects=state.folderLazy ? (state.projectSummaries||[]) : (state.projects||[]);
      projects.forEach(project=>{
        commands.push({id:`project:${project.id}`,title:project.name,category:"Projects",subtitle:"Open project",keywords:"project workspace",icon:project.icon||"mdi:clipboard-text-outline",run:()=>actions.openProject(project)});
        const groups=[...(project.groups||[])];
        if ((project.items||[]).length || !groups.length){
          groups.push({id:"__project_items__",name:"Unassigned",items:project.items||[]});
        }
        groups.forEach(group=>{
          commands.push({id:`group:${project.id}:${group.id}`,title:group.name,category:"Groups",subtitle:project.name,keywords:"group status",icon:"mdi:folder-outline",run:()=>actions.openGroup(project,group)});
          const groupItems=state.folderLazy
            ? (project.itemIndex||[]).filter(item=>item.groupId===group.id)
            : (group.items||[]);
          groupItems.filter(item=>!item.archived).forEach(item=>{
            const tagNames=(item.tagIds||[]).map(tagId=>(project.tags||[]).find(tag=>tag.id===tagId)?.name||"").join(" ");
            const fieldValues=(project.fields||[]).map(field=>{
              const value=item.values?.[field.id];
              if (!value) return "";
              return `${field.label} ${(field.options||[]).find(option=>option.id===value)?.label||value}`;
            }).join(" ");
            commands.push({
              id:`item:${project.id}:${group.id}:${item.id}`,
              title:item.title,
              category:item.calendarType==="event" ? "Calendar" : "Tasks",
              subtitle:`${project.name} / ${group.name}`,
              keywords:[item.description,tagNames,fieldValues,...(item.subitems||[]).map(subitem=>subitem.title)].filter(Boolean).join(" "),
              icon:item.calendarType==="event" ? "mdi:calendar-clock-outline" : "mdi:checkbox-marked-circle-outline",
              run:()=>actions.openProjectItem(project,group,item)
            });
          });
        });
        (project.tags||[]).forEach(tag=>commands.push({
          id:`tag:${project.id}:${tag.id}`,
          title:tag.name,
          category:"Tags",
          subtitle:`${project.name} tag`,
          keywords:"filter label",
          icon:"mdi:tag-outline",
          run:()=>actions.openTag(project,tag)
        }));
      });
      (state.calendarItems||[]).filter(item=>!item.archived).forEach(item=>commands.push({
        id:`calendar:${item.id}`,
        title:item.title,
        category:"Calendar",
        subtitle:"Standalone event",
        keywords:[item.description,item.location].filter(Boolean).join(" "),
        icon:"mdi:calendar-clock-outline",
        run:()=>actions.openCalendarItem(item)
      }));
      return commands;
    }

    return Object.freeze({getCommands});
  }

  global.BeforeworkWorkspaceCommands = Object.freeze({create:createWorkspaceCommands});
})(window);
