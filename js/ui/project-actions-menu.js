(function(global){
  "use strict";

  const ACTIONS=[
    [
      {id:"edit",label:"Edit"},
      {id:"overview-visibility",label:project=>project?.hiddenFromOverview?"Show on Overview":"Hide from Overview"},
      {id:"move",label:"Move to folder"},
      {id:"duplicate",label:"Duplicate"}
    ],
    [
      {id:"add-field",label:"Add field"},
      {id:"import-csv",label:"Import from CSV"}
    ],
    [
      {id:"undo",label:"Undo"},
      {id:"print",label:"Print / PDF"}
    ],
    [
      {id:"archive",label:project=>project?.archived?"Unarchive":"Archive"},
      {id:"delete",label:"Delete",danger:true}
    ]
  ];

  function createProjectActionsMenu({
    documentRef=global.document,
    container,
    variant="header",
    project=null,
    actions
  }={}){
    if (!container) throw new TypeError("A project actions menu requires a container.");
    if (!actions||typeof actions!=="object") throw new TypeError("A project actions menu requires action handlers.");
    ACTIONS.flat().forEach(action=>{
      if (typeof actions[action.id]!=="function"){
        throw new TypeError(`A project actions menu requires a "${action.id}" handler.`);
      }
    });

    const button=documentRef.createElement("button");
    button.type="button";
    button.className=variant==="sidebar"
      ?"projectMenuBtnSmall action-menu__trigger action-menu__trigger--sidebar"
      :"btn btn-sm btn-invisible projectMenuBtn action-menu__trigger";
    button.title="Project actions";
    button.setAttribute("aria-label","Project actions");
    button.textContent=variant==="sidebar"?"⋯":"⋮";

    const menu=documentRef.createElement("div");
    menu.className=variant==="sidebar"
      ?"menu action-menu action-menu--sidebar projectQuickMenu"
      :"menu action-menu action-menu--project";
    menu.hidden=true;

    ACTIONS.forEach((group,index)=>{
      if (index){
        const separator=documentRef.createElement("div");
        separator.className="action-menu__separator";
        separator.setAttribute("role","separator");
        menu.appendChild(separator);
      }
      group.forEach(action=>{
        const item=documentRef.createElement("button");
        item.type="button";
        if (variant==="header") item.className="btn btn-sm btn-invisible";
        if (action.danger) item.classList.add("danger");
        item.dataset.projectAction=action.id;
        item.textContent=typeof action.label==="function"?action.label(project):action.label;
        menu.appendChild(item);
      });
    });

    container.append(button,menu);
    const actionMenu=global.BeforeworkActionMenu.create({documentRef}).register(button,menu);

    function setProject(nextProject){
      project=nextProject;
      const visibilityItem=menu.querySelector('[data-project-action="overview-visibility"]');
      visibilityItem.textContent=ACTIONS[0][1].label(project);
      const archiveItem=menu.querySelector('[data-project-action="archive"]');
      archiveItem.textContent=ACTIONS[3][0].label(project);
      button.setAttribute("aria-label",project?`Project actions for ${project.name}`:"Project actions");
    }

    menu.addEventListener("click",event=>{
      const item=event.target.closest("[data-project-action]");
      if (!item) return;
      event.stopPropagation();
      actions[item.dataset.projectAction](project);
    });
    setProject(project);

    return Object.freeze({
      close:()=>actionMenu.close(),
      setProject,
      element:container
    });
  }

  global.BeforeworkProjectActionsMenu=Object.freeze({create:createProjectActionsMenu});
})(window);
