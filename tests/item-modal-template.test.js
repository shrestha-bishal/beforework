"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const templatePath=path.join(__dirname,"../pages/item-modal.html");
const templateSource=fs.readFileSync(templatePath,"utf8");
const appSource=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
const stylesSource=fs.readFileSync(path.join(__dirname,"../styles/app.css"),"utf8");
const templatesSource=fs.readFileSync(path.join(__dirname,"../js/ui/templates.js"),"utf8");

function loadTemplateModule(){
  const window={};
  const sandbox={
    window,
    fetch:async url=>({
      ok:true,
      text:async()=>url==="pages/item-modal.html" ? templateSource : ""
    }),
    document:{
      createElement(){
        let html="";
        return {
          get innerHTML(){ return html; },
          set innerHTML(value){ html=value; },
          content:{cloneNode(){ return {}; }}
        };
      }
    }
  };
  vm.runInNewContext(templatesSource,sandbox,{filename:"templates.js"});
  return window.BeforeworkViewTemplates;
}

test("item modal markup lives in a separately loaded parameterized HTML template",async()=>{
  const loader=loadTemplateModule();
  await loader.load("itemModal");
  const tokens=[...templateSource.matchAll(/\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/g)].map(match=>match[1]);
  const values=Object.fromEntries([...new Set(tokens)].map(token=>[token,`value-${token}`]));
  const rendered=loader.render("itemModal",values);

  assert.ok(tokens.length>0);
  assert.doesNotMatch(rendered,/\{\{[a-zA-Z][a-zA-Z0-9_]*\}\}/);
  for (const id of ["itemTitleInput","itemDescInput","itemDescPreview","itemCalendarType","itemModalFooter"]){
    assert.ok(rendered.includes(`id="${id}"`) || rendered.includes(`class="${id}"`),`missing ${id}`);
  }
  assert.match(appSource,/if \(field\.type==="tags"\)[\s\S]*?id="itemTagChips"/);
  assert.match(appSource,/data-action="toggleDescriptionMenu"/);
  assert.match(appSource,/data-action="copyDescriptionMarkdown"/);
  assert.match(appSource,/Copy Markdown/);
  assert.match(appSource,/mdi:pencil-outline/);
  assert.match(rendered,/itemDescriptionCard/);
  assert.match(appSource,/id="descriptionActionMenu"/);
  assert.match(appSource,/class="menu action-menu action-menu--item"/);
  assert.match(appSource,/role="menuitem" class="danger menu-item menu-item--danger" data-action="deleteItem"/);
  assert.match(rendered,/itemDescPreview/);
  assert.match(rendered,/class="itemMarkdownToolbar"/);
  assert.match(templateSource,/\{\{location\}\}/);
  assert.match(templateSource,/\{\{schedule\}\}/);
  assert.match(appSource,/const locationHtml=locationField\?/);
  assert.match(appSource,/const scheduleSectionHtml=scheduleField/);
  assert.match(appSource,/data-action="addSchedule"/);
  assert.match(appSource,/scheduleField\s*\?\s*\(hasSchedule\s*\|\|\s*openItemRef\.scheduleOpen\s*\?/);
  assert.match(rendered,/data-description-tab="edit"/);
  assert.match(rendered,/data-description-tab="preview"/);
  assert.match(rendered,/data-md-action="bold"/);
  assert.match(rendered,/data-md-action="task-list"/);
  assert.match(appSource,/data-action="cancelDescriptionEdit"/);
  assert.match(appSource,/data-action="saveDescriptionEdit"/);
  assert.match(appSource,/data-action="saveDescriptionEdit">Save<\/button>/);
  assert.match(rendered,/aria-label="Markdown formatting"/);
  assert.match(templateSource,/<\/div>\s*<\/div>\s*\{\{descriptionEditControls\}\}/);
  assert.match(appSource,/descriptionInput\.value=item\.description\|\|""/);
  assert.match(appSource,/item\.description=nextDescription/);
  assert.match(appSource,/descriptionEditControlsElement\.hidden=!editSession/);
  assert.match(appSource,/descriptionToolbar\.hidden=!editSession/);
  assert.match(appSource,/openItemRef\.descriptionEditing=true/);
  assert.match(appSource,/descriptionInput\.setRangeText\(replacement,start,end,"select"\)/);
  assert.match(appSource,/setDescriptionMode\(tab\.dataset\.descriptionTab\)/);
  assert.doesNotMatch(templateSource,/\{\{description(?:Input|Preview)Hidden\}\}/);
  assert.match(appSource,/descriptionInput\.setRangeText\(replacement,start,end,"select"\)/);
  assert.match(appSource,/descriptionEditButton\.onclick=/);
  assert.match(appSource,/BeforeworkViewTemplates\.render\("itemModal"/);
  assert.match(appSource,/modal\.open\(\{id:"itemOverlay",content,onBackdrop:closeItemModal\}\)/);
});

test("Tags controls are rendered by the optional Tags field and retain tag assignments when removed",()=>{
  const start=appSource.indexOf("function fieldInputHtml");
  const end=appSource.indexOf("function renderItemModal",start);
  const context={
    escapeHtml:value=>String(value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char])),
    tagDotHtml:(tag,selected)=>`<span data-tag="${tag.id}" data-selected="${selected}">${tag.name}</span>`
  };
  const html=vm.runInNewContext(`${appSource.slice(start,end)}; fieldInputHtml(
    {id:"tags-field",label:"Tags",type:"tags"},
    {tagIds:["release"],values:{}},
    {tags:[{id:"release",name:"Release",color:"blue"}]}
  );`,context);

  assert.match(html,/id="itemTagChips"/);
  assert.match(html,/data-tag="release" data-selected="true"/);
  assert.match(html,/data-action="newTagFromItem"/);
  assert.match(appSource,/fieldTypes\.canAddToProject\(option\.value,project\.fields\)/);
  assert.match(appSource,/Tags and their assignments will stay saved but hidden/);
  const deleteStart=appSource.indexOf("function deleteField");
  const deleteEnd=appSource.indexOf("async function addFieldFlow",deleteStart);
  assert.match(appSource.slice(deleteStart,deleteEnd),/project\.fields\s*=\s*project\.fields\.filter\(f=>f\.id!==fid\)/);
  assert.doesNotMatch(appSource.slice(deleteStart,deleteEnd),/tagIds/);
});

test("item modal overlays the sidebar and reflows with viewport size",()=>{
  assert.match(stylesSource,/\.overlay\{[^}]*z-index:100;/);
  assert.match(stylesSource,/@media \(max-width:900px\)\{[\s\S]*?#itemModal\{width:100%;max-height:calc\(100vh - 24px\);max-height:calc\(100dvh - 24px\);\}[\s\S]*?\.itemModalBody\{flex-direction:column;/);
  assert.match(stylesSource,/@media \(max-width:560px\)\{[\s\S]*?#itemModal\{max-height:calc\(100vh - 16px\);max-height:calc\(100dvh - 16px\);/);
});
