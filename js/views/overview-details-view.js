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
      <div class="overviewDetailsList">${entries.length?entries.map(entry=>`<button class="overviewDetailsRow" type="button"${entry.kind==="project"?` data-detail-project="${escapeHtml(entry.id)}"`:` data-detail-item="${escapeHtml(entry.id)}" data-pid="${escapeHtml(entry.projectId)}" data-gid="${escapeHtml(entry.groupId)}" data-iid="${escapeHtml(entry.id)}"`}>
        <strong>${escapeHtml(entry.title)}</strong><span>${escapeHtml(entry.meta)}</span>
      </button>`).join(""):`<p class="overviewDetailsEmpty">Nothing to show yet.</p>`}</div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("[data-close]").onclick=()=>overlay.remove();
    overlay.addEventListener("click",event=>{ if (event.target===overlay) overlay.remove(); });
    overlay.querySelectorAll("[data-detail-project]").forEach(button=>button.onclick=()=>{
      const projectId=button.dataset.detailProject;
      overlay.remove();
      actions.openProject(projectId);
    });
    overlay.querySelectorAll("[data-detail-item]").forEach(button=>button.onclick=()=>{
      const {pid,gid,iid}=button.dataset;
      overlay.remove();
      actions.openItem(pid,gid,iid);
    });
    overlay.querySelector("[data-close]").focus();
  }
}
