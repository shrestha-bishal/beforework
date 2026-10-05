"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const source=fs.readFileSync(path.join(__dirname,"../js/services/csv-export.js"),"utf8");
const appSource=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");

function createHarness(){
  const calls={blobs:[],links:[],revoked:[],delays:[]};
  class TestBlob{
    constructor(parts,options){ this.parts=parts; this.options=options; calls.blobs.push(this); }
  }
  const urlApi={
    createObjectURL(blob){ calls.blob=blob; return "blob:csv-export"; },
    revokeObjectURL(url){ calls.revoked.push(url); }
  };
  const window={Blob:TestBlob,URL:urlApi,setTimeout(callback,delay){ calls.delays.push(delay); callback(); }};
  vm.runInNewContext(source,{window},{filename:"csv-export.js"});
  const exportCsv=window.BeforeworkCsvExport.create({
    getRows:project=>project.rows,
    formatFieldValue:(field,value,project,item)=>field.type==="tags"
      ? item.tagNames.join("; ")
      : field.type==="select"
        ? field.options.find(option=>option.id===value)?.label||""
        : field.type==="multi-select"
          ? value.map(id=>field.options.find(option=>option.id===id)?.label).filter(Boolean).join("; ")
          : String(value??""),
    formatScheduleValue:(_project,item)=>item.schedule||"",
    formatUpdatedAt:()=>"Today at 9:00 AM",
    orderedTableColumns:(project,viewType,columnIds)=>{
      const saved=project.columnOrders?.[viewType]||[];
      return [...saved.filter(id=>columnIds.includes(id)),...columnIds.filter(id=>!saved.includes(id))];
    },
    documentRef:{createElement:tag=>{
      assert.equal(tag,"a");
      const link={click(){ calls.links.push({href:this.href,download:this.download}); }};
      return link;
    }}
  });
  return {exportCsv,calls};
}

test("CSV export preserves saved view columns and safely serializes formatted values",()=>{
  const {exportCsv}=createHarness();
  const project={
    groups:[{id:"g1"},{id:"g2"}],
    fields:[
      {id:"status",label:"Status",type:"select",options:[{id:"blocked",label:"Blocked"}]},
      {id:"areas",label:"Areas",type:"multi-select",options:[{id:"docs",label:"Docs"},{id:"design",label:"Design"}]},
      {id:"cost",label:"Cost",type:"number"},
      {id:"tags",label:"Tags",type:"tags"}
    ],
    columnOrders:{table:["tags","title","group","field:status","field:areas","field:cost"]},
    rows:[{item:{
      title:"=1+1",values:{status:"blocked",areas:["docs","design"],cost:-12},tagNames:["release"],updatedAt:1,subitems:[]
    },group:{name:"Planning"}}]
  };
  const table=exportCsv.buildProjectCsv(project,"table",false,project.rows);
  const list=exportCsv.buildProjectCsv(project,"list",true,project.rows);
  const noTags=exportCsv.buildProjectCsv({...project,fields:project.fields.filter(field=>field.type!=="tags")},"table",false,project.rows);
  const escaped=exportCsv.serializeRows([["Header"],['Comma, quote " and newline\nnext'],["=SUM(A1)"]]);

  assert.match(table,/^"Tags","Title","Group","Status","Areas","Cost"/);
  assert.match(table,/"release","'=1\+1","Planning","Blocked","Docs; Design","-12"/);
  assert.match(list,/"Progress","Updated"/);
  assert.doesNotMatch(noTags,/Tags|release/);
  assert.ok(escaped.includes("\"Comma, quote \"\" and newline\nnext\""));
  assert.match(escaped,/"'=SUM\(A1\)"/);
});

test("CSV export includes list-only columns and omits groups when they aren't needed",()=>{
  const {exportCsv}=createHarness();
  const project={
    name:"Launch",
    groups:[{id:"g1"}],
    fields:[{id:"schedule",label:"Schedule",type:"schedule"}],
    rows:[{item:{title:"Task",values:{},schedule:"Oct 5",updatedAt:1,subitems:[{done:true},{done:false}]},group:{name:"To do"}}]
  };
  const csv=exportCsv.buildProjectCsv(project,"list",true,project.rows);

  assert.equal(csv,'"Title","Schedule","Progress","Updated"\r\n"Task","Oct 5","1/2","Today at 9:00 AM"');
});

test("CSV export downloads a UTF-8 BOM file with a safe project filename and revokes its URL",()=>{
  const {exportCsv,calls}=createHarness();
  const project={
    name:'Release: "Q4"?',
    groups:[],
    fields:[],
    rows:[{item:{title:"Ship",values:{},subitems:[]},group:{name:""}}]
  };
  exportCsv.exportProjectCsv(project,"table");

  assert.deepEqual(Array.from(calls.blobs[0].parts),["\uFEFF",'"Title"\r\n"Ship"']);
  assert.equal(calls.blobs[0].options.type,"text/csv;charset=utf-8");
  assert.deepEqual(calls.links,[{href:"blob:csv-export",download:"Release- -Q4--.csv"}]);
  assert.deepEqual(calls.revoked,["blob:csv-export"]);
  assert.deepEqual(calls.delays,[1000]);
});

test("CSV export requires app callbacks and delegates view exports to the service",()=>{
  const window={};
  vm.runInNewContext(source,{window},{filename:"csv-export.js"});
  assert.throws(()=>window.BeforeworkCsvExport.create(),/requires row, formatting, and column-order callbacks/);

  assert.match(appSource,/window\.BeforeworkCsvExport\.create\(\{/);
  assert.match(appSource,/getRows:project=>sortProjectRows\(project,rowsForSelection\(project\)\)/);
  assert.match(appSource,/const exportProjectCsv=csvExport\.exportProjectCsv/);
});
