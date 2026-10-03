(function(global){
  "use strict";
  const includes=(value,query)=>String(value??"").toLowerCase().includes(String(query??"").toLowerCase());
  global.BeforeworkFieldTypes.register({
    value:"location",label:"Location",description:"Add an optional location or link to each item.",
    filter:{
      kind:"text",
      matches:({value,mode})=>{
        if (Array.isArray(mode)){
          if (!mode.length||mode.includes("__all__")) return true;
          return value==null||value===""?mode.includes("__none__"):mode.some(selected=>selected!=="__none__"&&String(value)===String(selected));
        }
        return mode==="__all__"||(mode==="__none__"?!value:includes(value,mode));
      },
      matchesQuery:({value,query})=>includes(value,query)
    },
    normalizeInput:({value})=>value,
    formatValue:({value,item,field})=>String(value??item?.location??field?.value??"")
  });
})(window);
