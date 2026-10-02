(function(global){
  "use strict";

  function createItemModal({documentRef=global.document}={}){
    function wire(modal,{onClose}={}){
      if (!modal || typeof modal.querySelector!=="function" || typeof modal.querySelectorAll!=="function"){
        throw new TypeError("An item modal requires a DOM element.");
      }

      const closeButton=modal.querySelector('[data-action="close"]');
      if (closeButton && typeof onClose==="function") closeButton.onclick=onClose;

      const actionMenu=modal.querySelector("#itemModalActionMenu");
      const actionMenuButton=modal.querySelector('[data-action="toggleItemMenu"]');
      if (actionMenu && actionMenuButton){
        const closeActionMenu=()=>{
          actionMenu.hidden=true;
          actionMenuButton.setAttribute("aria-expanded","false");
        };
        actionMenuButton.onclick=()=>{
          actionMenu.hidden=!actionMenu.hidden;
          actionMenuButton.setAttribute("aria-expanded",String(!actionMenu.hidden));
          if (!actionMenu.hidden) actionMenu.querySelector('[role="menuitem"]')?.focus();
        };
        modal.addEventListener("click",event=>{
          if (!event.target.closest(".itemModalActions")) closeActionMenu();
        });
        actionMenu.addEventListener("keydown",event=>{
          if (event.key==="Escape"){
            closeActionMenu();
            actionMenuButton.focus();
          } else if (event.key==="ArrowDown" || event.key==="ArrowUp"){
            const menuItems=[...actionMenu.querySelectorAll('[role="menuitem"]')];
            if (!menuItems.length) return;
            const currentIndex=menuItems.indexOf(documentRef.activeElement);
            const direction=event.key==="ArrowDown" ? 1 : -1;
            menuItems[(currentIndex+direction+menuItems.length)%menuItems.length].focus();
            event.preventDefault();
          }
        });
      }

      modal.querySelectorAll(".itemDetailTab").forEach(tab=>{
        tab.onclick=()=>{
          const target=tab.dataset.itemTab;
          modal.querySelectorAll(".itemDetailTab").forEach(button=>{
            const active=button===tab;
            button.classList.toggle("active",active);
            button.setAttribute("aria-selected",String(active));
          });
          modal.querySelectorAll(".itemDetailPanel").forEach(panel=>{
            const active=panel.dataset.itemPanel===target;
            panel.classList.toggle("active",active);
            panel.hidden=!active;
          });
        };
      });
    }

    return Object.freeze({wire});
  }

  global.BeforeworkItemModal=Object.freeze({create:createItemModal});
})(window);
