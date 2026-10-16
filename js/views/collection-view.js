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
    const viewButtons=[...page.querySelectorAll("[data-collection-view]")];
    if (!search||!sort||!addButton||!itemList||!empty||!cardTemplate?.content?.firstElementChild||viewButtons.length!==2){
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
        card.querySelector(".collectionPageIcon").setAttribute("icon",item.icon);
        card.querySelector(".collectionPageName").textContent=item.title;
        const badge=card.querySelector(".collectionPageBadge");
        badge.hidden=!item.badge;
        badge.textContent=item.badge||"";
        const description=card.querySelector(".collectionPageDescription");
        description.hidden=!item.description;
        description.textContent=item.description||"";
        const meta=card.querySelector(".collectionPageMeta");
        meta.hidden=!item.meta;
        meta.textContent=item.meta||"";
        card.onclick=()=>onOpen(item.id);
        itemList.appendChild(card);
      });
      empty.hidden=matching.length>0;
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
    }));
    updateViewControls();
    updateItemList();
    board.appendChild(page);
  }
}
