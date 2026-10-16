(function(global){
  "use strict";

  function create({uid,now=Date.now,getState}={}){
    if (typeof getState!=="function") throw new TypeError("Workspace documents require a workspace state accessor.");
    const documents=global.BeforeworkMarkdownDocuments.create({
      uid,now,templateNoun:"workspace document",documentNoun:"workspace document",
      getDocuments:()=>{
        const state=getState();
        if (!state) return [];
        if (!Array.isArray(state.workspaceDocuments)) state.workspaceDocuments=[];
        if (!Array.isArray(state.documentFolders)) state.documentFolders=[];
        state.workspaceDocuments.forEach(document=>{
          if (typeof document.pinned!=="boolean") document.pinned=false;
          if (!Object.prototype.hasOwnProperty.call(document,"folderId")) document.folderId=null;
        });
        return state.workspaceDocuments;
      },
      getActiveId:()=>{
        const state=getState();
        return state ? state.activeWorkspaceDocumentId ?? null : null;
      },
      setActiveId:(_owner,id)=>{ const state=getState(); if (state) state.activeWorkspaceDocumentId=id ?? null; }
    });
    return Object.freeze({
      ...documents,
      create(owner,title,template){
        const document=documents.create(owner,title,template);
        document.pinned=false;
        document.folderId=null;
        return document;
      },
      listFolders(){
        const state=getState();
        if (!state) return [];
        if (!Array.isArray(state.documentFolders)) state.documentFolders=[];
        return state.documentFolders;
      }
    });
  }

  global.BeforeworkWorkspaceDocuments=Object.freeze({create});
})(window);
