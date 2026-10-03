(function(global){
  "use strict";

  function create({
    uid,fieldTypes,selectColors,projectItemEntries,queueGoogleEventDeletes,
    getBoardFilterFields,getBoardFilterColumns,getListSort,setListSort,
    showDialog,showNotice,showConfirm,scheduleSave,renderAll,refreshOpenItemModal,closeAllActionMenus
  }){
    const fieldTypeOptions=fieldTypes.list();

    function fieldTypeLabel(type){
      return fieldTypes.get(type)?.label||"Text";
    }

    async function addField(project,label,type){
      if (type==="date"&&/^(start|start date|starts on|due|due date|deadline)$/.test(label.trim().toLowerCase())){
        await showNotice("Choose a date-specific field type",`Use Start date or Due date for "${label}". Choose Date for a different kind of date.`);
        return;
      }
      if (!fieldTypes.canAddToProject(type,project.fields)){
        await showNotice(`${fieldTypeLabel(type)} field already exists`,`Each project can have only one ${fieldTypeLabel(type)} field.`);
        return;
      }
      const definition=fieldTypes.get(type);
      if (!definition) throw new Error(`Unknown field type: ${type}`);
      const storageType=definition.storageType||type;
      const field={
        id:uid(),label,type:storageType,options:[],
        ...(storageType!==type?{offeringType:type}:{})
      };
      if (storageType==="select"||storageType==="multi-select"){
        const opts=await showDialog({
          title:"Field options",
          message:`Add options for "${label}" separated by commas.`,
          fields:[{label:"Options",placeholder:"Backlog, In progress, Blocked"}],
          confirmLabel:"Create field"
        });
        if (opts===null) return;
        field.options=(opts||"").split(",").map(value=>value.trim()).filter(Boolean)
          .map((optionLabel,index)=>({id:uid(),label:optionLabel,color:selectColors[index%selectColors.length]}));
      }
      project.fields.push(field);
      scheduleSave();
      renderAll();
    }

    function deleteField(project,fieldId){
      const field=project.fields.find(candidate=>candidate.id===fieldId);
      project.fields=project.fields.filter(candidate=>candidate.id!==fieldId);
      projectItemEntries(project).forEach(({item})=>{
        delete item.values[fieldId];
        if (field?.type==="location") item.location="";
        if (field?.type==="schedule"){
          queueGoogleEventDeletes(item);
          item.startTime="";
          item.endTime="";
          item.endDate="";
          item.recurrence=null;
          item.reminderAt=null;
        }
      });
      project.views?.forEach(view=>{ if (view.groupByFieldId===fieldId) delete view.groupByFieldId; });
      getBoardFilterFields().delete(fieldId);
      if (field?.type==="tags") getBoardFilterColumns().delete("tags");
      if (getListSort().field===fieldId) setListSort({field:"updated",dir:"desc"});
      scheduleSave();
      renderAll();
      refreshOpenItemModal();
    }

    async function addFieldFlow(project){
      const availableFieldTypes=fieldTypeOptions.filter(option=>
        fieldTypes.canAddToProject(option.value,project.fields));
      const details=await showDialog({
        title:"Add field",
        fields:[
          {label:"Field type",type:"select",options:availableFieldTypes.map(({value,label,description})=>({value,label,description})),value:"select"},
          {label:"Field name",placeholder:"e.g. Status, Type, Effort"}
        ],
        confirmLabel:"Add field"
      });
      if (!details) return;
      const [type,label]=details;
      const fieldName=label?.trim()||(type==="group"?"Group":({
        tags:"Tags",
        location:"Location",
        schedule:"Schedule",
        "start-date":"Start date",
        "due-date":"Due date"
      }[type]||""));
      if (!fieldName) return;
      await addField(project,fieldName,type);
    }

    async function editField(event,field,project){
      event?.stopPropagation();
      closeAllActionMenus();
      const label=await showDialog({
        title:"Edit field",
        fields:[{label:"Field name",value:field.label}],
        confirmLabel:"Save",
        actionMenu:{
          items:[{
            label:"Delete",
            danger:true,
            onSelect:event=>deleteFieldFromMenu(event,field,project)
          }]
        }
      });
      if (!label||!label.trim()) return;
      field.label=label.trim();
      scheduleSave();
      renderAll();
    }

    async function deleteFieldFromMenu(event,field,project){
      event.stopPropagation();
      closeAllActionMenus();
      const message=field.type==="tags"
        ? "Tags and their assignments will stay saved but hidden. Add the Tags field again to restore them."
        : "This removes its values from every item in this project.";
      if (await showConfirm(`Delete field ${field.label}`,message,true)) deleteField(project,field.id);
    }

    function wireCustomColumnHeader(header,field,project){
      const menu=header.querySelector(".fieldColumnMenu");
      menu.querySelector('[data-column-action="edit"]').onclick=event=>editField(event,field,project);
      menu.querySelector('[data-column-action="delete"]').onclick=event=>deleteFieldFromMenu(event,field,project);
    }

    return Object.freeze({addField,addFieldFlow,deleteField,deleteFieldFromMenu,editField,wireCustomColumnHeader});
  }

  global.BeforeworkFieldFeature=Object.freeze({create});
})(window);
