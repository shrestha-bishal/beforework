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

  function createCsvImportDialog({
    documentRef=global.document,
    loadTemplate,
    cloneTemplate,
    csvImport=global.BeforeworkCsvImport,
    errorUtils=global.BeforeworkErrorUtils,
    makeTargets,
    getPreviewOptions,
    getProjects,
    getActiveProjectId,
    resolveProject,
    importTasks,
    showNotice
  }={}){
    const requiredCallbacks={loadTemplate,cloneTemplate,makeTargets,getPreviewOptions,getProjects,getActiveProjectId,resolveProject,importTasks,showNotice};
    if (Object.entries(requiredCallbacks).some(([,callback])=>typeof callback!=="function")){
      throw new TypeError("A CSV import dialog requires template, project, import, and notice callbacks.");
    }
    if (!csvImport || typeof csvImport.parseCsv!=="function" || typeof csvImport.prepareImport!=="function"){
      throw new TypeError("A CSV import dialog requires the CSV import service.");
    }
    const document=documentRef;

    async function open({destinationMode="existing",targetProjectId}={}){
      try{
        await loadTemplate("csvImport");
      }catch(error){
        await showNotice("Couldn't open CSV import",errorUtils.getMessage(error));
        return;
      }

      const templateFragment=cloneTemplate("csvImport");
      const dialogTemplate=templateFragment.querySelector("#csvImportDialog");
      if (!dialogTemplate){
        await showNotice("Couldn't open CSV import","The CSV import dialog template is missing.");
        return;
      }
      const overlay=dialogTemplate.content.firstElementChild.cloneNode(true);
      const destination=overlay.querySelector("[data-csv-destination]");
      destination.closest(".csvImportField").hidden=true;
      destination.disabled=true;
      const setup=overlay.querySelector(".csvImportSetup");
      const existingWrap=overlay.querySelector("[data-csv-existing-wrap]");
      const existingProject=overlay.querySelector("[data-csv-existing-project]");
      existingProject.disabled=true;
      const newWrap=overlay.querySelector("[data-csv-new-wrap]");
      const newName=overlay.querySelector("[data-csv-new-name]");
      const templateWrap=overlay.querySelector("[data-csv-template-wrap]");
      const templateSelect=overlay.querySelector("[data-csv-template]");
      const fileInput=overlay.querySelector("[data-csv-file]");
      const fileButton=overlay.querySelector("[data-csv-file-button]");
      const fileName=overlay.querySelector("[data-csv-file-name]");
      const status=overlay.querySelector("[data-csv-status]");
      const stepPanels=[...overlay.querySelectorAll("[data-csv-step]")];
      const stepIndicators=[...overlay.querySelectorAll("[data-csv-step-indicator]")];
      const backButton=overlay.querySelector("[data-csv-back]");
      const nextButton=overlay.querySelector("[data-csv-next]");
      const mappingFields=overlay.querySelector("[data-csv-mapping-fields]");
      const mappingFieldTemplate=templateFragment.querySelector("#csvImportMappingFieldTemplate");
      const dateFormatTemplate=templateFragment.querySelector("#csvImportDateFormatTemplate");
      const previewSummary=overlay.querySelector("[data-csv-preview-summary]");
      const previewHead=overlay.querySelector("[data-csv-preview-head]");
      const previewBody=overlay.querySelector("[data-csv-preview-body]");
      const previewHeadRowTemplate=templateFragment.querySelector("#csvImportPreviewHeadRowTemplate");
      const previewHeadingCellTemplate=templateFragment.querySelector("#csvImportPreviewHeadingCellTemplate");
      const previewBodyRowTemplate=templateFragment.querySelector("#csvImportPreviewBodyRowTemplate");
      const previewBodyCellTemplate=templateFragment.querySelector("#csvImportPreviewBodyCellTemplate");
      const confirmButton=overlay.querySelector("[data-csv-confirm]");
      const context={parsed:null,project:null,targets:[],selectionToken:0,closed:false,step:1,mapping:null};

      const close=()=>{
        context.closed=true;
        overlay.remove();
      };
      overlay.querySelectorAll("[data-csv-cancel]").forEach(button=>button.addEventListener("click",close));
      overlay.addEventListener("click",event=>{ if (event.target===overlay) close(); });
      overlay.addEventListener("keydown",event=>{ if (event.key==="Escape"){ event.preventDefault(); close(); } });
      document.body.appendChild(overlay);

      const records=getProjects();
      overlay.querySelector("#csvImportTitle").textContent=destinationMode==="new" ? "Import project from CSV" : "Import tasks from CSV";
      const helpText=overlay.querySelector(".csvImportHelp");
      helpText.textContent=destinationMode==="new"
        ? "Create a new project and import its tasks from a CSV file."
        : "Import tasks from a CSV file into this project.";
      confirmButton.textContent=destinationMode==="new" ? "Create project" : "Import tasks";
      existingProject.replaceChildren(...records.map(project=>{
        const option=document.createElement("option");
        option.value=project.id;
        option.textContent=project.name;
        return option;
      }));
      const initial=records.find(project=>project.id===getActiveProjectId())||records[0];
      if (destinationMode==="new"){
        destination.value="new";
      }else if (records.some(project=>project.id===targetProjectId)){
        existingProject.value=targetProjectId;
        destination.value="existing";
        helpText.textContent=`Import tasks from a CSV file into ${records.find(project=>project.id===targetProjectId).name}.`;
      }else if (initial){
        existingProject.value=initial.id;
        destination.value="existing";
        helpText.textContent=`Import tasks from a CSV file into ${initial.name}.`;
      }else destination.value="new";

      const setStatus=(message,isError=false)=>{
        status.textContent=message;
        status.classList.toggle("error",isError);
      };
      const updateStep=()=>{
        stepPanels.forEach(panel=>{ panel.hidden=Number(panel.dataset.csvStep)!==context.step; });
        stepIndicators.forEach(indicator=>{
          if (Number(indicator.dataset.csvStepIndicator)===context.step) indicator.setAttribute("aria-current","step");
          else indicator.removeAttribute("aria-current");
        });
        backButton.hidden=context.step===1;
        nextButton.hidden=context.step!==1;
        confirmButton.hidden=context.step!==2;
        nextButton.disabled=!context.parsed || (destination.value==="new" && !newName.value.trim());
      };
      const currentProject=async()=>{
        if (destination.value==="new"||!existingProject.value) return null;
        const project=await resolveProject(existingProject.value);
        if (!project) throw new Error("Couldn't load the selected project.");
        return project;
      };
      const guessTarget=(target,header)=>{
        const value=header.trim().toLowerCase();
        if (target.kind==="title" && /^(title|task|task name|name)$/.test(value)) return true;
        if (target.kind==="description" && /^(description|details|notes)$/.test(value)) return true;
        if (target.kind==="startDate" && /^(start|start date|start_date|starts on)$/.test(value)) return true;
        if (target.kind==="status" && /^(status|group|stage)$/.test(value)) return true;
        if (target.kind==="tags" && /^(tag|tags|label|labels)$/.test(value)) return true;
        if (target.kind==="dueDate" && /^(due|due date|deadline)$/.test(value)) return true;
        if (target.kind==="priority" && /^priority$/.test(value)) return true;
        return false;
      };
      const selectedTargets=()=>{
        const targets=new Map();
        mappingFields.querySelectorAll("[data-csv-target]").forEach(select=>{
          if (select.value==="" || !Number.isInteger(Number(select.value))) return;
          targets.set(select.dataset.csvTarget,Number(select.value));
        });
        return targets;
      };
      const mappingRenderer=createMappingRenderer({
        documentRef:document,
        mappingFields,
        mappingFieldTemplate,
        dateFormatTemplate,
        makeTargets:project=>makeTargets(project,templateSelect.value),
        guessTarget,
        onChange:refreshPreview
      });

      function renderMapping(){
        mappingRenderer.render(context);
      }

      function refreshPreview(){
        const targets=selectedTargets();
        const selectedColumns=new Set(targets.values());
        mappingFields.querySelectorAll("[data-csv-target]").forEach(select=>{
          [...select.options].forEach(option=>{
            if (!option.value||option.value===select.value) return;
            option.disabled=selectedColumns.has(Number(option.value));
          });
        });
        const mapping={};
        let startDateFieldId=null,dueDateFieldId=null,priorityFieldId=null;
        let startDateFieldIndex=null,dueDateFieldIndex=null,priorityFieldIndex=null;
        for (const target of context.targets){
          if (!targets.has(target.key)) continue;
          mapping[target.kind==="customDate"?target.key:target.kind]=targets.get(target.key);
          if (target.kind==="startDate"){ startDateFieldId=target.fieldId; startDateFieldIndex=target.fieldIndex; }
          if (target.kind==="dueDate"){ dueDateFieldId=target.fieldId; dueDateFieldIndex=target.fieldIndex; }
          if (target.kind==="priority"){ priorityFieldId=target.fieldId; priorityFieldIndex=target.fieldIndex; }
        }
        if (mappingRenderer.dateFormatControl){
          mappingRenderer.dateFormatControl.hidden=![...mappingRenderer.dateFormatTargetKeys].some(key=>targets.has(key));
        }
        const options=getPreviewOptions({
          project:context.project,
          templateKey:templateSelect.value,
          priorityTarget:context.targets.find(target=>target.kind==="priority"&&targets.has(target.key))
        });
        const prepared=context.parsed&&Object.hasOwn(mapping,"title")
          ? csvImport.prepareImport(
            context.parsed,
            mapping,
            options.groupNames,
            mappingRenderer.dateFormatSelect?.value||"DMY",
            options.priorityChoices
          )
          : null;
        previewHead.replaceChildren();
        previewBody.replaceChildren();
        if (!context.parsed){ confirmButton.disabled=true; return; }
        if (!Object.hasOwn(mapping,"title")){
          previewSummary.textContent="Map a CSV column to Task title to continue.";
          setStatus("Choose a CSV file and map its task title column.");
        }else if (prepared.errors.length){
          const extra=prepared.errors.length>3 ? ` And ${prepared.errors.length-3} more.` : "";
          setStatus(`${prepared.errors.slice(0,3).join(" ")}${extra}`,true);
          previewSummary.textContent=`${prepared.tasks.length} CSV row(s) found; fix the errors before importing.`;
        }else{
          setStatus("");
          const additions=prepared.groupsToCreate.length
            ? `${options.mapsStatusToField?" New status options will be created":" New groups will be created"}: ${prepared.groupsToCreate.join(", ")}.`
            : "";
          previewSummary.textContent=`${prepared.tasks.length} task(s) ready to import.${additions}`;
        }
        const columns=context.targets.filter(target=>targets.has(target.key));
        const headingRow=previewHeadRowTemplate.content.firstElementChild.cloneNode(true);
        columns.forEach(target=>{
          const cell=previewHeadingCellTemplate.content.firstElementChild.cloneNode(true);
          cell.textContent=target.label;
          headingRow.appendChild(cell);
        });
        previewHead.appendChild(headingRow);
        (prepared?.tasks||[]).slice(0,5).forEach(task=>{
          const row=previewBodyRowTemplate.content.firstElementChild.cloneNode(true);
          columns.forEach(target=>{
            const cell=previewBodyCellTemplate.content.firstElementChild.cloneNode(true);
            const kind=target.kind;
            cell.textContent=kind==="dueDate" ? task.dueDate
              : kind==="startDate" ? task.startDate
                : kind==="customDate" ? task.customDates[target.key]||""
                  : kind==="priority" ? task.priority
                    : kind==="tags" ? task.tags.join(", ")
                      : kind==="status" ? task.status||options.groupNames[0]||""
                        : task[kind]||"";
            row.appendChild(cell);
          });
          previewBody.appendChild(row);
        });
        const nameValid=destination.value!=="new"||!!newName.value.trim();
        confirmButton.disabled=!(prepared&&!prepared.errors.length&&nameValid&&(destination.value==="new"||!!context.project));
        context.mapping={
          mapping,
          startDateFieldId,dueDateFieldId,priorityFieldId,
          startDateFieldIndex,dueDateFieldIndex,priorityFieldIndex,
          customDateFields:context.targets.filter(target=>target.kind==="customDate"&&targets.has(target.key))
            .map(target=>({key:target.key,fieldId:target.fieldId,fieldIndex:target.fieldIndex})),
          prepared
        };
      }

      async function refreshProjectAndMapping(){
        const token=++context.selectionToken;
        confirmButton.disabled=true;
        context.project=null;
        if (destination.value==="existing"){
          if (!existingProject.value){
            setStatus("Create a project before importing tasks.",true);
            renderMapping();
            return;
          }
          setStatus("Loading project…");
          try{
            const project=await currentProject();
            if (context.closed||token!==context.selectionToken) return;
            context.project=project;
          }catch(error){
            if (context.closed||token!==context.selectionToken) return;
            setStatus(errorUtils.getMessage(error),true);
          }
        }
        if (context.closed||token!==context.selectionToken) return;
        if (context.step===2) renderMapping();
        if (!context.parsed) setStatus(destination.value==="new"?"Choose a CSV file to continue.":"");
        updateStep();
      }

      destination.addEventListener("change",()=>{
        const isNew=destination.value==="new";
        setup.classList.toggle("is-new-project",isNew);
        existingWrap.hidden=isNew;
        newWrap.hidden=!isNew;
        templateWrap.hidden=!isNew;
        refreshProjectAndMapping();
      });
      existingProject.addEventListener("change",refreshProjectAndMapping);
      templateSelect.addEventListener("change",renderMapping);
      newName.addEventListener("input",updateStep);
      nextButton.addEventListener("click",()=>{
        if (!context.parsed||(destination.value==="new"&&!newName.value.trim())) return;
        context.step=2;
        setStatus("");
        updateStep();
        renderMapping();
        mappingFields.querySelector("[data-csv-target]")?.focus();
      });
      backButton.addEventListener("click",()=>{
        context.step=1;
        setStatus("");
        updateStep();
      });
      fileButton.addEventListener("click",()=>fileInput.click());
      fileInput.addEventListener("change",async()=>{
        context.parsed=null;
        mappingFields.replaceChildren();
        confirmButton.disabled=true;
        updateStep();
        const file=fileInput.files?.[0];
        fileName.textContent=file?.name||"No file selected";
        if (!file){ refreshPreview(); setStatus(""); return; }
        try{
          csvImport.validateFile(file);
          const bytes=await file.arrayBuffer();
          const view=new Uint8Array(bytes);
          const encoding=view[0]===0xFF&&view[1]===0xFE?"utf-16le"
            :view[0]===0xFE&&view[1]===0xFF?"utf-16be":"utf-8";
          context.parsed=csvImport.parseCsv(new TextDecoder(encoding).decode(bytes));
          await refreshProjectAndMapping();
          setStatus("CSV loaded. Continue to map its columns.");
        }catch(error){
          context.parsed=null;
          refreshPreview();
          updateStep();
          setStatus(errorUtils.getMessage(error),true);
        }
      });
      confirmButton.addEventListener("click",async()=>{
        confirmButton.disabled=true;
        try{
          const mapping=context.mapping;
          const prepared=mapping?.prepared;
          if (!prepared||prepared.errors.length) throw new Error("Fix the CSV mapping errors before importing.");
          const result=await importTasks({
            destinationMode,
            targetProjectId:existingProject.value,
            newProjectName:newName.value.trim(),
            templateKey:templateSelect.value,
            project:context.project,
            mapping,
            prepared
          });
          if (!result?.project) throw new Error("The CSV import did not return a project.");
          close();
          await showNotice(
            destinationMode==="new"?"Project created":"CSV import complete",
            `Imported ${prepared.tasks.length} task(s) into ${result.project.name}.`
          );
        }catch(error){
          confirmButton.disabled=false;
          setStatus(errorUtils.getMessage(error),true);
        }
      });

      existingWrap.hidden=true;
      newWrap.hidden=destination.value!=="new";
      templateWrap.hidden=destination.value!=="new";
      setup.classList.toggle("is-new-project",destination.value==="new");
      updateStep();
      if (destination.value==="new") newName.focus();
      else fileButton.focus();
      await refreshProjectAndMapping();
    }

    return Object.freeze({open});
  }

  global.BeforeworkCsvImportDialog=Object.freeze({createMappingRenderer,create:createCsvImportDialog});
})(window);
