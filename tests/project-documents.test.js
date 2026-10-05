"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");
const appScripts=require("./helpers/app-script-order");

const root=path.join(__dirname,"..");
const index=fs.readFileSync(path.join(root,"index.html"),"utf8");
const featureSource=fs.readFileSync(path.join(root,"js/features/project-documents.js"),"utf8");
const viewSource=fs.readFileSync(path.join(root,"js/views/documents-view.js"),"utf8");
const appSource=fs.readFileSync(path.join(root,"js/app.js"),"utf8");
const bootstrapSource=fs.readFileSync(path.join(root,"js/bootstrap.js"),"utf8");
const templateSource=fs.readFileSync(path.join(root,"pages/documents.html"),"utf8");
const documentsStyles=fs.readFileSync(path.join(root,"styles/documents.css"),"utf8");

function createFeature(){
  const window={};
  vm.runInNewContext(featureSource,{window},{filename:"project-documents.js"});
  let id=0;
  let timestamp=100;
  return window.BeforeworkProjectDocuments.create({
    uid:()=>`document-${++id}`,
    now:()=>++timestamp
  });
}

test("project document feature creates, edits, and removes markdown documents",()=>{
  const feature=createFeature();
  const project={};
  const brief=feature.create(project,"Project brief","brief");
  const notes=feature.create(project,"Notes");

  assert.match(brief.content,/^# Project brief/m);
  assert.match(brief.content,/## Goals/);
  assert.equal(notes.content,"");
  assert.deepEqual([...feature.list(project).map(document=>document.title)],["Project brief","Notes"]);
  assert.equal(feature.active(project),notes);
  feature.select(project,brief.id);
  assert.equal(project.activeDocumentId,brief.id);
  feature.rename(project,notes.id,"Decision log");
  feature.updateContent(project,notes.id,"# Decision\n\nApproved.");
  assert.equal(notes.title,"Decision log");
  assert.equal(notes.content,"# Decision\n\nApproved.");
  assert.ok(notes.updatedAt>notes.createdAt);
  assert.equal(feature.remove(project,brief.id),brief);
  assert.deepEqual([...feature.list(project).map(document=>document.id)],[notes.id]);
  assert.equal(project.activeDocumentId,null);
  feature.select(project,notes.id);
  assert.equal(feature.active(project),notes);
});

test("project document feature rejects invalid titles, templates, and content",()=>{
  const feature=createFeature();
  const project={documents:[]};
  assert.throws(()=>feature.create(project,"  "),/title is required/);
  assert.throws(()=>feature.create(project,"x".repeat(161)),/160 characters or fewer/);
  assert.throws(()=>feature.create(project,"Notes","unknown"),/Unknown project document template/);
  const document=feature.create(project,"Notes");
  assert.throws(()=>feature.updateContent(project,document.id,42),/must be text/);
  assert.throws(()=>feature.rename(project,document.id," "),/title is required/);
  assert.throws(()=>feature.rename(project,document.id,"x".repeat(161)),/160 characters or fewer/);
  assert.throws(()=>feature.remove(project,"missing"),/no longer exists/);
});

test("Documents is a separately loaded project view with Markdown preview and export",()=>{
  assert.ok(appScripts.includes("features/project-documents.js"));
  assert.match(bootstrapSource,/\.\/views\/documents-view\.js/);
  assert.match(appSource,/documentsView\.render\(project,board\)/);
  assert.match(appSource,/documents:\(project\.documents\|\|\[\]\)\.map\(document=>\(\{[\s\S]*?id:documentIds\.get\(document\.id\)/);
  assert.match(viewSource,/this\.markdown\.render\(active\.content\)/);
  assert.match(viewSource,/type:"text\/markdown;charset=utf-8"/);
  assert.match(templateSource,/data-document-content/);
  assert.match(templateSource,/data-document-preview/);
  assert.match(templateSource,/data-document-export/);
  assert.match(templateSource,/class="itemDescriptionCard documentDescriptionCard"/);
  assert.match(templateSource,/class="itemMarkdownToolbar documentMarkdownToolbar"/);
  assert.match(templateSource,/class="itemMarkdownModeTabs"/);
  assert.match(templateSource,/class="[^"]*action-menu__trigger/);
  assert.match(templateSource,/class="menu action-menu action-menu--item documentActionsMenu"/);
  assert.doesNotMatch(templateSource,/data-document-export-card[^>]*>Export</);
  assert.match(templateSource,/class="mainSection"/);
  assert.doesNotMatch(templateSource,/projectDocumentsSidebar|documentCard/);
  assert.match(viewSource,/fragment\.querySelector\("\.documentsPage"\)/);
  assert.match(documentsStyles,/\.documentDetailBody\{[^}]*flex:1/);
  assert.match(documentsStyles,/\.documentMarkdownInput\{[^}]*flex:1/);
  assert.match(documentsStyles,/\.documentMarkdownPreview\{flex:1/);
  assert.doesNotMatch(documentsStyles,/\.documentMarkdownInput:hover/);
  assert.match(documentsStyles,/\.documentDescriptionCard:hover\{border-color:var\(--border\);\}/);
});

test("Documents view cannot open the item filter surface",()=>{
  assert.match(appSource,/if \(activeView\.type==="documents"\)\{[\s\S]*?filterBar\.style\.display="none";[\s\S]*?completionTabs\.style\.display="none";[\s\S]*?documentsView\.render/);
});
