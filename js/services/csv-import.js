(function(global){
  "use strict";

  function parseCsv(text){
    if (typeof text!=="string") throw new TypeError("CSV content must be text.");
    const input=text.replace(/^\uFEFF/,"");
    const records=[];
    let record=[];
    let cell="";
    let quoted=false;
    let justClosedQuote=false;

    for (let index=0;index<input.length;index++){
      const character=input[index];
      if (quoted){
        if (character==='"'){
          if (input[index+1]==='"'){ cell+='"'; index++; }
          else { quoted=false; justClosedQuote=true; }
        } else cell+=character;
        continue;
      }

      if (justClosedQuote && character!=="," && character!=="\r" && character!=="\n" && character!==" " && character!=="\t"){
        throw new Error(`Unexpected character after a quoted value at character ${index+1}.`);
      }
      if (character==='"'){
        if (cell.length) throw new Error(`Unexpected quote at character ${index+1}.`);
        quoted=true;
      } else if (character===","){
        record.push(cell);
        cell="";
        justClosedQuote=false;
      } else if (character==="\r" || character==="\n"){
        record.push(cell);
        cell="";
        justClosedQuote=false;
        if (record.some(value=>value.trim()!=="")) records.push(record);
        record=[];
        if (character==="\r" && input[index+1]==="\n") index++;
      } else if (!justClosedQuote) cell+=character;
    }

    if (quoted) throw new Error("The CSV contains an unclosed quoted value.");
    record.push(cell);
    if (record.some(value=>value.trim()!=="")) records.push(record);
    if (!records.length) throw new Error("The CSV file is empty.");

    const headerRow=records.shift();
    const headers=headerRow.map((header,index)=>header.trim()||`Column ${index+1}`);
    const rows=records.map((values,index)=>{
      if (values.length>headers.length){
        throw new Error(`Row ${index+2} has more columns than the header row.`);
      }
      return [...values,...Array(headers.length-values.length).fill("")];
    });
    if (!rows.length) throw new Error("The CSV has headers but no task rows.");
    return {headers,rows};
  }

  function normalizeDate(value,format="DMY"){
    const text=String(value||"").trim();
    if (!text) return "";
    const match=/^(\d{1,4})([-/.])(\d{1,2})\2(\d{1,4})$/.exec(text);
    if (!match) return null;
    let year,month,day;
    if (/^\d{4}$/.test(match[1]) && /^\d{1,2}$/.test(match[3]) && /^\d{1,2}$/.test(match[4])){
      [year,month,day]=[Number(match[1]),Number(match[3]),Number(match[4])];
    }else{
      if (!["DMY","MDY"].includes(format)) return null;
      const first=Number(match[1]),second=Number(match[3]),third=Number(match[4]);
      if (!/^\d{4}$/.test(match[4])) return null;
      year=third;
      [day,month]=format==="DMY" ? [first,second] : [second,first];
    }
    const date=new Date(year,month-1,day);
    if (date.getFullYear()!==year || date.getMonth()!==month-1 || date.getDate()!==day) return null;
    return `${String(year).padStart(4,"0")}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  }

  function normalizePriority(value,choices){
    const text=String(value||"").trim().toLowerCase();
    if (!text) return "";
    if (Array.isArray(choices)){
      const match=choices.find(choice=>
        String(choice.id).trim().toLowerCase()===text
        ||String(choice.label).trim().toLowerCase()===text
      );
      if (match) return match.id;
    }
    const normalized=["high","urgent","p1"].includes(text)?"high"
      :["medium","normal","p2"].includes(text)?"medium"
        :["low","p3"].includes(text)?"low":null;
    if (normalized&&Array.isArray(choices)){
      return choices.some(choice=>choice.id===normalized)?normalized:null;
    }
    if (normalized) return normalized;
    return null;
  }

  function validateFile(file,maxSize=10*1024*1024){
    if (!file || typeof file.name!=="string") throw new Error("Choose a CSV file to import.");
    const extension=file.name.split(".").pop().toLowerCase();
    if (extension==="xlsx" || extension==="xls"){
      throw new Error("Excel workbooks aren't supported yet. Save the spreadsheet as a CSV file, then choose the .csv file.");
    }
    if (extension!=="csv"){
      throw new Error("Unsupported file type. Choose a .csv file.");
    }
    if (file.size>maxSize) throw new Error("CSV files must be 10 MB or smaller.");
  }

  function prepareImport(parsed,mapping,groupNames=[],dateFormat="DMY",priorityChoices){
    const errors=[];
    const existingGroups=new Map(groupNames.map(name=>[name.trim().toLowerCase(),name]));
    const groupsToCreate=new Map();
    const tasks=parsed.rows.map((row,index)=>{
      const rowNumber=index+2;
      const read=key=>mapping[key]==null ? "" : String(row[mapping[key]]??"").trim();
      const title=read("title");
      const startDate=normalizeDate(read("startDate"),dateFormat);
      const dueDate=normalizeDate(read("dueDate"),dateFormat);
      const customDates={};
      Object.keys(mapping).filter(key=>key.startsWith("customDate:")).forEach(key=>{
        const raw=read(key);
        const value=normalizeDate(raw,dateFormat);
        if (raw&&value===null) errors.push(`Row ${rowNumber}: ${key.replace("customDate:","custom date ")} doesn't match the selected format.`);
        customDates[key]=value||"";
      });
      const priority=normalizePriority(read("priority"),priorityChoices);
      const rawStatus=read("status");
      const status=rawStatus ? existingGroups.get(rawStatus.toLowerCase())||rawStatus : "";
      const tags=read("tags").split(/[;,]/).map(tag=>tag.trim()).filter(Boolean);

      if (!title) errors.push(`Row ${rowNumber}: task title is required.`);
      if (read("startDate") && startDate===null) errors.push(`Row ${rowNumber}: start date doesn't match the selected format.`);
      if (read("dueDate") && dueDate===null) errors.push(`Row ${rowNumber}: date doesn't match the selected format.`);
      if (startDate && dueDate && startDate>dueDate) errors.push(`Row ${rowNumber}: start date must be on or before the due date.`);
      if (read("priority") && priority===null){
        const available=Array.isArray(priorityChoices)
          ?priorityChoices.map(choice=>choice.label).join(", ")||"none"
          :"High, Medium, or Low";
        errors.push(`Row ${rowNumber}: priority must be an available priority level (${available}).`);
      }
      if (rawStatus && !existingGroups.has(rawStatus.toLowerCase())) groupsToCreate.set(rawStatus.toLowerCase(),rawStatus);

      return {
        title,
        description:read("description"),
        startDate:startDate||"",
        dueDate:dueDate||"",
        customDates,
        priority:priority||"",
        status,
        tags
      };
    });

    return {tasks,errors,groupsToCreate:[...groupsToCreate.values()]};
  }

  global.BeforeworkCsvImport=Object.freeze({parseCsv,normalizeDate,normalizePriority,validateFile,prepareImport});
})(window);
