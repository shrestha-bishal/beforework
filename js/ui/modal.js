(function(global){
  "use strict";

  function createModal({documentRef=global.document}={}){
    function open({id,content,onBackdrop}={}){
      if (!id) throw new TypeError("A modal requires an overlay id.");
      if (!content || typeof content.nodeType!=="number"){
        throw new TypeError("A modal requires a DOM content node.");
      }
      const overlay=documentRef.createElement("div");
      overlay.className="overlay";
      overlay.id=id;
      if (typeof onBackdrop==="function"){
        overlay.addEventListener("click",event=>{
          if (event.target===overlay) onBackdrop();
        });
      }
      overlay.appendChild(content);
      documentRef.body.appendChild(overlay);
      return overlay;
    }

    function close(id){
      const overlay=documentRef.getElementById(id);
      if (!overlay) return false;
      overlay.remove();
      return true;
    }

    return Object.freeze({open,close});
  }

  global.BeforeworkModal=Object.freeze({create:createModal});
})(window);
