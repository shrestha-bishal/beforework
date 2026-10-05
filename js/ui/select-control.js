(function(global){
  "use strict";

  function createSelectControls({documentRef=global.document,windowRef=global}={}){
    const document=documentRef;
    const window=windowRef;

    function positionFloatingSelectMenu(button,menu){
      if (!button?.isConnected || menu.hidden) return;
      const rect=button.getBoundingClientRect();
      const menuMaxHeight=Math.min(360,window.innerHeight-16);
      const naturalHeight=Math.min(menu.scrollHeight,menuMaxHeight);
      const spaceBelow=window.innerHeight-rect.bottom-8;
      const spaceAbove=rect.top-8;
      const placeAbove=spaceBelow<naturalHeight && spaceAbove>spaceBelow;
      const maxHeight=Math.max(40,Math.min(menuMaxHeight,placeAbove?spaceAbove:spaceBelow));
      const requestedWidth=Number(menu.dataset.selectWidth)||rect.width;
      const width=Math.min(requestedWidth,window.innerWidth-16);
      menu.style.maxHeight=`${maxHeight}px`;
      menu.style.width=`${width}px`;
      menu.style.left=`${Math.max(8,Math.min(rect.left,window.innerWidth-width-8))}px`;
      menu.style.top=placeAbove
        ? `${Math.max(8,rect.top-Math.min(naturalHeight,maxHeight)-4)}px`
        : `${rect.bottom+4}px`;
    }

    function openFloatingSelectMenu(button,menu){
      menu._selectHome={parent:menu.parentNode,nextSibling:menu.nextSibling};
      menu._selectAnchor=button;
      document.body.appendChild(menu);
      menu.hidden=false;
      button.setAttribute("aria-expanded","true");
      positionFloatingSelectMenu(button,menu);
    }

    function closeFloatingSelectMenu(menu){
      menu.hidden=true;
      menu._selectAnchor?.setAttribute("aria-expanded","false");
      const home=menu._selectHome;
      if (home?.parent?.isConnected){
        home.parent.insertBefore(menu,home.nextSibling?.parentNode===home.parent?home.nextSibling:null);
      }
      menu._selectAnchor=null;
      menu._selectHome=null;
      menu.style.removeProperty("top");
      menu.style.removeProperty("left");
      menu.style.removeProperty("width");
      menu.style.removeProperty("max-height");
    }

    function repositionFloatingSelectMenus(){
      document.querySelectorAll(".appSelectMenu:not([hidden]),.dialogSelectMenu:not([hidden])").forEach(menu=>{
        positionFloatingSelectMenu(menu._selectAnchor,menu);
      });
    }

    function enhanceSelectControl(select){
      if (select.dataset.appSelectEnhanced || (!select.options.length && select.dataset.appSelectEnhanceEmpty!=="true")) return;
      const isMultiple=select.multiple;
      select.dataset.appSelectEnhanced="true";
      const wrapper=document.createElement("div");
      wrapper.className=`appSelectWrap ${select.dataset.appSelectWrapClass||""}`.trim();
      const isTableSelect=!!select.closest(".listTable");
      const width=select.getBoundingClientRect().width;
      if (isTableSelect) wrapper.style.width="100%";
      else if (width>0) wrapper.style.width=`${width}px`;
      select.parentNode.insertBefore(wrapper,select);
      wrapper.appendChild(select);
      select.classList.add("appSelectNative");
      const button=document.createElement("button");
      button.type="button";
      button.className=select.dataset.appSelectButtonClass||"appSelectButton";
      button.setAttribute("aria-haspopup","listbox");
      button.setAttribute("aria-expanded","false");
      const buttonLabel=select.dataset.appSelectButtonLabel||select.getAttribute("aria-label");
      if (buttonLabel) button.setAttribute("aria-label",buttonLabel);
      button.title=select.dataset.appSelectButtonTitle??select.dataset.appSelectButtonLabel??select.dataset.appSelectPlaceholder??"";
      const search=document.createElement("input");
      search.type="search";
      search.className="appSelectSearch";
      search.placeholder=select.dataset.appSelectSearchPlaceholder||"Search options";
      search.setAttribute("aria-label",select.dataset.appSelectSearchPlaceholder||"Search options");
      const label=document.createElement("span");
      const chevron=document.createElement("iconify-icon");
      chevron.setAttribute("icon",select.dataset.appSelectButtonIcon||select.dataset.appSelectIcon||"mdi:chevron-down");
      chevron.setAttribute("aria-hidden","true");
      button.append(label,chevron);
      const menu=document.createElement("div");
      menu.className="appSelectMenu";
      menu.hidden=true;
      if (select.dataset.appSelectMenuWidth) menu.dataset.selectWidth=select.dataset.appSelectMenuWidth;
      const menuTitle=select.dataset.appSelectMenuTitle?document.createElement("strong"):null;
      if (menuTitle){
        menuTitle.className="appSelectMenuTitle";
        menuTitle.textContent=select.dataset.appSelectMenuTitle;
      }
      const optionList=document.createElement("div");
      optionList.className="appSelectOptions";
      optionList.setAttribute("role","listbox");
      if (isMultiple) optionList.setAttribute("aria-multiselectable","true");
      const emptyState=document.createElement("div");
      emptyState.className="appSelectEmpty";
      emptyState.textContent="No options found";
      emptyState.hidden=true;
      let nativeOptions=[];
      let options=[];
      menu.append(...(menuTitle?[menuTitle]:[]),search,optionList,emptyState);
      wrapper.append(button,menu);
      const filterOptions=()=>{
        const query=search.value.trim().toLocaleLowerCase();
        let visibleCount=0;
        options.forEach(option=>{
          const matches=option.textContent.toLocaleLowerCase().includes(query);
          option.hidden=!matches;
          if (matches) visibleCount++;
        });
        emptyState.textContent=nativeOptions.length===0
          ? select.dataset.appSelectEmptyLabel||"No options found"
          : "No options found";
        emptyState.hidden=visibleCount>0;
        optionList.hidden=visibleCount===0;
      };
      const sync=()=>{
        if (select.dataset.appSelectButtonLabel){
          label.textContent=select.dataset.appSelectButtonLabel;
        }else if (isMultiple){
          const selected=nativeOptions.filter(option=>option.selected);
          label.textContent=selected.map(option=>option.textContent).join(", ")||select.dataset.appSelectPlaceholder||"Select options";
        }else{
          const selected=nativeOptions[select.selectedIndex]||nativeOptions[0];
          label.textContent=selected.textContent;
        }
        options.forEach(option=>{
          const nativeOption=nativeOptions[Number(option.dataset.index)];
          const active=isMultiple ? nativeOption.selected : nativeOption===nativeOptions[select.selectedIndex];
          option.classList.toggle("selected",active);
          option.setAttribute("aria-selected",String(active));
        });
      };
      const refreshOptions=()=>{
        nativeOptions=[...select.options];
        optionList.replaceChildren();
        options=nativeOptions.map((option,index)=>{
          const item=document.createElement("button");
          item.type="button";
          item.className="appSelectOption";
          item.setAttribute("role","option");
          item.dataset.value=option.value;
          item.dataset.index=String(index);
          item.dataset.order=String(index);
          item.textContent=option.textContent;
          item.onclick=()=>{
            const nativeOption=nativeOptions[Number(item.dataset.index)];
            if (isMultiple) nativeOption.selected=!nativeOption.selected;
            else select.value=item.dataset.value;
            select.dispatchEvent(new Event("change",{bubbles:true}));
            sync();
            if (!isMultiple){ close(); button.focus(); }
          };
          optionList.appendChild(item);
          return item;
        });
        sync();
      };
      const close=()=>closeFloatingSelectMenu(menu);
      const open=()=>{
        refreshOptions();
        search.value="";
        filterOptions();
        openFloatingSelectMenu(button,menu);
        search.focus();
      };
      button.onclick=event=>{ event.stopPropagation(); menu.hidden ? open() : close(); };
      button.onkeydown=event=>{
        if (event.key==="ArrowDown" || event.key==="Enter" || event.key===" "){ event.preventDefault(); open(); }
      };
      search.addEventListener("input",filterOptions);
      menu.onkeydown=event=>{
        const visibleOptions=options.filter(option=>!option.hidden);
        const current=visibleOptions.indexOf(document.activeElement);
        if (event.key==="ArrowDown"){
          event.preventDefault();
          visibleOptions[current<0?0:Math.min(visibleOptions.length-1,current+1)]?.focus();
        }
        if (event.key==="ArrowUp"){
          event.preventDefault();
          visibleOptions[current<0?visibleOptions.length-1:Math.max(0,current-1)]?.focus();
        }
        if (event.key==="Escape"){ event.preventDefault(); close(); button.focus(); }
      };
      select.addEventListener("change",sync);
      refreshOptions();
    }

    function enhanceSelectControls(root=document){
      if (root.matches?.("select:not([data-app-select-enhanced])")) enhanceSelectControl(root);
      root.querySelectorAll("select:not([data-app-select-enhanced])").forEach(enhanceSelectControl);
    }

    return Object.freeze({
      positionFloatingSelectMenu,
      openFloatingSelectMenu,
      closeFloatingSelectMenu,
      repositionFloatingSelectMenus,
      enhanceSelectControl,
      enhanceSelectControls
    });
  }

  global.BeforeworkSelectControl=Object.freeze({create:createSelectControls});
})(window);
