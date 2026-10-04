(function(global){
  "use strict";

  function create({tagColorOptions, defaultProjectIcon, projectDefaultIcons, openFloatingSelectMenu, closeFloatingSelectMenu, loadTemplate, clonePageTemplate}){
    let templatesPromise=null;
    let finishActive=null;
    let requestSequence=0;

    function loadTemplates(){
      if (!templatesPromise){
        templatesPromise=loadTemplate("dialogs")
          .then(()=>clonePageTemplate("dialogs"))
          .then(templates=>{
            const required=["dialogShell","dialogInputField","dialogTextareaField","dialogSelectField","dialogTagColorField","dialogIconPickerField"];
            const missing=required.filter(id=>!templates.querySelector(`#${id}`));
            if (missing.length) throw new Error(`Missing dialog templates: ${missing.join(", ")}`);
            return templates;
          })
          .catch(error=>{ templatesPromise=null; throw error; });
      }
      return templatesPromise;
    }

    function cloneTemplate(templates,id){
      return templates.querySelector(`#${id}`).content.cloneNode(true).firstElementChild;
    }

    function setFieldLabel(root,field,index,forId){
      const label=root.querySelector("[data-dialog-label]");
      if (!field.label){ label.remove(); return; }
      label.htmlFor=forId||`dialogField${index}`;
      label.textContent=field.label;
    }

    function makeIconOption(iconName,index,selected){
      const label=document.createElement("label");
      label.className="projectIconOption";
      label.title=iconName;
      const radio=document.createElement("input");
      radio.type="radio";
      radio.name=`dialogIcon${index}`;
      radio.value=iconName;
      radio.checked=selected;
      const icon=document.createElement("iconify-icon");
      icon.setAttribute("icon",iconName);
      icon.setAttribute("aria-hidden","true");
      const text=document.createElement("span");
      text.textContent=iconName.slice(4);
      label.append(radio,icon,text);
      return label;
    }

    function makeField(templates,field,index,selectedIconValues){
      const id=`dialogField${index}`;
      if (field.type==="iconPicker"){
        const root=cloneTemplate(templates,"dialogIconPickerField");
        setFieldLabel(root,field,index,id);
        const defaults=root.querySelector("[data-default-icons]");
        const moreButton=root.querySelector("[data-icon-more]");
        const searchPanel=root.querySelector("[data-icon-search-panel]");
        const search=root.querySelector("[data-icon-search]");
        const results=root.querySelector("[data-icon-results]");
        const status=root.querySelector("[data-icon-status]");
        search.id=id;
        let matches=[];
        let searchTimer=null;
        let searchSequence=0;
        const renderOptions=()=>{
          const defaultIcons=[...projectDefaultIcons];
          if (!defaultIcons.includes(selectedIconValues[index])) defaultIcons.unshift(selectedIconValues[index]);
          const defaultSet=new Set(defaultIcons);
          defaults.replaceChildren(...defaultIcons.map(iconName=>makeIconOption(iconName,index,selectedIconValues[index]===iconName)));
          results.replaceChildren(...matches.filter(iconName=>!defaultSet.has(iconName)).map(iconName=>makeIconOption(iconName,index,selectedIconValues[index]===iconName)));
        };
        const selectIcon=event=>{
          const radio=event.target.closest('input[type="radio"]');
          if (!radio) return;
          selectedIconValues[index]=radio.value;
          renderOptions();
        };
        renderOptions();
        defaults.addEventListener("change",selectIcon);
        results.addEventListener("change",selectIcon);
        moreButton.addEventListener("click",()=>{
          searchPanel.hidden=!searchPanel.hidden;
          moreButton.setAttribute("aria-expanded",String(!searchPanel.hidden));
          moreButton.textContent=searchPanel.hidden?"More icons":"Hide search";
          if (!searchPanel.hidden) search.focus();
        });
        search.addEventListener("input",()=>{
          clearTimeout(searchTimer);
          const query=search.value.trim();
          const sequence=++searchSequence;
          if (query.length<2){
            matches=[];
            renderOptions();
            status.textContent=query?"Type at least 2 characters to search.":"Search Material Design Icons to browse more.";
            return;
          }
          status.textContent="Searching icons...";
          searchTimer=setTimeout(async()=>{
            try{
              const response=await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(query)}&prefix=mdi&limit=48`);
              if (!response.ok) throw new Error("Icon search unavailable");
              const payload=await response.json();
              if (sequence!==searchSequence) return;
              matches=(Array.isArray(payload.icons)?payload.icons:[]).filter(iconName=>typeof iconName==="string"&&/^mdi:[a-z0-9-]+$/i.test(iconName));
              renderOptions();
              status.textContent=matches.length?`${matches.length} icons found.`:"No matching icons.";
            }catch(error){
              if (sequence!==searchSequence) return;
              matches=[];
              renderOptions();
              status.textContent="Icon search unavailable. Your selected icon is unchanged.";
            }
          },250);
        });
        return root;
      }

      if (field.type==="tagColor"){
        const root=cloneTemplate(templates,"dialogTagColorField");
        const selectedIndex=tagColorOptions.findIndex(option=>option.value===field.value);
        const customValue=/^#[0-9a-f]{6}$/i.test(field.value||"")?field.value:"#0969da";
        setFieldLabel(root,field,index,`${id}Color0`);
        root.querySelector("[data-color-group]").setAttribute("aria-label",field.label||"Pill color");
        const swatches=root.querySelector("[data-tag-swatches]");
        const customOption=root.querySelector("[data-custom-option]");
        const currentColor=root.querySelector("[data-custom-current]");
        const customRadio=root.querySelector("[data-custom-radio]");
        const picker=root.querySelector("[data-custom-picker]");
        customRadio.id=`${id}Custom`;
        customRadio.name=id;
        customRadio.checked=selectedIndex<0;
        picker.id=`dialogColor${index}`;
        picker.value=customValue;
        currentColor.style.background=customValue;
        currentColor.classList.toggle("is-visible",selectedIndex<0);
        tagColorOptions.forEach((option,optionIndex)=>{
          const label=document.createElement("label");
          label.className="tagColorOption";
          label.title=option.label;
          const radio=document.createElement("input");
          radio.id=`${id}Color${optionIndex}`;
          radio.type="radio";
          radio.name=id;
          radio.value=option.value;
          radio.checked=selectedIndex===optionIndex;
          const swatch=document.createElement("span");
          swatch.className="tagColorSwatch";
          swatch.style.background=option.value;
          const name=document.createElement("span");
          name.className="sr-only";
          name.textContent=option.label;
          label.append(radio,swatch,name);
          swatches.insertBefore(label,customOption);
        });
        const selectCustom=()=>{ customRadio.checked=true; currentColor.classList.add("is-visible"); };
        picker.addEventListener("pointerdown",selectCustom);
        picker.addEventListener("input",()=>{ selectCustom(); currentColor.style.background=picker.value; });
        root.querySelectorAll(`input[name="${id}"]:not([value="__custom__"])`).forEach(radio=>radio.addEventListener("change",()=>currentColor.classList.remove("is-visible")));
        return root;
      }

      if (field.type==="select"){
        const root=cloneTemplate(templates,"dialogSelectField");
        const selectedOption=(field.options||[]).find(option=>option.value===field.value)||(field.options||[])[0];
        setFieldLabel(root,field,index,id);
        const input=root.querySelector("[data-select-value]");
        const button=root.querySelector("[data-select-button]");
        const menu=root.querySelector("[data-select-menu]");
        const optionList=root.querySelector("[data-select-options]");
        const search=root.querySelector("[data-select-search]");
        const emptyState=root.querySelector("[data-select-empty]");
        input.id=id;
        input.value=selectedOption?.value||"";
        button.id=`${id}Button`;
        button.querySelector("[data-select-label]").textContent=selectedOption?.label||"";
        search.hidden=!field.searchable;
        search.placeholder=field.searchPlaceholder||`Search ${field.label?.toLowerCase()||"options"}`;
        search.setAttribute("aria-label",search.placeholder);
        optionList.setAttribute("aria-label",field.label||"Select an option");
        const options=(field.options||[]).map((option,optionIndex)=>{
          const choice=document.createElement("button");
          choice.type="button";
          choice.className="dialogSelectOption";
          choice.setAttribute("role","option");
          choice.setAttribute("aria-selected",String(option.value===selectedOption?.value));
          choice.dataset.value=String(option.value??"");
          choice.dataset.index=String(optionIndex);
          if (option.value===selectedOption?.value) choice.classList.add("selected");
          const text=document.createElement("span");
          text.className="dialogSelectOptionText";
          const label=document.createElement("span");
          label.className="dialogSelectOptionLabel";
          label.textContent=option.label;
          text.appendChild(label);
          if (option.description){
            const meta=document.createElement("small");
            meta.className="dialogSelectOptionMeta";
            meta.textContent=option.description;
            text.appendChild(meta);
          }
          choice.appendChild(text);
          optionList.appendChild(choice);
          return choice;
        });
        const visibleOptions=()=>options.filter(option=>!option.hidden);
        const filterOptions=()=>{
          const query=search.value.trim().toLocaleLowerCase();
          let visibleCount=0;
          options.forEach(option=>{
            option.hidden=!option.textContent.toLocaleLowerCase().includes(query);
            if (!option.hidden) visibleCount++;
          });
          emptyState.hidden=visibleCount>0;
          optionList.hidden=visibleCount===0;
        };
        const close=()=>closeFloatingSelectMenu(menu);
        const open=()=>{
          openFloatingSelectMenu(button,menu);
          if (field.searchable){
            search.value="";
            filterOptions();
            search.focus();
          }else options.find(option=>option.dataset.value===input.value)?.focus();
        };
        button.onclick=event=>{ event.stopPropagation(); menu.hidden?open():close(); };
        button.onkeydown=event=>{ if (event.key==="ArrowDown"||event.key==="Enter"||event.key===" "){ event.preventDefault(); open(); } };
        options.forEach(option=>option.onclick=()=>{
          input.value=option.dataset.value;
          button.querySelector("[data-select-label]").textContent=option.querySelector(".dialogSelectOptionLabel")?.textContent||option.textContent;
          options.forEach(candidate=>{ candidate.classList.toggle("selected",candidate===option); candidate.setAttribute("aria-selected",String(candidate===option)); });
          input.dispatchEvent(new global.Event("change",{bubbles:true}));
          close();
          button.focus();
        });
        if (field.searchable){
          search.addEventListener("input",filterOptions);
          search.onkeydown=event=>{
            const visible=visibleOptions();
            if (event.key==="ArrowDown"){ event.preventDefault(); visible[0]?.focus(); }
            if (event.key==="ArrowUp"){ event.preventDefault(); visible[visible.length-1]?.focus(); }
            if (event.key==="Escape"){ event.preventDefault(); close(); button.focus(); }
          };
        }
        menu.onkeydown=event=>{
          const visible=visibleOptions();
          const current=visible.indexOf(document.activeElement);
          if (event.key==="ArrowDown"){ event.preventDefault(); visible[Math.min(visible.length-1,current<0?0:current+1)]?.focus(); }
          if (event.key==="ArrowUp"){ event.preventDefault(); visible[Math.max(0,current<0?visible.length-1:current-1)]?.focus(); }
          if (event.key==="Escape"){ event.preventDefault(); close(); button.focus(); }
        };
        return root;
      }

      const root=cloneTemplate(templates,field.type==="textarea"?"dialogTextareaField":"dialogInputField");
      const control=root.querySelector("[data-dialog-input]")||root.querySelector("[data-dialog-textarea]");
      control.id=id;
      control.placeholder=field.placeholder||"";
      control.value=field.value||"";
      if (field.type==="date") control.type="date";
      setFieldLabel(root,field,index,id);
      return root;
    }

    function renderChoiceList(container,choiceList){
      if (!choiceList) return null;
      const choices=choiceList.items.map(choice=>({...choice}));
      const rows=container.querySelector("[data-dialog-choice-rows]");
      const addButton=container.querySelector("[data-dialog-choice-add]");
      const newChoiceRow=container.querySelector("[data-dialog-choice-new]");
      const newChoiceInput=container.querySelector("[data-dialog-choice-new-input]");
      const newChoiceConfirm=container.querySelector("[data-dialog-choice-new-confirm]");
      const newChoiceCancel=container.querySelector("[data-dialog-choice-new-cancel]");
      const copy=choiceList.copy;
      const choiceRows=new WeakMap();
      container.hidden=false;
      container.querySelector("[data-dialog-choice-heading]").textContent=copy.heading;
      container.querySelector("[data-dialog-choice-description]").textContent=copy.description;
      addButton.querySelector("[data-dialog-choice-add-label]").textContent=copy.addLabel;
      newChoiceInput.placeholder=copy.inputPlaceholder;
      newChoiceInput.setAttribute("aria-label",`New ${copy.itemLabel} name`);
      newChoiceConfirm.setAttribute("aria-label",copy.addLabel);
      newChoiceConfirm.title=copy.addLabel;
      function renderChoice(choice){
        const row=document.createElement("div");
        row.className="dialogChoiceRow";
        const dragHandle=document.createElement("button");
        dragHandle.type="button";
        dragHandle.className="btn btn-invisible dialogChoiceDragHandle";
        dragHandle.draggable=true;
        dragHandle.setAttribute("aria-label",`Reorder ${copy.itemLabel} ${choice.label}`);
        dragHandle.title=`Drag to reorder ${copy.itemLabel}`;
        const dragIcon=document.createElement("iconify-icon");
        dragIcon.setAttribute("icon","mdi:drag-horizontal");
        dragIcon.setAttribute("aria-hidden","true");
        dragHandle.appendChild(dragIcon);
        const visibilityLabel=document.createElement("label");
        visibilityLabel.className="dialogChoiceVisibility";
        const checkbox=document.createElement("input");
        checkbox.type="checkbox";
        checkbox.checked=!choice.hiddenInField;
        checkbox.setAttribute("aria-label",`Show ${choice.label} in field`);
        checkbox.addEventListener("change",()=>{ choice.hiddenInField=!checkbox.checked; });
        visibilityLabel.appendChild(checkbox);

        const name=document.createElement("span");
        name.className="dialogChoiceName";
        name.textContent=choice.label;
        const input=document.createElement("input");
        input.className="form-control dialogChoiceInput";
        input.type="text";
        input.value=choice.label;
        input.setAttribute("aria-label",`${copy.itemLabel} name: ${choice.label}`);
        input.hidden=true;
        input.addEventListener("input",()=>{
          choice.label=input.value;
          name.textContent=input.value;
          checkbox.setAttribute("aria-label",`Show ${input.value} in field`);
          editButton.setAttribute("aria-label",`${input.hidden?"Edit":"Finish editing"} ${input.value}`);
          deleteButton.setAttribute("aria-label",`Delete ${input.value}`);
        });

        const editButton=document.createElement("button");
        editButton.type="button";
        editButton.className="btn btn-invisible dialogChoiceAction";
        editButton.setAttribute("aria-label",`Edit ${choice.label}`);
        editButton.title=`Edit ${copy.itemLabel}`;
        const editIcon=document.createElement("iconify-icon");
        editIcon.setAttribute("icon","mdi:pencil-outline");
        editIcon.setAttribute("aria-hidden","true");
        editButton.appendChild(editIcon);
        editButton.addEventListener("click",()=>{
          input.hidden=!input.hidden;
          name.hidden=!input.hidden;
          editIcon.setAttribute("icon",input.hidden?"mdi:pencil-outline":"mdi:check");
          editButton.title=input.hidden?`Edit ${copy.itemLabel}`:`Finish editing ${copy.itemLabel}`;
          editButton.setAttribute("aria-label",`${input.hidden?"Edit":"Finish editing"} ${choice.label}`);
          if (!input.hidden){ input.focus(); input.select(); }
        });

        const deleteButton=document.createElement("button");
        deleteButton.type="button";
        deleteButton.className="btn btn-invisible dialogChoiceAction danger";
        deleteButton.setAttribute("aria-label",`Delete ${choice.label}`);
        deleteButton.title=`Delete ${copy.itemLabel}`;
        const deleteIcon=document.createElement("iconify-icon");
        deleteIcon.setAttribute("icon","mdi:trash-can-outline");
        deleteIcon.setAttribute("aria-hidden","true");
        deleteButton.appendChild(deleteIcon);
        deleteButton.addEventListener("click",()=>{
          choice.deleted=true;
          row.remove();
        });

        row.append(dragHandle,visibilityLabel,name,input,editButton,deleteButton);
        rows.appendChild(row);
        const clearDragStyles=()=>{
          rows.querySelectorAll(".dialogChoiceDragging,.dialogChoiceDropTarget,.dialogChoiceDropAfter")
            .forEach(element=>element.classList.remove("dialogChoiceDragging","dialogChoiceDropTarget","dialogChoiceDropAfter"));
        };
        const moveChoice=(source,target,after)=>{
          if (source===target) return;
          const sourceIndex=choices.indexOf(source);
          if (sourceIndex<0) return;
          choices.splice(sourceIndex,1);
          const targetIndex=choices.indexOf(target);
          if (targetIndex<0){ choices.splice(sourceIndex,0,source); return; }
          choices.splice(targetIndex+(after?1:0),0,source);
          const sourceRow=choiceRows.get(source);
          const targetRow=choiceRows.get(target);
          if (sourceRow&&targetRow) rows.insertBefore(sourceRow,after?targetRow.nextSibling:targetRow);
        };
        choiceRows.set(choice,row);
        dragHandle.addEventListener("click",event=>event.stopPropagation());
        dragHandle.addEventListener("keydown",event=>{
          if (event.key!=="ArrowUp"&&event.key!=="ArrowDown") return;
          const visibleChoices=[...rows.children].map(element=>element.choice).filter(Boolean);
          const index=visibleChoices.indexOf(choice);
          const target=visibleChoices[index+(event.key==="ArrowUp"?-1:1)];
          if (!target) return;
          event.preventDefault();
          moveChoice(choice,target,event.key==="ArrowDown");
        });
        dragHandle.addEventListener("dragstart",event=>{
          event.stopPropagation();
          event.dataTransfer.effectAllowed="move";
          event.dataTransfer.setData("application/x-beforework-choice",choice.id);
          row.classList.add("dialogChoiceDragging");
        });
        dragHandle.addEventListener("dragend",clearDragStyles);
        row.addEventListener("dragover",event=>{
          if (!event.dataTransfer||![...event.dataTransfer.types].includes("application/x-beforework-choice")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect="move";
          const after=event.clientY>=row.getBoundingClientRect().top+row.getBoundingClientRect().height/2;
          row.classList.add("dialogChoiceDropTarget");
          row.classList.toggle("dialogChoiceDropAfter",after);
        });
        row.addEventListener("dragleave",event=>{
          if (row.contains(event.relatedTarget)) return;
          row.classList.remove("dialogChoiceDropTarget","dialogChoiceDropAfter");
        });
        row.addEventListener("drop",event=>{
          const sourceId=event.dataTransfer?.getData("application/x-beforework-choice");
          const source=choices.find(candidate=>candidate.id===sourceId);
          if (!source) return;
          event.preventDefault();
          const after=event.clientY>=row.getBoundingClientRect().top+row.getBoundingClientRect().height/2;
          clearDragStyles();
          moveChoice(source,choice,after);
        });
        row.choice=choice;
      }
      choices.forEach(renderChoice);
      addButton.addEventListener("click",()=>{
        addButton.hidden=true;
        newChoiceRow.hidden=false;
        newChoiceInput.focus();
      });
      function finishNewChoice(){
        const label=newChoiceInput.value.trim();
        if (!label){ newChoiceInput.focus(); return; }
        if (typeof choiceList.createChoice!=="function"){
          throw new TypeError("Field choice creation requires a field-type choice factory.");
        }
        const choice=choiceList.createChoice(label);
        if (!choice||typeof choice.id!=="string"||typeof choice.label!=="string"){
          throw new TypeError("Field type returned an invalid choice.");
        }
        choices.push(choice);
        renderChoice(choice);
        newChoiceInput.value="";
        newChoiceRow.hidden=true;
        addButton.hidden=false;
        addButton.focus();
      }
      function cancelNewChoice(){
        newChoiceInput.value="";
        newChoiceRow.hidden=true;
        addButton.hidden=false;
        addButton.focus();
      }
      newChoiceConfirm.addEventListener("click",finishNewChoice);
      newChoiceCancel.addEventListener("click",cancelNewChoice);
      newChoiceInput.addEventListener("keydown",event=>{
        if (event.key==="Enter"){ event.preventDefault(); finishNewChoice(); }
        if (event.key==="Escape") cancelNewChoice();
      });
      return choices;
    }

    function showDialog(options){
      const sequence=++requestSequence;
      return loadTemplates().then(templates=>{
        if (sequence!==requestSequence) return null;
        if (finishActive) finishActive(null);
        return new Promise(resolve=>{
          const overlay=cloneTemplate(templates,"dialogShell");
          const {title,message="",fields=[],confirmLabel="Continue",secondaryLabel="",danger=false,cancelLabel="Cancel",actionMenu,choiceList}=options;
          const dialog=overlay.querySelector('[role="dialog"]');
          dialog.querySelector("[data-dialog-title]").textContent=title;
          if (actionMenu){
            const trigger=dialog.querySelector("[data-dialog-action-menu-trigger]");
            const menu=dialog.querySelector("[data-dialog-action-menu]");
            dialog.querySelector("[data-dialog-action-menu-wrap]").hidden=false;
            menu.replaceChildren(...actionMenu.items.map(({label,danger:dangerous,onSelect})=>{
              const item=document.createElement("button");
              item.type="button";
              item.className=dangerous?"danger menu-item menu-item--danger":"menu-item";
              item.setAttribute("role","menuitem");
              item.textContent=label;
              item.onclick=onSelect;
              return item;
            }));
            global.BeforeworkActionMenu.create().register(trigger,menu);
          }
          const messageElement=dialog.querySelector("[data-dialog-message]");
          messageElement.hidden=!message;
          messageElement.textContent=message||"";
          dialog.querySelector("[data-dialog-cancel-label]").textContent=cancelLabel;
          const secondary=dialog.querySelector("[data-dialog-secondary]");
          secondary.hidden=!secondaryLabel;
          secondary.textContent=secondaryLabel||"";
          const confirm=dialog.querySelector("[data-dialog-confirm]");
          confirm.textContent=confirmLabel;
          confirm.classList.toggle("btn-danger",danger);
          confirm.classList.toggle("btn-primary",!danger);
          const selectedIconValues=fields.map(field=>field.type==="iconPicker"?(field.value||defaultProjectIcon):null);
          const fieldsContainer=dialog.querySelector("[data-dialog-fields]");
          const fieldRoots=fields.map((field,index)=>{
            const root=makeField(templates,field,index,selectedIconValues);
            fieldsContainer.appendChild(root);
            return root;
          });
          const updateFieldVisibility=()=>{
            const values=fields.map((field,index)=>
              fieldsContainer.querySelector(`#dialogField${index}`)?.value??""
            );
            fields.forEach((field,index)=>{
              if (typeof field.visibleWhen==="function"){
                fieldRoots[index].hidden=!field.visibleWhen(values);
              }
            });
          };
          fieldsContainer.addEventListener("input",updateFieldVisibility);
          fieldsContainer.addEventListener("change",updateFieldVisibility);
          updateFieldVisibility();
          const choiceChanges=renderChoiceList(dialog.querySelector("[data-dialog-choice-list]"),choiceList);
          document.body.appendChild(overlay);
          const finish=value=>{
            overlay.remove();
            if (finishActive===finish) finishActive=null;
            resolve(value);
          };
          finishActive=finish;
          overlay.querySelectorAll("[data-dialog-cancel]").forEach(button=>button.onclick=()=>finish(null));
          if (secondaryLabel) secondary.onclick=()=>finish("__secondary__");
          confirm.onclick=()=>{
            const values=fields.map((field,index)=>{
              if (field.type==="iconPicker") return selectedIconValues[index];
              if (field.type!=="tagColor") return overlay.querySelector(`#dialogField${index}`).value;
              const selected=overlay.querySelector(`input[name="dialogField${index}"]:checked`);
              return selected?.value==="__custom__"?overlay.querySelector(`#dialogColor${index}`).value:selected?.value;
            });
            const result=values.length===1?values[0]:values.length?values:"__confirm__";
            finish(choiceChanges?{values,choices:choiceChanges}:result);
          };
          overlay.addEventListener("click",event=>{ if (event.target===overlay) finish(null); });
          const first=overlay.querySelector("input:not([type='hidden']):not([hidden]), textarea:not([hidden]), select:not([hidden]), .dialogSelectButton:not([hidden])");
          if (first) first.focus();
        });
      });
    }

    function showNotice(title,message){ return showDialog({title,message,confirmLabel:"OK",cancelLabel:"Close",fields:[]}); }
    function showConfirm(title,message,danger=false){ return showDialog({title,message,confirmLabel:danger?"Delete":"Continue",danger}); }
    function dismissActive(){ requestSequence++; if (finishActive) finishActive(null); }
    return Object.freeze({showDialog,showNotice,showConfirm,dismissActive});
  }

  global.BeforeworkDialogs=Object.freeze({create});
})(window);