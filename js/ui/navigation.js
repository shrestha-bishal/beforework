(function(global){
  "use strict";

  function createNavigation({
    navigationView,
    storage=global.localStorage,
    onOverview,
    onCalendar,
    onRoadmap,
    onTimer,
    onIntegrations,
    onSettings,
    onSupport,
    onFeedback,
    switchWorkspace,
    createWorkspace
  }){
    if (!navigationView || !Array.isArray(navigationView.items)
      || typeof navigationView.getElement!=="function"
      || typeof navigationView.getSecondarySection!=="function"){
      throw new TypeError("Navigation requires a mounted navigation view.");
    }
    const SECONDARY_SECTION_KEY="beforework_secondary_sidebar_section_v1";
    const element=id=>navigationView.getElement(id);
    const secondarySidebar=element("secondarySidebar");
    const secondarySidebarTitle=element("secondarySidebarTitle");
    const secondarySidebarContent=element("secondarySidebarContent");
    const projectCreateButton=element("projectCreateBtn");
    const projectsSidebar=element("sidebarProjects");
    const workspaceSidebarActions=element("workspaceSidebarActions");
    const workspaceSwitcherLabel=element("workspaceSwitcherLabel");
    const workspaceSidebarName=element("workspaceSidebarName");
    const secondarySections=new Map();
    let activeSecondarySection=null;
    let activeSecondaryTrigger=null;

    function updateCreateButton(section){
      const registration=secondarySections.get(section);
      if (registration?.createLabel){
        projectCreateButton.title=registration.createLabel;
        projectCreateButton.setAttribute("aria-label",registration.createLabel);
        delete projectCreateButton.dataset.actionMenuTrigger;
        projectCreateButton.onclick=()=>registration.onCreate?.();
        projectCreateButton.removeAttribute("aria-haspopup");
        projectCreateButton.removeAttribute("aria-controls");
        projectCreateButton.setAttribute("aria-expanded","false");
        return;
      }
      projectCreateButton.onclick=null;
      projectCreateButton.dataset.actionMenuTrigger="true";
      projectCreateButton.title="Create project or folder";
      projectCreateButton.setAttribute("aria-label","Create project or folder");
      projectCreateButton.setAttribute("aria-haspopup","menu");
      projectCreateButton.setAttribute("aria-controls","projectCreateMenu");
      projectCreateButton.setAttribute("aria-expanded","false");
    }

    function persistSecondarySection(section){
      try{
        if (section) storage?.setItem(SECONDARY_SECTION_KEY,section);
        else storage?.removeItem(SECONDARY_SECTION_KEY);
      }catch(err){}
    }

    function toggleSidebar(){
      element("sidebar").classList.toggle("open");
      element("sidebarScrim").classList.toggle("show");
    }

    function closeSidebarOnMobile(){
      element("sidebar").classList.remove("open");
      element("sidebarScrim").classList.remove("show");
    }

    function renderSecondarySection(registration){
      secondarySidebarContent.replaceChildren();
      registration.renderContent(secondarySidebarContent);
    }

    function closeSecondarySidebar(){
      secondarySidebar.classList.remove("open");
      secondarySidebar.setAttribute("aria-hidden","true");
      secondarySidebar.setAttribute("inert","");
      if (activeSecondaryTrigger) activeSecondaryTrigger.setAttribute("aria-expanded","false");
      activeSecondarySection=null;
      activeSecondaryTrigger=null;
      persistSecondarySection(null);
      updateCreateButton(null);
      secondarySidebar.removeAttribute("data-section");
      element("sidebar").removeAttribute("data-secondary-section");
    }

    function openSecondarySidebar({title,renderContent,section,trigger}){
      if (activeSecondaryTrigger&&activeSecondaryTrigger!==trigger){
        activeSecondaryTrigger.setAttribute("aria-expanded","false");
      }
      secondarySidebarTitle.textContent=title;
      if (renderContent){
        renderSecondarySection({renderContent,section});
      }
      activeSecondarySection=section||null;
      activeSecondaryTrigger=trigger||null;
      updateCreateButton(activeSecondarySection);
      persistSecondarySection(activeSecondarySection);
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

    function toggleSecondarySection(definition){
      if (secondarySidebar.classList.contains("open")&&activeSecondarySection===definition.section){
        closeSecondarySidebar();
      }else{
        openSecondarySidebar(definition);
        definition.onOpen?.();
      }
    }

    function registerSecondarySection(definition){
      const {section,title,trigger,renderContent,onOpen,onCreate,createLabel}=definition||{};
      if (!section || !title || !trigger || typeof renderContent!=="function"){
        throw new TypeError("A secondary section requires a section key, title, trigger, and content renderer.");
      }
      const registration={section,title,trigger,renderContent,onOpen,onCreate,createLabel};
      secondarySections.set(section,registration);
      trigger.onclick=()=>toggleSecondarySection(registration);
      return ()=>{
        if (secondarySections.get(section)!==registration) return;
        if (activeSecondarySection===section) closeSecondarySidebar();
        secondarySections.delete(section);
        trigger.onclick=null;
      };
    }

    function restoreSecondarySection(){
      let section=null;
      try{ section=storage?.getItem(SECONDARY_SECTION_KEY); }catch(err){/* Sidebar state is optional. */}
      const registration=secondarySections.get(section);
      if (registration) openSecondarySidebar(registration);
      else if (section) persistSecondarySection(null);
    }

    function refreshSecondarySection(){
      if (!secondarySidebar.classList.contains("open")||!activeSecondarySection) return;
      const registration=secondarySections.get(activeSecondarySection);
      if (registration?.renderContent){
        renderSecondarySection(registration);
      }
    }

    function navigate(callback){
      closeSecondarySidebar();
      callback();
    }

    function wire(){
      const primaryActions={overview:onOverview,calendar:onCalendar,roadmap:onRoadmap,timer:onTimer,
        integrations:onIntegrations,settings:onSettings,support:onSupport,feedback:onFeedback};
      const secondaryRenderers={
        projects:content=>content.replaceChildren(projectsSidebar),
        workspace:content=>{
          workspaceSidebarName.textContent=workspaceSwitcherLabel.textContent||"Workspace";
          content.replaceChildren(workspaceSidebarActions);
        }
      };
      navigationView.items.filter(item=>item.kind==="primary").forEach(item=>{
        const action=primaryActions[item.action];
        if (typeof action!=="function") throw new Error(`No action is configured for primary navigation item "${item.id}".`);
        element(item.id).onclick=()=>navigate(action);
      });
      navigationView.items.filter(item=>item.kind==="secondary"&&item.content).forEach(item=>{
        const renderContent=secondaryRenderers[item.content];
        if (!renderContent) throw new Error(`No renderer is configured for secondary navigation item "${item.id}".`);
        const definition=navigationView.getSecondarySection(item.section);
        registerSecondarySection({...definition,renderContent});
      });
      element("secondarySidebarClose").onclick=closeSecondarySidebar;

      element("workspaceSwitchBtn").onclick=async()=>{
        await switchWorkspace();
      };
      element("workspaceNewBtn").onclick=async()=>{
        await createWorkspace();
      };

      element("sidebarToggle").onclick=toggleSidebar;
      element("sidebarScrim").onclick=closeSidebarOnMobile;

    }

    return Object.freeze({wire,toggleSidebar,closeSidebarOnMobile,openSecondarySidebar,closeSecondarySidebar,registerSecondarySection,restoreSecondarySection,refreshSecondarySection});
  }

  global.BeforeworkNavigation=Object.freeze({create:createNavigation});
})(window);
