"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const root=path.join(__dirname,"..");
const app=fs.readFileSync(path.join(root,"js/app.js"),"utf8");
const view=fs.readFileSync(path.join(root,"js/views/collection-view.js"),"utf8");
const workspaceDocumentsView=fs.readFileSync(path.join(root,"js/views/workspace-documents-view.js"),"utf8");
const template=fs.readFileSync(path.join(root,"pages/collection.html"),"utf8");
const bootstrap=fs.readFileSync(path.join(root,"js/bootstrap.js"),"utf8");
const templates=fs.readFileSync(path.join(root,"js/ui/templates.js"),"utf8");
const styles=fs.readFileSync(path.join(root,"styles/app.css"),"utf8");

function makeElement(){
  const listeners={};
  const classes=new Set();
  return {
    children:[],
    dataset:{},
    attributes:{},
    style:{},
    classList:{
      toggle(name,enabled){ if (enabled) classes.add(name); else classes.delete(name); },
      contains(name){ return classes.has(name); }
    },
    addEventListener(name,callback){ listeners[name]=callback; },
    dispatch(name){ listeners[name]?.({target:this}); },
    setAttribute(name,value){ this.attributes[name]=value; },
    appendChild(child){ this.children.push(child); },
    replaceChildren(...children){ this.children=children; },
    listeners
  };
}

function createCollectionView(){
  const search=makeElement();
  const sort=makeElement();
  const add=makeElement();
  const viewControls=makeElement();
  const items=makeElement();
  const empty=makeElement();
  const organization=makeElement();
  const filters=makeElement();
  const createFolder=makeElement();
  const viewButtons=["grid","list"].map(view=>{
    const button=makeElement();
    button.dataset.collectionView=view;
    return button;
  });
  const page=makeElement();
  page.querySelector=selector=>({
    ".collectionPageSearch":search,
    ".collectionPageSort":sort,
    ".collectionPageAdd":add,
    ".collectionPageViewControls":viewControls,
    ".collectionPageItems":items,
    ".collectionPageEmpty":empty,
    ".collectionPageOrganization":organization,
    ".collectionPageFilters":filters,
    ".collectionPageCreateFolder":createFolder
  })[selector];
  page.querySelectorAll=()=>viewButtons;
  const cardTemplate={content:{firstElementChild:{cloneNode:()=>{
    const entry=makeElement();
    const card=makeElement();
    const actions=makeElement();
    const toggle=makeElement();
    const menu=makeElement();
    const pinAction=makeElement();
    const moveAction=makeElement();
    menu.hidden=true;
    const fields={
      ".collectionPageIcon":makeElement(),
      ".collectionPageName":makeElement(),
      ".collectionPageBadge":makeElement(),
      ".collectionPageDescription":makeElement(),
      ".collectionPageMeta":makeElement(),
      ".collectionPageProjectDot":makeElement(),
      ".collectionPageCardHeader":makeElement(),
      ".collectionPageProjectStatus":makeElement(),
      ".collectionPageProgress":makeElement()
    };
    const progressLabel=makeElement();
    const progressBar=makeElement();
    const progressFill=makeElement();
    fields[".collectionPageProgress"].querySelector=selector=>({
      ".collectionPageProgressHeader strong":progressLabel,
      ".collectionPageProgressTrack":progressBar,
      ".collectionPageProgressFill":progressFill
    })[selector];
    card.querySelector=selector=>fields[selector];
    card.fields=fields;
    card.progressLabel=progressLabel;
    card.progressBar=progressBar;
    card.progressFill=progressFill;
    entry.querySelector=selector=>({
      ".collectionPageCard":card,
      ".collectionPageActionToggle":toggle,
      ".collectionPageActionMenu":menu,
      ".collectionPageCardActions":actions,
      '[data-collection-action="pin"]':pinAction,
      '[data-collection-action="move"]':moveAction
    })[selector];
    entry.fields=fields;
    entry.progressLabel=progressLabel;
    entry.progressBar=progressBar;
    entry.progressFill=progressFill;
    entry.actions={actions,toggle,menu,pinAction,moveAction};
    entry.onclick=()=>card.onclick?.();
    return entry;
  }}}};
  const newCardTemplate={content:{firstElementChild:{cloneNode:()=>{
    const card=makeElement();
    const label=makeElement();
    const hint=makeElement();
    card.querySelector=selector=>({
      ".collectionPageNewCardLabel":label,
      ".collectionPageNewCardHint":hint
    })[selector];
    card.fields={label,hint};
    return card;
  }}}};
  const filterTemplate={content:{firstElementChild:{cloneNode:()=>makeElement()}}};
  const groupTemplate={content:{firstElementChild:{cloneNode:()=>makeElement()}}};
  const fragment={querySelector:selector=>({
    ".collectionPage":page,
    "#collectionPageCardTemplate":cardTemplate,
    "#collectionPageNewCardTemplate":newCardTemplate,
    "#collectionPageFilterTemplate":filterTemplate,
    "#collectionPageGroupTemplate":groupTemplate
  })[selector]};
  const board=makeElement();
  const source=fs.readFileSync(path.join(root,"js/views/collection-view.js"),"utf8");
  const window={};
  vm.runInNewContext(
    `${source.replace("export class CollectionView","class CollectionView")}\nwindow.CollectionView=CollectionView;`,
    {window},
    {filename:"collection-view.js"}
  );
  const collection=new window.CollectionView({cloneTemplate:()=>fragment});
  return {add,board,collection,createFolder,empty,filters,items,organization,page,search,sort,viewButtons,viewControls};
}

