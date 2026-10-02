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

    function wire(){
      element("overviewNav").onclick=onOverview;
      element("brandHomeBtn").onclick=onOverview;
      element("calendarNav").onclick=onCalendar;
      element("roadmapNav").onclick=onRoadmap;
      element("integrationsNav").onclick=onIntegrations;
      element("settingsNav").onclick=onSettings;
      element("supportNav").onclick=onSupport;

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

    return Object.freeze({wire,toggleSidebar,closeSidebarOnMobile});
  }

  global.BeforeworkNavigation=Object.freeze({create:createNavigation});
})(window);
