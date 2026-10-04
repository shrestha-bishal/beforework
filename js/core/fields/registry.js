(function(global){
  "use strict";

  const definitions=new Map();

  function register(definition){
    if (!definition||typeof definition.value!=="string"||!definition.value){
      throw new TypeError("A field type definition must have a value.");
    }
    if (definitions.has(definition.value)){
      throw new Error(`Field type "${definition.value}" is already registered.`);
    }
    if (definition.choiceEditor&&[
      "getChoices","getLabel","getEditorCopy","createChoice","getDeleteConfirmation","applyChanges"
    ].some(method=>typeof definition.choiceEditor[method]!=="function")){
      throw new TypeError(`Field type "${definition.value}" has an incomplete choice editor.`);
    }
    definitions.set(definition.value,Object.freeze({...definition}));
  }

  function get(type){
    return definitions.get(type)||null;
  }

  function getFilter(field){
    return behaviorFor(field?.type)?.filter||null;
  }

  function getChoiceEditor(field){
    return behaviorFor(field?.type)?.choiceEditor||null;
  }

  function getFieldChoices(field,context){
    return getChoiceEditor(field)?.getChoices({...context,field})||[];
  }

  function getInputChoices(field,context={}){
    const choices=getFieldChoices(field,context);
    const selected=new Set(context.selected||[]);
    return choices.filter(choice=>!choice.hiddenInField||selected.has(choice.id));
  }

  function getEditableChoices(field,context){
    const editor=getChoiceEditor(field);
    if (!editor) return null;
    return editor.getChoices({...context,field}).map(choice=>({
      id:choice.id,
      label:editor.getLabel(choice),
      hiddenInField:choice.hiddenInField===true
    }));
  }

  function getChoiceEditorCopy(field,context={}){
    const editor=getChoiceEditor(field);
    if (!editor) return null;
    const copy=editor.getEditorCopy({...context,field});
    if (!copy||["itemLabel","heading","description","addLabel","inputPlaceholder"].some(key=>
      typeof copy[key]!=="string"||!copy[key].trim()
    )){
      throw new TypeError(`Field type "${field.type}" returned incomplete choice editor copy.`);
    }
    return copy;
  }

  function applyChoiceEdits(field,context,changes){
    const editor=getChoiceEditor(field);
    if (!editor) throw new Error(`Field type "${field?.type}" does not support choice editing.`);
    return editor.applyChanges({...context,field,changes});
  }

  function createChoice(field,context,label){
    const editor=getChoiceEditor(field);
    if (!editor?.createChoice) throw new Error(`Field type "${field?.type}" does not define choice creation.`);
    if (typeof context?.uid!=="function") throw new TypeError("Choice creation requires an ID generator.");
    const choice=editor.createChoice({...context,field,label});
    if (!choice||typeof choice.id!=="string"||!choice.id) throw new TypeError(`Field type "${field.type}" returned a choice without an ID.`);
    return {
      id:choice.id,
      label:editor.getLabel(choice),
      hiddenInField:choice.hiddenInField===true,
      added:true,
      choice
    };
  }

  function getChoiceDeleteConfirmation(field,context){
    const editor=getChoiceEditor(field);
    if (!editor?.getDeleteConfirmation) throw new Error(`Field type "${field?.type}" does not define choice deletion.`);
    return editor.getDeleteConfirmation({...context,field});
  }

  function behaviorFor(type){
    const definition=get(type);
    return definition?.storageType?get(definition.storageType)||definition:definition;
  }

  function list(){
    return [...definitions.values()];
  }

  function isFieldType(field,type){
    const definition=get(type);
    if (!definition) return false;
    if (field?.type===type||field?.fieldType===type||field?.offeringType===type) return true;
    return type==="group"&&field?.type===definition.storageType
      &&String(field.label||"").trim().toLowerCase()==="group";
  }

  function canAddToProject(type,fields=[]){
    const definition=get(type);
    if (!definition) return false;
    if (definition.maxPerProject==null) return true;
    const count=fields.filter(field=>isFieldType(field,type)).length;
    return count<definition.maxPerProject;
  }

  function getFilterValues(field,context){
    const behavior=behaviorFor(field?.type);
    if (behavior?.filter?.getValues) return behavior.filter.getValues({...context,field});
    const value=context.value;
    if (Array.isArray(value)) return value.length?value.map(String):[context.noneValue||"__none__"];
    return value==null||value===""?[context.noneValue||"__none__"]:[String(value)];
  }

  function getFilterOptions(field,context){
    const behavior=behaviorFor(field?.type);
    return behavior?.filter?.getOptions
      ?behavior.filter.getOptions({...context,field}):[];
  }

  function matchesFilter(field,context){
    const behavior=behaviorFor(field?.type);
    return behavior?.filter?.matches
      ? behavior.filter.matches({...context,field})
      : true;
  }

  function matchesQuery(field,context){
    const behavior=behaviorFor(field?.type);
    return behavior?.filter?.matchesQuery
      ? behavior.filter.matchesQuery({...context,field})
      : String(context.value??"").toLowerCase().includes(String(context.query??"").toLowerCase());
  }

  function normalizeInput(field,context){
    const behavior=behaviorFor(field?.type);
    return behavior?.normalizeInput
      ? behavior.normalizeInput({...context,field})
      : context.value;
  }

  function sortValue(field,context){
    const behavior=behaviorFor(field?.type);
    return behavior?.sortValue
      ? behavior.sortValue({...context,field})
      : String(context.value??"").toLowerCase();
  }

  function formatValue(field,context){
    const behavior=behaviorFor(field?.type);
    return behavior?.formatValue
      ? behavior.formatValue({...context,field})
      : String(context.value??"");
  }

  global.BeforeworkFieldTypes=Object.freeze({
    register,get,list,isFieldType,canAddToProject,getFilter,getChoiceEditor,getFieldChoices,getInputChoices,getEditableChoices,getChoiceEditorCopy,createChoice,
    applyChoiceEdits,getChoiceDeleteConfirmation,
    getFilterValues,getFilterOptions,matchesFilter,matchesQuery,
    normalizeInput,sortValue,formatValue
  });
})(window);
