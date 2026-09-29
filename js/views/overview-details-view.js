function escapeHtml(value){
  return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
}

export class OverviewDetailsView {
  constructor({model}){
    this.model=model;
  }

  open({tone,stats,data,actions}){
    const stat=stats.find(row=>row.tone===tone);
    const entries=this.model.getEntries(tone,data);
    const overlay=document.createElement("div");
    overlay.className="overlay";
    overlay.innerHTML=`<div class="Overlay Overlay--size-medium position-relative overviewDetailsDialog" data-modal role="dialog" aria-modal="true" aria-labelledby="overviewDetailsTitle">
      <button class="btn btn-invisible closeX" type="button" data-close aria-label="Close">✕</button>
      <h3 id="overviewDetailsTitle">${escapeHtml(stat?.label||"Details")}</h3>
      ${stat?.searchable?`<input class="form-control overviewDetailsSearch" type="search" placeholder="Search ${tone==="projects"?"projects":"items"}" aria-label="Search ${tone==="projects"?"projects":"items"}">`:""}
      <div class="overviewDetailsList"></div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("[data-close]").onclick=()=>overlay.remove();
    overlay.addEventListener("click",event=>{ if (event.target===overlay) overlay.remove(); });
    const list=overlay.querySelector(".overviewDetailsList");
    const search=overlay.querySelector(".overviewDetailsSearch");
    const renderEntries=()=>{
      const query=search?.value||"";
      const matches=search ? this.model.searchEntries(entries,query) : entries;
      list.innerHTML=matches.length?matches.map(entry=>`<button class="overviewDetailsRow" type="button"${entry.kind==="project"?` data-detail-project="${escapeHtml(entry.id)}"`:` data-detail-item="${escapeHtml(entry.id)}" data-pid="${escapeHtml(entry.projectId)}" data-gid="${escapeHtml(entry.groupId)}" data-iid="${escapeHtml(entry.id)}"}`}>
        <strong>${escapeHtml(entry.title)}</strong><span>${escapeHtml(entry.meta)}</span>
      </button>`).join(""):`<p class="overviewDetailsEmpty">${query.trim()?"No matching results.":"Nothing to show yet."}</p>`;
    };
    renderEntries();
    if (search) search.addEventListener("input",renderEntries);
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
    if (search) search.focus();
    else overlay.querySelector("[data-close]").focus();
  }
}
