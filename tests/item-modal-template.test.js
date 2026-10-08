"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");
const {createItemFieldRenderer,templateSource:fieldTemplateSource}=require("./helpers/item-fields");

const templatePath=path.join(__dirname,"../pages/item-modal.html");
const templateSource=fs.readFileSync(templatePath,"utf8");
const partsSource=fs.readFileSync(path.join(__dirname,"../pages/item-modal-parts.html"),"utf8");
const appSource=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
const itemModalSource=fs.readFileSync(path.join(__dirname,"../js/ui/item-modal.js"),"utf8");
const fieldFeatureSource=fs.readFileSync(path.join(__dirname,"../js/features/fields.js"),"utf8");
const stylesSource=fs.readFileSync(path.join(__dirname,"../styles/app.css"),"utf8");
const templatesSource=fs.readFileSync(path.join(__dirname,"../js/ui/templates.js"),"utf8");
const dialogsTemplateSource=fs.readFileSync(path.join(__dirname,"../pages/dialogs.html"),"utf8");
const dialogsSource=fs.readFileSync(path.join(__dirname,"../js/ui/dialogs.js"),"utf8");
const fieldTypesSource=fs.readFileSync(path.join(__dirname,"../js/core/fields/registry.js"),"utf8");

function loadTemplateModule(){
  const window={};
  const sandbox={
    window,
    fetch:async url=>({
      ok:true,
      text:async()=>url==="pages/item-modal.html" ? templateSource
        : url==="pages/item-modal-parts.html" ? partsSource
          : ""
    }),
    document:{
      createElement(){
        let html="";
        const content={
          cloneNode(){ return {}; },
          querySelectorAll(selector){
            return selector==="template[data-view-partial]"
              ? [...html.matchAll(/<template data-view-partial="([^"]+)">([\s\S]*?)<\/template>/g)]
                .map(([,name,innerHTML])=>({dataset:{viewPartial:name},innerHTML}))
              : [];
          }
        };
        return {
          get innerHTML(){ return html; },
          set innerHTML(value){ html=value; },
          content
        };
      }
    }
  };
  vm.runInNewContext(templatesSource,sandbox,{filename:"templates.js"});
  return window.BeforeworkViewTemplates;
}

