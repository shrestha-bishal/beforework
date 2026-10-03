(function(global){
  "use strict";

  const ENABLED=false;

  function createNetlifyIdentityProvider({
    windowRef=global,
    documentRef=global.document,
    setTimeoutFn=global.setTimeout,
    enabled=ENABLED
  }={}){
    function loadIdentity(){
      if (windowRef.netlifyIdentity) return Promise.resolve();
      return new Promise((resolve,reject)=>{
        const script=documentRef.createElement("script");
        script.src="https://identity.netlify.com/v1/netlify-identity-widget.js";
        script.onload=resolve;
        script.onerror=()=>reject(new Error("Netlify Identity failed to load."));
        documentRef.head.appendChild(script);
      });
    }

    return Object.freeze({
      async isAvailable(){
        if (!enabled) return false;
        await loadIdentity();
        return typeof windowRef.netlifyIdentity!=="undefined";
      },
      init(onChange,onUnavailable){
        let settled=false;
        const identity=windowRef.netlifyIdentity;
        identity.on("init",user=>{ settled=true; onChange(user||null); });
        identity.on("login",user=>{ settled=true; onChange(user||null); identity.close(); });
        identity.on("logout",()=>onChange(null));
        identity.on("error",()=>{ if (!settled) onUnavailable(); });
        identity.init({logo:false});
        setTimeoutFn(()=>{ if (!settled) onUnavailable(); },4000);
      },
      login(){ windowRef.netlifyIdentity.open("login"); },
      logout(){ windowRef.netlifyIdentity.logout(); },
      label(user){
        return user?.user_metadata?.full_name||user?.email||"Signed in";
      }
    });
  }

  global.BeforeworkNetlifyIdentityProvider=Object.freeze({create:createNetlifyIdentityProvider});
})(window);
