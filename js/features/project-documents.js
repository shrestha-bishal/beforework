(function(global){
  "use strict";

  function create({uid,now=Date.now}={}){
    return global.BeforeworkMarkdownDocuments.create({
      uid,now,templateNoun:"project document",documentNoun:"project document",
      getDocuments:project=>{
        if (!Array.isArray(project.documents)) project.documents=[];
        return project.documents;
      },
      getActiveId:project=>project.activeDocumentId,
      setActiveId:(project,id)=>{ project.activeDocumentId=id; }
    });
  }

  global.BeforeworkProjectDocuments=Object.freeze({create});
})(window);
