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

  function create({uid,now=Date.now,getDocuments,getActiveId,setActiveId,templateNoun="document",documentNoun="document"}={}){
    if (typeof uid!=="function") throw new TypeError(`${templateNoun[0].toUpperCase()+templateNoun.slice(1)}s require an ID generator.`);
    if (typeof getDocuments!=="function"||typeof getActiveId!=="function"||typeof setActiveId!=="function"){
      throw new TypeError("Markdown documents require document and active-document accessors.");
    }
    function list(owner){
      const documents=getDocuments(owner);
      if (!Array.isArray(documents)) throw new TypeError("The document collection must be an array.");
      return documents;
    }
    function active(owner){
      return list(owner).find(document=>document.id===getActiveId(owner))||null;
    }
    function select(owner,documentId){
      const document=list(owner).find(candidate=>candidate.id===documentId);
      if (!document) throw new Error(`The ${documentNoun} no longer exists.`);
      setActiveId(owner,document.id);
      return document;
    }
    function clearActive(owner){
      setActiveId(owner,null);
    }
    function createDocument(owner,title,template="blank"){
      const name=normalizeTitle(title);
      if (!["blank","brief"].includes(template)) throw new TypeError(`Unknown ${templateNoun} template.`);
      const timestamp=now();
      const document={id:uid(),title:name,content:template==="brief"?BRIEF_TEMPLATE(name):"",createdAt:timestamp,updatedAt:timestamp};
      list(owner).push(document);
      setActiveId(owner,document.id);
      return document;
    }
    function updateContent(owner,documentId,content){
      if (typeof content!=="string") throw new TypeError("Document content must be text.");
      const document=list(owner).find(candidate=>candidate.id===documentId);
      if (!document) throw new Error(`The ${documentNoun} no longer exists.`);
      document.content=content;
      document.updatedAt=now();
      return document;
    }
    function rename(owner,documentId,title){
      const name=normalizeTitle(title);
      const document=list(owner).find(candidate=>candidate.id===documentId);
      if (!document) throw new Error(`The ${documentNoun} no longer exists.`);
      document.title=name;
      document.updatedAt=now();
      return document;
    }
    function remove(owner,documentId){
      const documents=list(owner);
      const index=documents.findIndex(document=>document.id===documentId);
      if (index<0) throw new Error(`The ${documentNoun} no longer exists.`);
      const [removed]=documents.splice(index,1);
      if (getActiveId(owner)===documentId) setActiveId(owner,null);
      return removed;
    }
    return Object.freeze({list,active,select,clearActive,create:createDocument,updateContent,rename,remove});
  }

  global.BeforeworkMarkdownDocuments=Object.freeze({create});
})(window);
