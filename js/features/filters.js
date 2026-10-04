(function(global){
  "use strict";

  const NONE="__none__";

  function create({
    documentRef=global.document,
    storage=global.localStorage,
    storageKey,
    fieldTypes,
    getProject,
    getActiveProjectId,
    getProjectGroups,
    getProjectItemEntries,
    getShowArchived,
    isItemCompleted,
    scheduleFieldValue,
    render,
    escapeHtml,
    enhanceSelectControl
  }={}){
    if (!fieldTypes || typeof getProject!=="function" || typeof getProjectGroups!=="function" ||
      typeof getProjectItemEntries!=="function" || typeof render!=="function"){
      throw new TypeError("Filters require project, field, and render dependencies.");
    }

    let text="";
    let groups=new Set();
    let tags=new Set();
    let fields=new Map();
    let columns=new Map();
    let completion="open";
    let preferences=JSON.parse(storage.getItem(storageKey)||"{}");
    let suggestionIndex=-1;
    let suggestionsOpen=false;

    function replaceSet(target,values){
      target.clear();
      values.forEach(value=>target.add(value));
    }

    function savePreferences(){
      storage.setItem(storageKey,JSON.stringify(preferences));
    }

    function persistActive(){
      const project=getProject(getActiveProjectId());
      if (!project) return;
      pruneColumns(project);
      preferences[project.id]={
        text,
        groups:[...groups],
        tags:[...tags],
        fields:Object.fromEntries(fields),
        columns:Object.fromEntries([...columns].map(([id,values])=>[id,[...values]])),
        completion
      };
      savePreferences();
    }

    function pruneColumns(project){
      const valid=new Set(["title","group","progress","updated",
        ...project.fields.filter(field=>field.type!=="tags").map(field=>`field:${field.id}`)
      ]);
      if (project.fields.some(field=>field.type==="tags")) valid.add("tags");
      for (const id of columns.keys()) if (!valid.has(id)) columns.delete(id);
    }

    function sharedColumnField(project,columnId){
      if (!columnId.startsWith("field:")) return null;
      const field=project?.fields?.find(candidate=>candidate.id===columnId.slice(6));
      return ["checkbox","priority","select","multi-select","relation"].includes(field?.type)?field:null;
    }

    function migrateColumns(project){
      if (!project) return;
      for (const [columnId,values] of [...columns]){
        if (columnId==="group"){
          values.forEach(value=>groups.add(value));
          columns.delete(columnId);
        } else if (columnId==="tags"){
          values.forEach(value=>tags.add(value));
          columns.delete(columnId);
        } else {
          const field=sharedColumnField(project,columnId);
          if (!field) continue;
          const current=fields.get(field.id);
          const selected=new Set(Array.isArray(current)?current:current&&current!=="__all__"?[current]:[]);
          values.forEach(value=>selected.add(value));
          fields.set(field.id,[...selected]);
          columns.delete(columnId);
        }
      }
    }

    function restore(projectId){
      const saved=preferences[projectId]||{};
      text=saved.text||"";
      replaceSet(groups,Array.isArray(saved.groups)?saved.groups:[]);
      replaceSet(tags,Array.isArray(saved.tags)?saved.tags:[]);
      fields.clear();
      columns.clear();
      fields=new Map(Object.entries(saved.fields||{}));
      columns=new Map(Object.entries(saved.columns||{}).map(([id,values])=>[id,new Set(Array.isArray(values)?values:[])]));
      migrateColumns(getProject(projectId));
      completion=saved.completion==="completed"?"completed":"open";
    }

    function reset(){
      text="";
      groups.clear();
      tags.clear();
      fields.clear();
      columns.clear();
      suggestionsOpen=false;
      const input=inputElement();
      input.value="";
      const suggestionsWrap=documentRef.getElementById("filterSuggestions");
      suggestionsWrap.hidden=true;
      input.setAttribute("aria-expanded","false");
      render();
    }

    function columnDateKey(value){
      if (value==null||value==="") return NONE;
      const date=new Date(value);
      return Number.isNaN(date.getTime())?NONE:date.toISOString().slice(0,10);
    }

    function projectTagOptions(project){
      const tagsField=project?.fields?.find(field=>field.type==="tags");
      const options=tagsField?fieldTypes.getFilterOptions(tagsField,{project})
        :(project?.tags||[]).map(tag=>({value:tag.id,label:tag.name,color:tag.color||""}));
      return [...options,{value:NONE,label:"No tags",color:""}];
    }

    function columnValuesForItem(project,item,group,columnId){
      if (columnId==="title") return item.title?[String(item.title)]:[NONE];
      if (columnId==="group") return group?.id?[String(group.id)]:[NONE];
      if (columnId==="tags"){
        const tagsField=project?.fields?.find(field=>field.type==="tags");
        if (!tagsField) return item.tagIds?.length?item.tagIds.map(String):[NONE];
        return fieldTypes.getFilterValues(tagsField,{
          item,project,group,noneValue:NONE,dateKey:columnDateKey,scheduleFieldValue
        });
      }
      if (columnId==="progress"){
        const subitems=Array.isArray(item.subitems)?item.subitems:[];
        return subitems.length?[`${subitems.filter(subitem=>subitem.done).length}/${subitems.length}`]:[NONE];
      }
      if (columnId==="updated") return [columnDateKey(item.updatedAt)];
      if (!columnId.startsWith("field:")) return [NONE];
      const id=columnId.slice(6);
      const field=project?.fields?.find(candidate=>candidate.id===id);
      const value=field?.type==="location"?(item.values||{})[id]??item.location??""
        :(item.values||{})[id];
      return fieldTypes.getFilterValues(field,{
        value,item,project,group,noneValue:NONE,dateKey:columnDateKey,scheduleFieldValue
      });
    }

    function matches(project,item,group,ignoreColumnFilters=false){
      if (item.archived&&!getShowArchived()) return false;
      if (project&&project.id===getActiveProjectId()&&isItemCompleted(item)!==(completion==="completed")) return false;
      if (groups.size&&(!group||!groups.has(group.id))) return false;
      const tagsField=project?.fields?.find(field=>field.type==="tags");
      if (tags.size){
        if (tagsField){
          if (!fieldTypes.matchesFilter(tagsField,{item,project,mode:[...tags],noneValue:NONE})) return false;
        } else {
          const assigned=(item.tagIds||[]).map(String);
          const selected=[...tags];
          if (selected.includes(NONE)?assigned.length>0:!selected.some(id=>assigned.includes(id))) return false;
        }
      }
      for (const [id,mode] of fields){
        const field=project?.fields?.find(candidate=>candidate.id===id);
        const value=field?.type==="schedule"?scheduleFieldValue(project,item):(item.values||{})[id]??"";
        if (!fieldTypes.matchesFilter(field,{
          value,mode,item,project,group,noneValue:NONE,scheduleFieldValue,dateKey:columnDateKey
        })) return false;
      }
      if (!ignoreColumnFilters){
        for (const [columnId,selected] of columns){
          if (selected.size&&!columnValuesForItem(project,item,group,columnId).some(value=>selected.has(value))) return false;
        }
      }
      if (text){
        const query=text.toLowerCase();
        const standard=[item.title,item.description,...(item.subitems||[]).map(subitem=>subitem.title)];
        const standardMatch=standard.some(value=>String(value??"").toLowerCase().includes(query));
        const fieldMatch=(project?.fields||[]).some(field=>{
          const value=field.type==="location"?(item.values||{})[field.id]??item.location??""
            :(item.values||{})[field.id];
          return fieldTypes.matchesQuery(field,{value,item,project,query,scheduleFieldValue});
        });
        if (!standardMatch&&!fieldMatch) return false;
      }
      return true;
    }

    function columnSelection(project,columnId){
      if (columnId==="group") return new Set(groups);
      if (columnId==="tags") return new Set(tags);
      const field=sharedColumnField(project,columnId);
      if (field){
        const current=fields.get(field.id);
        if (Array.isArray(current)) return new Set(current.map(String));
        return current&&current!=="__all__"?new Set([String(current)]):new Set();
      }
      return columns.get(columnId)||new Set();
    }

    function columnFilterLabel(project,columnId,value){
      const field=columnId.startsWith("field:")
        ?project.fields.find(candidate=>candidate.id===columnId.slice(6)):null;
      if (field){
        const option=fieldTypes.getFilterOptions(field,{project,items:getProjectItemEntries(project)})
          .find(candidate=>String(candidate.value)===value);
        if (option) return option.label;
      }
      if (value===NONE){
        const labels={title:"title",group:"group",tags:"tags",progress:"progress",updated:"date"};
        return `No ${field?.label.toLowerCase()||labels[columnId]||"value"}`;
      }
      if (columnId==="group") return getProjectGroups(project).find(group=>group.id===value)?.name||value;
      if (columnId==="tags"){
        const tagsField=project.fields.find(candidate=>candidate.type==="tags");
        return fieldTypes.getFilterOptions(tagsField,{project}).find(option=>String(option.value)===value)?.label||value;
      }
      if (columnId==="updated"){
        const date=new Date(`${value}T12:00:00`);
        return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat(undefined,{dateStyle:"medium"}).format(date);
      }
      return value;
    }

    function columnFilterOptions(project,columnId){
      const values=new Set();
      const items=getProjectItemEntries(project);
      if (columnId==="group") getProjectGroups(project).forEach(group=>values.add(String(group.id)));
      else if (columnId==="tags"){
        projectTagOptions(project).forEach(option=>values.add(String(option.value)));
      } else if (columnId.startsWith("field:")){
        const field=project.fields.find(candidate=>candidate.id===columnId.slice(6));
        fieldTypes.getFilterOptions(field,{project,items}).forEach(option=>values.add(String(option.value)));
      }
      items.forEach(({item,group})=>columnValuesForItem(project,item,group,columnId).forEach(value=>values.add(value)));
      if (!values.size) values.add(NONE);
      return [...values].map(value=>({value,label:columnFilterLabel(project,columnId,value)}))
        .sort((first,second)=>first.label.localeCompare(second.label));
    }

    function fieldFilterOptions(project,field){
      const options=new Map(fieldTypes.getFilterOptions(field,{project,items:getProjectItemEntries(project)})
        .map(option=>[String(option.value),{
          value:String(option.value),label:option.label,color:option.color||""
        }]));
      getProjectItemEntries(project).forEach(({item,group})=>{
        columnValuesForItem(project,item,group,`field:${field.id}`).forEach(value=>{
          const key=String(value);
          if (!options.has(key)) options.set(key,{
            value:key,label:key===NONE?`No ${field.label}`:key,color:""
          });
        });
      });
      if (!options.has(NONE)) options.set(NONE,{value:NONE,label:`No ${field.label}`,color:""});
      return [...options.values()];
    }

    function applyColumnFilterVisibility(table,project){
      const tbody=table?.tBodies?.[0];
      if (!tbody) return;
      const rows=[...tbody.querySelectorAll("tr[data-iid]")];
      let visibleCount=0;
      rows.forEach(row=>{
        const group=getProjectGroups(project).find(candidate=>candidate.id===row.dataset.gid);
        const item=group?.items.find(candidate=>candidate.id===row.dataset.iid);
        row.hidden=!item||!matches(project,item,group);
        if (!row.hidden) visibleCount++;
      });
      let emptyRow=tbody.querySelector("[data-column-filter-empty]");
      if (rows.length&&!visibleCount){
        if (!emptyRow){
          emptyRow=document.createElement("tr");
          emptyRow.dataset.columnFilterEmpty="true";
          const cell=document.createElement("td");
          cell.colSpan=table.tHead.rows[0].cells.length;
          cell.textContent="No rows match the current filters.";
          emptyRow.appendChild(cell);
          tbody.appendChild(emptyRow);
        }
      } else emptyRow?.remove();
    }

    function wireColumnFilterHeader(th,project){
      if (!th||th.querySelector(".columnFilterSelectWrap")) return;
      const columnId=th.dataset.columnId;
      const label=th.querySelector(".fieldColumnLabel")?.textContent.trim()||columnId;
      const select=documentRef.createElement("select");
      select.multiple=true;
      select.dataset.appSelectPlaceholder=`Filter by ${label}`;
      select.dataset.appSelectButtonClass="fieldColumnMenuBtn columnFilterToggle";
      select.dataset.appSelectWrapClass="columnFilterSelectWrap";
      select.dataset.appSelectIcon="mdi:filter-outline";
      select.dataset.appSelectMenuWidth="320";
      select.dataset.appSelectMenuTitle=`Filter by ${label.toLowerCase()}`;
      select.dataset.appSelectSearchPlaceholder=`Filter ${label.toLowerCase()}`;
      select.setAttribute("aria-label",`Filter by ${label}`);
      const selected=columnSelection(project,columnId);
      columnFilterOptions(project,columnId).forEach(option=>{
        const element=documentRef.createElement("option");
        element.value=option.value;
        element.textContent=option.label;
        element.selected=selected.has(option.value);
        select.appendChild(element);
      });
      th.classList.add("hasColumnFilter");
      if (th.querySelector(".fieldColumnMenuBtn")) th.classList.add("hasColumnMenu");
      th.appendChild(select);
      enhanceSelectControl(select);
      const button=select.parentElement.querySelector(".columnFilterToggle");
      select.addEventListener("change",()=>{
        const values=[...select.selectedOptions].map(option=>option.value);
        setColumnSelection(project,columnId,values);
        const buttonLabel=values.length?`Filter by ${label}, ${values.length} selected`:`Filter by ${label}`;
        button?.setAttribute("aria-label",buttonLabel);
        button?.setAttribute("title",buttonLabel);
        persistActive();
        renderBar(project);
        applyColumnFilterVisibility(documentRef.querySelector("#board .listTable"),project);
      });
    }

    function setColumnSelection(project,columnId,values){
      const selected=new Set(values);
      if (columnId==="group") replaceSet(groups,selected);
      else if (columnId==="tags"){
        if (selected.has(NONE)) replaceSet(tags,[NONE]);
        else replaceSet(tags,selected);
      }
      else {
        const field=sharedColumnField(project,columnId);
        if (field){
          if (selected.size) fields.set(field.id,[...selected]);
          else fields.delete(field.id);
        } else if (selected.size) columns.set(columnId,selected);
        else columns.delete(columnId);
      }
    }

    function tokenList(project){
      const tokens=[];
      const add=(kind,id,value,label)=>tokens.push({kind,id,value,label});
      if (text) add("text","text",text,`Search: ${text}`);
      for (const id of groups){
        add("group","group",id,`Group: ${getProjectGroups(project).find(group=>group.id===id)?.name||id}`);
      }
      for (const id of tags){
        add("tag","tags",id,`Tag: ${id===NONE?"No tags":project.tags?.find(tag=>tag.id===id)?.name||id}`);
      }
      for (const [id,selection] of fields){
        const field=project.fields.find(candidate=>candidate.id===id);
        const values=Array.isArray(selection)?selection:[selection];
        values.filter(value=>value&&value!=="__all__").forEach(value=>{
          const option=fieldFilterOptions(project,field)
            .find(candidate=>candidate.value===String(value));
          const label=option?.label||(value===NONE?`No ${field?.label||"value"}`:value);
          add("field",id,String(value),`${field?.label||id}: ${label}`);
        });
      }
      for (const [columnId,selection] of columns){
        [...selection].forEach(value=>add("column",columnId,String(value),
          columnFilterLabel?.(project,columnId,String(value))||`${columnId}: ${value}`));
      }
      return tokens;
    }

    function suggestions(project,query){
      const options=[];
      const add=(kind,id,value,label,color="",extra={})=>options.push({kind,id,value:String(value),label,color,...extra});
      const projectFields=project.fields.filter(field=>field.type!=="tags");
      const needle=query.trim().toLowerCase();
      const match=(value,label)=>!needle||`${value} ${label}`.toLowerCase().includes(needle);
      const isSelected=(kind,id,value)=>{
        if (kind==="tag") return tags.has(String(value));
        if (kind==="group") return groups.has(String(value));
        if (kind==="field"){
          const selected=fields.get(id);
          const selectedValues=Array.isArray(selected)?selected:selected==null?[]:[selected];
          return selectedValues.some(item=>item!=null&&String(item)===String(value));
        }
        return false;
      };
      const addIfUnselected=(kind,id,value,label,color="")=>{
        if (!isSelected(kind,id,value)) add(kind,id,value,label,color);
      };
      const addOperators=filter=>{
        const operators=[
          {prefix:"tag",label:"Tag",description:"Filter by a project tag"},
          {prefix:"group",label:"Group",description:"Filter by a group"},
          {prefix:"is",label:"Is",description:"Filter by completion state"},
          ...projectFields.map(field=>({
            prefix:field.label.toLowerCase(),label:field.label,description:`Filter by ${field.label.toLowerCase()}`
          }))
        ];
        return operators.filter(option=>match(option.prefix,option.label)&&
          (!filter||option.prefix.toLowerCase().startsWith(filter.toLowerCase())))
          .map(option=>({kind:"operator",id:"",value:option.prefix,label:option.label,
            detail:option.description,color:""}));
      };
      const filterQuery=query.match(/^([^:]+):\s*(.*)$/);
      if (!filterQuery){
        if (!query.trim()) return addOperators("");
        options.push(...addOperators(query.trim()));
        projectTagOptions(project).forEach(option=>
          addIfUnselected("tag","tags",option.value,option.label,option.color||""));
        getProjectGroups(project).forEach(group=>addIfUnselected("group","group",group.id,group.name));
        projectFields.forEach(field=>{
          fieldFilterOptions(project,field).forEach(option=>
            addIfUnselected("field",field.id,option.value,option.label,option.color||""));
        });
        return options.filter(option=>match(option.value,option.label)).slice(0,12);
      }

      const prefix=filterQuery[1].trim().toLowerCase();
      const valueQuery=filterQuery[2].trim();
      if ("tag".startsWith(prefix)||"tags".startsWith(prefix)||"label".startsWith(prefix)){
        projectTagOptions(project).forEach(option=>
          addIfUnselected("tag","tags",option.value,option.label,option.color||""));
      } else if ("group".startsWith(prefix)){
        getProjectGroups(project).forEach(group=>addIfUnselected("group","group",group.id,group.name));
      } else if ("is".startsWith(prefix)){
        add("completion","is","open","Open");
        add("completion","is","completed","Completed");
      } else {
        const field=projectFields.find(candidate=>candidate.label.toLowerCase()===prefix);
        if (!field) return addOperators(prefix);
        const kind=fieldTypes.getFilter(field)?.kind;
        if (["text","number","date"].includes(kind)){
          if (valueQuery) addIfUnselected("field",field.id,valueQuery,valueQuery);
        } else {
          fieldFilterOptions(project,field).forEach(option=>
            addIfUnselected("field",field.id,option.value,option.label,option.color||""));
        }
      }
      const valueNeedle=valueQuery.toLowerCase();
      return options.filter(option=>!valueNeedle||
        `${option.value} ${option.label}`.toLowerCase().includes(valueNeedle)).slice(0,12);
    }

    function addSuggestion(suggestion){
      if (suggestion.kind==="operator"){
        const input=inputElement();
        input.value=`${suggestion.value}:`;
        suggestionIndex=-1;
        suggestionsOpen=true;
        input.dispatchEvent(new global.Event("input",{bubbles:true}));
        input.focus();
        return;
      }
      if (suggestion.kind==="completion") completion=suggestion.value;
      else if (suggestion.kind==="group") groups.add(suggestion.value);
      else if (suggestion.kind==="tag"){
        if (suggestion.value===NONE){
          tags.clear();
          tags.add(NONE);
        } else {
          tags.delete(NONE);
          tags.add(suggestion.value);
        }
      }
      else {
        const field=getProject(getActiveProjectId())?.fields.find(candidate=>candidate.id===suggestion.id);
        if (fieldTypes.getFilter(field)?.kind==="text") fields.set(suggestion.id,suggestion.value);
        else {
          const current=fields.get(suggestion.id);
          const selected=new Set(Array.isArray(current)?current:current&&current!=="__all__"?[current]:[]);
          selected.add(suggestion.value);
          fields.set(suggestion.id,[...selected]);
        }
      }
      inputElement().value="";
      suggestionIndex=-1;
      suggestionsOpen=true;
      persistActive();
      render();
      inputElement().focus();
      renderBar(getProject(getActiveProjectId()));
    }

    function removeToken(token){
      if (token.kind==="text") text="";
      else if (token.kind==="group") groups.delete(token.value);
      else if (token.kind==="tag") tags.delete(token.value);
      else if (token.kind==="field"){
        const values=fields.get(token.id);
        if (Array.isArray(values)){
          const remaining=values.filter(value=>String(value)!==token.value);
          if (remaining.length) fields.set(token.id,remaining);
          else fields.delete(token.id);
        } else fields.delete(token.id);
      } else {
        const selected=columns.get(token.id);
        selected?.delete(token.value);
        if (!selected?.size) columns.delete(token.id);
      }
      persistActive();
      render();
      renderBar(getProject(getActiveProjectId()));
    }

    function inputElement(){ return documentRef.getElementById("filterInput"); }

    function positionSuggestionsAtCaret(input,suggestionsWrap){
      const wrapper=input.closest(".filterBarInputWrap");
      const inputRect=input.getBoundingClientRect();
      const wrapperRect=wrapper.getBoundingClientRect();
      const inputStyle=global.getComputedStyle(input);
      const context=documentRef.createElement("canvas").getContext("2d");
      context.font=inputStyle.font;
      const caret=input.selectionStart??input.value.length;
      const textWidth=context.measureText(input.value.slice(0,caret)).width;
      const caretX=inputRect.left+parseFloat(inputStyle.paddingLeft)+textWidth-(input.scrollLeft||0);
      const maximumWidth=Math.min(420,global.innerWidth-40);
      const width=Math.min(maximumWidth,Math.max(180,global.innerWidth-caretX-20));
      const maximumLeft=global.innerWidth-wrapperRect.left-width-20;
      const left=Math.max(0,Math.min(caretX-wrapperRect.left,maximumLeft));
      suggestionsWrap.style.width=`${width}px`;
      suggestionsWrap.style.left=`${left}px`;
    }

    function renderBar(project){
      if (!project) return;
      const tokenWrap=documentRef.getElementById("filterTokens");
      const suggestionsWrap=documentRef.getElementById("filterSuggestions");
      const summary=documentRef.getElementById("filterSummary");
      if (!tokenWrap||!suggestionsWrap) return;
      const tokens=tokenList(project);
      tokenWrap.innerHTML=tokens.map((token,index)=>{
        const separator=token.label.indexOf(":");
        const prefix=separator<0?"":token.label.slice(0,separator+1);
        const value=separator<0?token.label:token.label.slice(separator+1).trim();
        return `<button type="button" class="filterToken" data-filter-token="${index}" aria-label="Remove ${escapeHtml(token.label)}">${prefix?`<span class="filterTokenPrefix">${escapeHtml(prefix)}</span>`:""}<span class="filterTokenValue">${escapeHtml(value)}</span><span class="filterTokenRemove" aria-hidden="true">×</span></button>`;
      }).join("");
      if (summary) summary.textContent=tokens.length?`${tokens.length} filter${tokens.length===1?"":"s"} applied`:"";
      tokenWrap.querySelectorAll("[data-filter-token]").forEach(button=>{
        button.onclick=()=>removeToken(tokens[Number(button.dataset.filterToken)]);
      });
      const input=inputElement();
      const choices=suggestions(project,input.value);
      suggestionsWrap.innerHTML=choices.map((choice,index)=>
        `<button type="button" class="filterSuggestion${choice.kind==="operator"?" filterSuggestionOperator":""}${index===suggestionIndex?" active":""}" role="option" aria-selected="${index===suggestionIndex}" data-suggestion="${index}">${choice.color?`<span class="filterSuggestionDot" style="--tag-color:${escapeHtml(choice.color)}"></span>`:""}<span class="filterSuggestionText">${escapeHtml(choice.label)}</span>${choice.kind==="operator"?`<span class="filterSuggestionSyntax">${escapeHtml(choice.value.toLowerCase())}:</span>`:choice.detail?`<span class="filterSuggestionDetail">${escapeHtml(choice.detail)}</span>`:""}</button>`
      ).join("")+(input.value.trim()&&!input.value.includes(":")?`<button type="button" class="filterSuggestion filterSuggestionSearch" role="option" data-filter-search><span class="filterSuggestionText">Search for “${escapeHtml(input.value.trim())}”</span><span class="filterSuggestionDetail">Full-text search</span></button>`:"");
      suggestionsWrap.hidden=!suggestionsOpen||(!choices.length&&!input.value.trim());
      if (!suggestionsWrap.hidden) positionSuggestionsAtCaret(input,suggestionsWrap);
      input.setAttribute("aria-expanded",String(!suggestionsWrap.hidden));
      suggestionsWrap.querySelectorAll("[data-suggestion]").forEach(button=>{
        button.onclick=event=>{
          event.stopPropagation();
          addSuggestion(choices[Number(button.dataset.suggestion)]);
        };
      });
      suggestionsWrap.querySelector("[data-filter-search]")?.addEventListener("click",()=>{
        suggestionsOpen=false;
        text=input.value.trim();
        input.value="";
        suggestionsWrap.hidden=true;
        persistActive();
        render();
        renderBar(getProject(getActiveProjectId()));
        input.focus();
      });
    }

    function wire(){
      const input=inputElement();
      documentRef.getElementById("filterSuggestions").addEventListener("mousedown",event=>{
        if (event.target.closest("button")) event.preventDefault();
      });
      input.addEventListener("input",()=>{
        suggestionIndex=-1;
        suggestionsOpen=true;
        renderBar(getProject(getActiveProjectId()));
        if (input.value.trim()) documentRef.getElementById("filterSuggestions").hidden=false;
      });
      input.addEventListener("focus",()=>{
        suggestionsOpen=true;
        renderBar(getProject(getActiveProjectId()));
      });
      input.addEventListener("keydown",event=>{
        const list=documentRef.getElementById("filterSuggestions");
        const options=[...list.querySelectorAll("[data-suggestion]")];
        if (event.key==="ArrowDown"&&options.length){
          event.preventDefault();
          suggestionIndex=(suggestionIndex+1)%options.length;
          renderBar(getProject(getActiveProjectId()));
        } else if (event.key==="ArrowUp"&&options.length){
          event.preventDefault();
          suggestionIndex=(suggestionIndex-1+options.length)%options.length;
          renderBar(getProject(getActiveProjectId()));
        } else if (event.key==="Enter"){
          event.preventDefault();
          if (suggestionIndex>=0&&options[suggestionIndex]) options[suggestionIndex].click();
          else if (input.value.trim()){
            const project=getProject(getActiveProjectId());
            const typed=input.value.trim();
            const parsed=typed.match(/^([^:]+):\s*(.*)$/);
            const exact=suggestions(project,typed).find(option=>
              option.label.toLowerCase()===typed.toLowerCase()||
              (parsed&&option.value.toLowerCase()===parsed[2].trim().toLowerCase())
            );
            if (exact){
              addSuggestion(exact);
              return;
            }
            if (parsed&&options.length){
              options[0].click();
              return;
            }
            text=input.value.trim();
            input.value="";
            persistActive();
            render();
            renderBar(getProject(getActiveProjectId()));
          }
        } else if (event.key==="Escape"){
          suggestionsOpen=false;
          list.hidden=true;
          input.setAttribute("aria-expanded","false");
        }
      });
      documentRef.addEventListener("click",event=>{
        if (!documentRef.querySelector(".filterBarInputWrap")?.contains(event.target)){
          suggestionsOpen=false;
          documentRef.getElementById("filterSuggestions").hidden=true;
          input.setAttribute("aria-expanded","false");
        }
      });
      documentRef.getElementById("clearBoardFilters").onclick=reset;
    }

    const feature={
      persistActive,
      restore,
      pruneColumns,
      reset,
      matches,
      columnDateKey,
      columnValuesForItem,
      columnSelection,
      setColumnSelection,
      columnFilterOptions,
      applyColumnFilterVisibility,
      wireColumnFilterHeader,
      renderBar,
      tokens:tokenList,
      suggestions,
      wire,
      setText(value){ text=value; },
      setCompletion(value){ completion=value; },
      setGroups(value){ replaceSet(groups,value); },
      setTags(value){ replaceSet(tags,value); },
      setFields(value){ fields=new Map(value); },
      clearPreferences(){
        preferences={};
        columns.clear();
        savePreferences();
      },
      selectionForField(id){ return fields.get(id); }
    };
    Object.defineProperties(feature,{
      text:{get:()=>text},
      groups:{get:()=>groups},
      tags:{get:()=>tags},
      fields:{get:()=>fields},
      columns:{get:()=>columns},
      completion:{get:()=>completion}
    });
    return Object.freeze(feature);
  }

  global.BeforeworkFilters=Object.freeze({create});
})(window);