test("item modal markup lives in a separately loaded parameterized HTML template",async()=>{
  const loader=loadTemplateModule();
  await Promise.all([loader.load("itemModal"),loader.load("itemModalParts")]);
  const tokens=[...templateSource.matchAll(/\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/g)].map(match=>match[1]);
  const values=Object.fromEntries([...new Set(tokens)].map(token=>[token,`value-${token}`]));
  const rendered=loader.render("itemModal",values);

  assert.ok(tokens.length>0);
  assert.doesNotMatch(rendered,/\{\{[a-zA-Z][a-zA-Z0-9_]*\}\}/);
  for (const id of ["itemTitleInput","itemDescInput","itemDescPreview","itemCalendarType","itemModalFooter"]){
    assert.ok(rendered.includes(`id="${id}"`) || rendered.includes(`class="${id}"`),`missing ${id}`);
  }
  assert.match(partsSource,/data-action="toggleDescriptionMenu"/);
  assert.match(partsSource,/data-action="copyDescriptionMarkdown"/);
  assert.match(partsSource,/Copy Markdown/);
  assert.match(partsSource,/mdi:pencil-outline/);
  assert.match(rendered,/itemDescriptionCard/);
  assert.match(partsSource,/id="descriptionActionMenu"/);
  assert.match(partsSource,/class="menu action-menu action-menu--item"/);
  assert.match(partsSource,/role="menuitem" class="danger menu-item menu-item--danger" data-action="deleteItem"/);
  assert.match(rendered,/itemDescPreview/);
  assert.match(rendered,/class="itemMarkdownToolbar"/);
  assert.match(templateSource,/\{\{location\}\}/);
  assert.match(templateSource,/\{\{schedule\}\}/);
  assert.match(fieldTemplateSource,/<template data-view-partial="fieldLabel">/);
  assert.match(fieldTemplateSource,/id="itemTagChips"/);
  assert.match(fieldTemplateSource,/<template data-view-partial="tagSelector">/);
  assert.match(appSource,/BeforeworkItemFields\.create/);
  assert.match(appSource,/itemFieldRenderer\.render\(field,item,project\)/);
  assert.match(appSource,/itemFieldRenderer\.renderLocation\(locationField,item\)/);
  assert.match(appSource,/itemFieldRenderer\.renderSchedule\(scheduleField,scheduleHtml\)/);
  assert.match(appSource,/modal\.querySelectorAll\("\.fieldDetailSettings"\)/);
  assert.match(appSource,/fieldFeature\.editField\(event,field,project\)/);
  assert.match(appSource,/modal\.querySelectorAll\("\.fieldDetailMenuTrigger"\)/);
  assert.match(appSource,/actionMenus\.register\(button,menu\)/);
  assert.match(appSource,/fieldFeature\.deleteFieldFromMenu\(event,field,project\)/);
  assert.match(appSource,/refreshOpenItemModal:\(\)=>\{\s*if \(openItemRef\) renderItemModal\(\);\s*\}/);
  assert.match(fieldFeatureSource,/fieldTypes\.getEditableChoices\(field,\{project\}\)/);
  assert.match(fieldFeatureSource,/fieldTypes\.applyChoiceEdits\(field/);
  assert.doesNotMatch(appSource,/removeTagData:itemFeature\.removeTagData/);
  assert.match(fieldTypesSource,/function applyChoiceEdits\(field,context,changes\)/);
  assert.match(fieldTypesSource,/function getChoiceDeleteConfirmation\(field,context\)/);
  assert.match(dialogsTemplateSource,/data-dialog-choice-list[\s\S]*data-dialog-choice-rows/);
  assert.match(dialogsTemplateSource,/data-dialog-choice-add[\s\S]*data-dialog-choice-add-label/);
  assert.match(dialogsTemplateSource,/data-dialog-choice-new-input[\s\S]*data-dialog-choice-new-confirm[\s\S]*data-dialog-choice-new-cancel/);
  assert.match(dialogsSource,/function renderChoiceList\(container,choiceList\)/);
  assert.match(dialogsSource,/dialog\.classList\.toggle\("dialog--choice-editor",Boolean\(choiceList\)\)/);
  assert.doesNotMatch(dialogsTemplateSource,/data-dialog-choice-heading/);
  assert.match(dialogsSource,/const updateFieldVisibility=\(\)=>/);
  assert.match(dialogsSource,/fieldsContainer\.addEventListener\("change",updateFieldVisibility\)/);
  assert.match(dialogsSource,/input\.dispatchEvent\(new global\.Event\("change",\{bubbles:true\}\)\)/);
  assert.match(dialogsSource,/mdi:drag-horizontal/);
  assert.match(dialogsSource,/application\/x-beforework-choice/);
  assert.match(dialogsSource,/event\.key!=="ArrowUp"&&event\.key!=="ArrowDown"/);
  assert.match(dialogsSource,/moveChoice\(source,choice,after\)/);
  assert.match(dialogsSource,/event\.key==="Enter"[\s\S]*finishNewChoice/);
  assert.match(dialogsSource,/newChoiceCancel\.addEventListener\("click",cancelNewChoice\)/);
  assert.match(dialogsTemplateSource,/data-dialog-action-menu-trigger[\s\S]*mdi:dots-horizontal[\s\S]*data-dialog-cancel aria-label="Close"/);
  assert.match(dialogsSource,/global\.BeforeworkActionMenu\.create\(\)\.register\(trigger,menu\)/);
  assert.match(fieldFeatureSource,/onSelect:event=>deleteFieldFromMenu\(event,field,project\)/);
  assert.match(fieldTemplateSource,/\{\{actionsHtml\}\}/);
  assert.match(fieldTemplateSource,/<template data-view-partial="fieldActionMenu">[\s\S]*data-field-menu role="menu"/);
  assert.match(fieldTemplateSource,/data-field-menu-delete/);
  assert.match(appSource,/enhanceSelectControls\(modal\)/);
  assert.match(stylesSource,/\.itemModalSidebar \.sideItem \.fieldDetailLabel\{display:flex;width:100%;min-height:24px/);
  assert.match(stylesSource,/\.fieldDetailSettings\{appearance:none;-webkit-appearance:none;display:grid/);
  assert.match(stylesSource,/\.fieldDetailSettings:focus-visible\{outline:2px solid var\(--accent\);outline-offset:2px;\}/);
  assert.match(stylesSource,/\.dialogChoiceList\{display:flex;flex-direction:column;gap:8px;margin-top:0;\}/);
  assert.doesNotMatch(stylesSource,/\.dialog--choice-editor h3/);
  assert.match(partsSource,/data-action="addSchedule"/);
  assert.match(appSource,/scheduleField\s*\?\s*\(hasSchedule\s*\|\|\s*openItemRef\.scheduleOpen\s*\?/);
  assert.match(rendered,/data-description-tab="edit"/);
  assert.match(rendered,/data-description-tab="preview"/);
  assert.match(rendered,/data-md-action="bold"/);
  assert.match(rendered,/data-md-action="task-list"/);
  assert.match(partsSource,/data-action="cancelDescriptionEdit"/);
  assert.match(partsSource,/data-action="saveDescriptionEdit"/);
  assert.match(partsSource,/data-action="saveDescriptionEdit">Save<\/button>/);
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
  assert.match(itemModalSource,/modal\.innerHTML=renderTemplate\(values\)/);
  assert.match(appSource,/renderPartial:\(name,values\)=>window\.BeforeworkViewTemplates\.renderPartial\("itemModalParts",name,values\)/);
  const itemModalRenderSource=appSource.slice(
    appSource.indexOf("  function renderItemModal(){"),
    appSource.indexOf("\n  function ",appSource.indexOf("  function renderItemModal(){")+1)
  );
  assert.match(itemModalRenderSource,/itemModalView\.render\(modal,\{/);
  assert.doesNotMatch(itemModalRenderSource,/BeforeworkViewTemplates\.render\("itemModal"/);
  assert.match(loader.renderPartial("itemModalParts","scheduleAdd",{}),/data-action="addSchedule"/);
  assert.match(appSource,/modal\.open\(\{id:"itemOverlay",content,onBackdrop:closeItemModal\}\)/);
});

test("Tags controls are rendered by the optional Tags field and retain tag assignments when removed",()=>{
  const html=createItemFieldRenderer().render(
    {id:"tags-field",label:"Tags",type:"tags"},
    {tagIds:["release"],values:{}},
    {tags:[{id:"release",name:"Release",color:"blue"}]}
  );

  assert.match(html,/id="itemTagChips"/);
  assert.match(html,/data-app-select-button-class="appSelectButton tagSelectButton"/);
  assert.doesNotMatch(html,/fieldDetailMenu|data-field-menu-action|data-action-menu-trigger/);
  assert.match(html,/class="tagPill selected" data-tag="release"/);
  assert.doesNotMatch(html,/data-tagfilter/);
  assert.match(html,/data-app-select-enhance-empty="true"/);
  assert.doesNotMatch(html,/Add new tag/);
  assert.match(fieldFeatureSource,/fieldTypes\.canAddToProject\(option\.value,project\.fields\)/);
  assert.match(fieldFeatureSource,/Tags and their assignments will stay saved but hidden/);
  assert.match(fieldFeatureSource,/project\.fields=project\.fields\.filter\(candidate=>candidate\.id!==fieldId\)/);
  assert.doesNotMatch(fieldFeatureSource,/tagIds/);
});

test("item modal overlays the sidebar and reflows with viewport size",()=>{
  assert.match(stylesSource,/\.overlay\{[^}]*z-index:100;/);
  assert.match(stylesSource,/#itemOverlay\.overlay\{align-items:stretch;justify-content:flex-end;padding:0;\}/);
  assert.match(stylesSource,/#itemOverlay #itemModal\{width:min\(1080px,92vw\);max-width:100%;height:100vh;height:100dvh;max-height:100vh;max-height:100dvh/);
  assert.match(stylesSource,/@media \(max-width:900px\)\{[\s\S]*?\.itemModalBody\{flex-direction:column;/);
  assert.match(stylesSource,/@media \(max-width:560px\)\{[\s\S]*?#itemOverlay #itemModal\{width:100%;height:100vh;height:100dvh;max-height:100vh;max-height:100dvh;border-radius:0;\}/);
  assert.match(stylesSource,/@media \(prefers-reduced-motion:reduce\)\{#itemOverlay #itemModal\{animation:none;\}\}/);
});
