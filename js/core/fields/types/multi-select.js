(function(global){
  "use strict";
  const none="__none__";
  global.BeforeworkFieldTypes.register({
    value:"multi-select",label:"Multi-select",description:"Choose more than one option.",
    filter:{
      kind:"options",
      getOptions:({field})=>(field.options||[]).map(option=>({value:String(option.id),label:option.label})),
      getValues:({value,noneValue=none})=>Array.isArray(value)&&value.length?value.map(String):[noneValue],
      matches:({value,mode,noneValue=none})=>{
        const values=Array.isArray(value)?value.map(String):[];
        const selected=Array.isArray(mode)?mode:[mode];
        const selectedValues=selected.filter(entry=>entry!==noneValue);
        if (!selected.length||selected.includes("__all__")) return true;
        return values.length?values.some(entry=>selectedValues.includes(entry)):selected.includes(noneValue);
      }
    },
    normalizeInput:({selectedOptions})=>selectedOptions.map(option=>option.value),
    sortValue:({field,value})=>(Array.isArray(value)?value:[])
      .map(id=>(field.options||[]).find(option=>option.id===id)?.label||"").join(", ").toLowerCase(),
    formatValue:({field,value})=>(Array.isArray(value)?value:[])
      .map(id=>(field.options||[]).find(option=>option.id===id)?.label||"").filter(Boolean).join("; ")
  });
})(window);
