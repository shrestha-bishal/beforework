(function(global){
  "use strict";

  function getMessage(error,fallback="Unknown error"){
    if (error==null) return fallback;
    if (typeof error==="string") return error.trim()||fallback;
    if (typeof error==="number"||typeof error==="boolean"||typeof error==="bigint") return String(error);

    try{
      const message=error.message;
      if (typeof message==="string"&&message.trim()) return message.trim();
    }catch(ignored){}
    try{
      const name=error.name;
      if (typeof name==="string"&&name.trim()&&name!=="Error") return name.trim();
    }catch(ignored){}
    try{
      const text=String(error);
      if (text&&text!=="[object Object]") return text;
    }catch(ignored){}
    try{
      const text=JSON.stringify(error);
      if (text&&text!=="{}") return text;
    }catch(ignored){}
    return fallback;
  }

  global.BeforeworkErrorUtils=Object.freeze({getMessage});
})(window);
