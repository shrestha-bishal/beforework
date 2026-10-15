(function(global){
  "use strict";

  function create({uid,now=Date.now,getState}={}){
    if (typeof getState!=="function") throw new TypeError("Workspace documents require a workspace state accessor.");
    return global.BeforeworkMarkdownDocuments.create({
      uid,now,templateNoun:"workspace document",documentNoun:"workspace document",
      getDocuments:()=>{
        const state=getState();
        if (!state) return [];
        if (!Array.isArray(state.workspaceDocuments)) state.workspaceDocuments=[];
        return state.workspaceDocuments;
      },
      getActiveId:()=>{
        const state=getState();
        return state ? state.activeWorkspaceDocumentId ?? null : null;
      },
      setActiveId:(_owner,id)=>{ const state=getState(); if (state) state.activeWorkspaceDocumentId=id ?? null; }
    });
  }

  global.BeforeworkWorkspaceDocuments=Object.freeze({create});
})(window);
