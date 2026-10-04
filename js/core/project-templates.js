(function(global){
  "use strict";

  const defaultStatusOptions=["To do","In progress","Review"];
  const templates={
    simple:{
      label:"Simple list",
      views:["list"],
      fields:[],
      groups:[]
    },
    table:{
      label:"Table (spreadsheet-style)",
      views:["table"],
      fields:["status","priority","due","tags"],
      groups:[],
      statusOptions:["Backlog","To do","In progress","Review","Blocked"],
      tags:["Urgent","Follow-up","Quick win"],
      columnOrders:{
        table:["title","field:status","field:priority","field:due","tags"]
      }
    },
    taskboard:{
      label:"Project / task management",
      views:["list","kanban","calendar","roadmap"],
      fields:["priority","due","status","tags"],
      groups:[],
      boardGroupBy:"Status",
      statusOptions:["Backlog","To do","In progress","Review","Blocked"],
      tags:["Urgent","Follow-up","Quick win"],
      columnOrders:{
        list:["title","field:status","field:priority","field:due","tags","progress","updated"],
        table:["title","field:status","field:priority","field:due","tags"]
      }
    },
    calendarTpl:{
      label:"Calendar / events",
      views:["calendar","list"],
      fields:["start","due","location","schedule"],
      groups:[],
      itemDefaultType:"event",
      columnOrders:{
        list:["title","field:start","field:due","field:location","field:schedule","updated"]
      }
    },
    blank:{
      label:"Blank",
      views:["list"],
      fields:[],
      groups:[]
    }
  };

  function create({uid,tagColors,selectColors}={}){
    if (typeof uid!=="function") throw new TypeError("Project templates require an ID generator.");
    if (!Array.isArray(tagColors)||!tagColors.length) throw new TypeError("Project templates require tag colors.");
    if (!Array.isArray(selectColors)||!selectColors.length) throw new TypeError("Project templates require select colors.");

    function get(key){
      return templates[key]||templates.blank;
    }

    function buildFields(key){
      const template=get(key);
      return template.fields.map(type=>{
        if (type==="priority") return {id:uid(),label:"Priority",type:"priority",options:[]};
        if (type==="start") return {id:uid(),label:"Start date",type:"start-date",options:[]};
        if (type==="due") return {id:uid(),label:"Due date",type:"due-date",options:[]};
        if (type==="status") return {
          id:uid(),label:"Status",type:"select",
          options:(template.statusOptions||defaultStatusOptions).map((label,index)=>({
            id:uid(),label,color:selectColors[index%selectColors.length]
          }))
        };
        if (type==="tags") return {id:uid(),label:"Tags",type:"tags",options:[]};
        if (type==="location") return {id:uid(),label:"Location",type:"location",options:[]};
        if (type==="schedule") return {id:uid(),label:"Schedule",type:"schedule",options:[]};
        throw new Error(`Unknown project template field "${type}".`);
      });
    }

    function buildTags(key){
      return (get(key).tags||[]).map((name,index)=>({
        id:uid(),name,color:tagColors[index%tagColors.length]
      }));
    }

    function statusOptions(key){
      return [...(get(key).statusOptions||defaultStatusOptions)];
    }

    function entries(){
      return Object.entries(templates);
    }

    return Object.freeze({get,entries,buildFields,buildTags,statusOptions});
  }

  global.BeforeworkProjectTemplates=Object.freeze({create});
})(window);
