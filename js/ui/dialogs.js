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
        input.id=id;
        input.value=selectedOption?.value||"";
        button.id=`${id}Button`;
        button.querySelector("[data-select-label]").textContent=selectedOption?.label||"";
        menu.setAttribute("aria-label",field.label||"Select an option");
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
          menu.appendChild(choice);
          return choice;
        });
        const close=()=>closeFloatingSelectMenu(menu);
        const open=()=>{ openFloatingSelectMenu(button,menu); options.find(option=>option.dataset.value===input.value)?.focus(); };
        button.onclick=event=>{ event.stopPropagation(); menu.hidden?open():close(); };
        button.onkeydown=event=>{ if (event.key==="ArrowDown"||event.key==="Enter"||event.key===" "){ event.preventDefault(); open(); } };
        options.forEach(option=>option.onclick=()=>{
          input.value=option.dataset.value;
          button.querySelector("[data-select-label]").textContent=option.querySelector(".dialogSelectOptionLabel")?.textContent||option.textContent;
          options.forEach(candidate=>{ candidate.classList.toggle("selected",candidate===option); candidate.setAttribute("aria-selected",String(candidate===option)); });
          close();
          button.focus();
        });
        menu.onkeydown=event=>{
          const current=Math.max(0,options.indexOf(document.activeElement));
          if (event.key==="ArrowDown"){ event.preventDefault(); options[Math.min(options.length-1,current+1)]?.focus(); }
          if (event.key==="ArrowUp"){ event.preventDefault(); options[Math.max(0,current-1)]?.focus(); }
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

    function showDialog(options){
      const sequence=++requestSequence;
      return loadTemplates().then(templates=>{
        if (sequence!==requestSequence) return null;
        if (finishActive) finishActive(null);
        return new Promise(resolve=>{
          const overlay=cloneTemplate(templates,"dialogShell");
          const {title,message="",fields=[],confirmLabel="Continue",secondaryLabel="",danger=false,cancelLabel="Cancel"}=options;
          const dialog=overlay.querySelector('[role="dialog"]');
          dialog.querySelector("[data-dialog-title]").textContent=title;
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
          fields.forEach((field,index)=>fieldsContainer.appendChild(makeField(templates,field,index,selectedIconValues)));
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
            finish(values.length===1?values[0]:values.length?values:"__confirm__");
          };
          overlay.addEventListener("click",event=>{ if (event.target===overlay) finish(null); });
          const first=overlay.querySelector("input:not([type='hidden']), textarea, select, .dialogSelectButton");
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