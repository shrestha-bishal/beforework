(function(global){
  "use strict";

  const options=[
    {id:"high",label:"High",color:"var(--color-danger-fg)",rank:3},
    {id:"medium",label:"Medium",color:"var(--color-attention-fg)",rank:2},
    {id:"low",label:"Low",color:"var(--color-fg-muted)",rank:1}
  ];
  const none="__none__";

  global.BeforeworkFieldTypes.register({
    value:"priority",label:"Priority",description:"Best for urgency or ranking.",
    options,
    filter:{
      kind:"options",
      getOptions:()=>options.map(option=>({value:option.id,label:option.label,color:option.color})),
      getValues:({value,noneValue=none})=>value==null||value===""?[noneValue]:[String(value)],
      matches:({value,mode,noneValue=none})=>{
        if (mode==="__all__") return true;
        if (Array.isArray(mode)) return !mode.length||mode.includes("__all__")||mode.includes(value==null||value===""?noneValue:String(value));
        return mode===noneValue?value==null||value==="":String(value??"")===mode;
      }
    },
    sortValue:({value})=>(options.find(option=>option.id===value)||{rank:0}).rank,
    formatValue:({value})=>options.find(option=>option.id===value)?.label||String(value??"")
  });
})(window);
