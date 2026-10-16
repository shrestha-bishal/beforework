"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");
const root=path.join(__dirname,"..");

const sharedSource=fs.readFileSync(path.join(root,"js/features/markdown-documents.js"),"utf8");
const projectFeatureSource=fs.readFileSync(path.join(root,"js/features/project-documents.js"),"utf8");
const featureSource=fs.readFileSync(path.join(root,"js/features/workspace-documents.js"),"utf8");
const viewSource=fs.readFileSync(path.join(root,"js/views/workspace-documents-view.js"),"utf8");
const documentViewSource=fs.readFileSync(path.join(root,"js/views/documents-view.js"),"utf8");
const appSource=fs.readFileSync(path.join(root,"js/app.js"),"utf8");
const index=fs.readFileSync(path.join(root,"index.html"),"utf8");
const navigationTemplate=fs.readFileSync(path.join(root,"pages/navigation.html"),"utf8");
const bootstrap=fs.readFileSync(path.join(root,"js/bootstrap.js"),"utf8");
const manifest=fs.readFileSync(path.join(root,"js/manifest.js"),"utf8");

function makeFeature(){
  const window={};
  vm.runInNewContext(sharedSource,{window},{filename:"markdown-documents.js"});
  vm.runInNewContext(projectFeatureSource,{window},{filename:"project-documents.js"});
  vm.runInNewContext(featureSource,{window},{filename:"workspace-documents.js"});
  let id=0;
  let timestamp=100;
  const state={workspaceDocuments:[],activeWorkspaceDocumentId:null};
  const feature=window.BeforeworkWorkspaceDocuments.create({uid:()=>`workspace-document-${++id}`,now:()=>++timestamp,getState:()=>state});
  return {feature,state};
}

test("workspace document feature initializes missing workspace collections",()=>{
  const window={};
  vm.runInNewContext(sharedSource,{window},{filename:"markdown-documents.js"});
  vm.runInNewContext(featureSource,{window},{filename:"workspace-documents.js"});
  let id=0;
  let timestamp=100;
  const state={};
  const feature=window.BeforeworkWorkspaceDocuments.create({
    uid:()=>`workspace-document-${++id}`,
    now:()=>++timestamp,
    getState:()=>state
  });
  const scope={id:"workspace",name:"Workspace"};
  const document=feature.create(scope,"Notes");

  assert.equal(state.workspaceDocuments.length,1);
  assert.equal(state.workspaceDocuments[0].id,document.id);
  assert.equal(state.activeWorkspaceDocumentId,document.id);
  assert.equal(feature.list(scope).length,1);
});

