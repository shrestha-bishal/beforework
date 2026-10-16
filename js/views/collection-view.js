export class CollectionView {
  constructor({cloneTemplate}={}){
    if (typeof cloneTemplate!=="function") throw new TypeError("The collection view requires a template cloner.");
    this.cloneTemplate=cloneTemplate;
    this.pageState=new Map();
  }

  render(board,{key,kind,items,onOpen,onAdd,addLabel,searchLabel,emptyMessage,noResultsMessage,organization}={}){
    if (!key||!kind||!Array.isArray(items)||typeof onOpen!=="function"){
      throw new TypeError("A collection page requires a key, type, item list, and open handler.");
    }
    const saved=this.pageState.get(key)||{query:"",sort:"name-asc",view:"grid",filter:"all"};
    this.pageState.set(key,saved);

    const templates=this.cloneTemplate();
    const page=templates.querySelector(".collectionPage");
    if (!page) throw new Error("The Collection view template is missing its root element.");
    const search=page.querySelector(".collectionPageSearch");
    const sort=page.querySelector(".collectionPageSort");
    const addButton=page.querySelector(".collectionPageAdd");
    const viewControls=page.querySelector(".collectionPageViewControls");
    const itemList=page.querySelector(".collectionPageItems");
    const empty=page.querySelector(".collectionPageEmpty");
    const organizationPanel=page.querySelector(".collectionPageOrganization");
    const filters=page.querySelector(".collectionPageFilters");
    const createFolderButton=page.querySelector(".collectionPageCreateFolder");
    const cardTemplate=templates.querySelector("#collectionPageCardTemplate");
    const newCardTemplate=templates.querySelector("#collectionPageNewCardTemplate");
    const filterTemplate=templates.querySelector("#collectionPageFilterTemplate");
    const groupTemplate=templates.querySelector("#collectionPageGroupTemplate");
    const viewButtons=[...page.querySelectorAll("[data-collection-view]")];
    if (!search||!sort||!addButton||!viewControls||!itemList||!empty||!organizationPanel||!filters||!createFolderButton
      ||!cardTemplate?.content?.firstElementChild||!newCardTemplate?.content?.firstElementChild
      ||!filterTemplate?.content?.firstElementChild||!groupTemplate?.content?.firstElementChild||viewButtons.length!==2){
      throw new Error("The Collection view template is missing required controls.");
    }
    page.dataset.collectionKind=kind;
    if (kind==="projects") saved.view="grid";
    search.value=saved.query;
    search.placeholder=searchLabel;
    search.setAttribute("aria-label",searchLabel);
    sort.value=saved.sort;
    addButton.hidden=typeof onAdd!=="function";
    addButton.textContent=addLabel||"Create";
    addButton.onclick=onAdd||null;
    organizationPanel.hidden=!organization;
    createFolderButton.hidden=!organization||typeof organization.onCreateFolder!=="function";
    createFolderButton.onclick=organization?.onCreateFolder||null;
    const organizationFilters=organization?[
      {id:"all",label:`All ${organization.collectionLabel||"items"}`},
      {id:"pinned",label:"Pinned"},
      ...(organization.folders||[]).map(folder=>({id:`folder:${folder.id}`,label:folder.name})),
      {id:"unfiled",label:"Unfiled"}
    ]:[];
    if (!organizationFilters.some(filter=>filter.id===saved.filter)) saved.filter="all";
    filters.replaceChildren();
    organizationFilters.forEach(filter=>{
      const button=filterTemplate.content.firstElementChild.cloneNode(true);
      button.textContent=filter.label;
      button.dataset.collectionFilter=filter.id;
      button.setAttribute("aria-pressed",String(filter.id===saved.filter));
      button.onclick=()=>{
        saved.filter=filter.id;
        updateItemList();
        updateFilterButtons();
      };
      filters.appendChild(button);
    });
    empty.hidden=true;

    function updateFilterButtons(){
      [...filters.children].forEach(button=>{
        const selected=button.dataset.collectionFilter===saved.filter;
        button.setAttribute("aria-pressed",String(selected));
        button.classList.toggle("selected",selected);
      });
    }

    function updateViewControls(){
      viewControls.hidden=kind==="projects";
      itemList.classList.toggle("collectionPageItems--list",saved.view==="list");
      addButton.hidden=typeof onAdd!=="function"||saved.view==="grid";
      viewButtons.forEach(button=>{
        const selected=button.dataset.collectionView===saved.view;
        button.setAttribute("aria-pressed",String(selected));
        button.classList.toggle("selected",selected);
      });
    }

    let openActionMenu=null;
    function updateItemList(){
      openActionMenu=null;
      itemList.replaceChildren();
      const query=saved.query.trim().toLocaleLowerCase();
      const matching=items.filter(item=>
        `${item.title||""} ${item.description||""} ${item.meta||""}`.toLocaleLowerCase().includes(query)
      ).sort((first,second)=>{
        const comparison=String(first.title||"").localeCompare(String(second.title||""),undefined,{sensitivity:"base"});
        if (saved.sort==="updated-desc") return (second.updatedAt||0)-(first.updatedAt||0)||comparison;
        return saved.sort==="name-desc"?-comparison:comparison;
      });
      let filtered=matching;
      if (organization){
        if (saved.filter==="pinned") filtered=matching.filter(item=>item.pinned);
        else if (saved.filter==="unfiled") filtered=matching.filter(item=>!item.folderId&&!item.pinned);
        else if (saved.filter.startsWith("folder:")){
          const folderId=saved.filter.slice("folder:".length);
          filtered=matching.filter(item=>item.folderId===folderId);
        }
      }
      const groups=[];
      if (organization&&saved.filter==="all"){
        const pinned=filtered.filter(item=>item.pinned);
        if (pinned.length) groups.push({label:"Pinned",items:pinned});
        (organization.folders||[]).forEach(folder=>{
          const folderItems=filtered.filter(item=>!item.pinned&&item.folderId===folder.id);
          if (folderItems.length) groups.push({label:folder.name,items:folderItems});
        });
        const unfiled=filtered.filter(item=>!item.pinned&&!item.folderId);
        if (unfiled.length) groups.push({label:"Unfiled",items:unfiled});
      }else groups.push({label:"",items:filtered});
      const closeActionMenu=()=>{
        if (!openActionMenu) return;
        openActionMenu.menu.hidden=true;
        openActionMenu.toggle.setAttribute("aria-expanded","false");
        openActionMenu=null;
      };
      const appendCard=item=>{
        const entry=cardTemplate.content.firstElementChild.cloneNode(true);
        const card=entry.querySelector(".collectionPageCard");
        const actionToggle=entry.querySelector(".collectionPageActionToggle");
        const actionMenu=entry.querySelector(".collectionPageActionMenu");
        const pinAction=entry.querySelector('[data-collection-action="pin"]');
        const moveAction=entry.querySelector('[data-collection-action="move"]');
        card.title=`Open ${item.title}`;
        const icon=card.querySelector(".collectionPageIcon");
        icon.hidden=true;
        icon.setAttribute("icon",item.icon);
        card.querySelector(".collectionPageName").textContent=item.title;
        const projectDot=card.querySelector(".collectionPageProjectDot");
        projectDot.hidden=false;
        const cardHeader=card.querySelector(".collectionPageCardHeader");
        cardHeader.classList.toggle("collectionPageCardHeader--collection",true);
        const badge=card.querySelector(".collectionPageBadge");
        badge.hidden=!item.badge;
        badge.textContent=item.badge||"";
        const description=card.querySelector(".collectionPageDescription");
        description.hidden=!item.description;
        description.textContent=item.description||"";
        const meta=card.querySelector(".collectionPageMeta");
        meta.hidden=!item.meta;
        meta.textContent=item.meta||"";
        const projectStatus=card.querySelector(".collectionPageProjectStatus");
        projectStatus.hidden=kind!=="projects";
        projectStatus.textContent=item.projectStatus||"";
        if (item.projectStatus) projectStatus.dataset.status=item.projectStatus.toLocaleLowerCase().replaceAll(" ","-");
        const progress=card.querySelector(".collectionPageProgress");
        progress.hidden=kind!=="projects";
        if (kind==="projects"){
          const percentage=Math.max(0,Math.min(100,Number(item.progress)||0));
          const progressLabel=progress.querySelector(".collectionPageProgressHeader strong");
          const progressBar=progress.querySelector(".collectionPageProgressTrack");
          const progressFill=progress.querySelector(".collectionPageProgressFill");
          progressLabel.textContent=`${percentage}%`;
          progressBar.setAttribute("aria-valuenow",String(percentage));
          progressBar.setAttribute("aria-label",`${item.title} completion`);
          progressFill.style.width=`${percentage}%`;
        }
        card.onclick=()=>onOpen(item.id);
        entry.querySelector(".collectionPageCardActions").hidden=!organization;
        pinAction.hidden=!organization||typeof organization.onTogglePin!=="function";
        pinAction.textContent=item.pinned?"Unpin":"Pin";
        pinAction.onclick=()=>{
          closeActionMenu();
          organization.onTogglePin(item.id);
        };
        moveAction.hidden=!organization||typeof organization.onMove!=="function";
        moveAction.onclick=()=>{
          closeActionMenu();
          organization.onMove(item.id);
        };
        actionToggle.onclick=()=>{
          if (openActionMenu?.menu===actionMenu){
            closeActionMenu();
          }else{
            closeActionMenu();
            actionMenu.hidden=false;
            actionToggle.setAttribute("aria-expanded","true");
            openActionMenu={menu:actionMenu,toggle:actionToggle};
          }
        };
        itemList.appendChild(entry);
      };
      groups.forEach(group=>{
        if (group.label){
          const heading=groupTemplate.content.firstElementChild.cloneNode(true);
          heading.textContent=group.label;
          itemList.appendChild(heading);
        }
        group.items.forEach(appendCard);
      });
      const showCreateCard=typeof onAdd==="function"&&saved.view==="grid"&&!query
        &&(!organization||saved.filter==="all"||saved.filter==="unfiled");
      if (showCreateCard){
        const createLabel=addLabel||"Create";
        const entityName=createLabel.replace(/^(New|Add)\s+/i,"").toLocaleLowerCase();
        const newCard=newCardTemplate.content.firstElementChild.cloneNode(true);
        newCard.querySelector(".collectionPageNewCardLabel").textContent=createLabel;
        newCard.querySelector(".collectionPageNewCardHint").textContent=`Create a ${entityName}`;
        newCard.title=createLabel;
        newCard.onclick=onAdd;
        itemList.appendChild(newCard);
      }
      empty.hidden=filtered.length>0||showCreateCard;
      let currentEmptyMessage=emptyMessage;
      if (organization&&!query){
        const collectionLabel=organization.collectionLabel||"items";
        if (saved.filter==="pinned") currentEmptyMessage=`No pinned ${collectionLabel} yet.`;
        else if (saved.filter==="unfiled") currentEmptyMessage=`No unfiled ${collectionLabel} yet.`;
        else if (saved.filter.startsWith("folder:")){
          const folder=(organization.folders||[]).find(candidate=>candidate.id===saved.filter.slice("folder:".length));
          currentEmptyMessage=`No ${collectionLabel} in ${folder?.name||"this folder"} yet.`;
        }
      }
      empty.textContent=filtered.length?"" : query?noResultsMessage:currentEmptyMessage;
      updateFilterButtons();
    }

    search.addEventListener("input",()=>{
      saved.query=search.value;
      updateItemList();
    });
    sort.addEventListener("change",()=>{
      saved.sort=sort.value;
      updateItemList();
    });
    if (kind!=="projects"){
      viewButtons.forEach(button=>button.addEventListener("click",()=>{
        saved.view=button.dataset.collectionView;
        updateViewControls();
        updateItemList();
      }));
    }
    updateViewControls();
    updateItemList();
    board.appendChild(page);
  }
}
