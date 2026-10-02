(function(global){
  "use strict";

  function createItemModal({documentRef=global.document}={}){
    const actionMenus=global.BeforeworkActionMenu.create({documentRef});

    function wire(modal,{onClose}={}){
      if (!modal || typeof modal.querySelector!=="function" || typeof modal.querySelectorAll!=="function"){
        throw new TypeError("An item modal requires a DOM element.");
      }

      const closeButton=modal.querySelector('[data-action="close"]');
      if (closeButton && typeof onClose==="function") closeButton.onclick=onClose;

      [
        {button:modal.querySelector('[data-action="toggleItemMenu"]'),menu:modal.querySelector("#itemActionMenu")},
        {button:modal.querySelector('[data-action="toggleDescriptionMenu"]'),menu:modal.querySelector("#descriptionActionMenu")}
      ].forEach(({button,menu})=>{
        if (!button || !menu) return;
        actionMenus.register(button,menu);
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
