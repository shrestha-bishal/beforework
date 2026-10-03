(function(global){
  "use strict";

  const colors=[
    "#0969da","#8250df","#bf3989","#1a7f37","#cf222e",
    "#9a6700","#116329","#6e7781","#0f766e","#bc4c00","#cf4a2c"
  ];
  const colorOptions=[
    {label:"Blue",value:colors[0]},{label:"Purple",value:colors[1]},
    {label:"Pink",value:colors[2]},{label:"Green",value:colors[3]},
    {label:"Red",value:colors[4]},{label:"Amber",value:colors[5]},
    {label:"Forest",value:colors[6]},{label:"Grey",value:colors[7]},
    {label:"Teal",value:"#0f766e"},{label:"Orange",value:"#bc4c00"},
    {label:"Coral",value:"#cf4a2c"}
  ];
  const none="__none__";

  global.BeforeworkFieldTypes.register({
    value:"tags",label:"Tags",description:"Add colored tags, filters, and bulk tagging to this project.",
    maxPerProject:1,
    colors,colorOptions,
    choiceEditor:{
      getChoices:({project})=>project.tags||[],
      getLabel:tag=>tag.name,
      getDeleteConfirmation:({choices})=>({
        title:`Delete ${choices.length===1?"tag":"tags"}: ${choices.map(choice=>choice.label).join(", ")}`,
        message:`This deletes ${choices.length===1?"this tag":"these tags"} and removes ${choices.length===1?"it":"them"} from all item assignments.`
      }),
      applyChanges:({project,changes,projectItemEntries,getBoardFilterTags,getBoardFilterColumns})=>{
        const tags=new Map((project.tags||[]).map(tag=>[tag.id,tag]));
        changes.forEach(change=>{
          const tag=tags.get(change.id);
          if (!tag) return;
          if (change.deleted){
            project.tags=project.tags.filter(candidate=>candidate.id!==tag.id);
            projectItemEntries(project).forEach(({item})=>{
              item.tagIds=(item.tagIds||[]).filter(id=>id!==tag.id);
            });
            getBoardFilterTags().delete(tag.id);
            return;
          }
          tag.name=change.label.trim();
          if (change.hiddenInField) tag.hiddenInField=true;
          else delete tag.hiddenInField;
        });
        const columnFilters=getBoardFilterColumns();
        const columnFilter=columnFilters.get("tags");
        if (columnFilter&&typeof columnFilter.delete==="function"){
          changes.filter(change=>change.deleted).forEach(change=>columnFilter.delete(change.id));
          if (!columnFilter.size) columnFilters.delete("tags");
        }
      }
    },
    filter:{
      kind:"tags",
      getOptions:({project})=>(project.tags||[])
        .map(tag=>({value:String(tag.id),label:tag.name,color:tag.color})),
      getValues:({item,noneValue=none})=>(item.tagIds||[]).length?item.tagIds.map(String):[noneValue],
      matches:({item,mode,selected,noneValue=none})=>{
        const assigned=item.tagIds||[];
        const selectedValues=selected instanceof Set?[...selected]:Array.isArray(mode)?mode:[mode];
        return selectedValues.includes(noneValue)?assigned.length===0:selectedValues.every(id=>assigned.includes(id));
      },
      matchesQuery:({item,project,query})=>{
        const names=(item.tagIds||[]).map(id=>(project.tags||[]).find(tag=>tag.id===id)?.name||"");
        return names.join(" ").toLowerCase().includes(String(query??"").toLowerCase());
      }
    },
    formatValue:({item,project})=>(item.tagIds||[])
      .map(id=>(project.tags||[]).find(tag=>tag.id===id)?.name||"").filter(Boolean).join("; ")
  });
})(window);
