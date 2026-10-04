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

test("imports custom priority labels using the project's configured choices",()=>{
  const choices=[
    {id:"p1-custom",label:"Critical"},
    {id:"p2-custom",label:"Standard"}
  ];
  const parsed={headers:["Title","Priority"],rows:[
    ["Escalate incident","Critical"],
    ["Review request","p2-custom"]
  ]};
  const result=csvImport.prepareImport(parsed,{title:0,priority:1},[], "DMY",choices);

  assert.deepEqual(JSON.parse(JSON.stringify(result.tasks.map(task=>task.priority))),["p1-custom","p2-custom"]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.errors)),[]);
  assert.equal(csvImport.normalizePriority("High",choices),null);
});

test("validates CSV file types and size with actionable errors",()=>{
  assert.throws(()=>csvImport.validateFile({name:"Book2.xlsx",size:200}),/Save the spreadsheet as a CSV file/);
  assert.throws(()=>csvImport.validateFile({name:"tasks.xls",size:200}),/Excel workbooks aren't supported yet/);
  assert.throws(()=>csvImport.validateFile({name:"tasks.txt",size:200}),/Choose a \.csv file/);
  assert.throws(()=>csvImport.validateFile({name:"tasks.csv",size:10*1024*1024+1}),/10 MB or smaller/);
  assert.doesNotThrow(()=>csvImport.validateFile({name:"tasks.CSV",size:200}));
});

test("prepares mapped tasks, resolves groups, and identifies new groups",()=>{
  const parsed={headers:["Title","Status","Tags","Start Date","Due","Priority"],rows:[
    ["Prepare release","To do","release; qa","2026-09-25","2026-10-01","High"],
    ["Publish release","Ready","release","","10/2/2026","P2"]
  ]};
  const result=csvImport.prepareImport(parsed,{title:0,status:1,tags:2,startDate:3,dueDate:4,priority:5},["To Do"],"MDY");
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{
    tasks:[
      {title:"Prepare release",description:"",startDate:"2026-09-25",dueDate:"2026-10-01",customDates:{},priority:"high",status:"To Do",tags:["release","qa"]},
      {title:"Publish release",description:"",startDate:"",dueDate:"2026-10-02",customDates:{},priority:"medium",status:"Ready",tags:["release"]}
    ],
    errors:[],
    groupsToCreate:["Ready"]
  });
});

test("normalizes mapped custom date columns and rejects invalid values",()=>{
  const result=csvImport.prepareImport(
    {headers:["Title","Review"],rows:[["Plan release","2026-10-02"],["Ship release","not a date"]]},
    {title:0,"customDate:2":1}
  );
  assert.deepEqual(JSON.parse(JSON.stringify(result.tasks.map(task=>task.customDates))),[
    {"customDate:2":"2026-10-02"},
    {"customDate:2":""}
  ]);
  assert.match(result.errors[0],/custom date/);
});

test("rejects a task start date after its due date",()=>{
  const result=csvImport.prepareImport(
    {headers:["Title","Start","Due"],rows:[["Plan release","2026-10-02","2026-10-01"]]},
    {title:0,startDate:1,dueDate:2}
  );
  assert.deepEqual(JSON.parse(JSON.stringify(result.errors)),["Row 2: start date must be on or before the due date."]);
});

test("reports row-specific missing titles and invalid mapped values",()=>{
  const parsed={headers:["Title","Due","Priority"],rows:[["","not-a-date","asap"]]};
  const result=csvImport.prepareImport(parsed,{title:0,dueDate:1,priority:2});
  assert.equal(result.errors.length,3);
  assert.match(result.errors[0],/Row 2: task title is required/);
  assert.match(result.errors[1],/selected format/);
  assert.match(result.errors[2],/priority must be/);
});
