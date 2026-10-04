(function(global){
  "use strict";
  const colors=[
    "var(--color-accent-fg)","var(--color-severe-fg)","var(--color-sponsors-fg)","var(--color-open-fg)",
    "var(--color-danger-fg)","var(--color-attention-fg)","var(--color-success-fg)","var(--color-fg-muted)"
  ];
  const none="__none__";
  global.BeforeworkFieldTypes.register({
    value:"multi-select",label:"Multi-select",description:"Choose more than one option.",
    colors,
    choiceEditor:{
      getChoices:({field})=>field.options||[],
      getLabel:option=>option.label,
      createChoice:({uid,label,field,index=0})=>({
        id:uid(),label:label.trim(),color:colors[((field.options||[]).length+index)%colors.length]
      }),
      getDeleteConfirmation:({choices})=>({
        title:`Delete ${choices.length===1?"option":"options"}: ${choices.map(choice=>choice.label).join(", ")}`,
        message:`This removes ${choices.length===1?"this option":"these options"} from the field and clears ${choices.length===1?"it":"them"} from item values.`
      }),
      applyChanges:({field,project,changes,projectItemEntries,getBoardFilterFields,getBoardFilterColumns})=>{
        const removed=new Set(changes.filter(change=>change.deleted).map(change=>change.id));
        const updated=new Map(changes.map(change=>[change.id,change]));
        const added=changes.filter(change=>change.added&&!change.deleted).map(change=>{
          const option=change.choice;
          option.label=change.label.trim();
          if (change.hiddenInField) option.hiddenInField=true;
          return option;
        });
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
        field.options.push(...added);
        projectItemEntries(project).forEach(({item})=>{
          const value=item.values[field.id];
          if (Array.isArray(value)) item.values[field.id]=value.filter(id=>!removed.has(id));
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
      getValues:({value,noneValue=none})=>Array.isArray(value)&&value.length?value.map(String):[noneValue],
      matches:({value,mode,noneValue=none})=>{
        const values=Array.isArray(value)?value.map(String):[];
        const selected=Array.isArray(mode)?mode:[mode];
        const selectedValues=selected.filter(entry=>entry!==noneValue);
        if (!selected.length||selected.includes("__all__")) return true;
        return values.length?values.some(entry=>selectedValues.includes(entry)):selected.includes(noneValue);
      }
    },
    normalizeInput:({selectedOptions})=>selectedOptions.map(option=>option.value),
    sortValue:({field,value})=>(Array.isArray(value)?value:[])
      .map(id=>(field.options||[]).find(option=>option.id===id)?.label||"").join(", ").toLowerCase(),
    formatValue:({field,value})=>(Array.isArray(value)?value:[])
      .map(id=>(field.options||[]).find(option=>option.id===id)?.label||"").filter(Boolean).join("; ")
  });
})(window);
