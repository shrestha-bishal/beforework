(function(global){
  "use strict";

  function createProjectActionsMenu({documentRef=global.document}={}){
    const button=documentRef.getElementById("projectMenuBtn");
    const menu=documentRef.getElementById("projectMenu");
    const actionMenu=global.BeforeworkActionMenu.create({documentRef}).register(button,menu);

    function close(){
      actionMenu.close();
    }

    function wire(){
      menu.addEventListener("click",event=>{
        if (event.target.closest("button")) close();
      });
    }

    return Object.freeze({wire,close});
  }

  global.BeforeworkProjectActionsMenu=Object.freeze({create:createProjectActionsMenu});
})(window);
