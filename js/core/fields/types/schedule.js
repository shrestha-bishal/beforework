(function(global){
  "use strict";
  const schedule=({project,item,scheduleFieldValue})=>scheduleFieldValue(project,item);
  global.BeforeworkFieldTypes.register({
    value:"schedule",label:"Schedule",description:"Add dates, times, reminders, and recurrence controls to items.",
    filter:{
      kind:"text",
      getValues:({item,project,scheduleFieldValue,noneValue="__none__"})=>{
        const value=schedule({project,item,scheduleFieldValue});
        return value?[value]:[noneValue];
      },
      matches:({item,project,scheduleFieldValue,mode})=>{
        const value=schedule({project,item,scheduleFieldValue})||"";
        if (Array.isArray(mode)){
          if (!mode.length||mode.includes("__all__")) return true;
          return value?mode.some(selected=>selected!=="__none__"&&String(value)===String(selected)):mode.includes("__none__");
        }
        return mode==="__all__"||(mode==="__none__"?!value:String(value).toLowerCase().includes(String(mode??"").toLowerCase()));
      },
      matchesQuery:({item,project,scheduleFieldValue,query})=>
        String(schedule({project,item,scheduleFieldValue})||"").toLowerCase().includes(String(query??"").toLowerCase())
    },
    sortValue:({project,item,scheduleFieldValue})=>String(schedule({project,item,scheduleFieldValue})||"").toLowerCase(),
    formatValue:({item,project,scheduleFieldValue})=>schedule({project,item,scheduleFieldValue})||""
  });
})(window);
