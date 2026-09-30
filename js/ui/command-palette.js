(function(global){
  "use strict";

  const RECENTS_KEY = "beforework_command_recents_v1";
  const MAX_RESULTS = 24;
  const MAX_RECENTS = 6;

  function normalize(value){
    return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  }
  function subsequenceScore(query,target){
    let queryIndex = 0;
    let previousIndex = -2;
    let score = 55;
    for (let targetIndex=0; targetIndex<target.length && queryIndex<query.length; targetIndex++){
      if (target[targetIndex]!==query[queryIndex]) continue;
      score += previousIndex===targetIndex-1 ? 7 : -Math.min(8,targetIndex-previousIndex-1);
      if (targetIndex===0 || /[\s/-]/.test(target[targetIndex-1])) score += 5;
      previousIndex = targetIndex;
      queryIndex++;
    }
    return queryIndex===query.length ? score-previousIndex*0.05 : Number.NEGATIVE_INFINITY;
  }
  function fuzzyScore(query,text){
    const queryTokens = normalize(query).trim().split(/\s+/).filter(Boolean);
    if (!queryTokens.length) return 0;
    const target = normalize(text);
    if (!target) return Number.NEGATIVE_INFINITY;
    let total = 0;
    for (const token of queryTokens){
      const index = target.indexOf(token);
      const tokenScore = index>=0
        ? 100-index*0.2+(index===0 || /[\s/-]/.test(target[index-1]) ? 14 : 0)
        : token.length>=3 ? subsequenceScore(token,target) : Number.NEGATIVE_INFINITY;
      if (!Number.isFinite(tokenScore)) return Number.NEGATIVE_INFINITY;
      total += tokenScore;
    }
    return total;
  }
  function createSearchIndex(commands){
    const postings = new Map();
    commands.forEach((command,index)=>{
      const text=normalize([command.title,command.subtitle,command.category,command.keywords].filter(Boolean).join(" "));
      for (const character of new Set(text)){
        if (!postings.has(character)) postings.set(character,new Set());
        postings.get(character).add(index);
      }
    });
    return Object.freeze({
      candidates(query){
        const characters=new Set(Array.from(normalize(query).trim().replace(/\s+/g,"")));
        if (!characters.size) return commands.slice();
        const lists=[];
        for (const character of characters){
          const matches=postings.get(character);
          if (!matches) return [];
          lists.push(matches);
        }
        lists.sort((a,b)=>a.size-b.size);
        return [...lists[0]].filter(index=>lists.every(matches=>matches.has(index))).map(index=>commands[index]);
      }
    });
  }
  function createCommandPalette({getCommands, canOpen=()=>true, getInitialQuery=()=>"", onQueryChange=()=>{}, onClose=()=>{}, onTemplateError=error=>console.error(error), cloneTemplate, documentRef=global.document, storage=global.localStorage, platform=global.navigator?.platform||""}){
    const previousFocus = {element:null};
    const keyLabel = /Mac|iPhone|iPad/.test(platform) ? "⌘ K" : "Ctrl K";
    let overlay = null;
    let input = null;
    let results = null;
    let overlayPromise = null;
    let commands = [];
    let commandCache = null;
    let commandSearchIndex = null;
    let rankedResults = [];
    let activeIndex = 0;
    let isOpen = false;
    let isOpening = false;
    let openingQuery = "";
    let openSequence = 0;
    let openPromise = null;

    function ensureOverlay(){
      if (overlay) return Promise.resolve(overlay);
      if (overlayPromise) return overlayPromise;
      overlayPromise=Promise.resolve().then(()=>cloneTemplate()).then(root=>{
        overlay=root;
        overlay.hidden=true;
        input=overlay.querySelector(".commandPaletteInput");
        results=overlay.querySelector(".commandPaletteResults");
        overlay.querySelector("[data-palette-shortcut]").textContent=keyLabel;
        input.addEventListener("input",()=>{ activeIndex=0; onQueryChange(input.value); render(); });
        overlay.addEventListener("click",event=>{ if (event.target===overlay) close(); });
        documentRef.body.appendChild(overlay);
        return overlay;
      }).catch(error=>{
        overlayPromise=null;
        throw error;
      });
      return overlayPromise;
    }

    function readRecents(){
      try{
        const value = JSON.parse(storage?.getItem(RECENTS_KEY)||"[]");
        return Array.isArray(value) ? value.filter(item=>typeof item==="string") : [];
      }catch(err){ return []; }
    }
    function writeRecent(commandId){
      try{
        const next = [commandId,...readRecents().filter(id=>id!==commandId)].slice(0,MAX_RECENTS);
        storage?.setItem(RECENTS_KEY,JSON.stringify(next));
      }catch(err){ /* Recents are optional. */ }
    }
    function availableCommands(){
      if (commandCache) return commandCache;
      commandCache=(getCommands?.()||[]).filter(command=>command && command.id && command.title && typeof command.run==="function");
      commandSearchIndex=createSearchIndex(commandCache);
      return commandCache;
    }
    function rankResults(query){
      commands = availableCommands();
      if (!query.trim()){
        const byId = new Map(commands.map(command=>[command.id,command]));
        const recent = readRecents().map(id=>byId.get(id)).filter(Boolean).map(command=>({...command, resultCategory:"Recent"}));
        const recentIds = new Set(recent.map(command=>command.id));
        const pinned = commands.filter(command=>command.pinned && !recentIds.has(command.id)).map(command=>({...command,resultCategory:command.category||"Actions"}));
        return [...recent,...pinned].slice(0,MAX_RESULTS);
      }
      return commandSearchIndex.candidates(query).map(command=>({
        command,
        score:fuzzyScore(query,[command.title,command.subtitle,command.category,command.keywords].filter(Boolean).join(" "))
      })).filter(result=>Number.isFinite(result.score))
        .sort((a,b)=>b.score-a.score || a.command.title.localeCompare(b.command.title))
        .slice(0,MAX_RESULTS)
        .map(result=>({...result.command,resultCategory:result.command.category||"Results"}));
    }
    function render(){
      rankedResults = rankResults(input.value);
      activeIndex = Math.max(0,Math.min(activeIndex,rankedResults.length-1));
      results.replaceChildren();
      input.removeAttribute("aria-activedescendant");
      if (!rankedResults.length){
        const empty = documentRef.createElement("div");
        empty.className = "commandPaletteEmpty";
        empty.textContent = input.value.trim() ? "No matching commands or workspace items." : "No commands available.";
        results.appendChild(empty);
        return;
      }
      let previousCategory = "";
      rankedResults.forEach((command,index)=>{
        if (command.resultCategory!==previousCategory){
          const heading = documentRef.createElement("div");
          heading.className = "commandPaletteCategory";
          heading.textContent = command.resultCategory;
          results.appendChild(heading);
          previousCategory = command.resultCategory;
        }
        const button = documentRef.createElement("button");
        button.type = "button";
        button.className = "commandPaletteItem";
        button.id = `commandPaletteOption${index}`;
        button.dataset.commandIndex = String(index);
        button.setAttribute("role","option");
        button.setAttribute("aria-selected",String(index===activeIndex));
        if (index===activeIndex){
          button.classList.add("selected");
          input.setAttribute("aria-activedescendant",button.id);
        }
        if (command.icon){
          const icon = documentRef.createElement("iconify-icon");
          icon.setAttribute("icon",command.icon);
          icon.setAttribute("aria-hidden","true");
          button.appendChild(icon);
        }
        const copy = documentRef.createElement("span");
        copy.className = "commandPaletteCopy";
        const title = documentRef.createElement("strong");
        title.textContent = command.title;
        copy.appendChild(title);
        if (command.subtitle){
          const subtitle = documentRef.createElement("small");
          subtitle.textContent = command.subtitle;
          copy.appendChild(subtitle);
        }
        button.appendChild(copy);
        if (command.shortcut){
          const shortcut = documentRef.createElement("kbd");
          shortcut.textContent = command.shortcut;
          button.appendChild(shortcut);
        }
        button.addEventListener("mouseenter",()=>setActive(index));
        button.addEventListener("click",()=>runCommand(index));
        results.appendChild(button);
      });
    }
    function setActive(index){
      if (!rankedResults.length) return;
      activeIndex=(index+rankedResults.length)%rankedResults.length;
      results.querySelectorAll(".commandPaletteItem").forEach(button=>{
        const selected=Number(button.dataset.commandIndex)===activeIndex;
        button.classList.toggle("selected",selected);
        button.setAttribute("aria-selected",String(selected));
      });
      input.setAttribute("aria-activedescendant",`commandPaletteOption${activeIndex}`);
    }
    function runCommand(index){
      const command = rankedResults[index];
      if (!command) return;
      writeRecent(command.id);
      close();
      try{
        const result = command.run();
        if (result && typeof result.catch==="function") result.catch(error=>console.error(error));
      }catch(error){ console.error(error); }
    }
    function moveSelection(offset){
      if (!rankedResults.length) return;
      setActive(activeIndex+offset);
      results.querySelector(`#commandPaletteOption${activeIndex}`)?.scrollIntoView({block:"nearest"});
    }
    function open(initialQuery){
      if (!canOpen()) return Promise.resolve();
      if (isOpen){ input.focus(); return Promise.resolve(); }
      openingQuery=String(initialQuery??getInitialQuery?.()??"");
      if (isOpening) return openPromise;
      const sequence=++openSequence;
      const focusTarget=documentRef.activeElement;
      isOpening=true;
      openPromise=ensureOverlay().then(()=>{
        if (sequence!==openSequence || !canOpen()) return;
        previousFocus.element=focusTarget;
        input.value=openingQuery;
        activeIndex=0;
        overlay.hidden=false;
        isOpen=true;
        render();
        input.focus();
      }).catch(error=>{
        if (sequence===openSequence) onTemplateError(error);
      }).finally(()=>{
        if (sequence===openSequence) isOpening=false;
      });
      return openPromise;
    }
    function refreshCommands(){
      commandCache=null;
      commandSearchIndex=null;
      if (isOpen){ activeIndex=0; render(); }
    }
    function close(){
      openSequence++;
      isOpening=false;
      if (!isOpen) return;
      overlay.hidden=true;
      isOpen=false;
      const focusTarget=previousFocus.element;
      previousFocus.element=null;
      onClose(focusTarget);
      if (focusTarget?.isConnected) focusTarget.focus();
    }
    function onKeydown(event){
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase()==="k"){
        event.preventDefault();
        event.stopPropagation();
        if (isOpen || isOpening) close(); else open();
        return;
      }
      if (!isOpen) return;
      if (event.key==="ArrowDown"){
        event.preventDefault();
        moveSelection(1);
      }else if(event.key==="ArrowUp"){
        event.preventDefault();
        moveSelection(-1);
      }else if(event.key==="Enter"){
        event.preventDefault();
        runCommand(activeIndex);
      }else if(event.key==="Escape"){
        event.preventDefault();
        event.stopPropagation();
        close();
      }
      if (isOpen) event.stopPropagation();
    }
    documentRef.addEventListener("keydown",onKeydown,true);
    return Object.freeze({open,close,isOpen:()=>isOpen,refreshCommands});
  }

  global.BeforeworkCommandPalette = Object.freeze({create:createCommandPalette, fuzzyScore, createSearchIndex});
})(window);
