(function(global){
  "use strict";
  const includes=(value,query)=>String(value??"").toLowerCase().includes(String(query??"").toLowerCase());
  global.BeforeworkFieldTypes.register({
    value:"text",label:"Text",description:"Freeform notes or details.",
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
    formatValue:({value})=>String(value??"")
  });
})(window);
