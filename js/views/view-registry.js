(function(global){
  "use strict";

  const definitions=Object.freeze([
    Object.freeze({type:"list",label:"List",icon:"mdi:view-list-outline",description:"Organize project tasks in a clear list.",category:"Popular"}),
    Object.freeze({type:"table",label:"Table",icon:"mdi:table",description:"Review and edit project fields in a table.",category:"Popular"}),
    Object.freeze({type:"kanban",label:"Board",icon:"mdi:view-column-outline",description:"Track work across status columns.",category:"Popular"}),
    Object.freeze({type:"calendar",label:"Calendar",icon:"mdi:calendar-month-outline",description:"Plan work around dates and deadlines.",category:"Popular"}),
    Object.freeze({type:"milestones",label:"Milestones",icon:"mdi:flag-checkered",description:"Track key project checkpoints.",category:"Other"}),
    Object.freeze({type:"roadmap",label:"Roadmap",icon:"mdi:chart-gantt",description:"See project work and milestones over time.",category:"Other"}),
    Object.freeze({type:"documents",label:"Documents",icon:"mdi:file-document-multiple-outline",description:"Keep project notes and reference documents.",category:"Other"})
  ]);
  const definitionsByType=new Map(definitions.map(definition=>[definition.type,definition]));

  global.BeforeworkViewRegistry=Object.freeze({
    list:()=>definitions,
    get:type=>definitionsByType.get(type)||null,
    label:type=>definitionsByType.get(type)?.label||type
  });
})(window);
