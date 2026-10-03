(function(global){
  "use strict";

  function createAuthService({providers=[],onUserChange=()=>{},onUnavailable=()=>{}}={}){
    let activeProvider=null;
    let currentUser=null;

    async function init(){
      let lastError=null;
      for (const provider of providers){
        try{
          if (!await provider.isAvailable()) continue;
          activeProvider=provider;
          provider.init(user=>{
            currentUser=user;
            onUserChange(user);
          },error=>{
            activeProvider=null;
            currentUser=null;
            onUnavailable(error);
          });
          return;
        }catch(error){
          lastError=error;
        }
      }
      if (lastError) onUnavailable(lastError);
    }

    function getAccountName(){
      return currentUser&&activeProvider?activeProvider.label(currentUser):"";
    }

    function logout(){
      if (activeProvider) activeProvider.logout();
    }

    return Object.freeze({init,getAccountName,logout});
  }

  global.BeforeworkAuth=Object.freeze({create:createAuthService});
})(window);
