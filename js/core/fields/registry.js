(function(global){
  "use strict";

  const definitions=new Map();

  function register(definition){
    if (!definition||typeof definition.value!=="string"||!definition.value){
      throw new TypeError("A field type definition must have a value.");
    }
    if (definitions.has(definition.value)){
      throw new Error(`Field type "${definition.value}" is already registered.`);
    }
    definitions.set(definition.value,Object.freeze({...definition}));
  }

  function get(type){
    return definitions.get(type)||null;
  }

  function getFilter(field){
    return behaviorFor(field?.type)?.filter||null;
  }

  function behaviorFor(type){
    const definition=get(type);
    return definition?.storageType?get(definition.storageType)||definition:definition;
  }

  function list(){
    return [...definitions.values()];
  }

  function getFilterValues(field,context){
    const behavior=behaviorFor(field?.type);
    if (behavior?.filter?.getValues) return behavior.filter.getValues({...context,field});
    const value=context.value;
    if (Array.isArray(value)) return value.length?value.map(String):[context.noneValue||"__none__"];
    return value==null||value===""?[context.noneValue||"__none__"]:[String(value)];
  }

  function getFilterOptions(field,context){
    const behavior=behaviorFor(field?.type);
    return behavior?.filter?.getOptions
      ?behavior.filter.getOptions({...context,field}):[];
  }

  function matchesFilter(field,context){
    const behavior=behaviorFor(field?.type);
    return behavior?.filter?.matches
      ? behavior.filter.matches({...context,field})
      : true;
  }

  function matchesQuery(field,context){
    const behavior=behaviorFor(field?.type);
    return behavior?.filter?.matchesQuery
      ? behavior.filter.matchesQuery({...context,field})
      : String(context.value??"").toLowerCase().includes(String(context.query??"").toLowerCase());
  }

  function normalizeInput(field,context){
    const behavior=behaviorFor(field?.type);
    return behavior?.normalizeInput
      ? behavior.normalizeInput({...context,field})
      : context.value;
  }

  function sortValue(field,context){
    const behavior=behaviorFor(field?.type);
    return behavior?.sortValue
      ? behavior.sortValue({...context,field})
      : String(context.value??"").toLowerCase();
  }

  function formatValue(field,context){
    const behavior=behaviorFor(field?.type);
    return behavior?.formatValue
      ? behavior.formatValue({...context,field})
      : String(context.value??"");
  }

  global.BeforeworkFieldTypes=Object.freeze({
    register,get,list,getFilter,getFilterValues,getFilterOptions,matchesFilter,matchesQuery,
    normalizeInput,sortValue,formatValue
  });
})(window);