test("collection page template provides shared search, sort, display, and card controls",()=>{
  assert.match(template,/class="collectionPage"/);
  assert.match(template,/class="form-control collectionPageSearch"/);
  assert.match(template,/class="form-control collectionPageSort"/);
  assert.match(template,/value="name-asc"/);
  assert.match(template,/value="name-desc"/);
  assert.match(template,/value="updated-desc"/);
  assert.match(template,/data-collection-view="grid"/);
  assert.match(template,/data-collection-view="list"/);
  assert.match(template,/data-collection-view="grid" aria-label="Grid view" title="Grid view" aria-pressed="true">[\s\S]*?icon="mdi:view-grid-outline"/);
  assert.match(template,/data-collection-view="list" aria-label="List view" title="List view" aria-pressed="false">[\s\S]*?icon="mdi:view-list-outline"/);
  assert.match(template,/<template id="collectionPageCardTemplate">/);
  assert.match(template,/<template id="collectionPageNewCardTemplate">/);
  assert.match(template,/<template id="collectionPageFilterTemplate">/);
  assert.match(template,/<template id="collectionPageGroupTemplate">/);
  assert.match(template,/class="collectionPageOrganization"/);
  assert.match(template,/data-collection-action="move"/);
  assert.match(template,/class="collectionPageNewCard"/);
  assert.match(template,/<iconify-icon icon="mdi:plus" aria-hidden="true"><\/iconify-icon>/);
  assert.match(view,/pageState=new Map\(\)/);
  assert.match(view,/saved\.query\.trim\(\)\.toLocaleLowerCase\(\)/);
  assert.match(view,/saved\.sort==="updated-desc"/);
  assert.match(view,/saved\.view==="list"/);
  assert.match(view,/onOpen\(item\.id\)/);
  assert.match(view,/addButton\.onclick=typeof onAdd==="function"\?\(\)=>onAdd\(selectedFolderId\(\)\):null/);
  assert.match(bootstrap,/\.\/views\/collection-view\.js/);
  assert.match(templates,/collection:"pages\/collection\.html"/);
  assert.match(styles,/\.collectionPageItems\{display:grid;grid-template-columns:repeat\(auto-fill/);
  assert.match(styles,/\.collectionPageItems--list\{grid-template-columns:minmax\(0,1fr\);\}/);
});

test("collection page spans the available content width",()=>{
  assert.match(styles,/\.collectionPage\{width:100%;min-width:0;margin:0;\}/);
  assert.doesNotMatch(styles,/\.collectionPage\{width:min\(100%,\d+px\)/);
  assert.match(styles,/\.collectionPageCard\{display:flex;flex-direction:column;align-items:stretch;gap:10px;width:100%;min-height:196px/);
  assert.match(styles,/\.collectionPageCardHeader\{display:flex;align-items:center;gap:8px;min-width:0;\}/);
  assert.match(styles,/\.collectionPageCardHeader--collection \.collectionPageName\{flex:1/);
  assert.match(styles,/\.collectionPageItems--list \.collectionPageCard\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,\.42fr\)/);
  assert.match(view,/if \(kind==="projects"\) saved\.view="grid"/);
  assert.match(view,/viewControls\.hidden=kind==="projects"/);
  assert.doesNotMatch(styles,/\.collectionPage\[data-collection-kind="projects"\] \.collectionPageItems--list/);
  assert.doesNotMatch(styles,/\.collectionPageItems--list \.collectionPageProjectStatus,\.collectionPageItems--list \.collectionPageProgress\{display:none!important;\}/);
  assert.match(styles,/\.collectionPageNewCard\{[^}]*border:1px dashed/);
});

test("project pages use grid cards and hide the view toggle",()=>{
  const harness=createCollectionView();
  let addCount=0;
  harness.collection.pageState.set("projects",{query:"",sort:"name-asc",view:"list"});
  harness.collection.render(harness.board,{
    key:"projects",
    kind:"projects",
    items:[{id:"a",title:"Alpha",icon:"mdi:rocket"}],
    addLabel:"New project",
    onAdd:()=>addCount++,
    onOpen:()=>{}
  });
  assert.equal(harness.collection.pageState.get("projects").view,"grid");
  assert.equal(harness.items.children.length,2);
  assert.equal(harness.items.children[1].fields.label.textContent,"New project");
  assert.equal(harness.items.children[1].fields.hint.textContent,"Create a project");
  assert.equal(harness.add.hidden,true);
  assert.equal(harness.viewControls.hidden,true);
  harness.items.children[1].onclick();
  assert.equal(addCount,1);

  harness.viewButtons[1].dispatch("click");
  assert.equal(harness.items.classList.contains("collectionPageItems--list"),false);
  assert.equal(harness.items.children.length,2);
  assert.equal(harness.add.hidden,true);
});

test("empty project grids keep the create card as the empty-state fallback",()=>{
  const harness=createCollectionView();
  harness.collection.render(harness.board,{
    key:"empty-projects",
    kind:"projects",
    items:[],
    addLabel:"New project",
    emptyMessage:"No projects yet.",
    onAdd:()=>{},
    onOpen:()=>{}
  });
  assert.equal(harness.items.children.length,1);
  assert.equal(harness.items.children[0].fields.label.textContent,"New project");
  assert.equal(harness.empty.hidden,true);
});

test("project cards avoid project glyphs and show status and accessible completion progress",()=>{
  const harness=createCollectionView();
  harness.collection.render(harness.board,{
    key:"projects",
    kind:"projects",
    items:[{
      id:"a",
      title:"Alpha",
      icon:"mdi:rocket",
      meta:"4 tasks, 1 open",
      projectStatus:"In Progress",
      progress:75
    }],
    onOpen:()=>{}
  });
  const card=harness.items.children[0];
  assert.equal(card.fields[".collectionPageIcon"].hidden,true);
  assert.equal(card.fields[".collectionPageProjectDot"].hidden,false);
  assert.equal(card.fields[".collectionPageProjectStatus"].textContent,"In Progress");
  assert.equal(card.fields[".collectionPageProjectStatus"].dataset.status,"in-progress");
  assert.equal(card.progressLabel.textContent,"75%");
  assert.equal(card.progressBar.attributes["aria-valuenow"],"75");
  assert.equal(card.progressBar.attributes["aria-label"],"Alpha completion");
  assert.equal(card.progressFill.style.width,"75%");
  assert.equal(card.fields[".collectionPageMeta"].textContent,"4 tasks, 1 open");
});

test("document cards use the shared grid treatment and show a matching create fallback",()=>{
  const harness=createCollectionView();
  let addCount=0;
  harness.collection.render(harness.board,{
    key:"documents",
    kind:"documents",
    items:[{id:"doc",title:"Notes",icon:"mdi:file-document-outline",description:"A short note",meta:"Updated today"}],
    addLabel:"New document",
    onAdd:()=>addCount++,
    onOpen:()=>{}
  });
  const card=harness.items.children[0];
  assert.equal(card.fields[".collectionPageIcon"].hidden,true);
  assert.equal(card.fields[".collectionPageProjectDot"].hidden,false);
  assert.equal(card.fields[".collectionPageCardHeader"].classList.contains("collectionPageCardHeader--collection"),true);
  assert.equal(harness.items.children[1].fields.label.textContent,"New document");
  assert.equal(harness.items.children[1].fields.hint.textContent,"Create a document");
  assert.equal(harness.viewControls.hidden,false);
  harness.items.children[1].onclick();
  assert.equal(addCount,1);

  harness.viewButtons[1].dispatch("click");
  assert.equal(card.fields[".collectionPageIcon"].hidden,true);
  assert.equal(card.fields[".collectionPageProjectDot"].hidden,false);
  assert.equal(harness.add.hidden,false);
  assert.equal(harness.items.children.length,1);
});

test("collection organization filters and groups pinned, foldered, and unfiled entries",()=>{
  const harness=createCollectionView();
  let createdFolderId="not-created";
  const entries=[
    {id:"pinned",title:"Pinned work",pinned:true},
    {id:"foldered",title:"Filed work",folderId:"folder-a"},
    {id:"unfiled",title:"Loose work"}
  ];
  harness.collection.render(harness.board,{
    key:"organized-projects",
    kind:"projects",
    items:entries,
    addLabel:"New project",
    onAdd:folderId=>{ createdFolderId=folderId; },
    onOpen:()=>{},
    organization:{
      collectionLabel:"projects",
      folders:[{id:"folder-a",name:"Research"}],
      onCreateFolder:()=>{},
      onTogglePin:()=>{},
      onMove:()=>{}
    }
  });

  assert.deepEqual(harness.filters.children.map(filter=>filter.textContent),["All projects","Pinned","Research","Unfiled"]);
  assert.deepEqual(harness.items.children.map(child=>child.textContent||child.fields?.[".collectionPageName"]?.textContent||""),[
    "Pinned","Pinned work","Research","Filed work","Unfiled","Loose work",""
  ]);
  assert.equal(harness.organization.hidden,false);
  assert.equal(harness.createFolder.hidden,false);

  harness.filters.children[1].onclick();
  assert.equal(harness.items.children.length,1);
  assert.equal(harness.items.children[0].fields[".collectionPageName"].textContent,"Pinned work");
  harness.filters.children[2].onclick();
  assert.equal(harness.items.children.length,2);
  assert.equal(harness.items.children[0].fields[".collectionPageName"].textContent,"Filed work");
  assert.equal(harness.items.children[1].fields.label.textContent,"New project");
  harness.items.children[1].onclick();
  assert.equal(createdFolderId,"folder-a");
});

test("collection card actions pin and move the selected item",()=>{
  const harness=createCollectionView();
  const actions=[];
  harness.collection.render(harness.board,{
    key:"organized-documents",
    kind:"documents",
    items:[{id:"doc",title:"Handbook",pinned:true}],
    onOpen:()=>{},
    organization:{
      collectionLabel:"documents",
      folders:[],
      onTogglePin:id=>actions.push(["pin",id]),
      onMove:id=>actions.push(["move",id])
    }
  });
  const entry=harness.items.children[1];
  entry.actions.toggle.onclick();
  assert.equal(entry.actions.menu.hidden,false);
  assert.equal(entry.actions.pinAction.textContent,"Unpin");
  entry.actions.pinAction.onclick();
  entry.actions.moveAction.onclick();
  assert.deepEqual(actions,[["pin","doc"],["move","doc"]]);
  assert.equal(entry.actions.menu.hidden,true);
});

test("folder, Projects, and Documents routes render through the shared collection view",()=>{
  assert.match(app,/activeProjectId===PROJECTS[\s\S]*?collectionView\.render\(board,\{\s*key:"projects"/);
  assert.match(app,/organization:\{\s*collectionLabel:"projects"/);
  assert.match(app,/collectionView\.render\(board,\{\s*key:`folder:\$\{folder\.id\}`[\s\S]*?addLabel:"New project"/);
  assert.match(app,/onAdd:folderId=>createProjectFromMenu\(folderId\)/);
  assert.match(app,/workspaceDocumentsView\.render\(board,collectionView\)/);
  assert.match(workspaceDocumentsView,/collectionView\.render\(board,\{\s*key:"workspace-documents"/);
  assert.match(workspaceDocumentsView,/collectionLabel:"documents"/);
  assert.match(workspaceDocumentsView,/folders:this\.documentsFeature\.listFolders/);
  assert.match(workspaceDocumentsView,/onAdd:folderId=>this\.documentsView\.createDocumentImmediately\(this\.workspace,"Untitled document",folderId\)/);
  assert.match(workspaceDocumentsView,/this\.documentsView\.openDocument\(this\.workspace,documentId\)/);
  assert.match(app,/onOpen:openProjectsSection/);
  assert.match(app,/function navigateToProjects\(\)/);
  assert.match(app,/saved===OVERVIEW \|\| saved===PROJECTS/);
});

test("folder collection routing restores without loading a lazy project",()=>{
  assert.match(app,/function folderPageLocation\(folderId\)/);
  assert.match(app,/folderId!==null&&state\?\.folders\.some\(folder=>folder\.id===folderId\)/);
  assert.match(app,/state\.folderLazy && !isFolderPageLocation\(activeProjectId\)/);
});

test("collection view searches, sorts, toggles layout, and opens selected entries",()=>{
  const harness=createCollectionView();
  const opened=[];
  harness.collection.render(harness.board,{
    key:"documents",
    kind:"documents",
    items:[
      {id:"a",title:"Alpha",icon:"mdi:rocket",updatedAt:10},
      {id:"b",title:"Beta",icon:"mdi:folder",updatedAt:20}
    ],
    searchLabel:"Search documents",
    emptyMessage:"No documents.",
    noResultsMessage:"No matching documents.",
    onOpen:id=>opened.push(id)
  });
  assert.deepEqual(harness.items.children.map(card=>card.fields[".collectionPageName"].textContent),["Alpha","Beta"]);

  harness.sort.value="updated-desc";
  harness.sort.dispatch("change");
  assert.deepEqual(harness.items.children.map(card=>card.fields[".collectionPageName"].textContent),["Beta","Alpha"]);

  harness.search.value="alpha";
  harness.search.dispatch("input");
  assert.deepEqual(harness.items.children.map(card=>card.fields[".collectionPageName"].textContent),["Alpha"]);
  harness.items.children[0].onclick();
  assert.deepEqual(opened,["a"]);

  harness.viewButtons[1].dispatch("click");
  assert.equal(harness.items.classList.contains("collectionPageItems--list"),true);

  harness.search.value="missing";
  harness.search.dispatch("input");
  assert.equal(harness.empty.hidden,false);
  assert.equal(harness.empty.textContent,"No matching documents.");
});