test("workspace document feature shares Markdown behavior without changing project ownership",()=>{
  const {feature,state}=makeFeature();
  const scope={id:"workspace",name:"Workspace"};
  const brief=feature.create(scope,"Workspace brief","brief");
  const notes=feature.create(scope,"Notes");
  assert.match(brief.content,/^# Workspace brief/m);
  assert.equal(notes.content,"");
  assert.equal(state.activeWorkspaceDocumentId,notes.id);
  feature.select(scope,brief.id);
  feature.rename(scope,notes.id,"Decisions");
  feature.updateContent(scope,notes.id,"# Approved");
  assert.equal(brief.title,"Workspace brief");
  assert.equal(notes.title,"Decisions");
  assert.equal(notes.content,"# Approved");
  assert.ok(notes.updatedAt>notes.createdAt);
  assert.equal(feature.remove(scope,brief.id),brief);
  assert.equal(feature.active(scope),null);
  assert.deepEqual([...feature.list(scope).map(document=>document.id)],[notes.id]);
});

test("workspace documents are a primary navigation destination with a reusable editor view",()=>{
  assert.match(index,/<div id="navigationMount"><\/div>/);
  assert.match(navigationTemplate,/id="workspaceDocumentsNav"[^>]*aria-controls="secondarySidebar"/);
  assert.match(bootstrap,/\.\/views\/workspace-documents-view\.js/);
  assert.match(manifest,/features\/markdown-documents\.js/);
  assert.match(manifest,/features\/workspace-documents\.js/);
  assert.match(appSource,/navigation\.registerSecondarySection\(\{[\s\S]*?navigationView\.getSecondarySection\("documents"\)[\s\S]*?renderContent:content=>workspaceDocumentsView\.renderSidebar\(content\)/);
  assert.match(appSource,/workspaceDocumentsView\.render\(board,collectionView\)/);
  assert.match(appSource,/workspaceDocumentLocation\(documentId\)/);
  assert.match(documentViewSource,/listHeading="Project documents"/);
  assert.match(documentViewSource,/onOpenDocument/);
  assert.match(documentViewSource,/createDocumentImmediately\(project,title="Untitled document"\)/);
  assert.doesNotMatch(viewSource,/cloneTemplate/);
  assert.match(appSource,/createLabel:"New document"[\s\S]*?onCreate:\(\)=>workspaceDocumentsEditor\.createDocumentImmediately/);
  assert.match(viewSource,/this\.documentsView\.openDocument\(this\.workspace,documentId\)/);
  assert.match(documentViewSource,/active\?\.content\.trim\(\)\?"preview":"write"/);
});

test("workspace document sidebar search filters titles and reports empty results",()=>{
  const {feature}=makeFeature();
  const owner={id:"workspace",name:"Workspace"};
  feature.create(owner,"Team handbook");
  feature.create(owner,"Release plan");
  const makeElement=tag=>({
    tag,
    children:[],
    classList:{toggle(){}},
    setAttribute(){},
    appendChild(child){ this.children.push(child); },
    append(...children){ this.children.push(...children); },
    replaceChildren(...children){ this.children=children; }
  });
  const documentRef={createDocumentFragment:()=>makeElement("fragment"),createElement:makeElement};
  const window={};
  vm.runInNewContext(
    `${viewSource.replace("export class WorkspaceDocumentsView","class WorkspaceDocumentsView")}\nwindow.WorkspaceDocumentsView=WorkspaceDocumentsView;`,
    {window,globalThis:{document:documentRef}},
    {filename:"workspace-documents-view.js"}
  );
  const view=new window.WorkspaceDocumentsView({
    documentsFeature:feature,
    documentsView:{},
    cloneTemplate:()=>null
  });
  const container=makeElement("container");
  const getList=()=>container.children[0].children[0].children[0];

  view.renderSidebar(container);
  let list=getList();
  assert.equal(list.children.length,2);
  view.setSearchQuery("release");
  view.renderSidebar(container);
  list=getList();
  assert.equal(list.children.length,1);
  assert.equal(list.children[0].children[1].children[0].textContent,"Release plan");
  view.setSearchQuery("missing");
  view.renderSidebar(container);
  list=getList();
  assert.equal(list.children.length,1);
  assert.equal(list.children[0].textContent,"No matching documents.");
});

test("New document action creates and opens the editor immediately without a dialog",()=>{
  let openedId=null;
  let saved=0;
  let rendered=0;
  let focused=0;
  let selected=0;
  const {feature}=makeFeature();
  const window={BeforeworkActionMenu:{create:()=>({register(){}})}};
  const documentRef={querySelector:selector=>{
    assert.equal(selector,"[data-document-title-input]");
    return {focus(){ focused++; },select(){ selected++; }};
  }};
  const context={window,globalThis:{document:documentRef}};
  vm.runInNewContext(
    `${documentViewSource.replace("export class DocumentsView","class DocumentsView")}\nwindow.DocumentsView=DocumentsView;`,
    context,
    {filename:"documents-view.js"}
  );
  const DocumentsView=window.DocumentsView;
  const view=new DocumentsView({
    documentsFeature:feature,
    showDialog(){ throw new Error("New document should not open a dialog."); },
    showConfirm:async()=>true,
    showNotice:async()=>{},
    scheduleSave(){ saved++; },
    render(){ rendered++; },
    markdown:{render:()=>""},
    cloneTemplate:()=>null,
    onOpenDocument:id=>{ openedId=id; }
  });
  const document=view.createDocumentImmediately({id:"workspace",name:"Workspace"});

  assert.equal(document.title,"Untitled document");
  assert.equal(feature.active({id:"workspace",name:"Workspace"}),document);
  assert.equal(openedId,document.id);
  assert.equal(saved,0);
  assert.equal(rendered,0);
  assert.equal(focused,1);
  assert.equal(selected,1);
});

test("opening a populated document previews it while empty documents open in write mode",()=>{
  const {feature}=makeFeature();
  const owner={id:"workspace",name:"Workspace"};
  const populated=feature.create(owner,"Read me");
  const empty=feature.create(owner,"Draft");
  feature.updateContent(owner,populated.id,"# Existing content");
  let openedId=null;
  const window={BeforeworkActionMenu:{create:()=>({register(){}})}};
  const context={window,globalThis:{document:{querySelector:()=>null}}};
  vm.runInNewContext(
    `${documentViewSource.replace("export class DocumentsView","class DocumentsView")}\nwindow.DocumentsView=DocumentsView;`,
    context,
    {filename:"documents-view.js"}
  );
  const view=new window.DocumentsView({
    documentsFeature:feature,
    showDialog:async()=>null,
    showConfirm:async()=>true,
    showNotice:async()=>{},
    scheduleSave(){},
    render(){},
    markdown:{render:()=>""},
    cloneTemplate:()=>null,
    onOpenDocument:id=>{ openedId=id; }
  });

  assert.equal(view.openDocument(owner,populated.id),populated);
  assert.equal(view.modes.get(owner.id),"preview");
  assert.equal(openedId,populated.id);
  assert.equal(view.openDocument(owner,empty.id),empty);
  assert.equal(view.modes.get(owner.id),"write");
  assert.equal(openedId,empty.id);
});
