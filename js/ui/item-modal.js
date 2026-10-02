(function(global){
  "use strict";

  function createItemModal({documentRef=global.document}={}){
    function wire(modal,{onClose}={}){
      if (!modal || typeof modal.querySelector!=="function" || typeof modal.querySelectorAll!=="function"){
        throw new TypeError("An item modal requires a DOM element.");
      }

      const closeButton=modal.querySelector('[data-action="close"]');
      if (closeButton && typeof onClose==="function") closeButton.onclick=onClose;

      [
        {button:modal.querySelector('[data-action="toggleItemMenu"]'),menu:modal.querySelector("#itemModalActionMenu"),container:".itemModalActions"},
        {button:modal.querySelector('[data-action="toggleDescriptionMenu"]'),menu:modal.querySelector("#itemDescriptionActionMenu"),container:".itemDescriptionActions"}
      ].forEach(({button,menu,container})=>{
        if (!button || !menu) return;
        const closeMenu=()=>{
          menu.hidden=true;
          button.setAttribute("aria-expanded","false");
        };
        button.onclick=()=>{
          menu.hidden=!menu.hidden;
          button.setAttribute("aria-expanded",String(!menu.hidden));
          if (!menu.hidden) menu.querySelector('[role="menuitem"]')?.focus();
        };
        modal.addEventListener("click",event=>{
          if (!event.target.closest(container)) closeMenu();
        });
        menu.addEventListener("keydown",event=>{
          if (event.key==="Escape"){
            closeMenu();
            button.focus();
          } else if (event.key==="ArrowDown" || event.key==="ArrowUp"){
            const menuItems=[...menu.querySelectorAll('[role="menuitem"]')];
            if (!menuItems.length) return;
            const currentIndex=menuItems.indexOf(documentRef.activeElement);
            const direction=event.key==="ArrowDown" ? 1 : -1;
            menuItems[(currentIndex+direction+menuItems.length)%menuItems.length].focus();
            event.preventDefault();
          }
        });
      });

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
