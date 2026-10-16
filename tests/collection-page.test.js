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
  const items=makeElement();
  const empty=makeElement();
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
    ".collectionPageItems":items,
    ".collectionPageEmpty":empty
  })[selector];
  page.querySelectorAll=()=>viewButtons;
  const cardTemplate={content:{firstElementChild:{cloneNode:()=>{
    const card=makeElement();
    const fields={
      ".collectionPageIcon":makeElement(),
      ".collectionPageName":makeElement(),
      ".collectionPageBadge":makeElement(),
      ".collectionPageDescription":makeElement(),
      ".collectionPageMeta":makeElement()
    };
    card.querySelector=selector=>fields[selector];
    card.fields=fields;
    return card;
  }}}};
  const fragment={querySelector:selector=>selector===".collectionPage"?page:cardTemplate};
  const board=makeElement();
  const source=fs.readFileSync(path.join(root,"js/views/collection-view.js"),"utf8");
  const window={};
  vm.runInNewContext(
    `${source.replace("export class CollectionView","class CollectionView")}\nwindow.CollectionView=CollectionView;`,
    {window},
    {filename:"collection-view.js"}
  );
  const collection=new window.CollectionView({cloneTemplate:()=>fragment});
  return {add,board,collection,empty,items,page,search,sort,viewButtons};
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
  assert.match(template,/<template id="collectionPageCardTemplate">/);
  assert.match(view,/pageState=new Map\(\)/);
  assert.match(view,/saved\.query\.trim\(\)\.toLocaleLowerCase\(\)/);
  assert.match(view,/saved\.sort==="updated-desc"/);
  assert.match(view,/saved\.view==="list"/);
  assert.match(view,/onOpen\(item\.id\)/);
  assert.match(view,/addButton\.onclick=onAdd\|\|null/);
  assert.match(bootstrap,/\.\/views\/collection-view\.js/);
  assert.match(templates,/collection:"pages\/collection\.html"/);
  assert.match(styles,/\.collectionPageItems\{display:grid;grid-template-columns:repeat\(auto-fill/);
  assert.match(styles,/\.collectionPageItems--list\{grid-template-columns:minmax\(0,1fr\);\}/);
});

test("folder, Projects, and Documents routes render through the shared collection view",()=>{
  assert.match(app,/activeProjectId===PROJECTS[\s\S]*?collectionView\.render\(board,\{\s*key:"projects"/);
  assert.match(app,/collectionView\.render\(board,\{\s*key:`folder:\$\{folder\.id\}`/);
  assert.match(app,/workspaceDocumentsView\.render\(board,collectionView\)/);
  assert.match(workspaceDocumentsView,/collectionView\.render\(board,\{\s*key:"workspace-documents"/);
  assert.match(workspaceDocumentsView,/this\.documentsView\.openDocument\(this\.workspace,documentId\)/);
  assert.match(app,/onOpen:navigateToProjects/);
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
    key:"projects",
    kind:"projects",
    items:[
      {id:"a",title:"Alpha",icon:"mdi:rocket",updatedAt:10},
      {id:"b",title:"Beta",icon:"mdi:folder",updatedAt:20}
    ],
    searchLabel:"Search projects",
    emptyMessage:"No projects.",
    noResultsMessage:"No matching projects.",
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
  assert.equal(harness.empty.textContent,"No matching projects.");
});
