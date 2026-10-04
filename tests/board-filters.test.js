"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const source=fs.readFileSync(path.join(__dirname,"../js/features/filters.js"),"utf8");
const app=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
const index=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");

function createFeature({saved={}}={}){
  const sandbox={window:{}};
  vm.runInNewContext(source,sandbox,{filename:"filters.js"});
  const stored=new Map([["filters",JSON.stringify(saved)]]);
  const storage={
    getItem:key=>stored.get(key)||null,
    setItem:(key,value)=>stored.set(key,value)
  };
  const project={id:"project",fields:[
    {id:"status",label:"Status",type:"select",options:[{id:"todo",label:"To do"},{id:"doing",label:"In progress"}]},
    {id:"count",label:"Count",type:"number"},
    {id:"areas",label:"Areas",type:"multi-select",options:[{id:"docs",label:"Docs"},{id:"design",label:"Design"}]},
    {id:"contact",label:"Contact",type:"email"},
    {id:"tags",label:"Tags",type:"tags"}
  ],tags:[{id:"urgent",name:"urgent",color:"#cf222e"}],groups:[
    {id:"backlog",name:"Backlog",items:[{id:"one",title:"First task",tagIds:["urgent"],values:{
      status:"todo",count:0,areas:["docs","design"],contact:"alex@example.com"
    }}]},
    {id:"doing-group",name:"Doing",items:[{id:"two",title:"Second task",tagIds:[],values:{status:"doing"}}]}
  ]};
  const fieldTypes={
    getFilter(field){
      return {kind:{select:"options",number:"number","multi-select":"options",email:"text",text:"text"}[field?.type]||"options"};
    },
    getFilterOptions(field){
      if (field.type==="tags") return project.tags.map(tag=>({value:tag.id,label:tag.name,color:tag.color}));
      return (field.options||[]).map(option=>({value:option.id,label:option.label}));
    },
    getFilterValues(field,{item,noneValue}={}){
      const value=field?.type==="tags"?item?.tagIds:item?.values?.[field?.id];
      return value!=null&&value!==""?(Array.isArray(value)?value:[value]):[noneValue];
    },
    matchesFilter(field,{item,mode}={}){
      if (field?.type==="tags") return !mode?.length||mode.some(id=>(item.tagIds||[]).includes(id));
      const actual=item.values?.[field?.id];
      const values=Array.isArray(mode)?mode:[mode];
      return !values.length||values.some(value=>Array.isArray(actual)?actual.includes(value)
        :field?.type==="email"?String(actual??"").includes(value):String(actual)===String(value));
    },
    matchesQuery(field,{value,query}={}){
      return String(value??"").toLowerCase().includes(query);
    }
  };
  const feature=sandbox.window.BeforeworkFilters.create({
    storageKey:"filters",
    storage,
    fieldTypes,
    getProject:id=>id==="project"?project:null,
    getActiveProjectId:()=>"project",
    getProjectGroups:value=>value.groups,
    getProjectItemEntries:value=>value.groups.flatMap(group=>group.items.map(item=>({item,group}))),
    getShowArchived:()=>false,
    isItemCompleted:()=>false,
    scheduleFieldValue:()=>"",
    render:()=>{},
    escapeHtml:value=>String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
  });
  return {feature,project,stored};
}

test("filter state restores, persists, and migrates legacy column selections",()=>{
  const {feature,project,stored}=createFeature({saved:{
    project:{text:"release",groups:["backlog"],tags:["urgent"],fields:{},columns:{
      group:["doing-group"],tags:["other"],"field:status":["doing"]
    }}
  }});
  feature.restore("project");

  assert.equal(feature.text,"release");
  assert.deepEqual([...feature.groups],["backlog","doing-group"]);
  assert.deepEqual([...feature.tags],["urgent","other"]);
  assert.deepEqual([...feature.fields.get("status")],["doing"]);
  assert.equal(feature.columns.size,0);

  feature.persistActive();
  const saved=JSON.parse(stored.get("filters")).project;
  assert.deepEqual(saved.groups,["backlog","doing-group"]);
  assert.deepEqual(saved.tags,["urgent","other"]);
  assert.deepEqual(saved.fields.status,["doing"]);
  assert.deepEqual(saved.columns,{});
  assert.equal(project.id,"project");
});

