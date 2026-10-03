(function(global){
  "use strict";
  const colors=[
    "var(--color-accent-fg)","var(--color-severe-fg)","var(--color-sponsors-fg)","var(--color-open-fg)",
    "var(--color-danger-fg)","var(--color-attention-fg)","var(--color-success-fg)","var(--color-fg-muted)"
  ];
  const none="__none__";
  global.BeforeworkFieldTypes.register({
    value:"select",label:"Single select",description:"Pick one answer from a fixed list.",
    colors,
    filter:{
      kind:"options",
      getOptions:({field})=>(field.options||[]).map(option=>({value:String(option.id),label:option.label})),
      getValues:({value,noneValue=none})=>value==null||value===""?[noneValue]:[String(value)],
      matches:({value,mode,noneValue=none})=>{
        if (mode==="__all__") return true;
        if (Array.isArray(mode)) return !mode.length||mode.includes("__all__")||mode.includes(value==null||value===""?noneValue:String(value));
        return mode===noneValue?value==null||value==="":String(value??"")===mode;
      }
    },
    formatValue:({field,value})=>(field.options||[]).find(option=>option.id===value)?.label||String(value??"")
  });
})(window);
