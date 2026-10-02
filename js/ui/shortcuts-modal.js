(function(global){
  "use strict";

  function createShortcutsModal({modal,cloneTemplate}={}){
    if (!modal || typeof modal.open!=="function" || typeof modal.close!=="function"){
      throw new TypeError("A shortcuts modal requires the shared modal component.");
    }
    if (typeof cloneTemplate!=="function"){
      throw new TypeError("A shortcuts modal requires a template clone function.");
    }

    function close(){
      modal.close("shortcutsOverlay");
    }

    function open(){
      const content=cloneTemplate();
      content.querySelectorAll("[data-close]").forEach(button=>button.onclick=close);
      modal.open({id:"shortcutsOverlay",content,onBackdrop:close});
    }

    return Object.freeze({open,close});
  }

  global.BeforeworkShortcutsModal=Object.freeze({create:createShortcutsModal});
})(window);
