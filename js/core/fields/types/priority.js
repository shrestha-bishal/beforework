(function(global){
  "use strict";

  const options=[
    {id:"high",label:"High",color:"var(--color-danger-fg)",rank:3},
    {id:"medium",label:"Medium",color:"var(--color-attention-fg)",rank:2},
    {id:"low",label:"Low",color:"var(--color-fg-muted)",rank:1}
  ];
  const customColors=["var(--color-accent-fg)","var(--color-sponsors-fg)","var(--color-open-fg)"];
  const none="__none__";
  function choicesFor(field){
    return field?.priorityOptionsCustomized===true
      ?(field.options||[])
      :(field?.options?.length?field.options:options);
  }

  global.BeforeworkFieldTypes.register({
    value:"priority",label:"Priority",description:"Best for urgency or ranking.",
    maxPerProject:1,
    options,
    choiceEditor:{
      getChoices:({field})=>choicesFor(field),
      getLabel:option=>option.label,
      getEditorCopy:()=>({
        itemLabel:"priority",
        heading:"Priority levels",
        description:"Hidden levels stay assigned to existing items but aren't offered for new selections.",
        addLabel:"Add priority",
        inputPlaceholder:"Priority name"
      }),
      createChoice:({uid,label,field,index=0})=>{
        const existing=choicesFor(field);
        const lowestRank=existing.reduce((lowest,option)=>
          Number.isFinite(option.rank)?Math.min(lowest,option.rank):lowest,Infinity
        );
        const rank=Number.isFinite(lowestRank)?lowestRank-1:0;
        return {
          id:uid(),label:label.trim(),
          color:customColors[index%customColors.length],rank
        };
      },
      getDeleteConfirmation:({choices})=>({
        title:`Delete ${choices.length===1?"priority level":"priority levels"}: ${choices.map(choice=>choice.label).join(", ")}`,
        message:`This removes ${choices.length===1?"this priority level":"these priority levels"} and clears ${choices.length===1?"it":"them"} from item values.`
      }),
      applyChanges:({field,project,changes,projectItemEntries,getBoardFilterFields,getBoardFilterColumns})=>{
        const source=choicesFor(field).map(option=>({...option}));
        const removed=new Set(changes.filter(change=>change.deleted&&!change.added).map(change=>change.id));
        const updated=new Map(changes.filter(change=>!change.added).map(change=>[change.id,change]));
        const added=changes.filter(change=>change.added&&!change.deleted).map(change=>{
          const option=change.choice;
          option.label=change.label.trim();
          if (change.hiddenInField) option.hiddenInField=true;
          return option;
        });
        field.options=source.filter(option=>{
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
        const orderedOptions=new Map(field.options.map(option=>[option.id,option]));
        field.options=changes.filter(change=>!change.deleted)
          .map(change=>orderedOptions.get(change.id)).filter(Boolean);
        field.options.forEach((option,index)=>{ option.rank=field.options.length-index; });
        field.priorityOptionsCustomized=true;
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
      getOptions:({field})=>choicesFor(field).map(option=>({value:option.id,label:option.label,color:option.color})),
      getValues:({value,noneValue=none})=>value==null||value===""?[noneValue]:[String(value)],
      matches:({value,mode,noneValue=none})=>{
        if (mode==="__all__") return true;
        if (Array.isArray(mode)) return !mode.length||mode.includes("__all__")||mode.includes(value==null||value===""?noneValue:String(value));
        return mode===noneValue?value==null||value==="":String(value??"")===mode;
      }
    },
    sortValue:({field,value})=>(choicesFor(field).find(option=>option.id===value)||{rank:0}).rank,
    formatValue:({field,value})=>choicesFor(field).find(option=>option.id===value)?.label||String(value??"")
  });
})(window);
