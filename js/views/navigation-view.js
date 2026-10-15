const NAVIGATION_ITEMS=Object.freeze([
  {kind:"primary",id:"brandHomeBtn",action:"overview"},
  {kind:"primary",id:"overviewNav",action:"overview"},
  {kind:"secondary",id:"projectsNav",section:"projects",title:"Projects",searchable:true},
  {kind:"secondary",id:"workspaceDocumentsNav",section:"documents",title:"Documents",searchable:true},
  {kind:"primary",id:"calendarNav",action:"calendar"},
  {kind:"primary",id:"roadmapNav",action:"roadmap"},
  {kind:"primary",id:"focusTimerNav",action:"timer"},
  {kind:"primary",id:"integrationsNav",action:"integrations"},
  {kind:"primary",id:"settingsNav",action:"settings"},
  {kind:"primary",id:"supportNav",action:"support"},
  {kind:"primary",id:"feedbackNav",action:"feedback"},
  {kind:"secondary",id:"workspaceSwitcherBtn",section:"workspace",title:"Workspace",content:"workspace"}
].map(item=>Object.freeze(item)));

export class NavigationView {
  constructor({documentRef=globalThis.document,cloneTemplate}={}){
    if (!documentRef||typeof documentRef.getElementById!=="function"||typeof cloneTemplate!=="function"){
      throw new TypeError("The navigation view requires a document and template cloner.");
    }
    this.documentRef=documentRef;
    this.cloneTemplate=cloneTemplate;
  }

  get items(){
    return NAVIGATION_ITEMS;
  }

  getElement(id){
    const element=this.documentRef.getElementById(id);
    if (!element) throw new Error(`Navigation element "${id}" is missing.`);
    return element;
  }

  getSecondarySection(section){
    const item=NAVIGATION_ITEMS.find(candidate=>candidate.kind==="secondary"&&candidate.section===section);
    if (!item) throw new Error(`Unknown secondary navigation section "${section}".`);
    return {...item,trigger:this.getElement(item.id)};
  }

  mount(container){
    if (!container||typeof container.replaceChildren!=="function"){
      throw new TypeError("The navigation view requires a mount element.");
    }
    const fragment=this.cloneTemplate();
    const requiredIds=[...NAVIGATION_ITEMS.map(item=>item.id),"sidebar","sidebarScrim","secondarySidebar","secondarySidebarSearch","secondarySidebarSearchInput","sidebarProjects","workspaceSidebarActions"];
    const missing=requiredIds.filter(id=>!fragment.querySelector(`#${id}`));
    if (missing.length) throw new Error(`The navigation template is missing required elements: ${missing.join(", ")}.`);
    container.replaceChildren(fragment);
  }
}
