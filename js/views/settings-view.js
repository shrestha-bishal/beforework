export class SettingsView {
  constructor({cloneTemplate,actions}){
    this.cloneTemplate = cloneTemplate;
    this.actions = actions;
  }

  render(board,settings){
    const view = this.cloneTemplate();
    view.querySelector("#settingsThemeToggle").textContent = `${settings.theme} mode`;
    view.querySelector("#settingsTimeFormat").value = settings.timeFormat;
    view.querySelector("#settingsSidebarToggle").textContent = `${settings.sidebarCollapsed ? "Expand" : "Collapse"} sidebar`;
    view.querySelector("#settingsStorageStatus").textContent = settings.storageStatus;
    view.querySelector("#settingsBackupRow").hidden = !settings.hasBackup;
    const recoveryStatus=view.querySelector("#settingsRecoveryStatus");
    const recoveryList=view.querySelector("#settingsRecoveryList");
    const snapshots=settings.recoverySnapshots||[];
    recoveryStatus.textContent=snapshots.length
      ? `Up to 8 snapshots or 64 MB are retained in this browser. They do not sync with your workspace file.`
      : "No recovery snapshots yet. Automatic snapshots are saved before file changes at most every 30 minutes; imports, restores, and conflicts create extra snapshots.";
    snapshots.forEach(snapshot=>{
      const row=document.createElement("div");
      row.className="settingsRecoveryEntry";
      const details=document.createElement("span");
      details.textContent=`${new Date(snapshot.savedAt).toLocaleString()} · ${snapshot.reason.replaceAll("-"," ")}`;
      const actions=document.createElement("span");
      actions.className="settingsRowActions";
      const exportButton=document.createElement("button");
      exportButton.className="btn btn-sm";
      exportButton.type="button";
      exportButton.textContent="Export";
      exportButton.addEventListener("click",()=>this.actions.exportRecovery(snapshot.id));
      const restoreButton=document.createElement("button");
      restoreButton.className="btn btn-sm";
      restoreButton.type="button";
      restoreButton.textContent="Restore";
      restoreButton.addEventListener("click",()=>this.actions.restoreRecovery(snapshot.id));
      actions.append(exportButton,restoreButton);
      row.append(details,actions);
      recoveryList.appendChild(row);
    });
    view.querySelector("#settingsAccountName").textContent = settings.accountName;
    view.querySelector("#settingsAccountSection").hidden = !settings.accountName;
    view.querySelector("#settingsReminderStatus").textContent = settings.reminderStatus.label;
    view.querySelector("#settingsReminderToggle").textContent = settings.reminderStatus.actionLabel;
    view.querySelector("#settingsReminderToggle").disabled = !settings.reminderStatus.enabled && !settings.reminderStatus.canEnable;
    view.querySelector("#settingsReminderToggle").setAttribute("aria-pressed",String(settings.reminderStatus.enabled));
    board.replaceChildren(view);
    board.querySelector("#settingsThemeToggle").onclick = () => this.actions.toggleTheme(board);
    board.querySelector("#settingsTimeFormat").onchange = event=>this.actions.setTimeFormat(event.target.value);
    board.querySelector("#settingsSidebarToggle").onclick = () => this.actions.toggleSidebar(board);
    board.querySelector("#settingsReminderToggle").onclick = () => this.actions.toggleReminders(board);
    board.querySelector("#settingsShortcuts").onclick = this.actions.showShortcuts;
    board.querySelector("#settingsContactForm").onclick = this.actions.openIssues;
    board.querySelector("#settingsGithubSponsors").onclick = this.actions.openSponsors;
    board.querySelector("#settingsBuyMeCoffee").onclick = this.actions.openCoffee;
    board.querySelector("#settingsSwitchFile").onclick = this.actions.switchFile;
    board.querySelector("#settingsRetrySave").onclick = this.actions.retrySave;
    board.querySelector("#settingsNewFile").onclick = this.actions.createFile;
    board.querySelector("#settingsExport").onclick = this.actions.exportJSON;
    board.querySelector("#settingsImport").onclick = this.actions.importJSON;
    const restoreBackupButton = board.querySelector("#settingsRestoreBackup");
    if (restoreBackupButton) restoreBackupButton.onclick = this.actions.restoreBackup;
    const logoutButton = board.querySelector("#settingsLogout");
    if (logoutButton) logoutButton.onclick = this.actions.logout;
  }
}