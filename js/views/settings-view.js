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
    view.querySelector("#settingsAccountName").textContent = settings.accountName;
    view.querySelector("#settingsAccountSection").hidden = !settings.accountName;
    board.replaceChildren(view);
    board.querySelector("#settingsThemeToggle").onclick = () => this.actions.toggleTheme(board);
    board.querySelector("#settingsTimeFormat").onchange = event=>this.actions.setTimeFormat(event.target.value);
    board.querySelector("#settingsSidebarToggle").onclick = () => this.actions.toggleSidebar(board);
    board.querySelector("#settingsShortcuts").onclick = this.actions.showShortcuts;
    board.querySelector("#settingsContactForm").onclick = this.actions.openIssues;
    board.querySelector("#settingsGithubSponsors").onclick = this.actions.openSponsors;
    board.querySelector("#settingsBuyMeCoffee").onclick = this.actions.openCoffee;
    board.querySelector("#settingsSwitchFile").onclick = this.actions.switchFile;
    board.querySelector("#settingsNewFile").onclick = this.actions.createFile;
    board.querySelector("#settingsExport").onclick = this.actions.exportJSON;
    board.querySelector("#settingsImport").onclick = this.actions.importJSON;
    const restoreBackupButton = board.querySelector("#settingsRestoreBackup");
    if (restoreBackupButton) restoreBackupButton.onclick = this.actions.restoreBackup;
    const logoutButton = board.querySelector("#settingsLogout");
    if (logoutButton) logoutButton.onclick = this.actions.logout;
  }
}