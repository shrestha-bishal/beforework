(function(global){
  "use strict";

  function createProjectCreateMenu({documentRef=global.document,actions}){
    const menu=documentRef.getElementById("projectCreateMenu");
    const button=documentRef.getElementById("projectCreateBtn");
    const actionMenu=global.BeforeworkActionMenu.create({documentRef}).register(button,menu);

    function close(){
      actionMenu.close();
    }

    function wire(){
      menu.addEventListener("click",event=>{
        if (!event.target.closest("button")) return;
        close();
        const action=event.target.closest("button");
        if (action.id==="addProjectBtn") actions.createProject();
        else if (action.id==="importProjectBtn") actions.importProject();
        else if (action.id==="addFolderBtn") actions.createFolder();
      });
    }

    return Object.freeze({wire,close});
  }

  global.BeforeworkProjectCreateMenu=Object.freeze({create:createProjectCreateMenu});
})(window);
