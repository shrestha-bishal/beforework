(function(global){
  "use strict";
  global.BeforeworkFieldTypes.register({
    value:"start-date",label:"Start date",description:"When work on this task should begin.",
    filter:{
      kind:"date",
      getValues:({value,dateKey,noneValue="__none__"})=>[dateKey(value,noneValue)],
      matches:({value,mode,noneValue="__none__",dateKey})=>{
        if (Array.isArray(mode)){
          if (!mode.length||mode.includes("__all__")) return true;
          const key=dateKey?dateKey(value,noneValue):String(value??noneValue);
          return mode.includes(key);
        }
        return mode==="__all__"||(mode===noneValue?!value:String(value??"")===mode);
      }
    },
    sortValue:({value})=>value||"9999-99-99",
    formatValue:({value})=>String(value??"")
  });
})(window);
