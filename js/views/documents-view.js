export class DocumentsView {
  constructor({documentsFeature,showDialog,showConfirm,showNotice,scheduleSave,render,markdown,cloneTemplate}){
    this.documentsFeature=documentsFeature;
    this.showDialog=showDialog;
    this.showConfirm=showConfirm;
    this.showNotice=showNotice;
    this.scheduleSave=scheduleSave;
    this.renderApp=render;
    this.markdown=markdown;
    this.cloneTemplate=cloneTemplate;
    this.modes=new Map();
  }

  async createDocument(project){
    const result=await this.showDialog({
      title:"New document",
      fields:[
        {label:"Document name",placeholder:"e.g. Project brief"},
        {label:"Start with",type:"select",value:"blank",options:[
          {value:"blank",label:"Blank document"},
          {value:"brief",label:"Project brief"}
        ]}
      ],
      confirmLabel:"Create document"
    });
    if (!result) return;
    if (!String(result[0]??"").trim()){
      await this.showNotice("Document name required","Enter a name for this document.");
      return;
    }
    if (String(result[0]).trim().length>160){
      await this.showNotice("Document name too long","Document names must be 160 characters or fewer.");
      return;
    }
    const document=this.documentsFeature.create(project,result[0],result[1]);
    this.modes.set(project.id,"write");
    this.scheduleSave();
    this.renderApp();
  }

  async deleteDocument(project,document){
    if (!await this.showConfirm(`Delete ${document.title}?`,"This permanently removes the document from this project.",true)) return;
    this.documentsFeature.remove(project,document.id);
    this.scheduleSave();
    this.renderApp();
  }

  exportDocument(document){
    const blob=new Blob([document.content],{type:"text/markdown;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const link=documentRef().createElement("a");
    let safeName=document.title.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g,"-").replace(/[. ]+$/,"")||"document";
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safeName)) safeName=`_${safeName}`;
    link.href=url;
    link.download=`${safeName}.md`;
    try{
      link.click();
    }finally{
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
  }

  render(project,board){
    const documents=this.documentsFeature.list(project);
    const active=this.documentsFeature.active(project);
    const mode=this.modes.get(project.id)||"write";
    const fragment=this.cloneTemplate();
    const root=fragment.querySelector(".documentsPage");
    if (!root) throw new Error("The Documents view template is missing its root element.");
    const listView=root.querySelector("[data-documents-list-view]");
    const editorView=root.querySelector("[data-document-editor-view]");
    const empty=root.querySelector("[data-document-empty]");
    const grid=root.querySelector("[data-document-list]");
    const rowTemplate=fragment.querySelector("#projectDocumentRowTemplate");
    root.querySelectorAll("[data-create-document]").forEach(button=>{
      button.onclick=()=>this.createDocument(project);
    });
    listView.hidden=!!active;
    editorView.hidden=!active;
    empty.hidden=documents.length>0;
    grid.hidden=documents.length===0;
    documents.forEach(document=>{
      const row=rowTemplate.content.firstElementChild.cloneNode(true);
      row.querySelector("[data-document-title]").textContent=document.title;
      row.querySelector("[data-document-updated]").textContent=document.updatedAt
        ?`Updated ${new Date(document.updatedAt).toLocaleDateString()}`
        :"No update date";
      row.querySelector("[data-document-open]").onclick=()=>{
        this.documentsFeature.select(project,document.id);
        this.scheduleSave();
        this.render(project,board);
      };
      const trigger=row.querySelector("[data-document-menu-trigger]");
      window.BeforeworkActionMenu.create().register(trigger,row.querySelector(".documentActionsMenu"));
      const deleteButton=row.querySelector("[data-document-delete]");
      deleteButton.setAttribute("aria-label",`Delete ${document.title}`);
      deleteButton.onclick=()=>this.deleteDocument(project,document);
      row.querySelector("[data-document-export-card]").onclick=()=>this.exportDocument(document);
      grid.appendChild(row);
    });
    if (active){
      const title=editorView.querySelector("[data-document-title-input]");
      const textarea=editorView.querySelector("[data-document-content]");
      const preview=editorView.querySelector("[data-document-preview]");
      const actionTrigger=editorView.querySelector(".documentDetailActions .action-menu__trigger");
      const actionMenu=editorView.querySelector(".documentActionsMenu");
      window.BeforeworkActionMenu.create().register(actionTrigger,actionMenu);
      editorView.querySelector("[data-document-breadcrumb-project]").textContent=project.name;
      title.value=active.title;
      textarea.value=active.content;
      textarea.hidden=mode!=="write";
      preview.hidden=mode!=="preview";
      preview.innerHTML=this.markdown.render(active.content)||'<p class="markdownEmpty">Nothing to preview yet.</p>';
      editorView.querySelector("[data-document-updated]").textContent=active.updatedAt
        ?`Updated ${new Date(active.updatedAt).toLocaleDateString()}`
        :"";
      editorView.querySelector("[data-document-back]").onclick=()=>{
        this.documentsFeature.clearActive(project);
        this.scheduleSave();
        this.render(project,board);
      };
      editorView.querySelectorAll("[data-document-mode]").forEach(button=>{
        const selected=button.dataset.documentMode===mode;
        button.classList.toggle("active",selected);
        button.setAttribute("aria-selected",String(selected));
        button.onclick=()=>{
          this.modes.set(project.id,button.dataset.documentMode);
          this.render(project,board);
        };
      });
      title.addEventListener("change",()=>{
        if (!title.value.trim()){
          title.value=active.title;
          title.setCustomValidity("A document title is required.");
          title.reportValidity();
          title.setCustomValidity("");
          return;
        }
        this.documentsFeature.rename(project,active.id,title.value);
        this.scheduleSave();
        this.render(project,board);
      });
      textarea.addEventListener("input",()=>{
        this.documentsFeature.updateContent(project,active.id,textarea.value);
        preview.innerHTML=this.markdown.render(textarea.value)||'<p class="markdownEmpty">Nothing to preview yet.</p>';
        editorView.querySelector("[data-document-updated]").textContent="Unsaved changes";
        this.scheduleSave();
      });
      actionMenu.querySelector("[data-active-document-delete]").onclick=()=>this.deleteDocument(project,active);
      actionMenu.querySelector("[data-document-export]").onclick=()=>this.exportDocument(active);
    }
    board.replaceChildren(fragment);
  }
}

function documentRef(){
  return globalThis.document;
}
