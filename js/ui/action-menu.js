(function(global){
  "use strict";

  const managers=new WeakMap();

  function createActionMenu({documentRef=global.document}={}){
    if (managers.has(documentRef)) return managers.get(documentRef);

    const openMenus=new Set();
    const buttonMenus=new WeakMap();
    let nextMenuId=0;

    function menuItems(menu){
      return [...menu.querySelectorAll('[role="menuitem"],button:not(:disabled)')]
        .filter((item,index,items)=>items.indexOf(item)===index&&!item.hidden);
    }

    function close(menu,{restoreFocus=false}={}){
      const button=menu?.__actionMenuButton;
      if (!menu || !button) return;
      menu.classList.remove("open");
      openMenus.delete(menu);
      menu.hidden=true;
      button.classList.remove("active");
      button.setAttribute("aria-expanded","false");
      if (restoreFocus) button.focus();
    }

    function closeAll(except=null){
      openMenus.forEach(menu=>{
        if (menu!==except) close(menu);
      });
    }

    function open(menu){
      if (!menu || !menu.__actionMenuButton) return;
      closeAll(menu);
      menu.hidden=false;
      menu.classList.add("open");
      openMenus.add(menu);
      menu.__actionMenuButton.classList.add("active");
      menu.__actionMenuButton.setAttribute("aria-expanded","true");
    }

    function toggle(menu){
      if (!menu) return;
      if (menu.hidden || !menu.classList.contains("open")){
        open(menu);
        menuItems(menu)[0]?.focus();
      } else {
        close(menu);
      }
    }

    function register(button,menu,{styleTrigger=true}={}){
      if (!button || !menu) throw new TypeError("An action menu requires a button and menu element.");
      if (buttonMenus.has(button)) return buttonMenus.get(button);
      closeAll();

      if (!menu.id){
        let id;
        do { id=`action-menu-${++nextMenuId}`; }
        while (documentRef.getElementById?.(id));
        menu.id=id;
      }
      if (styleTrigger) button.classList.add("action-menu__trigger");
      button.dataset.actionMenuTrigger="true";
      button.setAttribute("aria-haspopup","menu");
      button.setAttribute("aria-controls",menu.id);
      if (!button.hasAttribute("aria-expanded")) button.setAttribute("aria-expanded","false");
      menu.classList.add("menu");
      menu.classList.add("action-menu");
      menu.setAttribute("role","menu");
      menu.querySelectorAll("button").forEach(item=>{
        item.classList.add("menu-item");
        if (item.classList.contains("danger")) item.classList.add("menu-item--danger");
        if (!item.hasAttribute("role")) item.setAttribute("role","menuitem");
      });
      menu.__actionMenuButton=button;
      if (!menu.classList.contains("open")) menu.hidden=true;

      const controller=Object.freeze({
        open:()=>open(menu),
        close:options=>close(menu,options),
        toggle:()=>toggle(menu)
      });
      buttonMenus.set(button,controller);
      return controller;
    }

    documentRef.addEventListener("click",event=>{
      const trigger=event.target.closest?.("[data-action-menu-trigger]");
      if (trigger){
        const controller=buttonMenus.get(trigger);
        if (controller) controller.toggle();
        event.stopPropagation();
        return;
      }

      const activeMenu=[...openMenus].find(menu=>menu.classList.contains("open"));
      if (!activeMenu) return;
      if (activeMenu.contains(event.target)){
        const item=event.target.closest?.('[role="menuitem"],button');
        if (item && !item.hasAttribute("data-action-menu-stay-open")) close(activeMenu,{restoreFocus:true});
      } else {
        closeAll();
      }
    },true);

    documentRef.addEventListener("keydown",event=>{
      const menu=[...openMenus].find(candidate=>candidate.classList.contains("open"));
      if (!menu) return;
      const button=menu.__actionMenuButton;
      if (event.key==="Escape"){
        close(menu,{restoreFocus:true});
        event.preventDefault();
        return;
      }
      if (event.key==="Tab"){
        close(menu,{restoreFocus:true});
        return;
      }
      const items=menuItems(menu);
      if (!items.length) return;
      if (event.target===button && (event.key==="ArrowDown"||event.key==="ArrowUp")){
        items[event.key==="ArrowDown"?0:items.length-1].focus();
        event.preventDefault();
        return;
      }
      const currentIndex=items.indexOf(documentRef.activeElement);
      if (currentIndex<0) return;
      let nextIndex;
      if (event.key==="ArrowDown") nextIndex=(currentIndex+1)%items.length;
      else if (event.key==="ArrowUp") nextIndex=(currentIndex-1+items.length)%items.length;
      else if (event.key==="Home") nextIndex=0;
      else if (event.key==="End") nextIndex=items.length-1;
      else return;
      items[nextIndex].focus();
      event.preventDefault();
    });

    const manager=Object.freeze({register,close,closeAll});
    managers.set(documentRef,manager);
    return manager;
  }

  global.BeforeworkActionMenu=Object.freeze({create:createActionMenu});
})(window);
