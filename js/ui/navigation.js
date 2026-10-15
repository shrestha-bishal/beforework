(function(global){
  "use strict";

  function createNavigation({
    documentRef=global.document,
    onOverview,
    onCalendar,
    onRoadmap,
    onTimer,
    onIntegrations,
    onSettings,
    onSupport,
    switchWorkspace,
    createWorkspace
  }){
    const element=id=>documentRef.getElementById(id);
    const workspaceSwitcherBtn=element("workspaceSwitcherBtn");
    const projectsNav=element("projectsNav");
    const secondarySidebar=element("secondarySidebar");
    const secondarySidebarTitle=element("secondarySidebarTitle");
    const secondarySidebarContent=element("secondarySidebarContent");
    const projectsSidebar=element("sidebarProjects");
    const workspaceSidebarActions=element("workspaceSidebarActions");
    const workspaceSwitcherLabel=element("workspaceSwitcherLabel");
    const workspaceSidebarName=element("workspaceSidebarName");
    let activeSecondarySection=null;
    let activeSecondaryTrigger=null;

    function toggleSidebar(){
      element("sidebar").classList.toggle("open");
      element("sidebarScrim").classList.toggle("show");
    }

    function closeSidebarOnMobile(){
      element("sidebar").classList.remove("open");
      element("sidebarScrim").classList.remove("show");
    }

    function closeSecondarySidebar(){
      secondarySidebar.classList.remove("open");
      secondarySidebar.setAttribute("aria-hidden","true");
      secondarySidebar.setAttribute("inert","");
      if (activeSecondaryTrigger) activeSecondaryTrigger.setAttribute("aria-expanded","false");
      activeSecondarySection=null;
      activeSecondaryTrigger=null;
      secondarySidebar.removeAttribute("data-section");
      element("sidebar").removeAttribute("data-secondary-section");
    }

    function openSecondarySidebar({title,renderContent,section,trigger}){
      if (activeSecondaryTrigger&&activeSecondaryTrigger!==trigger){
        activeSecondaryTrigger.setAttribute("aria-expanded","false");
      }
      secondarySidebarTitle.textContent=title;
      if (renderContent){
        secondarySidebarContent.replaceChildren();
        renderContent(secondarySidebarContent);
      }
      activeSecondarySection=section||null;
      activeSecondaryTrigger=trigger||null;
      if (section){
        secondarySidebar.setAttribute("data-section",section);
        element("sidebar").setAttribute("data-secondary-section",section);
      }else{
        secondarySidebar.removeAttribute("data-section");
        element("sidebar").removeAttribute("data-secondary-section");
      }
      secondarySidebar.classList.add("open");
      secondarySidebar.setAttribute("aria-hidden","false");
      secondarySidebar.removeAttribute("inert");
      if (activeSecondaryTrigger) activeSecondaryTrigger.setAttribute("aria-expanded","true");
      closeSidebarOnMobile();
    }

    function toggleSecondarySection({section,title,trigger,renderContent}){
      if (secondarySidebar.classList.contains("open")&&activeSecondarySection===section){
        closeSecondarySidebar();
      }else{
        openSecondarySidebar({section,title,trigger,renderContent});
      }
    }

    function navigate(callback){
      closeSecondarySidebar();
      callback();
    }

    function wire(){
      element("overviewNav").onclick=()=>navigate(onOverview);
      element("brandHomeBtn").onclick=()=>navigate(onOverview);
      element("calendarNav").onclick=()=>navigate(onCalendar);
      element("roadmapNav").onclick=()=>navigate(onRoadmap);
      element("focusTimerNav").onclick=()=>navigate(onTimer);
      projectsNav.onclick=()=>toggleSecondarySection({
        section:"projects",
        title:"Projects",
        trigger:projectsNav,
        renderContent:content=>content.replaceChildren(projectsSidebar)
      });
      workspaceSwitcherBtn.onclick=()=>toggleSecondarySection({
        section:"workspace",
        title:"Workspace",
        trigger:workspaceSwitcherBtn,
        renderContent:content=>{
          workspaceSidebarName.textContent=workspaceSwitcherLabel.textContent||"Workspace";
          content.replaceChildren(workspaceSidebarActions,projectsSidebar);
        }
      });
      element("secondarySidebarClose").onclick=closeSecondarySidebar;
      element("integrationsNav").onclick=()=>navigate(onIntegrations);
      element("settingsNav").onclick=()=>navigate(onSettings);
      element("supportNav").onclick=()=>navigate(onSupport);

      element("workspaceSwitchBtn").onclick=async()=>{
        await switchWorkspace();
      };
      element("workspaceNewBtn").onclick=async()=>{
        await createWorkspace();
      };

      element("sidebarToggle").onclick=toggleSidebar;
      element("sidebarScrim").onclick=closeSidebarOnMobile;

    }

    return Object.freeze({wire,toggleSidebar,closeSidebarOnMobile,openSecondarySidebar,closeSecondarySidebar});
  }

  global.BeforeworkNavigation=Object.freeze({create:createNavigation});
})(window);
