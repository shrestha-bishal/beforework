"use strict";

const assert=require("node:assert/strict");
const test=require("node:test");
const {createItemFieldRenderer,templateSource}=require("./helpers/item-fields");

test("field editor templates render escaped labels, values, and settings controls",()=>{
  const renderer=createItemFieldRenderer();
  const html=renderer.render(
    {id:'text"<',label:"Name <one>",type:"text"},
    {values:{'text"<':"<script>alert(1)</script>"}},
    {}
  );

  assert.match(html,/Name &lt;one&gt;/);
  assert.match(html,/data-fieldid="text&quot;&lt;"/);
  assert.match(html,/value="&lt;script&gt;alert\(1\)&lt;\/script&gt;"/);
  assert.match(html,/data-action="openFieldControl"/);
  assert.match(html,/icon="mdi:dots-horizontal"/);
});

test("field types preserve their existing selectors, values, and empty states",()=>{
  const renderer=createItemFieldRenderer({
    priorityOptions:[{id:"high",label:"High"}]
  });
  const item={id:"current",values:{
    priority:"high",
    category:"design",
    areas:["docs"],
    related:["target"],
    approved:true,
    due:"2026-10-12",
    estimate:0
  }};
  const project={groups:[{items:[
    item,
    {id:"target",title:"Target <item>"}
  ]}]};
  const output=[
    renderer.render({id:"priority",label:"Priority",type:"priority"},item,project),
    renderer.render({id:"category",label:"Category",type:"select",options:[{id:"design",label:"Design"}]},item,project),
    renderer.render({id:"areas",label:"Areas",type:"multi-select",options:[{id:"docs",label:"Docs"}]},item,project),
    renderer.render({id:"related",label:"Related",type:"relation"},item,project),
    renderer.render({id:"approved",label:"Approved",type:"checkbox"},item,project),
    renderer.render({id:"due",label:"Due",type:"due-date"},item,project),
    renderer.render({id:"estimate",label:"Estimate",type:"number"},item,project),
    renderer.render({id:"empty",label:"Empty",type:"multi-select",options:[]},item,project)
  ];

  assert.match(output[0],/value="high" selected/);
  assert.match(output[1],/value="design" selected/);
  assert.match(output[2],/multiple class="form-control fieldInput"/);
  assert.match(output[2],/value="docs" selected/);
  assert.match(output[3],/relationFieldSelect/);
  assert.match(output[3],/Target &lt;item&gt;/);
  assert.doesNotMatch(output[3],/value="current"/);
  assert.match(output[4],/type="checkbox"[^>]*checked/);
  assert.match(output[5],/type="date"/);
  assert.match(output[6],/type="number"[^>]*value="0"/);
  assert.match(output[7],/Add options to this column first/);
});

test("Tags, Location, and Schedule use field templates without changing their controls",()=>{
  const renderer=createItemFieldRenderer();
  const item={id:"item",tagIds:["release"],values:{location:"Office"}};
  const tags=renderer.render(
    {id:"tags",label:"Tags",type:"tags"},
    item,
    {tags:[{id:"release",name:"Release"}]}
  );
  const location=renderer.renderLocation({id:"location",label:"Location"},item);
  const schedule=renderer.renderSchedule(
    {id:"schedule",label:"Schedule"},
    '<button data-action="addSchedule">+ Add date and time</button>'
  );

  assert.match(tags,/data-tag="release" data-selected="true"/);
  assert.match(tags,/data-action="newTagFromItem"/);
  assert.equal(renderer.render({id:"schedule",label:"Schedule",type:"schedule"},item,{}),"");
  assert.match(location,/id="itemLocationInput"/);
  assert.match(location,/value="Office"/);
  assert.match(schedule,/data-action="openFieldControl"/);
  assert.match(schedule,/data-action="addSchedule"/);
  assert.match(templateSource,/<template data-view-partial="location">/);
  assert.match(templateSource,/<template data-view-partial="schedule">/);
});
