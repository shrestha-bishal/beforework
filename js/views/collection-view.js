export class CollectionView {
  constructor({cloneTemplate}={}){
    if (typeof cloneTemplate!=="function") throw new TypeError("The collection view requires a template cloner.");
    this.cloneTemplate=cloneTemplate;
    this.pageState=new Map();
  }

  render(board,{key,kind,items,onOpen,onAdd,addLabel,searchLabel,emptyMessage,noResultsMessage}={}){
    if (!key||!kind||!Array.isArray(items)||typeof onOpen!=="function"){
      throw new TypeError("A collection page requires a key, type, item list, and open handler.");
    }
    const saved=this.pageState.get(key)||{query:"",sort:"name-asc",view:"grid"};
    this.pageState.set(key,saved);

    const templates=this.cloneTemplate();
    const page=templates.querySelector(".collectionPage");
    if (!page) throw new Error("The Collection view template is missing its root element.");
    const search=page.querySelector(".collectionPageSearch");
    const sort=page.querySelector(".collectionPageSort");
    const addButton=page.querySelector(".collectionPageAdd");
    const itemList=page.querySelector(".collectionPageItems");
    const empty=page.querySelector(".collectionPageEmpty");
    const cardTemplate=templates.querySelector("#collectionPageCardTemplate");
    const newCardTemplate=templates.querySelector("#collectionPageNewCardTemplate");
    const viewButtons=[...page.querySelectorAll("[data-collection-view]")];
    if (!search||!sort||!addButton||!itemList||!empty||!cardTemplate?.content?.firstElementChild
      ||!newCardTemplate?.content?.firstElementChild||viewButtons.length!==2){
      throw new Error("The Collection view template is missing required controls.");
    }
    page.dataset.collectionKind=kind;
    search.value=saved.query;
    search.placeholder=searchLabel;
    search.setAttribute("aria-label",searchLabel);
    sort.value=saved.sort;
    addButton.hidden=typeof onAdd!=="function";
    addButton.textContent=addLabel||"Create";
    addButton.onclick=onAdd||null;
    empty.hidden=true;

    function updateViewControls(){
      itemList.classList.toggle("collectionPageItems--list",saved.view==="list");
      addButton.hidden=typeof onAdd!=="function"||saved.view==="grid";
      viewButtons.forEach(button=>{
        const selected=button.dataset.collectionView===saved.view;
        button.setAttribute("aria-pressed",String(selected));
        button.classList.toggle("selected",selected);
      });
    }

    function updateItemList(){
      itemList.replaceChildren();
      const query=saved.query.trim().toLocaleLowerCase();
      const matching=items.filter(item=>
        `${item.title||""} ${item.description||""} ${item.meta||""}`.toLocaleLowerCase().includes(query)
      ).sort((first,second)=>{
        const comparison=String(first.title||"").localeCompare(String(second.title||""),undefined,{sensitivity:"base"});
        if (saved.sort==="updated-desc") return (second.updatedAt||0)-(first.updatedAt||0)||comparison;
        return saved.sort==="name-desc"?-comparison:comparison;
      });
      matching.forEach(item=>{
        const card=cardTemplate.content.firstElementChild.cloneNode(true);
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
        itemList.appendChild(card);
      });
      const showCreateCard=typeof onAdd==="function"&&saved.view==="grid"&&!query;
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
      empty.hidden=matching.length>0||showCreateCard;
      empty.textContent=matching.length?"" : query?noResultsMessage:emptyMessage;
    }

    search.addEventListener("input",()=>{
      saved.query=search.value;
      updateItemList();
    });
    sort.addEventListener("change",()=>{
      saved.sort=sort.value;
      updateItemList();
    });
    viewButtons.forEach(button=>button.addEventListener("click",()=>{
      saved.view=button.dataset.collectionView;
      updateViewControls();
      updateItemList();
    }));
    updateViewControls();
    updateItemList();
    board.appendChild(page);
  }
}
