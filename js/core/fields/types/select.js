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
    choiceEditor:{
      getChoices:({field})=>field.options||[],
      getLabel:option=>option.label,
      getDeleteConfirmation:({choices})=>({
        title:`Delete ${choices.length===1?"option":"options"}: ${choices.map(choice=>choice.label).join(", ")}`,
        message:`This removes ${choices.length===1?"this option":"these options"} from the field and clears ${choices.length===1?"it":"them"} from item values.`
      }),
      applyChanges:({field,project,changes,projectItemEntries,getBoardFilterFields,getBoardFilterColumns})=>{
        const removed=new Set(changes.filter(change=>change.deleted).map(change=>change.id));
        const updated=new Map(changes.map(change=>[change.id,change]));
        field.options=(field.options||[]).filter(option=>{
          if (removed.has(option.id)) return false;
          const change=updated.get(option.id);
          if (change){
            option.label=change.label.trim();
            if (change.hiddenInField) option.hiddenInField=true;
            else delete option.hiddenInField;
          }
          return true;
        });
        projectItemEntries(project).forEach(({item})=>{
          if (removed.has(item.values[field.id])) delete item.values[field.id];
        });
        const fieldFilters=getBoardFilterFields();
        const filter=fieldFilters.get(field.id);
        if (Array.isArray(filter)){
          const remaining=filter.filter(id=>!removed.has(id));
          if (remaining.length) fieldFilters.set(field.id,remaining);
          else fieldFilters.delete(field.id);
        } else if (removed.has(filter)){
          fieldFilters.delete(field.id);
        }
        const columnFilters=getBoardFilterColumns();
        const columnFilter=columnFilters.get(field.id);
        if (columnFilter&&typeof columnFilter.delete==="function"){
          removed.forEach(id=>columnFilter.delete(id));
          if (!columnFilter.size) columnFilters.delete(field.id);
        }
      }
    },
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
