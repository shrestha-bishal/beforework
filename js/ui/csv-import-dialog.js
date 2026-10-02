(function(global){
  "use strict";

  function createMappingRenderer({
    documentRef=global.document,
    mappingFields,
    mappingFieldTemplate,
    dateFormatTemplate,
    makeTargets,
    guessTarget,
    onChange
  }={}){
    if (!mappingFields || typeof mappingFields.replaceChildren!=="function"){
      throw new TypeError("A CSV mapping renderer requires a mapping-fields element.");
    }
    if (!mappingFieldTemplate?.content?.cloneNode || !dateFormatTemplate?.content?.cloneNode){
      throw new TypeError("A CSV mapping renderer requires mapping field and date format templates.");
    }
    if (typeof makeTargets!=="function" || typeof guessTarget!=="function" || typeof onChange!=="function"){
      throw new TypeError("A CSV mapping renderer requires target and change callbacks.");
    }

    let dateFormatSelect=null;
    let dateFormatControl=null;
    let dateFormatTargetKeys=new Set();

    function render(context){
      if (!context?.parsed) return;
      context.targets=makeTargets(context.project);
      mappingFields.replaceChildren();
      dateFormatSelect=null;
      dateFormatControl=null;
      dateFormatTargetKeys=new Set();

      context.targets.forEach(target=>{
        const fieldFragment=mappingFieldTemplate.content.cloneNode(true);
        const label=fieldFragment.querySelector(".csvImportField");
        const caption=fieldFragment.querySelector("[data-csv-mapping-caption]");
        const select=fieldFragment.querySelector("[data-csv-mapping-select]");
        if (!label || !caption || !select){
          throw new Error("The CSV mapping field template is missing required elements.");
        }
        caption.textContent=target.required ? `${target.label} (required)` : target.label;
        select.dataset.csvTarget=target.key;
        const selectId=`csvImportTarget-${target.key.replace(/[^a-z0-9_-]/gi,"-")}`;
        select.id=selectId;
        caption.htmlFor=selectId;

        context.parsed.headers.forEach((header,index)=>{
          const option=documentRef.createElement("option");
          option.value=String(index);
          option.textContent=header;
          if (guessTarget(target,header)) option.selected=true;
          select.appendChild(option);
        });
        select.addEventListener("change",onChange);

        if ((target.kind==="dueDate"||target.kind==="startDate")&&!dateFormatControl){
          const dateFormatFragment=dateFormatTemplate.content.cloneNode(true);
          dateFormatControl=dateFormatFragment.querySelector(".csvImportDateFormatControl");
          dateFormatSelect=dateFormatFragment.querySelector("[data-csv-date-format]");
          if (!dateFormatControl || !dateFormatSelect){
            throw new Error("The CSV date format template is missing required elements.");
          }
          dateFormatSelect.addEventListener("change",onChange);
          label.appendChild(dateFormatFragment);
        }

        if (target.kind==="dueDate"||target.kind==="startDate"||target.kind==="customDate"){
          dateFormatTargetKeys.add(target.key);
        }
        mappingFields.appendChild(fieldFragment);
      });
      onChange();
    }

    return Object.freeze({
      render,
      get dateFormatSelect(){ return dateFormatSelect; },
      get dateFormatControl(){ return dateFormatControl; },
      get dateFormatTargetKeys(){ return dateFormatTargetKeys; }
    });
  }

  global.BeforeworkCsvImportDialog=Object.freeze({createMappingRenderer});
})(window);
