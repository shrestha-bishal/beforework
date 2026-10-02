(function(global){
  "use strict";

  function createProjectActionsMenu({documentRef=global.document}={}){
    const button=documentRef.getElementById("projectMenuBtn");
    const menu=documentRef.getElementById("projectMenu");

    function close(){
      menu.classList.remove("open");
      button.classList.remove("active");
    }

    function wire(){
      button.onclick=event=>{
        event.stopPropagation();
        const open=menu.classList.toggle("open");
        event.currentTarget.classList.toggle("active",open);
      };

      menu.addEventListener("click",event=>{
        if (event.target.closest("button")) close();
      });

      documentRef.addEventListener("click",event=>{
        if (!event.target.closest("#projectMenuWrap")) close();
      });
    }

    return Object.freeze({wire,close});
  }

  global.BeforeworkProjectActionsMenu=Object.freeze({create:createProjectActionsMenu});
})(window);
