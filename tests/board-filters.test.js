"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");
const appScripts=require("./helpers/app-script-order");

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
    {id:"priority",label:"Priority",type:"multi-select",options:[
      {id:"high",label:"High"},{id:"medium",label:"Medium"},{id:"low",label:"Low"}
    ]},
    {id:"count",label:"Count",type:"number"},
    {id:"areas",label:"Areas",type:"multi-select",options:[{id:"docs",label:"Docs"},{id:"design",label:"Design"}]},
    {id:"contact",label:"Contact",type:"email"},
    {id:"tags",label:"Tags",type:"tags"}
  ],tags:[
    {id:"urgent",name:"urgent",color:"#cf222e"},
    {id:"follow-up",name:"follow-up",color:"#8250df"},
    {id:"quick-win",name:"quick-win",color:"#bf3989"}
  ],groups:[
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

test("filters numeric zero, multi-select values, email substrings, and project tags",()=>{
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
  assert.equal(feature.matches(project,project.groups[1].items[0],project.groups[1]),false);
});

test("filter tokens and autocomplete suggestions expose the same canonical choices",()=>{
  const {feature,project}=createFeature();
  feature.setText("first");
  feature.groups.add("backlog");
  feature.tags.add("urgent");
  feature.fields.set("status",["todo"]);

  assert.deepEqual(JSON.parse(JSON.stringify(feature.tokens(project).map(token=>token.label))),[
    "Search: first","group: Backlog","Tag: urgent","Status: To do"
  ]);
  assert.ok(!feature.suggestions(project,"urgent").some(option=>option.kind==="tag"&&option.value==="urgent"));
  assert.ok(feature.suggestions(project,"in progress").some(option=>option.kind==="field"&&option.value==="doing"));
  assert.ok(feature.suggestions(project,"Contact: example.com").some(option=>option.kind==="field"&&option.value==="example.com"));
  assert.ok(!feature.suggestions(project,"Status:").some(option=>option.value==="todo"));
});

test("applied filter tokens retain selection order across filter types and restore",()=>{
  const {feature,project,stored}=createFeature();
  feature.setTags(["urgent"]);
  feature.setGroups(["backlog"]);
  feature.setTags(["urgent","follow-up"]);
  feature.persistActive();

  const expected=["Tag: urgent","group: Backlog","Tag: follow-up"];
  assert.deepEqual(JSON.parse(JSON.stringify(feature.tokens(project).map(token=>token.label))),expected);

  const restored=createFeature({saved:JSON.parse(stored.get("filters"))});
  restored.feature.restore("project");
  assert.deepEqual(
    JSON.parse(JSON.stringify(restored.feature.tokens(restored.project).map(token=>token.label))),
    expected
  );
});

test("filter autocomplete omits already selected values from field options",()=>{
  const {feature,project}=createFeature();
  feature.fields.set("priority",["high","medium"]);

  assert.deepEqual(JSON.parse(JSON.stringify(feature.suggestions(project,"Priority:").map(option=>option.label))),
    ["Low","No Priority"]);
});

test("filter suggestions return nothing and hide the menu when no choices remain",()=>{
  const {feature,project}=createFeature();
  project.tags=[];
  feature.tags.add("urgent");
  feature.tags.add("__none__");

  assert.deepEqual(JSON.parse(JSON.stringify(feature.suggestions(project,"tag:"))),[]);
  assert.deepEqual(JSON.parse(JSON.stringify(feature.suggestions(project,"tag"))),[]);
  assert.match(source,/suggestionsWrap\.hidden=!suggestionsOpen\|\|\(!choices\.length&&!hasSearchChoice\)/);
});

test("filter suggestion menu anchors at the input caret",()=>{
  const start=source.indexOf("function positionSuggestionsAtCaret(input,suggestionsWrap)");
  const end=source.indexOf("\n    function renderBar",start);
  const positioning=source.slice(start,end);
  const wrapper={getBoundingClientRect:()=>({left:100})};
  const menu={style:{}};
  const input={
    value:"tag:",
    selectionStart:4,
    scrollLeft:0,
    closest:()=>wrapper,
    getBoundingClientRect:()=>({left:120})
  };
  const documentRef={createElement:()=>({getContext:()=>({
    measureText:value=>({width:value.length*10})
  })})};
  const global={
    innerWidth:1000,
    getComputedStyle:()=>({font:"13px sans-serif",paddingLeft:"4px"})
  };

  vm.runInNewContext(`${positioning}; positionSuggestionsAtCaret(input,menu);`,{
    documentRef,global,input,menu
  });

  assert.equal(menu.style.left,"64px");
  assert.equal(menu.style.width,"420px");
});

test("filter query prefixes open focused autocomplete choices while leaving free text available",()=>{
  const {feature,project}=createFeature();
  feature.tags.add("urgent");
  const tagSuggestions=feature.suggestions(project,"tag:");

  assert.deepEqual(JSON.parse(JSON.stringify(tagSuggestions.map(option=>option.label))),
    ["follow-up","quick-win","No tags"]);
  assert.ok(!tagSuggestions.some(option=>option.value==="urgent"));
  assert.ok(tagSuggestions.some(option=>option.value==="__none__"&&option.kind==="tag"));
  assert.deepEqual(JSON.parse(JSON.stringify(feature.suggestions(project,"tag:urg").map(option=>option.value))),[]);
  assert.ok(!feature.suggestions(project,"No tags").some(option=>option.kind==="tag"));
  assert.ok(feature.suggestions(project,"")[0].kind==="operator");
  assert.ok(feature.suggestions(project,"is:").some(option=>option.value==="completed"));
  assert.ok(feature.suggestions(project,"Status:").some(option=>option.value==="todo"));
  assert.equal(feature.suggestions(project,"")
    .find(option=>option.kind==="operator"&&option.label==="Status").value,"status");
});

test("field filter syntax is rendered lowercase independently of its display label",()=>{
  assert.match(source,/class="filterSuggestionSyntax">\$\{escapeHtml\(choice\.value\.toLowerCase\(\)\)\}:/);
});

test("tag suggestions and filtering work without a custom Tags field",()=>{
  const {feature,project}=createFeature();
  project.fields=project.fields.filter(field=>field.type!=="tags");
  feature.tags.add("urgent");

  assert.deepEqual(JSON.parse(JSON.stringify(feature.suggestions(project,"tag:").map(option=>option.value))),
    ["follow-up","quick-win","__none__"]);
  assert.ok(feature.columnFilterOptions(project,"tags").some(option=>option.value==="__none__"));
  assert.equal(feature.matches(project,project.groups[0].items[0],project.groups[0]),true);
  assert.equal(feature.matches(project,project.groups[1].items[0],project.groups[1]),false);
});

test("choosing a filter operator keeps its value suggestions open",()=>{
  const operatorSelection=source.slice(source.indexOf('if (suggestion.kind==="operator")'),
    source.indexOf('if (suggestion.kind==="completion")'));

  assert.match(operatorSelection,/suggestionsOpen=true;[\s\S]*?input\.dispatchEvent\(new global\.Event\("input",\{bubbles:true\}\)\);[\s\S]*?input\.focus\(\)/);
  assert.match(source,/suggestionsWrap\.hidden=!suggestionsOpen/);
  assert.match(source,/getElementById\("filterSuggestions"\)\.addEventListener\("mousedown",event=>\{[\s\S]*?event\.preventDefault\(\)/);
  assert.match(source,/input\.dispatchEvent\(new global\.Event\("input",\{bubbles:true\}\)\)/);
});

test("applied filter tokens highlight values without rendering bordered chips",()=>{
  const featureSource=source;
  const styles=fs.readFileSync(path.join(__dirname,"../styles/app.css"),"utf8");

  assert.match(featureSource,/class="filterTokenPrefix"/);
  assert.match(featureSource,/escapeHtml\(prefix\.toLocaleLowerCase\(\)\)/);
  assert.match(featureSource,/class="filterTokenValue"/);
  assert.match(styles,/\.filterToken\{[^}]*border:0/);
  assert.match(styles,/\.filterTokenValue\{[^}]*background:var\(--color-accent-subtle\)/);
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
  assert.match(index,/id="filterInput"[^>]*placeholder="Search or filter items"/);
  assert.match(index,/<div class="filterBarInputWrap">[\s\S]*?<input class="filterBarInput" id="filterInput"[^>]*>\s*<button[^>]*id="clearBoardFilters"[^>]*aria-label="Clear filters"/);
  assert.match(index,/id="filterSuggestions"/);
  assert.doesNotMatch(index,/id="filterSummary"/);
  assert.doesNotMatch(source,/getElementById\("filterSummary"\)/);
  assert.match(fs.readFileSync(path.join(__dirname,"../styles/app.css"),"utf8"),/\.filterClearButton\{[^}]*margin-left:auto/);
  assert.doesNotMatch(index,/id="filterPanel"/);
  assert.ok(appScripts.indexOf("features/filters.js")<appScripts.indexOf("app.js"));
});

test("app moves completion tabs out of the board before clearing its contents",()=>{
  const renderStart=app.indexOf("function render(){");
  const relocate=app.indexOf("filterBar.insertBefore(completionTabs",renderStart);
  const clearBoard=app.indexOf('board.innerHTML = "";',renderStart);

  assert.ok(relocate>renderStart&&relocate<clearBoard);
  assert.match(app,/if \(completionTabs && filterBar && board\.contains\(completionTabs\)\)/);
});
