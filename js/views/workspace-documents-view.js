export class WorkspaceDocumentsView {
  constructor({documentsFeature,documentsView,cloneTemplate}){
    this.documentsFeature=documentsFeature;
    this.documentsView=documentsView;
    this.cloneTemplate=cloneTemplate;
    this.workspace={id:"workspace",name:"Workspace"};
  }

  renderSidebar(container){
    const documents=this.documentsFeature.list(this.workspace);
    const fragment=documentRef().createDocumentFragment();
    const sidebar=documentRef().createElement("div");
    sidebar.className="workspaceDocumentsSidebar";

    const list=documentRef().createElement("div");
    list.className="workspaceDocumentSidebarList";
    if (!documents.length){
      const empty=documentRef().createElement("p");
      empty.className="workspaceDocumentSidebarEmpty";
      empty.textContent="No workspace documents yet.";
      list.appendChild(empty);
    }
    documents.forEach(document=>{
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

  render(board){
    if (this.documentsFeature.active(this.workspace)){
      this.documentsView.render(this.workspace,board);
      return;
    }
    const fragment=this.cloneTemplate();
    board.replaceChildren(fragment);
  }
}

function documentRef(){
  return globalThis.document;
}
