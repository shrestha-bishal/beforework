(function(global){
  "use strict";

  const definitions=Object.freeze([
    Object.freeze({type:"list",label:"List"}),
    Object.freeze({type:"table",label:"Table"}),
    Object.freeze({type:"kanban",label:"Board"}),
    Object.freeze({type:"calendar",label:"Calendar"}),
    Object.freeze({type:"milestones",label:"Milestones"}),
    Object.freeze({type:"roadmap",label:"Roadmap"})
  ]);
  const definitionsByType=new Map(definitions.map(definition=>[definition.type,definition]));

  global.BeforeworkViewRegistry=Object.freeze({
    list:()=>definitions,
    get:type=>definitionsByType.get(type)||null,
    label:type=>definitionsByType.get(type)?.label||type
  });
})(window);
