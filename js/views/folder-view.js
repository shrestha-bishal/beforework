export class FolderView {
  constructor({cloneTemplate}={}){
    this.cloneTemplate=cloneTemplate;
    this.pageState=new Map();
  }

  render(board,folder,projects,{onOpenProject,onAddProject}){
    const folderProjects=projects.filter(project=>project.folderId===folder.id&&!project.archived);
    const saved=this.pageState.get(folder.id)||{query:"",sort:"name-asc",view:"grid"};
    this.pageState.set(folder.id,saved);

    const templates=this.cloneTemplate();
    const page=templates.querySelector(".folderPage");
    if (!page) throw new Error("The Folder view template is missing its root element.");
    const search=page.querySelector(".folderPageSearch");
    const sort=page.querySelector(".folderPageSort");
    const addButton=page.querySelector(".folderPageAdd");
    const projectList=page.querySelector(".folderPageProjects");
    const empty=page.querySelector(".folderPageEmpty");
    const projectCardTemplate=templates.querySelector("#folderProjectCardTemplate");
    const viewButtons=[...page.querySelectorAll("[data-folder-view]")];
    if (!search||!sort||!addButton||!projectList||!empty||!projectCardTemplate?.content?.firstElementChild||viewButtons.length!==2){
      throw new Error("The Folder view template is missing required controls.");
    }
    search.value=saved.query;
    sort.value=saved.sort;
    addButton.onclick=onAddProject;
    empty.hidden=true;
    function updateViewControls(){
      projectList.classList.toggle("folderPageProjects--list",saved.view==="list");
      viewButtons.forEach(button=>{
        const selected=button.dataset.folderView===saved.view;
        button.setAttribute("aria-pressed",String(selected));
        button.classList.toggle("selected",selected);
      });
    }

    function taskCounts(project){
      const items=Array.isArray(project.itemIndex)
        ?project.itemIndex
        :[...(project.groups||[]).flatMap(group=>group.items||[]),...(project.items||[])];
      const tasks=items.filter(item=>!item.archived&&item.calendarType!=="event");
      return {open:tasks.filter(item=>!item.completedAt).length,total:tasks.length};
    }

    function projectUpdatedAt(project){
      const items=Array.isArray(project.itemIndex)
        ?project.itemIndex
        :[...(project.groups||[]).flatMap(group=>group.items||[]),...(project.items||[])];
      return items.reduce((latest,item)=>Math.max(latest,item.updatedAt||item.createdAt||0),project.updatedAt||project.createdAt||0);
    }

    function updateProjectList(){
      projectList.replaceChildren();
      const query=saved.query.trim().toLocaleLowerCase();
      const matching=folderProjects.filter(project=>
        `${project.name||""} ${project.description||""}`.toLocaleLowerCase().includes(query)
      ).sort((a,b)=>{
        const comparison=String(a.name||"").localeCompare(String(b.name||""),undefined,{sensitivity:"base"});
        if (saved.sort==="updated-desc") return projectUpdatedAt(b)-projectUpdatedAt(a)||comparison;
        return saved.sort==="name-desc"?-comparison:comparison;
      });
      matching.forEach(project=>{
        const button=projectCardTemplate.content.firstElementChild.cloneNode(true);
        button.title=`Open ${project.name}`;
        const icon=button.querySelector(".folderProjectIcon");
        icon.setAttribute("icon",project.icon||"mdi:clipboard-text-outline");
        const name=button.querySelector(".folderProjectName");
        name.textContent=project.name;
        const description=button.querySelector(".folderProjectDescription");
        description.textContent=project.description||"No description";
        const stats=button.querySelector(".folderProjectStats");
        const counts=taskCounts(project);
        stats.textContent=`${counts.open} of ${counts.total} tasks open`;
        button.querySelector(".folderProjectPinned").hidden=!project.pinned;
        button.onclick=()=>onOpenProject(project.id);
        projectList.appendChild(button);
      });
      empty.hidden=matching.length>0;
      empty.textContent=folderProjects.length
        ?"No projects match your search."
        :"This folder has no projects yet. Add a project to get started.";
    }

    search.addEventListener("input",()=>{
      saved.query=search.value;
      updateProjectList();
    });
    sort.addEventListener("change",()=>{
      saved.sort=sort.value;
      updateProjectList();
    });
    viewButtons.forEach(button=>button.addEventListener("click",()=>{
      saved.view=button.dataset.folderView;
      updateViewControls();
    }));
    updateViewControls();
    updateProjectList();
    board.appendChild(page);
  }
}
