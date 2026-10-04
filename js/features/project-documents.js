(function(global){
  "use strict";

  const BRIEF_TEMPLATE=title=>`# ${title}\n\n## Goals\n\n## Scope\n\n## Key dates\n\n## Risks and decisions\n`;
  const MAX_TITLE_LENGTH=160;

  function normalizeTitle(title){
    const name=String(title??"").trim();
    if (!name) throw new TypeError("A document title is required.");
    if (name.length>MAX_TITLE_LENGTH) throw new RangeError(`Document titles must be ${MAX_TITLE_LENGTH} characters or fewer.`);
    return name;
  }

  function create({uid,now=Date.now}={}){
    if (typeof uid!=="function") throw new TypeError("Project documents require an ID generator.");
    function list(project){
      if (!Array.isArray(project.documents)) project.documents=[];
      return project.documents;
    }
    function active(project){
      const documents=list(project);
      return documents.find(candidate=>candidate.id===project.activeDocumentId)||null;
    }
    function select(project,documentId){
      const document=list(project).find(candidate=>candidate.id===documentId);
      if (!document) throw new Error("The project document no longer exists.");
      project.activeDocumentId=document.id;
      return document;
    }
    function clearActive(project){
      project.activeDocumentId=null;
    }
    function createDocument(project,title,template="blank"){
      const name=normalizeTitle(title);
      if (!["blank","brief"].includes(template)) throw new TypeError("Unknown project document template.");
      const timestamp=now();
      const document={id:uid(),title:name,content:template==="brief"?BRIEF_TEMPLATE(name):"",createdAt:timestamp,updatedAt:timestamp};
      list(project).push(document);
      project.activeDocumentId=document.id;
      return document;
    }
    function updateContent(project,documentId,content){
      if (typeof content!=="string") throw new TypeError("Document content must be text.");
      const document=list(project).find(candidate=>candidate.id===documentId);
      if (!document) throw new Error("The project document no longer exists.");
      document.content=content;
      document.updatedAt=now();
      return document;
    }
    function rename(project,documentId,title){
      const name=normalizeTitle(title);
      const document=list(project).find(candidate=>candidate.id===documentId);
      if (!document) throw new Error("The project document no longer exists.");
      document.title=name;
      document.updatedAt=now();
      return document;
    }
    function remove(project,documentId){
      const documents=list(project);
      const index=documents.findIndex(document=>document.id===documentId);
      if (index<0) throw new Error("The project document no longer exists.");
      const [removed]=documents.splice(index,1);
      if (project.activeDocumentId===documentId) project.activeDocumentId=null;
      return removed;
    }
    return Object.freeze({list,active,select,clearActive,create:createDocument,updateContent,rename,remove});
  }

  global.BeforeworkProjectDocuments=Object.freeze({create});
})(window);
