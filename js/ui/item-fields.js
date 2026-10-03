"use strict";

window.BeforeworkItemFields=(()=>{
  function create(dependencies){
    const {
      escapeHtml,
      tagPillHtml,
      projectItemEntries,
      fieldTypes,
      priorityOptions,
      renderPartial
    }=dependencies||{};
    if ([escapeHtml,tagPillHtml,projectItemEntries,renderPartial].some(value=>typeof value!=="function")
      ||!fieldTypes||typeof fieldTypes.getInputChoices!=="function"){
      throw new TypeError("Item field rendering requires its UI dependencies.");
    }
    if (!Array.isArray(priorityOptions)) throw new TypeError("Item field rendering requires priority options.");

    function labelHtml(field){
      return renderPartial("fieldLabel",{
        fieldId:escapeHtml(field.id),
        label:escapeHtml(field.label)
      });
    }

    function render(field,item,project){
      const values=item.values||{};
      const value=field.type==="location" ? values[field.id]??item.location??"" : values[field.id]??"";
      const label=labelHtml(field);
      const fieldId=escapeHtml(field.id);

      if (field.type==="schedule") return "";
      if (field.type==="tags"){
        const selectedTagIds=new Set(item.tagIds||[]);
        const selectedTags=(project.tags||[]).filter(tag=>selectedTagIds.has(tag.id));
        const chips=selectedTags.map(tag=>tagPillHtml(tag,true,false)).join("");
        const tags=fieldTypes.getInputChoices(field,{project,selected:selectedTagIds});
        const selector=renderPartial("tagSelector",{
          fieldId,
          ariaLabel:escapeHtml(field.label),
          options:tags.map(tag=>`<option value="${escapeHtml(tag.id)}" ${selectedTagIds.has(tag.id)?"selected":""}>${escapeHtml(tag.name)}</option>`).join("")
        });
        return renderPartial("tags",{
          labelHtml:label,
          chips,
          selector
        });
      }
      if (field.type==="priority"||field.type==="select"){
        const options=field.type==="priority"
          ? [{id:"",label:"None"},...priorityOptions]
          : [{id:"",label:"None"},...fieldTypes.getInputChoices(field,{project,selected:[value]})];
        return renderPartial("select",{
          labelHtml:label,
          fieldId,
          options:options.map(option=>`<option value="${escapeHtml(option.id)}" ${value===option.id?"selected":""}>${escapeHtml(option.label)}</option>`).join("")
        });
      }
      if (field.type==="multi-select"){
        const selected=new Set(Array.isArray(value)?value:[]);
        const options=fieldTypes.getInputChoices(field,{project,selected}).map(option=>
          `<option value="${escapeHtml(option.id)}" ${selected.has(option.id)?"selected":""}>${escapeHtml(option.label)}</option>`
        ).join("");
        return renderPartial(options?"multiSelect":"emptyOptions",{
          labelHtml:label,
          fieldId,
          ariaLabel:escapeHtml(field.label),
          placeholder:"Select options",
          emptyMessage:"Add options to this column first.",
          options
        });
      }
      if (field.type==="relation"){
        const selected=new Set(Array.isArray(value)?value:[]);
        const options=projectItemEntries(project).filter(({item:candidate})=>candidate.id!==item.id);
        const optionHtml=options.map(({item:target})=>
          `<option value="${escapeHtml(target.id)}" ${selected.has(target.id)?"selected":""}>${escapeHtml(target.title)}</option>`
        ).join("");
        return renderPartial(options.length?"relation":"emptyOptions",{
          labelHtml:label,
          fieldId,
          ariaLabel:escapeHtml(field.label),
          placeholder:"Select items",
          emptyMessage:"Add another item to this project to create a relation.",
          options:optionHtml
        });
      }
      if (["date","start-date","due-date"].includes(field.type)){
        return renderPartial("date",{
          labelHtml:label,
          fieldId,
          value:escapeHtml(value)
        });
      }
      if (field.type==="checkbox"){
        const checked=value===true||value==="true"||value==="1"||value==="yes"||value===1;
        return renderPartial("checkbox",{
          labelHtml:label,
          fieldId,
          checked:checked?"checked":"",
          valueLabel:checked?"Yes":"No"
        });
      }

      const inputTypes={url:"url",email:"email",number:"number"};
      const inputType=inputTypes[field.type]||"text";
      const placeholders={url:"https://example.com",email:"name@example.com"};
      return renderPartial("text",{
        labelHtml:label,
        fieldId,
        inputType,
        value:escapeHtml(value),
        step:inputType==="number"?"step=\"any\"":"",
        placeholder:placeholders[inputType]||""
      });
    }

    function renderLocation(field,item){
      return renderPartial("location",{
        labelHtml:labelHtml(field),
        fieldId:escapeHtml(field.id),
        value:escapeHtml(item.values[field.id]??item.location??"")
      });
    }

    function renderSchedule(field,content){
      return renderPartial("schedule",{
        labelHtml:labelHtml(field),
        content
      });
    }

    return {render,renderLocation,renderSchedule};
  }

  return {create};
})();
