(function(global){
  "use strict";
  const isChecked=value=>value===true||value===1||["true","1","yes"].includes(String(value).toLowerCase());
  global.BeforeworkFieldTypes.register({
    value:"checkbox",label:"Checkbox",description:"Yes/no or done/not done flag.",
    filter:{
      kind:"checkbox",
      getOptions:()=>[{value:"true",label:"Yes"},{value:"__none__",label:"No"}],
      getValues:({value,noneValue="__none__"})=>[isChecked(value)?"true":noneValue],
      matches:({value,mode,noneValue="__none__"})=>{
        const normalized=isChecked(value)?"true":noneValue;
        return Array.isArray(mode)?(!mode.length||mode.includes("__all__")||mode.includes(normalized)):mode==="__all__"||mode===normalized;
      }
    },
    normalizeInput:({input})=>input.checked?"true":"",
    sortValue:({value})=>isChecked(value)?1:0,
    formatValue:({value})=>isChecked(value)?"Yes":"No"
  });
})(window);
