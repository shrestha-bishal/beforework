"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const sandbox={window:{}};
const source=fs.readFileSync(path.join(__dirname,"../js/services/csv-import.js"),"utf8");
vm.runInNewContext(source,sandbox,{filename:"csv-import.js"});
const csvImport=sandbox.window.BeforeworkCsvImport;

test("parses quoted CSV values, escaped quotes, newlines, and a UTF-8 BOM",()=>{
  const parsed=csvImport.parseCsv('\uFEFFTitle,Description,Tags\r\n"Plan, launch","Line one\nLine ""two""",urgent; release\r\n');
  assert.deepEqual(JSON.parse(JSON.stringify(parsed)),{
    headers:["Title","Description","Tags"],
    rows:[["Plan, launch",'Line one\nLine "two"',"urgent; release"]]
  });
});

test("fills blank headers and missing trailing cells while rejecting extra columns",()=>{
  const parsed=csvImport.parseCsv("Task,,Priority\nShip,,High\n");
  assert.deepEqual(JSON.parse(JSON.stringify(parsed)),{
    headers:["Task","Column 2","Priority"],
    rows:[["Ship","","High"]]
  });
  assert.throws(()=>csvImport.parseCsv("Task,Status\nShip,Ready,Extra"),/more columns than the header row/);
});

test("rejects malformed quoting and CSV files without task rows",()=>{
  assert.throws(()=>csvImport.parseCsv('Title,Description\n"unfinished'),/unclosed quoted value/);
  assert.throws(()=>csvImport.parseCsv('Title\n"closed"bad'),/after a quoted value/);
  assert.throws(()=>csvImport.parseCsv("Title,Description\n"),/no task rows/);
});

test("normalizes supported due dates and priorities",()=>{
  assert.equal(csvImport.normalizeDate("2026-2-3"),"2026-02-03");
  assert.equal(csvImport.normalizeDate("29/12/2024","DMY"),"2024-12-29");
  assert.equal(csvImport.normalizeDate("1/12/2024","DMY"),"2024-12-01");
  assert.equal(csvImport.normalizeDate("12/29/2024","MDY"),"2024-12-29");
  assert.equal(csvImport.normalizeDate("2024/12/29","YMD"),"2024-12-29");
  assert.equal(csvImport.normalizeDate("29/12/2024","MDY"),null);
  assert.equal(csvImport.normalizeDate("29-12/2024","DMY"),null);
  assert.equal(csvImport.normalizeDate("2026-02-30"),null);
  assert.equal(csvImport.normalizePriority("P1"),"high");
  assert.equal(csvImport.normalizePriority("Normal"),"medium");
  assert.equal(csvImport.normalizePriority("unknown"),null);
});

test("validates CSV file types and size with actionable errors",()=>{
  assert.throws(()=>csvImport.validateFile({name:"Book2.xlsx",size:200}),/Save the spreadsheet as a CSV file/);
  assert.throws(()=>csvImport.validateFile({name:"tasks.xls",size:200}),/Excel workbooks aren't supported yet/);
  assert.throws(()=>csvImport.validateFile({name:"tasks.txt",size:200}),/Choose a \.csv file/);
  assert.throws(()=>csvImport.validateFile({name:"tasks.csv",size:10*1024*1024+1}),/10 MB or smaller/);
  assert.doesNotThrow(()=>csvImport.validateFile({name:"tasks.CSV",size:200}));
});

test("prepares mapped tasks, resolves groups, and identifies new groups",()=>{
  const parsed={headers:["Title","Status","Tags","Due","Priority"],rows:[
    ["Prepare release","To do","release; qa","2026-10-01","High"],
    ["Publish release","Ready","release","10/2/2026","P2"]
  ]};
  const result=csvImport.prepareImport(parsed,{title:0,status:1,tags:2,dueDate:3,priority:4},["To Do"],"MDY");
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{
    tasks:[
      {title:"Prepare release",description:"",dueDate:"2026-10-01",priority:"high",status:"To Do",tags:["release","qa"]},
      {title:"Publish release",description:"",dueDate:"2026-10-02",priority:"medium",status:"Ready",tags:["release"]}
    ],
    errors:[],
    groupsToCreate:["Ready"]
  });
});

test("reports row-specific missing titles and invalid mapped values",()=>{
  const parsed={headers:["Title","Due","Priority"],rows:[["","not-a-date","asap"]]};
  const result=csvImport.prepareImport(parsed,{title:0,dueDate:1,priority:2});
  assert.equal(result.errors.length,3);
  assert.match(result.errors[0],/Row 2: task title is required/);
  assert.match(result.errors[1],/selected format/);
  assert.match(result.errors[2],/priority must be/);
});
