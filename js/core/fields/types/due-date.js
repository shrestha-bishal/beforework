(function(global){
  "use strict";
  global.BeforeworkFieldTypes.register({
    value:"due-date",label:"Due date",description:"When this task should be completed.",
    allowRename:false,
    isEditable:false,
    maxPerProject:1,
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
