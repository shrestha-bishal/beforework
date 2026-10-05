(function(global){
  "use strict";

  function createCsvExport({
    getRows,
    formatFieldValue,
    formatScheduleValue,
    formatUpdatedAt,
    orderedTableColumns,
    documentRef=global.document,
    BlobConstructor=global.Blob,
    urlApi=global.URL,
    setTimeoutRef=global.setTimeout
  }={}){
    const callbacks={getRows,formatFieldValue,formatScheduleValue,formatUpdatedAt,orderedTableColumns};
    if (Object.values(callbacks).some(callback=>typeof callback!=="function")){
      throw new TypeError("A CSV export requires row, formatting, and column-order callbacks.");
    }
    if (!documentRef || typeof documentRef.createElement!=="function"
      || typeof BlobConstructor!=="function"
      || !urlApi || typeof urlApi.createObjectURL!=="function" || typeof urlApi.revokeObjectURL!=="function"
      || typeof setTimeoutRef!=="function"){
      throw new TypeError("A CSV export requires browser download APIs.");
    }

    function serializeRows(rows){
      return rows.map(row=>row.map(value=>{
        let text=String(value??"");
        const leading=text.trimStart();
        const isNumber=/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(leading);
        if (/^[=+@\-\t\r]/.test(leading) && !isNumber) text="'"+text;
        return `"${text.replace(/"/g,'""')}"`;
      }).join(",")).join("\r\n");
    }

    function buildProjectCsv(project,viewType,showProgressColumn,rows){
      const showGroupColumn=(project.groups||[]).length+((project.items||[]).length?1:0)>1;
      const columns=[
        {id:"title",label:"Title",value:row=>row.item.title},
        ...(showGroupColumn?[{id:"group",label:"Group",value:row=>row.group.name}]:[]),
        ...project.fields.filter(field=>field.type!=="tags").map(field=>({id:`field:${field.id}`,label:field.label,value:row=>field.type==="schedule"
          ? formatScheduleValue(project,row.item)
          : formatFieldValue(field,row.item.values[field.id],project)})),
        ...(project.fields.some(field=>field.type==="tags")?[{id:"tags",label:project.fields.find(field=>field.type==="tags").label,value:row=>
          formatFieldValue(project.fields.find(field=>field.type==="tags"),undefined,project,row.item)}]:[]),
        ...(viewType==="list"&&showProgressColumn?[{id:"progress",label:"Progress",value:row=>row.item.subitems.length?`${row.item.subitems.filter(subitem=>subitem.done).length}/${row.item.subitems.length}`:""}]:[]),
        ...(viewType==="list"?[{id:"updated",label:"Updated",value:row=>formatUpdatedAt(row.item.updatedAt)}]:[])
      ];
      const byId=new Map(columns.map(column=>[column.id,column]));
      const ordered=orderedTableColumns(project,viewType,columns.map(column=>column.id)).map(id=>byId.get(id)).filter(Boolean);
      return serializeRows([ordered.map(column=>column.label),...rows.map(row=>ordered.map(column=>column.value(row)))]);
    }

    function exportProjectCsv(project,viewType,showProgressColumn=false){
      const rows=getRows(project);
      const csv=buildProjectCsv(project,viewType,showProgressColumn,rows);
      const blob=new BlobConstructor(["\uFEFF",csv],{type:"text/csv;charset=utf-8"});
      const url=urlApi.createObjectURL(blob);
      const link=documentRef.createElement("a");
      const safeName=project.name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g,"-")||"beforework";
      link.href=url;
      link.download=`${safeName}.csv`;
      link.click();
      setTimeoutRef(()=>urlApi.revokeObjectURL(url),1000);
    }

    return Object.freeze({buildProjectCsv,exportProjectCsv,serializeRows});
  }

  global.BeforeworkCsvExport=Object.freeze({create:createCsvExport});
})(window);
