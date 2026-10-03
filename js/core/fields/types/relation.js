(function(global){
  "use strict";
  const none="__none__";
  global.BeforeworkFieldTypes.register({
    value:"relation",label:"Relations",description:"Link this item to other items in the same project.",
    filter:{
      kind:"options",
      getOptions:({items=[]})=>items.map(({item})=>({value:String(item.id),label:item.title})),
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
    formatValue:({value,relatedItemTitles})=>relatedItemTitles(value).join("; ")
  });
})(window);
