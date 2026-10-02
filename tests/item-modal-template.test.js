"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const templatePath=path.join(__dirname,"../pages/item-modal.html");
const templateSource=fs.readFileSync(templatePath,"utf8");
const appSource=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
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
  for (const id of ["itemTitleInput","itemDescInput","itemDescPreview","itemCalendarType","itemTagChips","itemModalFooter"]){
    assert.ok(rendered.includes(`id="${id}"`) || rendered.includes(`class="${id}"`),`missing ${id}`);
  }
  assert.match(appSource,/itemModalEditDescriptionButton/);
  assert.ok(appSource.indexOf('data-action="toggleDescriptionEdit"')<appSource.indexOf('data-action="toggleItemMenu"'));
  assert.match(appSource,/icon="mdi:pencil-outline"/);
  assert.match(rendered,/itemDescPreview/);
  assert.doesNotMatch(rendered,/itemDescriptionToolbar|data-description-mode/);
  assert.doesNotMatch(templateSource,/\{\{description(?:Input|Preview)Hidden\}\}/);
  assert.match(appSource,/descriptionPreviewElement\.hidden=descriptionEditing/);
  assert.match(appSource,/descriptionEditButton\.onclick=/);
  assert.match(appSource,/BeforeworkViewTemplates\.render\("itemModal"/);
  assert.match(appSource,/modal\.open\(\{id:"itemOverlay",content,onBackdrop:closeItemModal\}\)/);
});
