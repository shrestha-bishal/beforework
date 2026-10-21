export class WorkspaceDocumentsView {
  constructor({documentsFeature,documentsView,onTogglePin,onMove,onCreateFolder}){
    this.documentsFeature=documentsFeature;
    this.documentsView=documentsView;
    this.onTogglePin=onTogglePin;
    this.onMove=onMove;
    this.onCreateFolder=onCreateFolder;
    this.workspace={id:"workspace",name:"Workspace"};
    this.searchQuery="";
  }

  setSearchQuery(query){
    this.searchQuery=query;
  }

  renderSidebar(container){
    const documents=this.documentsFeature.list(this.workspace);
    const query=this.searchQuery.toLocaleLowerCase();
    const visibleDocuments=documents.filter(document=>!query||document.title.toLocaleLowerCase().includes(query));
    const fragment=documentRef().createDocumentFragment();
    const sidebar=documentRef().createElement("div");
    sidebar.className="workspaceDocumentsSidebar";

    const list=documentRef().createElement("div");
    list.className="workspaceDocumentSidebarList";
    if (!visibleDocuments.length){
      const empty=documentRef().createElement("p");
      empty.className="workspaceDocumentSidebarEmpty";
      empty.textContent=query?"No matching documents.":"No workspace documents yet.";
      list.appendChild(empty);
    }
    visibleDocuments.forEach(document=>{
      const row=documentRef().createElement("button");
      row.type="button";
      row.className="workspaceDocumentSidebarItem";
      row.classList.toggle("active",this.documentsFeature.active(this.workspace)?.id===document.id);
      const icon=documentRef().createElement("iconify-icon");
      icon.setAttribute("icon","mdi:file-document-outline");
      icon.setAttribute("aria-hidden","true");
      const copy=documentRef().createElement("span");
      copy.className="workspaceDocumentSidebarCopy";
      const title=documentRef().createElement("strong");
      title.textContent=document.title;
      const updated=documentRef().createElement("small");
      updated.textContent=document.updatedAt
        ?`Updated ${new Date(document.updatedAt).toLocaleDateString()}`
        :"No update date";
      copy.append(title,updated);
      row.append(icon,copy);
      row.onclick=()=>{
        this.documentsView.openDocument(this.workspace,document.id);
      };
      list.appendChild(row);
    });
    sidebar.appendChild(list);
    fragment.appendChild(sidebar);
    container.replaceChildren(fragment);
  }

  render(board,collectionView){
    if (this.documentsFeature.active(this.workspace)){
      this.documentsView.render(this.workspace,board);
      return;
    }
    const documents=this.documentsFeature.list(this.workspace);
    collectionView.render(board,{
      key:"workspace-documents",
      kind:"documents",
      items:documents.map(document=>({
        id:document.id,
        title:document.title,
        icon:"mdi:file-document-outline",
        description:String(document.content||"").replace(/[`*_>#~]/g," ").replace(/\s+/g," ").trim().slice(0,180),
        pinned:document.pinned===true,
        folderId:document.folderId||null,
        badge:document.pinned?"Pinned":"",
        meta:document.updatedAt
          ?`Updated ${new Date(document.updatedAt).toLocaleDateString()}`
          :"No update date",
        updatedAt:document.updatedAt||document.createdAt||0
      })),
      searchLabel:"Search workspace documents",
      emptyMessage:"No workspace documents yet. Create a document to get started.",
      noResultsMessage:"No documents match your search.",
      addLabel:"New document",
      onAdd:folderId=>this.documentsView.createDocumentImmediately(this.workspace,"Untitled document",folderId),
      onOpen:documentId=>this.documentsView.openDocument(this.workspace,documentId),
      organization:{
        collectionLabel:"documents",
        folders:this.documentsFeature.listFolders?.(this.workspace)||[],
        onTogglePin:this.onTogglePin,
        onMove:this.onMove,
        onCreateFolder:this.onCreateFolder
      }
    });
  }
}

function documentRef(){
  return globalThis.document;
}
