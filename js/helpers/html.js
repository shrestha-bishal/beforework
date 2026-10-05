(function(global){
  "use strict";

  function escapeHtml(value){
    return String(value).replace(/[&<>"']/g,char=>({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      '"':"&quot;",
      "'":"&#39;"
    }[char]));
  }

  global.BeforeworkHtml=Object.freeze({escapeHtml});
})(window);
