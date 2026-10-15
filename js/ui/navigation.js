(function(global){
  "use strict";

  function createNavigation({
    documentRef=global.document,
    onOverview,
    onCalendar,
    onRoadmap,
    onIntegrations,
    onSettings,
    onSupport,
    switchWorkspace,
    createWorkspace
  }){
    const element=id=>documentRef.getElementById(id);
    const workspaceSwitcherBtn=element("workspaceSwitcherBtn");
    const workspaceSwitcherMenu=element("workspaceSwitcherMenu");
    const projectsNav=element("projectsNav");
    const secondarySidebar=element("secondarySidebar");
    const secondarySidebarTitle=element("secondarySidebarTitle");
    const secondarySidebarContent=element("secondarySidebarContent");
    const workspaceSwitcherActionMenu=global.BeforeworkActionMenu.create({documentRef})
      .register(workspaceSwitcherBtn,workspaceSwitcherMenu,{styleTrigger:false});

    function closeWorkspaceSwitcher(){
      workspaceSwitcherActionMenu.close();
    }

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
      projectsNav.setAttribute("aria-expanded","false");
    }

    function openSecondarySidebar({title,renderContent}){
      secondarySidebarTitle.textContent=title;
      secondarySidebarContent.replaceChildren();
      if (renderContent) renderContent(secondarySidebarContent);
      secondarySidebar.classList.add("open");
      secondarySidebar.setAttribute("aria-hidden","false");
      secondarySidebar.removeAttribute("inert");
      projectsNav.setAttribute("aria-expanded","true");
      closeSidebarOnMobile();
    }

    function toggleProjectsSidebar(){
      if (secondarySidebar.classList.contains("open")){
        closeSecondarySidebar();
      }else{
        openSecondarySidebar({title:"Projects"});
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
      projectsNav.onclick=toggleProjectsSidebar;
      element("secondarySidebarClose").onclick=closeSecondarySidebar;
      element("integrationsNav").onclick=()=>navigate(onIntegrations);
      element("settingsNav").onclick=()=>navigate(onSettings);
      element("supportNav").onclick=()=>navigate(onSupport);

      element("workspaceSwitchBtn").onclick=async()=>{
        closeWorkspaceSwitcher();
        await switchWorkspace();
      };
      element("workspaceNewBtn").onclick=async()=>{
        closeWorkspaceSwitcher();
        await createWorkspace();
      };

      element("sidebarToggle").onclick=toggleSidebar;
      element("sidebarScrim").onclick=closeSidebarOnMobile;

    }

    return Object.freeze({wire,toggleSidebar,closeSidebarOnMobile,openSecondarySidebar,closeSecondarySidebar});
  }

  global.BeforeworkNavigation=Object.freeze({create:createNavigation});
})(window);
