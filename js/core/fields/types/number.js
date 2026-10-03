(function(global){
  "use strict";
  global.BeforeworkFieldTypes.register({
    value:"number",label:"Number",description:"Store a count, estimate, or other numeric value.",
    filter:{
      kind:"number",
      getValues:({value,noneValue="__none__"})=>value==null||value===""?[noneValue]:[String(value)],
      matches:({value,mode,noneValue="__none__"})=>{
        const selected=Array.isArray(mode)?mode:[mode];
        if (!selected.length||selected.includes("__all__")) return true;
        if (value==null||value==="") return selected.includes(noneValue);
        return selected.some(selectedValue=>selectedValue!==noneValue&&Number.isFinite(Number(value))&&Number(value)===Number(selectedValue));
      }
    },
    normalizeInput:({input})=>input.value===""?"":Number(input.value),
    sortValue:({value})=>{
      if (value===""||value==null) return Number.POSITIVE_INFINITY;
      const number=Number(value);
      return Number.isFinite(number)?number:Number.POSITIVE_INFINITY;
    },
    formatValue:({value})=>value==null?"":String(value)
  });
})(window);