test("filter matching combines text, group, tag, field, completion, archive, and column state",()=>{
  const {feature,project}=createFeature();
  const first=project.groups[0].items[0];
  const second=project.groups[1].items[0];

  feature.groups.add("backlog");
  feature.tags.add("urgent");
  feature.fields.set("status",["todo"]);
  feature.setText("first");
  assert.equal(feature.matches(project,first,project.groups[0]),true);
  assert.equal(feature.matches(project,second,project.groups[1]),false);

  feature.setText("");
  feature.fields.clear();
  feature.tags.clear();
  feature.groups.clear();
  feature.columns.set("title",new Set(["First task"]));
  assert.equal(feature.matches(project,first,project.groups[0]),true);
  assert.equal(feature.matches(project,second,project.groups[1]),false);
  assert.equal(feature.matches(project,second,project.groups[1],true),true);
});

test("column filters update the same canonical selections used by filter tokens",()=>{
  const {feature,project}=createFeature();
  feature.setColumnSelection(project,"group",["backlog"]);
  feature.setColumnSelection(project,"tags",["urgent"]);
  feature.setColumnSelection(project,"field:status",["doing"]);

  assert.deepEqual([...feature.groups],["backlog"]);
  assert.deepEqual([...feature.tags],["urgent"]);
  assert.deepEqual([...feature.fields.get("status")],["doing"]);
  assert.deepEqual([...feature.columnSelection(project,"field:status")],["doing"]);
});

test("filters numeric zero, multi-select values, email substrings, and tags only when enabled",()=>{
  const {feature,project}=createFeature();
  const first=project.groups[0].items[0];
  first.values={...first.values,count:0,areas:["docs","design"],contact:"alex@example.com"};
  feature.fields.set("count","0");
  assert.equal(feature.matches(project,first,project.groups[0]),true);
  feature.fields.clear();
  feature.fields.set("areas",["design"]);
  assert.equal(feature.matches(project,first,project.groups[0]),true);
  feature.fields.set("contact","example.com");
  assert.equal(feature.matches(project,first,project.groups[0]),true);
  feature.fields.clear();
  feature.tags.add("urgent");
  assert.equal(feature.matches(project,first,project.groups[0]),true);
  project.fields=project.fields.filter(field=>field.type!=="tags");
  assert.equal(feature.matches(project,project.groups[1].items[0],project.groups[1]),true);
});

test("filter tokens and autocomplete suggestions expose the same canonical choices",()=>{
  const {feature,project}=createFeature();
  feature.setText("first");
  feature.groups.add("backlog");
  feature.tags.add("urgent");
  feature.fields.set("status",["todo"]);

  assert.deepEqual(JSON.parse(JSON.stringify(feature.tokens(project).map(token=>token.label))),[
    "Search: first","Group: Backlog","Tag: urgent","Status: To do"
  ]);
  assert.ok(feature.suggestions(project,"urgent").some(option=>option.kind==="tag"&&option.value==="urgent"));
  assert.ok(feature.suggestions(project,"in progress").some(option=>option.kind==="field"&&option.value==="doing"));
  assert.ok(feature.suggestions(project,"Contact: example.com").some(option=>option.kind==="field"&&option.value==="example.com"));
});

test("app delegates filter state and matching to the extracted feature and uses the token bar",()=>{
  assert.match(app,/window\.BeforeworkFilters\.create\(/);
  assert.match(app,/filterFeature\.matches\(project,item,group,ignoreColumnFilters\)/);
  assert.match(app,/filterFeature\.persistActive\(\)/);
  assert.match(app,/filterFeature\.renderBar\(project\)/);
  assert.doesNotMatch(app,/let boardFilter(Text|Groups|Tags|Fields|Columns)/);
  assert.doesNotMatch(app,/function render(Field|Group|BoardTag)Filters/);
  assert.match(index,/id="filterTokens"/);
  assert.match(index,/id="filterInput"/);
  assert.match(index,/id="filterSuggestions"/);
  assert.doesNotMatch(index,/id="filterPanel"/);
  assert.ok(index.indexOf('src="js/features/filters.js"')<index.indexOf('src="js/app.js"'));
});

test("app moves completion tabs out of the board before clearing its contents",()=>{
  const renderStart=app.indexOf("function render(){");
  const relocate=app.indexOf("filterBar.insertBefore(completionTabs",renderStart);
  const clearBoard=app.indexOf('board.innerHTML = "";',renderStart);

  assert.ok(relocate>renderStart&&relocate<clearBoard);
  assert.match(app,/if \(completionTabs && filterBar && board\.contains\(completionTabs\)\)/);
});
