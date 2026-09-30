export class OverviewDetailsView {
  constructor({model,cloneTemplate}){
    this.model=model;
    this.cloneTemplate=cloneTemplate;
  }

  async open({tone,stats,data,actions}){
    const stat=stats.find(row=>row.tone===tone);
    const entries=this.model.getEntries(tone,data);
    const templates=await this.cloneTemplate();
    const overlay=templates.querySelector("#overviewDetailsOverlay").content.firstElementChild.cloneNode(true);
    const rowTemplate=templates.querySelector("#overviewDetailsRow");
    const emptyTemplate=templates.querySelector("#overviewDetailsEmpty");
    const title=overlay.querySelector("[data-details-title]");
    title.textContent=stat?.label||"Details";
    const dialog=overlay.querySelector("[role='dialog']");
    dialog.setAttribute("aria-labelledby",title.id);
    const search=overlay.querySelector("[data-details-search]");
    const searchable=!!stat?.searchable;
    search.hidden=!searchable;
    if (searchable){
      const subject=tone==="projects"?"projects":"items";
      search.placeholder=`Search ${subject}`;
      search.setAttribute("aria-label",`Search ${subject}`);
    }
    document.body.appendChild(overlay);
    overlay.querySelector("[data-close]").onclick=()=>overlay.remove();
    overlay.addEventListener("click",event=>{ if (event.target===overlay) overlay.remove(); });
    const list=overlay.querySelector("[data-details-list]");
    const renderEntries=()=>{
      const query=search?.value||"";
      const matches=searchable ? this.model.searchEntries(entries,query) : entries;
      list.replaceChildren();
      if (!matches.length){
        const empty=emptyTemplate.content.firstElementChild.cloneNode(true);
        empty.textContent=query.trim()?"No matching results.":"Nothing to show yet.";
        list.appendChild(empty);
        return;
      }
      matches.forEach(entry=>{
        const row=rowTemplate.content.firstElementChild.cloneNode(true);
        if (entry.kind==="project") row.dataset.detailProject=entry.id;
        else {
          row.dataset.detailItem=entry.id;
          row.dataset.pid=entry.projectId;
          row.dataset.gid=entry.groupId;
          row.dataset.iid=entry.id;
        }
        row.querySelector("[data-entry-title]").textContent=entry.title;
        row.querySelector("[data-entry-meta]").textContent=entry.meta;
        list.appendChild(row);
      });
    };
    renderEntries();
    if (searchable) search.addEventListener("input",renderEntries);
    list.addEventListener("click",event=>{
      const button=event.target.closest(".overviewDetailsRow");
      if (!button) return;
      if (button.dataset.detailProject){
        const projectId=button.dataset.detailProject;
        overlay.remove();
        actions.openProject(projectId);
      } else if (button.dataset.detailItem){
        const {pid,gid,iid}=button.dataset;
        overlay.remove();
        actions.openItem(pid,gid,iid);
      }
    });
    if (searchable) search.focus();
    else overlay.querySelector("[data-close]").focus();
  }
}
