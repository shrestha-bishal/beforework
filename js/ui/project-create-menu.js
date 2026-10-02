(function(global){
  "use strict";

  function createProjectCreateMenu({documentRef=global.document,actions}){
    const menu=documentRef.getElementById("projectCreateMenu");
    const button=documentRef.getElementById("projectCreateBtn");

    function close(){
      menu.classList.remove("open");
      button.classList.remove("active");
      button.setAttribute("aria-expanded","false");
    }

    function wire(){
      button.onclick=event=>{
        event.stopPropagation();
        const open=menu.classList.toggle("open");
        button.classList.toggle("active",open);
        button.setAttribute("aria-expanded",String(open));
      };

      menu.addEventListener("click",event=>{
        if (!event.target.closest("button")) return;
        close();
        const action=event.target.closest("button");
        if (action.id==="addProjectBtn") actions.createProject();
        else if (action.id==="importProjectBtn") actions.importProject();
        else if (action.id==="addFolderBtn") actions.createFolder();
      });

      documentRef.addEventListener("click",event=>{
        if (!event.target.closest(".projectCreateWrap")) close();
      });
    }

    return Object.freeze({wire,close});
  }

  global.BeforeworkProjectCreateMenu=Object.freeze({create:createProjectCreateMenu});
})(window);
