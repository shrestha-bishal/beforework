"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const {createItemFieldRenderer,templateSource}=require("./helpers/item-fields");

test("tag labels use a rich color fill without a leading dot",()=>{
  const styles=fs.readFileSync(path.join(__dirname,"../styles/app.css"),"utf8");

  assert.match(styles,/\.tagColorPill\{background-color:color-mix\(in srgb,var\(--tag-color\) 38%,var\(--bg\)\);[^}]*color:var\(--text\)/);
  assert.match(styles,/\.tagColorPill \.dot\{display:none;\}/);
  assert.match(styles,/\.Label\.selected:not\(\.tagColorPill\)/);
});

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
  assert.match(html,/aria-label="Edit Name &lt;one&gt;"/);
  assert.match(html,/title="Edit field"/);
  assert.match(html,/icon="mdi:cog-outline"/);
  assert.doesNotMatch(html,/fieldDetailMenu|data-field-menu-action|data-action-menu-trigger/);
});

test("fixed built-in fields use a delete action menu instead of field settings",()=>{
  const renderer=createItemFieldRenderer();
  for (const [id,type,label] of [
    ["start","start-date","Start date"],
    ["due","due-date","Due date"],
    ["location","location","Location"],
    ["schedule","schedule","Schedule"]
  ]){
    const field={id,type,label};
    const html=type==="location"
      ?renderer.renderLocation(field,{values:{}})
      :type==="schedule"
        ?renderer.renderSchedule(field,"Schedule controls")
        :renderer.render(field,{values:{}},{});

    assert.match(html,/icon="mdi:dots-horizontal"/);
    assert.match(html,/aria-label="More actions for/);
    assert.match(html,/data-field-menu-delete/);
    assert.match(html,/>\s*Delete\s*<\/button>/);
    assert.doesNotMatch(html,/mdi:cog-outline/);
  }
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

  assert.match(tags,/class="tagPill selected" data-tag="release"/);
  assert.doesNotMatch(tags,/data-tagfilter/);
  assert.match(tags,/data-app-select-button-class="appSelectButton tagSelectButton"/);
  assert.match(tags,/data-app-select-button-icon="mdi:plus"/);
  assert.match(tags,/data-app-select-enhance-empty="true"/);
  assert.match(tags,/data-app-select-menu-width="240"/);
  assert.match(tags,/value="release" selected/);
  assert.doesNotMatch(tags,/class="itemTagAddButton"/);
  assert.equal(renderer.render({id:"schedule",label:"Schedule",type:"schedule"},item,{}),"");
  assert.match(location,/id="itemLocationInput"/);
  assert.match(location,/value="Office"/);
  assert.match(schedule,/data-action="addSchedule"/);
  assert.match(templateSource,/<template data-view-partial="location">/);
  assert.match(templateSource,/<template data-view-partial="schedule">/);
});

test("Tags editor shows selected pills and offers visible tags through its picker",()=>{
  const renderer=createItemFieldRenderer();
  const html=renderer.render(
    {id:"tags",label:"Tags",type:"tags"},
    {tagIds:["urgent","hidden"],values:{}},
    {tags:[
      {id:"urgent",name:"Urgent"},
      {id:"follow-up",name:"Follow up"},
      {id:"hidden",name:"Hidden",hiddenInField:true}
    ]}
  );

  assert.match(html,/class="tagPill selected" data-tag="urgent"/);
  assert.match(html,/class="tagPill selected" data-tag="hidden"/);
  assert.doesNotMatch(html,/data-tagfilter/);
  assert.doesNotMatch(html,/data-tag="follow-up"/);
  assert.match(html,/value="urgent" selected/);
  assert.match(html,/value="follow-up"/);
  assert.match(html,/value="hidden" selected/);
  assert.match(html,/data-app-select-empty-label="No tags yet"/);
  assert.doesNotMatch(html,/Add new tag/);
  assert.doesNotMatch(html,/class="itemTagAddButton"/);
});

test("hidden select choices stay selected but are not offered for new assignments",()=>{
  const renderer=createItemFieldRenderer();
  const field={id:"status",label:"Status",type:"select",options:[
    {id:"ready",label:"Ready"},
    {id:"old",label:"Old",hiddenInField:true}
  ]};
  const existing=renderer.render(field,{values:{status:"old"}},{});
  const unassigned=renderer.render(field,{values:{}},{});

  assert.match(existing,/value="old" selected/);
  assert.doesNotMatch(unassigned,/value="old"/);
  assert.match(unassigned,/value="ready"/);
});

test("Tags editor keeps an empty picker available when the project has no tags",()=>{
  const html=createItemFieldRenderer().render(
    {id:"tags",label:"Tags",type:"tags"},
    {tagIds:[],values:{}},
    {tags:[]}
  );

  assert.match(html,/data-app-select-button-icon="mdi:plus"/);
  assert.match(html,/data-app-select-enhance-empty="true"/);
  assert.match(html,/data-app-select-empty-label="No tags yet"/);
  assert.doesNotMatch(html,/Add new tag/);
});
