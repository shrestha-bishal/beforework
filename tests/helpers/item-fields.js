"use strict";

const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const {createFieldTypes}=require("./field-types");

const moduleSource=fs.readFileSync(path.join(__dirname,"../../js/ui/item-fields.js"),"utf8");
const templateSource=fs.readFileSync(path.join(__dirname,"../../pages/item-fields.html"),"utf8");
const partials=new Map([...templateSource.matchAll(/<template data-view-partial="([^"]+)">([\s\S]*?)<\/template>/g)]
  .map(([,name,html])=>[name,html]));

function renderPartial(name,values){
  const template=partials.get(name);
  if (template===undefined) throw new Error(`Unknown partial "${name}"`);
  return template.replace(/\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/g,(token,key)=>{
    if (!Object.prototype.hasOwnProperty.call(values,key)) throw new Error(`Missing value "${key}"`);
    return String(values[key]);
  });
}

function createItemFieldRenderer(dependencies={}){
  const window={};
  vm.runInNewContext(moduleSource,{window},{filename:"item-fields.js"});
  return window.BeforeworkItemFields.create({
    escapeHtml:value=>String(value??"").replace(/[&<>"']/g,char=>({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    })[char]),
    tagPillHtml:(tag,selected,filterable)=>`<span class="tagPill${selected?" selected":""}" data-tag="${tag.id}"${filterable?' data-tagfilter="true"':""}>${tag.name}</span>`,
    projectItemEntries:project=>(project.groups||[]).flatMap(group=>(group.items||[]).map(item=>({group,item}))),
    fieldTypes:createFieldTypes(),
    priorityOptions:[],
    renderPartial,
    ...dependencies
  });
}

module.exports={createItemFieldRenderer,templateSource};
