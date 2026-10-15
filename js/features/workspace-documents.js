(function(global){
  "use strict";

  function create({uid,now=Date.now,getState}={}){
    if (typeof getState!=="function") throw new TypeError("Workspace documents require a workspace state accessor.");
    return global.BeforeworkMarkdownDocuments.create({
      uid,now,templateNoun:"workspace document",documentNoun:"workspace document",
      getDocuments:()=>getState().workspaceDocuments,
      getActiveId:()=>getState().activeWorkspaceDocumentId,
      setActiveId:(_owner,id)=>{ getState().activeWorkspaceDocumentId=id; }
    });
  }

  global.BeforeworkWorkspaceDocuments=Object.freeze({create});
})(window);
