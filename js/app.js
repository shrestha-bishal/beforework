  "use strict";

  /* ---------- Constants ---------- */
  const uid = () => crypto.randomUUID();
  function recordItemActivity(item, type, details={}){
    if (!item) return;
    if (!Array.isArray(item.activity)) item.activity = [];
    item.activity.push({id:uid(), type, at:Date.now(), ...details});
  }
  // Primer's own semantic fg tokens, not hand-picked hex - these track
  // light/dark theme automatically instead of needing a second palette.
  const TAG_COLORS = [
    "var(--color-accent-fg)","var(--color-severe-fg)","var(--color-sponsors-fg)","var(--color-open-fg)",
    "var(--color-danger-fg)","var(--color-attention-fg)","var(--color-success-fg)","var(--color-fg-muted)"
  ];
  const TAG_COLOR_OPTIONS = [
    {label:"Blue",value:TAG_COLORS[0]}, {label:"Purple",value:TAG_COLORS[1]},
    {label:"Pink",value:TAG_COLORS[2]}, {label:"Green",value:TAG_COLORS[3]},
    {label:"Red",value:TAG_COLORS[4]}, {label:"Amber",value:TAG_COLORS[5]},
    {label:"Forest",value:TAG_COLORS[6]}, {label:"Grey",value:TAG_COLORS[7]},
    {label:"Teal",value:"#0f766e"}, {label:"Orange",value:"#bc4c00"},
    {label:"Coral",value:"#cf4a2c"}
  ];
  const OVERVIEW = "__overview__";
  const CALENDAR = "__calendar__";
  const ROADMAP = "__roadmap__";
  const INTEGRATIONS = "__integrations__";
  const SETTINGS = "__settings__";
  const SUPPORT = "__support__";
  const DEFAULT_PROJECT_ICON = "mdi:clipboard-text-outline";
  const PROJECT_DEFAULT_ICONS = [
    "mdi:clipboard-text-outline","mdi:folder-outline","mdi:briefcase-outline","mdi:rocket-launch-outline",
    "mdi:code-tags","mdi:chart-box-outline","mdi:calendar-month-outline","mdi:lightbulb-outline",
    "mdi:palette-outline","mdi:book-open-variant","mdi:target","mdi:toolbox-outline",
    "mdi:account-group-outline","mdi:file-document-outline","mdi:flag-outline","mdi:puzzle-outline",
    "mdi:school-outline","mdi:bank-outline"
  ];
  const PRIORITY_OPTIONS = [
    {id:"high",label:"High",color:"var(--color-danger-fg)",rank:3},
    {id:"medium",label:"Medium",color:"var(--color-attention-fg)",rank:2},
    {id:"low",label:"Low",color:"var(--color-fg-muted)",rank:1},
  ];
  const FIELD_TYPE_OPTIONS = [
    {value:"priority", label:"Priority", description:"Best for urgency or ranking."},
    {value:"select", label:"Single select", description:"Pick one answer from a fixed list."},
    {value:"start-date", label:"Start date", description:"When work on this task should begin."},
    {value:"due-date", label:"Due date", description:"When this task should be completed."},
    {value:"date", label:"Date", description:"A custom date for any other purpose."},
    {value:"text", label:"Text", description:"Freeform notes or details."},
    {value:"checkbox", label:"Checkbox", description:"Yes/no or done/not done flag."},
    {value:"url", label:"URL", description:"Link to a website or online resource."},
    {value:"email", label:"Email", description:"Store a contact email address."},
    {value:"number", label:"Number", description:"Store a count, estimate, or other numeric value."},
    {value:"multi-select", label:"Multi-select", description:"Choose more than one option."},
  ];
  const FIELD_TYPES = FIELD_TYPE_OPTIONS.map(option=>option.value);
  function fieldTypeLabel(type){ return FIELD_TYPE_OPTIONS.find(option=>option.value===type)?.label || "Text"; }
  function fieldTypeDescription(type){ return FIELD_TYPE_OPTIONS.find(option=>option.value===type)?.description || ""; }
  const TIME_FORMAT_KEY = "personal_dashboard_time_format_v1";
  const LOCATION_KEY = "personal_dashboard_location_v1";
  const FEEDBACK_URL = "https://github.com/shrestha-bishal/beforework/issues";
  const GITHUB_SPONSORS_URL = "https://github.com/sponsors/shrestha-bishal";
  const BUY_ME_A_COFFEE_URL = "https://www.buymeacoffee.com/shresthabishal";
  const GOOGLE_CLIENT_ID = window.BEFOREWORK_CONFIG.googleClientId || "";
  const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly";
  const dialogs = window.BeforeworkDialogs.create({
    tagColorOptions:TAG_COLOR_OPTIONS,
    defaultProjectIcon:DEFAULT_PROJECT_ICON,
    projectDefaultIcons:PROJECT_DEFAULT_ICONS,
    openFloatingSelectMenu,
    closeFloatingSelectMenu,
    loadTemplate:name=>window.BeforeworkViewTemplates.load(name),
    clonePageTemplate:name=>window.BeforeworkViewTemplates.clone(name)
  });

  const __VIEW_IMPORT_HINTS = [
    'import("./views/settings-view.js")',
    'import("./views/overview-details-view.js")',
    'import("./models/overview-details-model.js")',
    'import("./views/milestones-view.js")',
    'import("./views/roadmap-view.js")',
    'import("./views/overview-view.js")',
    'import("./views/list-view.js")',
    'import("./views/table-view.js")',
    'import("./views/board-view.js")',
    'import("./views/calendar-view.js")'
  ];

  let state = null;                 // { projects:[] }
  const reminderService = window.BeforeworkReminders.create({getItems:getReminderEntries, onOpenItem:openReminderItem});
  const workspaceCommands = window.BeforeworkWorkspaceCommands.create({
    getState:()=>state,
    actions:{
      navigate(destination){
        if (destination==="settings") navigateToSettings();
        else if (destination==="integrations") navigateToIntegrations();
        else selectProject(destination==="calendar" ? CALENDAR : destination==="roadmap" ? ROADMAP : OVERVIEW);
      },
      addTask:quickAddViaShortcut,
      createProject(){ document.getElementById("addProjectBtn").click(); },
      createFolder(){ document.getElementById("addFolderBtn").click(); },
      createEvent(){ openNewCalendarItemModal(null,todayStr(0)); },
      toggleTheme:()=>window.BeforeworkAppearance.toggleTheme(),
      toggleTimer:toggleFocusTimer,
      showShortcuts:showShortcutsModal,
      openProject:selectProject,
      async openGroup(project,group){
        await selectProject(project.id);
        boardFilterGroups.clear();
        boardFilterGroups.add(group.id);
        render();
      },
      async openProjectItem(project,group,item){
        await selectProject(project.id);
        openItemModal(project.id,group.id,item.id);
      },
      async openTag(project,tag){
        await selectProject(project.id);
        boardFilterTags.clear();
        boardFilterTags.add(tag.id);
        render();
        renderSidebarTags();
      },
      openCalendarItem:openStandaloneCalendarItemModal
    }
  });
  let suppressGlobalSearchFocus = false;
  const commandPalette = window.BeforeworkCommandPalette.create({
    getCommands:workspaceCommands.getCommands,
    canOpen:()=>!!fileHandle,
    getInitialQuery:()=>document.getElementById("globalSearch").value,
    onQueryChange:value=>{ document.getElementById("globalSearch").value=value; },
    onClose:focusTarget=>{ if (focusTarget?.id==="globalSearch") suppressGlobalSearchFocus=true; },
    onTemplateError:error=>showNotice("Couldn't open command palette",error.message),
    cloneTemplate:async()=>{
      await window.BeforeworkViewTemplates.load("commandPalette");
      return window.BeforeworkViewTemplates.clone("commandPalette").querySelector("#commandPalette").content.firstElementChild.cloneNode(true);
    },
  });
  window.BeforeworkCommandPaletteInstance=commandPalette;
  let settingsView = null;
  let overviewDetailsView = null;
  let milestonesView = null;
  let roadmapView = null;
  let overviewView = null;
  let listView = null;
  let tableView = null;
  let boardView = null;
  let calendarView = null;
  let showArchived = false;
  let activeProjectId = OVERVIEW;
  const focusTimer = window.BeforeworkFocusTimer.create({
    getProjectId:()=>getProject(activeProjectId)?.id || null,
    loadTemplate:name=>window.BeforeworkViewTemplates.load(name),
    cloneTemplate:name=>window.BeforeworkViewTemplates.clone(name),
    onSessionComplete(session){
      if (!Array.isArray(state.focusSessions)) state.focusSessions=[];
      state.focusSessions.push({id:uid(),...session});
      scheduleSave();
      if (activeProjectId===OVERVIEW) render();
    },
    onFinished(mode){
      showNotice(
        mode==="break" ? "Break finished" : "Focus session finished",
        mode==="break"
          ? "Your break has finished. Start another focus session when you're ready."
          : "Your focus session has finished. Take a short break or start another session."
      );
    },
    onOpen(){
      window.BeforeworkAppearance.applySidebarCollapsed(false);
      if (window.innerWidth<=860){
        document.getElementById("sidebar").classList.add("open");
        document.getElementById("sidebarScrim").classList.add("show");
      }
    }
  });
  function toggleFocusTimer(){ focusTimer.togglePanel(); }
  // View type is per-project now (project.views + project.activeViewId), not global.
  const VIEW_DEFS = [
    {type:"list", label:"List"},
    {type:"table", label:"Table"},
    {type:"kanban", label:"Board"},
    {type:"calendar", label:"Calendar"},
    {type:"milestones", label:"Milestones"},
    {type:"roadmap", label:"Roadmap"},
  ];
  function viewLabel(type){ return (VIEW_DEFS.find(v=>v.type===type)||{}).label || type; }
  const PROJECT_TEMPLATES = {
    simple:   {label:"Simple list",               views:["list"],               fields:[],               groups:["Items"]},
    table:    {label:"Table (spreadsheet-style)",  views:["table"],              fields:[],               groups:["Rows"]},
    taskboard:{label:"Project / task management",  views:["list","kanban","calendar","roadmap"], fields:["priority","due"], groups:["To do","In progress","Review"]},
    calendarTpl:{label:"Calendar / events",        views:["calendar","list"],    fields:["due"],          groups:["Items"], itemDefaultType:"event"},
    blank:    {label:"Blank",                      views:["list"],              fields:[],               groups:["Items"]},
  };
  function buildFieldsForTemplate(keys){
    return (keys||[]).map(k=>{
      if (k==="priority") return {id:uid(), label:"Priority", type:"priority", options:[]};
      if (k==="due") return {id:uid(), label:"Due date", type:"due-date", options:[]};
      return null;
    }).filter(Boolean);
  }
  let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let boardFilterText = "";
  let boardFilterGroups = new Set();
  let boardFilterTags = new Set();
  let boardFilterFields = new Map(); // fieldId -> "__all__" | "__none__" | optionId
  let activeFilterCategory = "groupFilters";
  let completionFilter = "open";
  let listSort = {field:"updated", dir:"desc"};
  let openItemRef = null;
  let fileHandle = null;
  let workspaceRootHandle = null;
  let saveTimer = null;
  let lastSavedState = null;
  const undoStack = [];
  const selectedItemIds = new Set();
  let filterPrefs = {};
  let googleAccessToken = null;
  let googleTokenClient = null;
  let googleSyncInFlight = false;
  let googleImportInFlight = false;
  let googleSyncQueued = false;
  let googleSyncApplying = false;
  let googlePollTimer = null;
  let googleAutoSyncTimer = null;
  let googleSyncScopeProject = null;
  let googleTokenPurpose = "sync";
  let googleSilentAuth = false;
  let googleTokenRefreshTimer = null;

  function getTimeFormat(){
    try{ return localStorage.getItem(TIME_FORMAT_KEY)==="24" ? "24" : "12"; }catch(err){ return "12"; }
  }
  function formatTime(date){
    return date.toLocaleTimeString(undefined, {hour:"numeric", minute:"2-digit", hour12:getTimeFormat()==="12"});
  }
  function formatTimeValue(value){
    if (!value) return "";
    const [hours,minutes] = value.split(":").map(Number);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return value;
    return formatTime(new Date(2000,0,1,hours,minutes));
  }
  function formatDateTime(timestamp){
    const date = new Date(timestamp);
    return date.toLocaleString(undefined, {dateStyle:"medium", timeStyle:"short", hour12:getTimeFormat()==="12"});
  }

  /* ---------- Auth (optional, pluggable) ----------
     Authentication is entirely additive here: if no provider is available
     (script blocked, feature not enabled on this deployment, offline, or a
      future provider isn't configured), account controls stay unavailable and the
     app works exactly as it always has - nothing below gates storage or
     any feature.

     To add another provider later (Auth0, Supabase, Clerk, a custom
     backend, etc.), implement an object with the same four members and
     register it:

       registerAuthProvider("myProvider", {
         isAvailable(){ ... return true/false, or a Promise of one },
         init(onChange){ ... call onChange(user|null) whenever auth changes },
         login(){ ... },
         logout(){ ... },
         label(user){ ... return a display string for the signed-in user },
       });

     then add "myProvider" to AUTH_PROVIDER_ORDER. The first provider in
     that list that reports itself available is the one that's used. */
  const NETLIFY_IDENTITY_ENABLED = false;
  const AUTH_PROVIDERS = {};
  const AUTH_PROVIDER_ORDER = ["netlify"]; // try in this order; add new provider names here
  let activeAuthProvider = null;
  let currentAuthUser = null;

  function registerAuthProvider(name, provider){ AUTH_PROVIDERS[name] = provider; }

  function loadNetlifyIdentity(){
    if (window.netlifyIdentity) return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const script=document.createElement("script");
      script.src="https://identity.netlify.com/v1/netlify-identity-widget.js";
      script.onload=resolve;
      script.onerror=()=>reject(new Error("Netlify Identity failed to load."));
      document.head.appendChild(script);
    });
  }

  registerAuthProvider("netlify", {
    isAvailable(){
      return typeof window.netlifyIdentity !== "undefined";
    },
    init(onChange){
      let settled = false;
      netlifyIdentity.on("init", user => { settled = true; onChange(user || null); });
      netlifyIdentity.on("login", user => { settled = true; onChange(user || null); netlifyIdentity.close(); });
      netlifyIdentity.on("logout", () => { onChange(null); });
      // If this deployment isn't actually wired up to Netlify Identity, the
      // widget can error out instead of ever firing "init" - treat that as
      // "not configured" and fall back to normal, auth-less operation.
      netlifyIdentity.on("error", () => { if (!settled) disableAuthUI(); });
      netlifyIdentity.init({logo:false});
      // Belt-and-braces: nothing fired after a few seconds → assume this
      // page isn't connected to an Identity instance and stay out of the way.
      setTimeout(()=>{ if (!settled) disableAuthUI(); }, 4000);
    },
    login(){ netlifyIdentity.open("login"); },
    logout(){ netlifyIdentity.logout(); },
    label(user){
      return (user && (user.user_metadata && user.user_metadata.full_name)) || (user && user.email) || "Signed in";
    }
  });

  function disableAuthUI(){
    activeAuthProvider = null;
    if (activeProjectId===SETTINGS) render();
  }
  function renderAuthUI(){
    if (activeProjectId===SETTINGS) render();
  }
  async function initAuth(){
    for (const name of AUTH_PROVIDER_ORDER){
      const provider = AUTH_PROVIDERS[name];
      if (!provider) continue;
      try{
        const available = await provider.isAvailable();
        if (!available) continue;
        activeAuthProvider = provider;
        provider.init(user => { currentAuthUser = user; renderAuthUI(); });
        return; // first available provider wins
      }catch(err){ /* this provider isn't usable in this environment - try the next one */ }
    }
    // No provider available: account controls stay unavailable and the rest
    // of the app is completely unaffected.
  }

  /* ---------- Keyboard shortcuts modal ---------- */
  function showShortcutsModal(){
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    const rows = [
      ["/", "Open search and commands"],
      ["Ctrl/⌘ + K", "Open the command palette"],
      ["n", "Quick-add an item to the open project"],
      ["d", "Toggle dark / light mode"],
      ["[", "Collapse / expand the sidebar"],
      ["t", "Open or close the focus timer"],
      ["Ctrl/⌘ + Z", "Undo the last change"],
      ["Esc", "Close the open item or dialog"],
      ["?", "Show this shortcuts list"],
    ];
    overlay.innerHTML = `<div class="Overlay Overlay--size-medium position-relative" data-modal role="dialog" aria-modal="true">
      <button class="btn btn-invisible closeX" data-close>✕</button>
      <h3>Keyboard shortcuts</h3>
      <div>${rows.map(([key,desc])=>`<div class="shortcutRow"><span>${escapeHtml(desc)}</span><kbd>${escapeHtml(key)}</kbd></div>`).join("")}</div>
      <div class="uiDivider modalDivider" aria-hidden="true"></div>
      <div class="modalFooter"><button class="btn btn-primary btn-sm" data-close>Got it</button></div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.querySelectorAll("[data-close]").forEach(btn=>btn.onclick = ()=>overlay.remove());
    overlay.addEventListener("click", e=>{ if (e.target===overlay) overlay.remove(); });
  }

  function todayStr(offsetDays){
    const d = new Date();
    d.setDate(d.getDate() + (offsetDays||0));
    return d.toISOString().slice(0,10);
  }
  function dateTimeLocalValue(value){
    if (!value) return "";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
  }

  function defaultState(){
    if (window.BEFOREWORK_CONFIG?.initialWorkspace === "clean"){
      return {
        schemaVersion:SCHEMA_VERSION,
        projects:[],
        folders:[],
        calendarItems:[],
        focusSessions:[],
        googleDeletedEventIds:[],
        googleCalendarLinks:[],
        googleCalendarCatalog:[],
        googleCalendarSyncTokens:{},
        googleLastSyncAt:0
      };
    }
    return window.BeforeworkDemoSeeder.create({schemaVersion:SCHEMA_VERSION, uid, viewLabel, tagColors:TAG_COLORS, todayStr});
  }

  const schemaMigration = window.BeforeworkSchemaMigration.create({uid});
  const SCHEMA_VERSION = schemaMigration.version;
  function migrateState(raw){
    return schemaMigration.migrate(raw, defaultState);
  }
  async function maybeShowMigrationNotice(){
    const info = schemaMigration.takeMigrationInfo();
    if (!info) return;
    await showNotice("Beforework data upgraded",
      "This file was saved by an older version of Beforework (format v" + info.fromVersion + ") and has been upgraded to the current format (v" + info.toVersion + "). " +
      "A copy of the pre-upgrade data was saved automatically. Use 'Restore pre-upgrade backup' in the storage menu at the bottom if anything looks off.");
  }

  function hasMigrationBackup(){
    return schemaMigration.hasBackup();
  }
  async function restoreMigrationBackup(){
    const saved = schemaMigration.readBackup();
    if (!saved){ showNotice("No backup found", "There is no pre-migration backup saved in this browser."); return; }
    const when = new Date(saved.savedAt).toLocaleString();
    if (!await showConfirm("Restore pre-migration data", "This replaces your current data with the version saved automatically on " + when + ", just before it was last upgraded (from schema v" + saved.fromVersion + "). This cannot be undone with Ctrl+Z.")) return;
    const validation=window.BeforeworkWorkspaceValidation.validate(saved.data,SCHEMA_VERSION);
    if (!validation.valid){ await showNotice("Couldn't restore pre-migration data",validation.errors.join(" ")); return; }
    try{ await window.BeforeworkStorage.saveRecoverySnapshot(JSON.stringify(state),"pre-migration-restore"); }
    catch(err){ await showNotice("Couldn't protect current workspace",err.message); return; }
    state = {...saved.data, schemaVersion:saved.fromVersion};
    lastSavedState = null;
    undoStack.length = 0;
    scheduleSave();
    renderAll();
  }

  /* Persistence moved to js/services/storage/storage.js */

/* ---------- Connect gate ---------- */
  // Nothing in the app is usable until a workspace folder or legacy file is
  // connected - browser storage is only for recovery and reconnect metadata.
  function showConnectGate(){
    const gate = document.getElementById("connectGate");
    const folderSupported = "showDirectoryPicker" in window;
    const fileSupported = "showOpenFilePicker" in window && "showSaveFilePicker" in window;
    const supported = folderSupported || fileSupported;
    document.getElementById("gateNewBtn").hidden = !folderSupported;
    document.getElementById("gateOpenBtn").hidden = !folderSupported;
    document.getElementById("gateLegacyFileBtn").hidden = !fileSupported;
    if (getSyncStatusText()==="No workspace connected.") setSyncStatus("No workspace folder connected. Create or open one, or choose an older JSON workspace.");
    document.getElementById("gateSupportedActions").style.display = supported ? "flex" : "none";
    document.getElementById("gateUnsupported").style.display = supported ? "none" : "block";
    const reconnectRow = document.getElementById("gateReconnectRow");
    if (supported && pendingReconnectHandle){
      reconnectRow.style.display = "block";
      document.getElementById("gateFileName").textContent = pendingReconnectHandle.name;
    } else {
      reconnectRow.style.display = "none";
    }
    const legacyRow = document.getElementById("gateLegacyRow");
    if (supported && localStorage.getItem(LEGACY_LS_KEY)){
      legacyRow.style.display = "block";
    } else {
      legacyRow.style.display = "none";
    }
    gate.classList.add("open");
  }
  function hideConnectGate(){
    document.getElementById("connectGate").classList.remove("open");
  }

  function exportJSON(){
    const blob = new Blob([JSON.stringify(state,null,2)], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "beforework-data.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportRecoverySnapshot(snapshotId){
    const snapshot=window.BeforeworkStorage.getRecoverySnapshots().find(entry=>entry.id===snapshotId);
    if (!snapshot) return;
    const blob=new Blob([snapshot.data],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;
    link.download=`beforework-recovery-${new Date(snapshot.savedAt).toISOString().replace(/[:.]/g,"-")}.json`;
    link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  async function chooseWorkspaceConflict(fileName,externalValid,folderMode=false){
    const options=[];
    if (externalValid) options.push({value:"reload",label:"Load the folder version and keep this tab's version in recovery"});
    if (folderMode) options.push({value:"cancel",label:"Keep working in this tab; do not write to the folder"});
    else options.push({value:"overwrite",label:"Keep this tab's version and overwrite the file"});
    return showDialog({
      title:folderMode?"This workspace folder changed elsewhere":"This workspace file changed elsewhere",
      message:folderMode
        ? `Another tab or a synced-folder update changed ${fileName}. To protect the external shards, Beforework will not overwrite this folder in place. Load its version or keep working in this tab.`
        : `Another tab or a synced-folder update changed ${fileName} since it was opened. Your current changes are still in this tab. Choose which version to keep.`,
      fields:[{label:"Resolution",type:"select",value:externalValid?"reload":folderMode?"cancel":"overwrite",options}],
      confirmLabel:"Resolve conflict"
    });
  }

  async function restoreRecoverySnapshot(snapshotId){
    const snapshot=window.BeforeworkStorage.getRecoverySnapshots().find(entry=>entry.id===snapshotId);
    if (!snapshot){ await showNotice("No recovery snapshot", "Beforework has not saved a recovery snapshot for this workspace yet."); return; }
    const when=new Date(snapshot.savedAt).toLocaleString();
    if (!await showConfirm("Restore recovery snapshot", `This replaces the connected workspace with the snapshot from ${when}. A snapshot of the current workspace will be saved first.`)) return;
    try{
      const parsed=JSON.parse(snapshot.data);
      const validation=window.BeforeworkWorkspaceValidation.validate(parsed,SCHEMA_VERSION);
      if (!validation.valid) throw new Error(validation.errors.join(" "));
      await window.BeforeworkStorage.saveRecoverySnapshot(JSON.stringify(state),"pre-restore");
      state=migrateState(parsed);
      lastSavedState=null;
      undoStack.length=0;
      selectedItemIds.clear();
      scheduleSave();
      renderAll();
    }catch(err){ await showNotice("Couldn't restore recovery snapshot", err.message); }
  }

  async function importJSON(file){
    if (!fileHandle){ showNotice("Connect a file first", "Import replaces the data in your connected file - connect or create one first."); return; }
    try{
      const parsed = JSON.parse(await file.text());
      const validation=window.BeforeworkWorkspaceValidation.validate(parsed,SCHEMA_VERSION);
      if (!validation.valid) throw new Error(validation.errors.join(" "));
      if (!await showConfirm("Replace workspace data", "The imported file will replace the current workspace. A recovery snapshot of the current workspace will be saved first.")) return;
      await window.BeforeworkStorage.saveRecoverySnapshot(JSON.stringify(state),"pre-import");
      state = migrateState(parsed);
      lastSavedState = null;
      undoStack.length = 0;
      selectedItemIds.clear();
      filterPrefs = {};
      saveFilterPrefs();
      activeProjectId = OVERVIEW;
      persistActiveLocation();
      scheduleSave();
      renderAll();
      await maybeShowMigrationNotice();
    }catch(err){ await showNotice("Import failed", "Could not read that file: " + err.message); }
  }

  function saveFilterPrefs(){
    localStorage.setItem(FILTER_KEY, JSON.stringify(filterPrefs));
  }
  function persistActiveFilters(){
    if (activeProjectId===OVERVIEW) return;
    filterPrefs[activeProjectId] = {
      text: boardFilterText,
      groups: [...boardFilterGroups],
      tags: [...boardFilterTags],
      fields: Object.fromEntries(boardFilterFields),
      completion: completionFilter
    };
    saveFilterPrefs();
  }
  function restoreProjectFilters(pid){
    const saved = filterPrefs[pid] || {};
    boardFilterText = saved.text || "";
    boardFilterGroups = new Set(Array.isArray(saved.groups) ? saved.groups : []);
    boardFilterTags = new Set(Array.isArray(saved.tags) ? saved.tags : []);
    boardFilterFields = new Map(Object.entries(saved.fields || {}));
    completionFilter = saved.completion==="completed" ? "completed" : "open";
  }

  /* ---------- Model helpers ---------- */
  function projectRecords(){ return state?.folderLazy ? state.projectSummaries : state?.projects||[]; }
  function getProjectSummary(pid){ return projectRecords().find(project=>project.id===pid); }
  function getLoadedProject(pid){ return (state?.projects||[]).find(project=>project.id===pid); }
  function getProject(pid){ return getLoadedProject(pid)||getProjectSummary(pid); }
  function registerProjectSummary(project){
    if (!state.folderLazy) return;
    const summary=window.BeforeworkFolderWorkspace.summarizeProject(project);
    const index=state.projectSummaries.findIndex(candidate=>candidate.id===project.id);
    if (index<0) state.projectSummaries.push(summary); else state.projectSummaries[index]=summary;
  }
  async function ensureProjectLoaded(pid){
    const loaded=getLoadedProject(pid);
    if (loaded || !state?.folderLazy) return loaded||getProjectSummary(pid);
    const summary=getProjectSummary(pid);
    if (!summary) return null;
    if (state.projects.length){
      if (!await flushSave()) throw new Error("Resolve the pending save before loading another project.");
      state.projects=[];
    }
    let project=await window.BeforeworkStorage.loadFolderProject(pid);
    project.folderId=summary.folderId;
    let migratedProject=false;
    const items=project.groups.flatMap(group=>group.items||[]);
    const hasLegacyDateFields=project.fields.some(field=>field.type==="date"
      && /^(start|start date|starts on|due|due date|deadline)$/.test(String(field.label||"").trim().toLowerCase()));
    const hasLegacyStartDates=items.some(item=>item.calendarType!=="event"&&item.startDate)
      && !project.fields.some(field=>field.type==="start-date");
    if (state.schemaVersion<SCHEMA_VERSION||hasLegacyDateFields||hasLegacyStartDates){
      const sourceVersion=state.schemaVersion<SCHEMA_VERSION?state.schemaVersion:7;
      const migrated=migrateState({...state,schemaVersion:sourceVersion,projects:[project],folderLazy:false,projectSummaries:undefined});
      project=migrated.projects[0];
      state.schemaVersion=SCHEMA_VERSION;
      migratedProject=true;
    }
    state.projects.push(project);
    registerProjectSummary(project);
    if (migratedProject) scheduleSave();
    return project;
  }
  function getGroup(pid,gid){ return getProject(pid)?.groups.find(g=>g.id===gid); }
  function getItem(pid,gid,iid){ return getGroup(pid,gid)?.items.find(i=>i.id===iid); }
  function isItemCompleted(item){
    return !!item && item.calendarType!=="event" && Number.isFinite(item.completedAt) && item.completedAt>0;
  }
  async function toggleCalendarTaskCompletion(details){
    let project=null;
    let item=null;
    if (details.projectId){
      if (state.folderLazy && !getLoadedProject(details.projectId)){
        try{
          await ensureProjectLoaded(details.projectId);
        }catch(error){
          await showNotice("Couldn't update calendar task",error.message);
          return false;
        }
      }
      project=getLoadedProject(details.projectId)||getProject(details.projectId);
      item=project?.groups.find(group=>group.id===details.groupId)?.items.find(candidate=>candidate.id===details.itemId);
    } else {
      item=(state.calendarItems||[]).find(candidate=>candidate.id===details.itemId);
    }
    if (!item){
      await showNotice("Couldn't update calendar task","The task could not be found in its project.");
      return false;
    }
    const wasCompleted=isItemCompleted(item);
    item.completedAt=wasCompleted?null:Date.now();
    item.updatedAt=Date.now();
    recordItemActivity(item,wasCompleted?"reopened":"completed");
    if (project && state.folderLazy) registerProjectSummary(project);
    scheduleSave();
    return true;
  }
  function tagById(project,tid){ return project.tags.find(t=>t.id===tid); }
  function priorityField(project){ return project.fields.find(f=>f.type==="priority"); }
  function isDateField(field){ return ["date","start-date","due-date"].includes(field?.type); }
  function dateFields(project){ return project.fields.filter(isDateField); }
  function fieldsWithStartBeforeDue(fields){
    const ordered=fields.slice();
    const startIndex=ordered.findIndex(field=>field.type==="start-date");
    const dueIndex=ordered.findIndex(field=>field.type==="due-date");
    if (startIndex>=0&&dueIndex>=0&&startIndex>dueIndex){
      [ordered[startIndex],ordered[dueIndex]]=[ordered[dueIndex],ordered[startIndex]];
    }
    return ordered;
  }
  function startDateField(project){ return project.fields.find(field=>field.type==="start-date"); }
  function dueDateField(project){
    return project.fields.find(field=>field.type==="due-date")
      || project.fields.find(field=>field.type==="date"&&/^(due|due date|deadline)$/.test(String(field.label||"").trim().toLowerCase()));
  }
  function calendarDateFields(project){
    return dateFields(project).filter(field=>field.type!=="start-date")
      .sort((first,second)=>Number(second===dueDateField(project))-Number(first===dueDateField(project)));
  }
  function getReminderEntries(){
    if (!state) return [];
    const entries = [];
    projectRecords().forEach(project=>{
      const groups=state.folderLazy
        ? project.itemIndex.reduce((result,item)=>{
          let group=result.find(candidate=>candidate.id===item.groupId);
          if (!group){ group={id:item.groupId,name:item.groupName,items:[]}; result.push(group); }
          group.items.push(item);
          return result;
        },[])
        : project.groups;
      groups.forEach(group=>group.items.forEach(item=>{
        const dueField = dueDateField(project);
        entries.push({
          id:`project:${project.id}:${item.id}`,
          itemId:item.id,
          projectId:project.id,
          groupId:group.id,
          projectName:project.name,
          title:item.title,
          dueDate:dueField ? item.values[dueField.id] : null,
          reminderAt:item.reminderAt || null,
          isTask:item.calendarType!=="event",
          completed:isItemCompleted(item),
          archived:!!item.archived
        });
      }));
    });
    (state.calendarItems||[]).forEach(item=>entries.push({
      id:`calendar:${item.id}`,
      itemId:item.id,
      title:item.title,
      dueDate:item.startDate||item.endDate||null,
      reminderAt:item.reminderAt || null,
      isTask:item.calendarType!=="event",
      completed:isItemCompleted(item),
      archived:!!item.archived
    }));
    return entries;
  }
  function openReminderItem(entry){
    if (entry.projectId){
      openItemModal(entry.projectId,entry.groupId,entry.itemId);
      return;
    }
    const item = (state.calendarItems||[]).find(candidate=>candidate.id===entry.itemId);
    if (item) openStandaloneCalendarItemModal(item);
  }

  function allItemsFlat(){
    const out = [];
    if (state.folderLazy){
      state.projectSummaries.forEach(project=>project.itemIndex.forEach(item=>{
        const group=project.groups.find(candidate=>candidate.id===item.groupId)||{id:item.groupId,name:item.groupName};
        out.push({project,group,item});
      }));
      return out;
    }
    state.projects.forEach(p=> p.groups.forEach(g=> g.items.forEach(it=>
      out.push({project:p, group:g, item:it}))));
    return out;
  }

  async function addProject(name, templateKey, description=null){
    if (state.folderLazy && state.projects.length){
      if (!await flushSave()){
        await showNotice("Project creation paused","Resolve the pending save before unloading the open project.");
        return;
      }
      state.projects=[];
    }
    const tpl = PROJECT_TEMPLATES[templateKey] || PROJECT_TEMPLATES.blank;
    const views = tpl.views.map(type=>({id:uid(), type, name:viewLabel(type)}));
    const p = {
      id:uid(), name, description, createdAt:Date.now(), folderId:null,
      tags:[],
      fields: buildFieldsForTemplate(tpl.fields),
      groups: tpl.groups.map(gName=>({id:uid(), name:gName, items:[]})),
      views, activeViewId: views[0].id,
      itemDefaultType: tpl.itemDefaultType || "task",
    };
    if (state.folderLazy) state.projects=[p]; else state.projects.push(p);
    registerProjectSummary(p);
    activeProjectId = p.id;
    persistActiveLocation();
    scheduleSave(); renderAll();
    return p;
  }
  async function editProject(project){
    const result = await showDialog({title:"Edit project", fields:[
      {label:"Project name", value:project.name},
      {label:"Description", type:"textarea", placeholder:"What is this project about?", value:project.description||""},
      {label:"Project icon", type:"iconPicker", value:project.icon || DEFAULT_PROJECT_ICON}
    ], confirmLabel:"Save"});
    if (!result) return;
    const [name,description,icon] = result;
    if (!name.trim()){
      await showNotice("Project name required", "Enter a name for this project.");
      return;
    }
    project.name = name.trim();
    project.description = description.trim() || null;
    project.icon = icon || DEFAULT_PROJECT_ICON;
    scheduleSave();
    renderAll();
  }
  async function createFolder(){
    const name = await showDialog({title:"New folder", fields:[{label:"Folder name", placeholder:"e.g. Personal"}], confirmLabel:"Create folder"});
    if (!name || !name.trim()) return;
    state.folders.push({id:uid(), name:name.trim()});
    scheduleSave(); renderProjectList();
  }
  async function moveProjectToFolder(project){
    const folderId = await showDialog({title:"Move project to folder", fields:[{label:"Folder", type:"select", options:[{value:"",label:"No folder"}, ...state.folders.map(folder=>({value:folder.id,label:folder.name}))], value:project.folderId || ""}], confirmLabel:"Move project"});
    if (folderId === null) return;
    project.folderId = folderId || null;
    scheduleSave(); renderProjectList();
  }
  function addView(project, type){
    const v = {id:uid(), type, name:viewLabel(type)};
    project.views.push(v);
    project.activeViewId = v.id;
    scheduleSave(); render();
  }
  function removeView(project, viewId){
    if (project.views.length <= 1) return;
    project.views = project.views.filter(v=>v.id!==viewId);
    if (project.activeViewId===viewId) project.activeViewId = project.views[0].id;
    scheduleSave(); render();
  }
  async function createMilestone(project){
    const result=await showDialog({title:"New milestone",fields:[
      {label:"Milestone name",placeholder:"e.g. First release"},
      {label:"Due date",type:"date"}
    ],confirmLabel:"Create milestone"});
    if (!result) return;
    const [title,dueDate]=result;
    if (!title.trim()){
      await showNotice("Milestone name required","Enter a name for this milestone.");
      return;
    }
    if (!Array.isArray(project.milestones)) project.milestones=[];
    project.milestones.push({id:uid(),title:title.trim(),dueDate:dueDate||null});
    scheduleSave();
    render();
  }
  async function editMilestone(project,milestone){
    const result=await showDialog({title:"Edit milestone",fields:[
      {label:"Milestone name",value:milestone.title},
      {label:"Due date",type:"date",value:milestone.dueDate||""}
    ],confirmLabel:"Save milestone"});
    if (!result) return;
    const [title,dueDate]=result;
    if (!title.trim()){
      await showNotice("Milestone name required","Enter a name for this milestone.");
      return;
    }
    milestone.title=title.trim();
    milestone.dueDate=dueDate||null;
    scheduleSave();
    render();
  }
  async function deleteMilestone(project,milestone){
    if (!await showConfirm(`Delete milestone ${milestone.title}`,"Linked tasks will be kept and unlinked from this milestone.",true)) return;
    project.groups.forEach(group=>group.items.forEach(item=>{
      if (item.milestoneId===milestone.id) item.milestoneId=null;
    }));
    project.milestones=project.milestones.filter(candidate=>candidate.id!==milestone.id);
    scheduleSave();
    render();
  }
  async function deleteProject(pid){
    const project = await ensureProjectLoaded(pid);
    if (project) project.groups.forEach(group=>group.items.forEach(queueGoogleEventDeletes));
    state.projects = state.projects.filter(p=>p.id!==pid);
    if (state.folderLazy) state.projectSummaries=state.projectSummaries.filter(project=>project.id!==pid);
    if (activeProjectId===pid){
      activeProjectId = projectRecords()[0]?.id || OVERVIEW;
      persistActiveLocation();
    }
    scheduleSave(); renderAll();
  }
  async function duplicateProject(project){
    const proposedName = `${project.name} (copy)`;
    const name = await showDialog({
      title:"Duplicate project",
      message:"Groups, fields, tags, milestones, views, and items will be copied. Comments and Google Calendar sync history won't be copied. Scheduled items may sync as new events.",
      fields:[{label:"Project name", value:proposedName}],
      confirmLabel:"Duplicate"
    });
    if (!name || !name.trim()) return;
    if (state.folderLazy && !await flushSave()){
      await showNotice("Project duplication paused","Resolve the pending save before replacing the open project in memory.");
      return;
    }

    const fieldIds = new Map();
    const optionIds = new Map();
    const tagIds = new Map();
    const groupIds = new Map();
    const viewIds = new Map();
    const milestoneIds = new Map();
    const now = Date.now();
    const fields = (project.fields||[]).map(field=>{
      const id = uid();
      fieldIds.set(field.id, id);
      const options = (field.options||[]).map(option=>{
        const optionId = uid();
        optionIds.set(option.id, optionId);
        return {...option, id:optionId};
      });
      return {...field, id, options};
    });
    const tags = (project.tags||[]).map(tag=>{
      const id = uid();
      tagIds.set(tag.id, id);
      return {...tag, id};
    });
    const groups = project.groups||[];
    const views = project.views||[];
    groups.forEach(group=>groupIds.set(group.id, uid()));
    views.forEach(view=>viewIds.set(view.id, uid()));
    (project.milestones||[]).forEach(milestone=>milestoneIds.set(milestone.id,uid()));

    const copyItem = item=>{
      const values = {};
      Object.entries(item.values||{}).forEach(([fieldId,value])=>{
        values[fieldIds.get(fieldId)||fieldId] = optionIds.get(value)||value;
      });
      const copy = {
        ...item,
        id:uid(),
        tagIds:(item.tagIds||[]).map(id=>tagIds.get(id)).filter(Boolean),
        milestoneId:milestoneIds.get(item.milestoneId)||null,
        attachments:(item.attachments||[]).map(attachment=>({...attachment})),
        values,
        subitems:(item.subitems||[]).map(subitem=>({...subitem,id:uid()})),
        comments:[],
        createdAt:now,
        updatedAt:now
      };
      delete copy.googleEventIds;
      delete copy.googleSyncMeta;
      return copy;
    };
    const copy = {
      ...project,
      id:uid(),
      name:name.trim(),
      createdAt:now,
      fields,
      tags,
      milestones:(project.milestones||[]).map(milestone=>({...milestone,id:milestoneIds.get(milestone.id)})),
      groups:groups.map(group=>({
        ...group,
        id:groupIds.get(group.id),
        items:(group.items||[]).map(copyItem)
      })),
      views:views.map(view=>({...view,id:viewIds.get(view.id)})),
      activeViewId:viewIds.get(project.activeViewId)||viewIds.get(views[0]?.id)
    };
    if (state.folderLazy) state.projects=[copy]; else state.projects.push(copy);
    registerProjectSummary(copy);
    activeProjectId = copy.id;
    persistActiveLocation();
    scheduleSave();
    renderAll();
  }
  function addGroup(pid, name){
    const project = getProject(pid);
    if (!project) return;
    project.groups.push({id:uid(), name, items:[]});
    scheduleSave(); render();
  }
  function deleteGroup(pid, gid, targetGroupId){
    const p = getProject(pid);
    if (!p || p.groups.length <= 1){
      showNotice("Group required", "A project needs at least one group.");
      return;
    }
    const group = p.groups.find(candidate=>candidate.id===gid);
    if (!group) return;
    if (group.items.length){
      const target = p.groups.find(candidate=>candidate.id===targetGroupId && candidate.id!==gid);
      if (!target) return;
      const now = Date.now();
      group.items.forEach(item=>{ item.updatedAt = now; target.items.push(item); });
    }
    p.groups = p.groups.filter(g=>g.id!==gid);
    boardFilterGroups.delete(gid);
    scheduleSave(); render(); renderProjectList();
  }
  async function editGroupName(project, group){
    const name = await showDialog({title:"Edit group", fields:[{label:"Group name", value:group.name}], confirmLabel:"Save"});
    if (!name || !name.trim()) return;
    group.name = name.trim();
    scheduleSave(); renderAll();
  }
  async function confirmDeleteGroup(project, group){
    if (!project.groups.includes(group)) return;
    if (project.groups.length<=1){ await showNotice("Group required", "A project needs at least one group."); return; }
    let targetGroupId = null;
    if (group.items.length){
      targetGroupId = await showDialog({
        title:`Delete group ${group.name}`,
        message:`Choose where to move its ${group.items.length} item(s). The items and their calendar links will be preserved.`,
        fields:[{label:"Move items to", type:"select", options:project.groups.filter(candidate=>candidate.id!==group.id).map(candidate=>({value:candidate.id,label:candidate.name})), value:project.groups.find(candidate=>candidate.id!==group.id)?.id}],
        confirmLabel:"Move items and delete",
        danger:true
      });
      if (!targetGroupId) return;
    } else if (!await showConfirm(`Delete group ${group.name}`, "This group is empty. Delete it?", true)){
      return;
    }
    deleteGroup(project.id, group.id, targetGroupId);
  }
  function addItem(pid, gid, title){
    const it = createItem(pid,title);
    getGroup(pid,gid).items.push(it);
    scheduleSave(); render();
    return it;
  }
  function createItem(pid,title){
    const project = getProject(pid);
    const it = {id:uid(), title, description:"", attachments:[], calendarType:(project && project.itemDefaultType==="event") ? "event" : "task",
      startTime:"", endTime:"", location:"", endDate:"", completedAt:null, milestoneId:null, tagIds:[], values:{}, subitems:[],
      comments:[], activity:[], archived:false, createdAt:Date.now(), updatedAt:Date.now()};
    recordItemActivity(it, "created");
    return it;
  }
  async function openCsvImportDialog(destinationMode="existing",targetProjectId=activeProjectId){
    if (!fileHandle){
      await showNotice("Connect a workspace first","Open or create a workspace before importing tasks.");
      return;
    }
    try{
      await window.BeforeworkViewTemplates.load("csvImport");
    }catch(error){
      await showNotice("Couldn't open CSV import",error.message);
      return;
    }

    const templateFragment=window.BeforeworkViewTemplates.clone("csvImport");
    const dialogTemplate=templateFragment.querySelector("#csvImportDialog");
    if (!dialogTemplate){
      await showNotice("Couldn't open CSV import","The CSV import dialog template is missing.");
      return;
    }
    const overlay=dialogTemplate.content.firstElementChild.cloneNode(true);
    const destination=overlay.querySelector("[data-csv-destination]");
    destination.closest(".csvImportField").hidden=true;
    destination.disabled=true;
    const setup=overlay.querySelector(".csvImportSetup");
    const existingWrap=overlay.querySelector("[data-csv-existing-wrap]");
    const existingProject=overlay.querySelector("[data-csv-existing-project]");
    existingProject.disabled=true;
    const newWrap=overlay.querySelector("[data-csv-new-wrap]");
    const newName=overlay.querySelector("[data-csv-new-name]");
    const templateWrap=overlay.querySelector("[data-csv-template-wrap]");
    const templateSelect=overlay.querySelector("[data-csv-template]");
    const fileInput=overlay.querySelector("[data-csv-file]");
    const fileButton=overlay.querySelector("[data-csv-file-button]");
    const fileName=overlay.querySelector("[data-csv-file-name]");
    const status=overlay.querySelector("[data-csv-status]");
    const stepPanels=[...overlay.querySelectorAll("[data-csv-step]")];
    const stepIndicators=[...overlay.querySelectorAll("[data-csv-step-indicator]")];
    const backButton=overlay.querySelector("[data-csv-back]");
    const nextButton=overlay.querySelector("[data-csv-next]");
    const mappingSection=overlay.querySelector("[data-csv-mapping]");
    const mappingFields=overlay.querySelector("[data-csv-mapping-fields]");
    const previewSummary=overlay.querySelector("[data-csv-preview-summary]");
    const previewHead=overlay.querySelector("[data-csv-preview-head]");
    const previewBody=overlay.querySelector("[data-csv-preview-body]");
    const confirmButton=overlay.querySelector("[data-csv-confirm]");
    let dateFormatSelect=null;
    let dateFormatControl=null;
    let dateFormatTargetKeys=new Set();
    const context={parsed:null,project:null,fields:[],targets:[],selectionToken:0,closed:false,step:1};

    const close=()=>{
      context.closed=true;
      overlay.remove();
    };
    overlay.querySelectorAll("[data-csv-cancel]").forEach(button=>button.addEventListener("click",close));
    overlay.addEventListener("click",event=>{ if (event.target===overlay) close(); });
    overlay.addEventListener("keydown",event=>{ if (event.key==="Escape"){ event.preventDefault(); close(); } });
    document.body.appendChild(overlay);

    const records=projectRecords();
    overlay.querySelector("#csvImportTitle").textContent=destinationMode==="new" ? "Import project from CSV" : "Import tasks from CSV";
    const helpText=overlay.querySelector(".csvImportHelp");
    helpText.textContent=destinationMode==="new"
      ? "Create a new project and import its tasks from a CSV file."
      : "Import tasks from a CSV file into this project.";
    confirmButton.textContent=destinationMode==="new" ? "Create project" : "Import tasks";
    existingProject.replaceChildren(...records.map(project=>{
      const option=document.createElement("option");
      option.value=project.id;
      option.textContent=project.name;
      return option;
    }));
    const initial=records.find(project=>project.id===activeProjectId)||records[0];
    if (destinationMode==="new"){
      destination.value="new";
    }else if (records.some(project=>project.id===targetProjectId)){
      existingProject.value=targetProjectId;
      destination.value="existing";
      helpText.textContent=`Import tasks from a CSV file into ${records.find(project=>project.id===targetProjectId).name}.`;
    }else if (initial){
      existingProject.value=initial.id;
      destination.value="existing";
      helpText.textContent=`Import tasks from a CSV file into ${initial.name}.`;
    }else destination.value="new";

    const setStatus=(message,isError=false)=>{
      status.textContent=message;
      status.classList.toggle("error",isError);
    };
    const updateStep=()=>{
      stepPanels.forEach(panel=>{ panel.hidden=Number(panel.dataset.csvStep)!==context.step; });
      stepIndicators.forEach(indicator=>{
        if (Number(indicator.dataset.csvStepIndicator)===context.step) indicator.setAttribute("aria-current","step");
        else indicator.removeAttribute("aria-current");
      });
      backButton.hidden=context.step===1;
      nextButton.hidden=context.step!==1;
      confirmButton.hidden=context.step!==2;
      nextButton.disabled=!context.parsed || (destination.value==="new" && !newName.value.trim());
    };
    const getTemplateFields=()=>{
      const template=PROJECT_TEMPLATES[templateSelect.value]||PROJECT_TEMPLATES.blank;
      return buildFieldsForTemplate(template.fields);
    };
    const currentTargetProject=()=>{
      if (destination.value==="new") return null;
      const selectedId=existingProject.value;
      if (!selectedId) return null;
      const project=getProject(selectedId);
      if (!project) throw new Error("Couldn't load the selected project.");
      return project;
    };
    const makeTargets=project=>{
      const fields=project ? project.fields : getTemplateFields();
      const targets=[
        {key:"title",kind:"title",label:"Task title",required:true},
        {key:"description",kind:"description",label:"Description"},
        {key:"startDate",kind:"startDate",label:"Start date"},
        {key:"dueDate",kind:"dueDate",label:"Due date"},
        {key:"status",kind:"status",label:"Status / group"},
        {key:"tags",kind:"tags",label:"Tags"}
      ];
      const startField=fields.find(field=>field.type==="start-date")
        || fields.find(field=>field.type==="date"&&/^(start|start date|starts on)$/.test(String(field.label||"").trim().toLowerCase()));
      const dueField=fields.find(field=>field.type==="due-date")
        || fields.find(field=>field.type==="date"&&/^(due|due date|deadline)$/.test(String(field.label||"").trim().toLowerCase()));
      targets.find(target=>target.kind==="startDate").fieldId=startField?.id||null;
      targets.find(target=>target.kind==="startDate").fieldIndex=startField?fields.indexOf(startField):null;
      targets.find(target=>target.kind==="dueDate").fieldId=dueField?.id||null;
      targets.find(target=>target.kind==="dueDate").fieldIndex=dueField?fields.indexOf(dueField):null;
      fields.forEach((field,index)=>{
        if (field.type==="date"&&field!==startField&&field!==dueField){
          targets.push({key:`customDate:${index}`,kind:"customDate",fieldId:field.id,fieldIndex:index,label:`Date - ${field.label}`});
        }
        if (field.type==="priority") targets.push({
          key:`priority:${index}`,kind:"priority",fieldId:field.id,fieldIndex:index,label:`Priority - ${field.label}`
        });
      });
      return targets;
    };
    const guessTarget=(target,header)=>{
      const value=header.trim().toLowerCase();
      if (target.kind==="title" && /^(title|task|task name|name)$/.test(value)) return true;
      if (target.kind==="description" && /^(description|details|notes)$/.test(value)) return true;
      if (target.kind==="startDate" && /^(start|start date|start_date|starts on)$/.test(value)) return true;
      if (target.kind==="status" && /^(status|group|stage)$/.test(value)) return true;
      if (target.kind==="tags" && /^(tag|tags|label|labels)$/.test(value)) return true;
      if (target.kind==="dueDate" && /^(due|due date|deadline)$/.test(value)) return true;
      if (target.kind==="priority" && /^priority$/.test(value)) return true;
      return false;
    };
    const selectedProjectForPreview=()=>context.project;

    function refreshPreview(){
      const project=selectedProjectForPreview();
      const selectedTargets=new Map();
      const selectedColumns=new Set();
      mappingFields.querySelectorAll("[data-csv-target]").forEach(select=>{
        if (select.value==="" || !Number.isInteger(Number(select.value))) return;
        const column=Number(select.value);
        selectedTargets.set(select.dataset.csvTarget,column);
        selectedColumns.add(column);
      });
      mappingFields.querySelectorAll("[data-csv-target]").forEach(select=>{
        [...select.options].forEach(option=>{
          if (!option.value || option.value===select.value) return;
          option.disabled=selectedColumns.has(Number(option.value));
        });
      });

      const mapping={};
      let startDateFieldId=null,dueDateFieldId=null,priorityFieldId=null;
      let startDateFieldIndex=null,dueDateFieldIndex=null,priorityFieldIndex=null;
      for (const target of context.targets){
        if (selectedTargets.has(target.key)){
          mapping[target.kind==="customDate"?target.key:target.kind]=selectedTargets.get(target.key);
          if (target.kind==="startDate"){ startDateFieldId=target.fieldId; startDateFieldIndex=target.fieldIndex; }
          if (target.kind==="dueDate"){ dueDateFieldId=target.fieldId; dueDateFieldIndex=target.fieldIndex; }
          if (target.kind==="priority"){ priorityFieldId=target.fieldId; priorityFieldIndex=target.fieldIndex; }
        }
      }
      if (dateFormatControl) dateFormatControl.hidden=![...dateFormatTargetKeys].some(key=>selectedTargets.has(key));
      const hasTitle=Object.hasOwn(mapping,"title");
      const nameValid=destination.value!=="new" || !!newName.value.trim();
      const selectedProject=project;
      const groupNames=selectedProject
        ? selectedProject.groups.map(group=>group.name)
        : (PROJECT_TEMPLATES[templateSelect.value]||PROJECT_TEMPLATES.blank).groups;
      const prepared=context.parsed && hasTitle
        ? window.BeforeworkCsvImport.prepareImport(context.parsed,mapping,groupNames,dateFormatSelect?.value||"DMY")
        : null;
      previewHead.replaceChildren();
      previewBody.replaceChildren();

      if (!context.parsed){ confirmButton.disabled=true; return; }
      if (!hasTitle){
        previewSummary.textContent="Map a CSV column to Task title to continue.";
        setStatus("Choose a CSV file and map its task title column.");
      }else if (prepared.errors.length){
        const extra=prepared.errors.length>3 ? ` And ${prepared.errors.length-3} more.` : "";
        setStatus(`${prepared.errors.slice(0,3).join(" ")}${extra}`,true);
        previewSummary.textContent=`${prepared.tasks.length} CSV row(s) found; fix the errors before importing.`;
      }else{
        setStatus("");
        previewSummary.textContent=`${prepared.tasks.length} task(s) ready to import.${prepared.groupsToCreate.length ? ` New groups will be created: ${prepared.groupsToCreate.join(", ")}.` : ""}`;
      }

      const columns=context.targets.filter(target=>selectedTargets.has(target.key));
      const headingRow=document.createElement("tr");
      columns.forEach(target=>{
        const cell=document.createElement("th");
        cell.scope="col";
        cell.textContent=target.label;
        headingRow.appendChild(cell);
      });
      previewHead.appendChild(headingRow);
      const sample=(prepared?.tasks||[]).slice(0,5);
      sample.forEach(task=>{
        const row=document.createElement("tr");
        columns.forEach(target=>{
          const cell=document.createElement("td");
          const kind=target.kind;
          cell.textContent=kind==="dueDate" ? task.dueDate
            : kind==="startDate" ? task.startDate
              : kind==="customDate" ? task.customDates[target.key]||""
            : kind==="priority" ? task.priority
              : kind==="tags" ? task.tags.join(", ")
                : kind==="status" ? task.status||groupNames[0]||""
                  : task[kind]||"";
          row.appendChild(cell);
        });
        previewBody.appendChild(row);
      });
      if (prepared && !prepared.errors.length && nameValid && (destination.value==="new" || !!selectedProject)){
        confirmButton.disabled=false;
      }else confirmButton.disabled=true;
      context.mapping={mapping,startDateFieldId,dueDateFieldId,priorityFieldId,startDateFieldIndex,dueDateFieldIndex,priorityFieldIndex,
        customDateFields:context.targets.filter(target=>target.kind==="customDate"&&selectedTargets.has(target.key))
          .map(target=>({key:target.key,fieldId:target.fieldId,fieldIndex:target.fieldIndex})),
        prepared};
    }

    function renderMapping(){
      if (!context.parsed) return;
      context.targets=makeTargets(context.project);
      mappingFields.replaceChildren();
      dateFormatSelect=null;
      dateFormatControl=null;
      dateFormatTargetKeys=new Set();
      context.targets.forEach(target=>{
        const label=document.createElement("div");
        label.className="csvImportField";
        const caption=document.createElement("span");
        caption.textContent=target.required ? `${target.label} (required)` : target.label;
        const select=document.createElement("select");
        select.className="form-control";
        select.dataset.csvTarget=target.key;
        const selectId=`csvImportTarget-${target.key.replace(/[^a-z0-9_-]/gi,"-")}`;
        select.id=selectId;
        caption.htmlFor=selectId;
        const skip=document.createElement("option");
        skip.value="";
        skip.textContent="Don't import";
        select.appendChild(skip);
        context.parsed.headers.forEach((header,index)=>{
          const option=document.createElement("option");
          option.value=String(index);
          option.textContent=header;
          if (guessTarget(target,header)) option.selected=true;
          select.appendChild(option);
        });
        select.addEventListener("change",refreshPreview);
        label.append(caption,select);
        if ((target.kind==="dueDate"||target.kind==="startDate")&&!dateFormatControl){
          dateFormatControl=document.createElement("div");
          dateFormatControl.className="csvImportDateFormatControl";
          dateFormatControl.hidden=true;
          const formatLabel=document.createElement("label");
          formatLabel.className="csvImportDateFormatLabel";
          formatLabel.htmlFor="csvImportDateFormat";
          formatLabel.textContent="Date format";
          dateFormatSelect=document.createElement("select");
          dateFormatSelect.className="form-control";
          dateFormatSelect.id="csvImportDateFormat";
          dateFormatSelect.dataset.csvDateFormat="";
          dateFormatSelect.innerHTML=`
            <option value="DMY" selected>Day / Month / Year (29/12/2024)</option>
            <option value="MDY">Month / Day / Year (12/29/2024)</option>
            <option value="YMD">Year / Month / Day (2024-12-29)</option>`;
          dateFormatSelect.addEventListener("change",refreshPreview);
          dateFormatControl.append(formatLabel,dateFormatSelect);
          label.appendChild(dateFormatControl);
        }
        if (target.kind==="dueDate"||target.kind==="startDate"||target.kind==="customDate") dateFormatTargetKeys.add(target.key);
        mappingFields.appendChild(label);
      });
      refreshPreview();
    }

    async function refreshProjectAndMapping(){
      const token=++context.selectionToken;
      confirmButton.disabled=true;
      context.project=null;
      if (destination.value==="existing"){
        if (!existingProject.value){
          setStatus("Create a project before importing tasks.",true);
          renderMapping();
          return;
        }
        setStatus("Loading project…");
        try{
          const project=await currentTargetProject();
          if (context.closed || token!==context.selectionToken) return;
          context.project=project;
        }catch(error){
          if (context.closed || token!==context.selectionToken) return;
          setStatus(error.message,true);
        }
      }
      if (context.closed || token!==context.selectionToken) return;
      if (context.step===2) renderMapping();
      if (!context.parsed) setStatus(destination.value==="new" ? "Choose a CSV file to continue." : "");
      updateStep();
    }

    destination.addEventListener("change",()=>{
      const isNew=destination.value==="new";
      setup.classList.toggle("is-new-project",isNew);
      existingWrap.hidden=isNew;
      newWrap.hidden=!isNew;
      templateWrap.hidden=!isNew;
      refreshProjectAndMapping();
    });
    existingProject.addEventListener("change",refreshProjectAndMapping);
    templateSelect.addEventListener("change",renderMapping);
    newName.addEventListener("input",updateStep);
    nextButton.addEventListener("click",()=>{
      if (!context.parsed || (destination.value==="new" && !newName.value.trim())) return;
      context.step=2;
      setStatus("");
      updateStep();
      renderMapping();
      mappingFields.querySelector("[data-csv-target]")?.focus();
    });
    backButton.addEventListener("click",()=>{
      context.step=1;
      setStatus("");
      updateStep();
    });
    fileButton.addEventListener("click",()=>fileInput.click());
    fileInput.addEventListener("change",async()=>{
      context.parsed=null;
      mappingFields.replaceChildren();
      confirmButton.disabled=true;
      updateStep();
      const file=fileInput.files?.[0];
      fileName.textContent=file?.name||"No file selected";
      if (!file){ refreshPreview(); setStatus(""); return; }
      try{
        window.BeforeworkCsvImport.validateFile(file);
        const bytes=await file.arrayBuffer();
        let text;
        const view=new Uint8Array(bytes);
        if (view[0]===0xFF && view[1]===0xFE) text=new TextDecoder("utf-16le").decode(bytes);
        else if (view[0]===0xFE && view[1]===0xFF) text=new TextDecoder("utf-16be").decode(bytes);
        else text=new TextDecoder("utf-8").decode(bytes);
        context.parsed=window.BeforeworkCsvImport.parseCsv(text);
        await refreshProjectAndMapping();
        setStatus("CSV loaded. Continue to map its columns.");
      }catch(error){
        context.parsed=null;
        refreshPreview();
        updateStep();
        setStatus(error.message,true);
      }
    });
    confirmButton.addEventListener("click",async()=>{
      confirmButton.disabled=true;
      try{
        const prepared=context.mapping?.prepared;
        if (!prepared || prepared.errors.length) throw new Error("Fix the CSV mapping errors before importing.");
        let project=context.project;
        if (destination.value==="new"){
          project=await addProject(newName.value.trim(),templateSelect.value,null);
          if (!project) throw new Error("The project could not be created. Resolve any pending workspace save and try again.");
        }else{
          project=await ensureProjectLoaded(existingProject.value);
          if (!project) throw new Error("Couldn't load the selected project.");
        }
        if (!project.groups.length) project.groups.push({id:uid(),name:"Items",items:[]});

        let startField=destination.value==="new"
          ? project.fields[context.mapping.startDateFieldIndex]
          : project.fields.find(field=>field.id===context.mapping.startDateFieldId);
        let dueField=destination.value==="new"
          ? project.fields[context.mapping.dueDateFieldIndex]
          : project.fields.find(field=>field.id===context.mapping.dueDateFieldId);
        const priorityField=destination.value==="new"
          ? project.fields[context.mapping.priorityFieldIndex]
          : project.fields.find(field=>field.id===context.mapping.priorityFieldId);
        if (context.mapping.startDateFieldId && !startField) throw new Error("The selected start-date field is no longer available.");
        if (context.mapping.dueDateFieldId && !dueField) throw new Error("The selected due-date field is no longer available.");
        if (context.mapping.priorityFieldId && !priorityField) throw new Error("The selected priority field is no longer available.");
        if (context.mapping.mapping.startDate!==undefined&&!startField){
          startField={id:uid(),label:"Start date",type:"start-date",options:[]};
          project.fields.push(startField);
        }
        if (context.mapping.mapping.dueDate!==undefined&&!dueField){
          dueField={id:uid(),label:"Due date",type:"due-date",options:[]};
          project.fields.push(dueField);
        }
        const customDateFields=context.mapping.customDateFields.map(target=>{
          const field=destination.value==="new"
            ? project.fields[target.fieldIndex]
            : project.fields.find(candidate=>candidate.id===target.fieldId);
          if (!field) throw new Error("A selected custom date column is no longer available.");
          return {...target,field};
        });
        const groups=new Map(project.groups.map(group=>[group.name.trim().toLowerCase(),group]));
        prepared.groupsToCreate.forEach(name=>{
          const group={id:uid(),name,items:[]};
          project.groups.push(group);
          groups.set(name.trim().toLowerCase(),group);
        });
        const tags=new Map(project.tags.map(tag=>[tag.name.trim().toLowerCase(),tag]));

        for (const imported of prepared.tasks){
          const group=imported.status ? groups.get(imported.status.trim().toLowerCase()) : project.groups[0];
          if (!group) throw new Error(`Couldn't find a group for status "${imported.status}".`);
          const item=createItem(project.id,imported.title);
          item.description=imported.description;
          if (startField && imported.startDate) item.values[startField.id]=imported.startDate;
          if (dueField && imported.dueDate) item.values[dueField.id]=imported.dueDate;
          customDateFields.forEach(({key,field})=>{
            if (imported.customDates[key]) item.values[field.id]=imported.customDates[key];
          });
          if (priorityField && imported.priority) item.values[priorityField.id]=imported.priority;
          imported.tags.forEach(name=>{
            const key=name.trim().toLowerCase();
            let tag=tags.get(key);
            if (!tag){ tag=createTag(project,name); tags.set(key,tag); }
            if (!item.tagIds.includes(tag.id)) item.tagIds.push(tag.id);
          });
          group.items.push(item);
        }
        activeProjectId=project.id;
        persistActiveLocation();
        registerProjectSummary(project);
        scheduleSave();
        renderAll();
        close();
        await showNotice(destinationMode==="new" ? "Project created" : "CSV import complete",
          `Imported ${prepared.tasks.length} task(s) into ${project.name}.`);
      }catch(error){
        confirmButton.disabled=false;
        setStatus(error.message,true);
      }
    });

    existingWrap.hidden=true;
    newWrap.hidden=destination.value!=="new";
    templateWrap.hidden=destination.value!=="new";
    setup.classList.toggle("is-new-project",destination.value==="new");
    context.step=1;
    updateStep();
    if (destination.value==="new") newName.focus();
    else fileButton.focus();
    await refreshProjectAndMapping();
  }
  function openNewItemModal(project, group, milestoneId=null){
    if (!project || !group) return;
    openItemRef = {projectId:project.id, groupId:group.id, itemId:null, isNew:true, globalNew:false, draft:{
      id:uid(), title:"", description:"", attachments:[], calendarType:project.itemDefaultType==="event" ? "event" : "task",
      startTime:"", endTime:"", location:"", endDate:"", completedAt:null, milestoneId, tagIds:[], values:{}, subitems:[], comments:[],
      activity:[], archived:false, createdAt:Date.now(), updatedAt:Date.now()
    }};
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.id = "itemOverlay";
    overlay.innerHTML = `<div class="Overlay Overlay--size-medium position-relative" data-modal id="itemModal"></div>`;
    overlay.addEventListener("click", event=>{ if (event.target===overlay) closeItemModal(); });
    document.body.appendChild(overlay);
    renderItemModal();
    const titleInput = document.getElementById("itemTitleInput");
    if (titleInput) titleInput.focus();
  }
  function deleteItem(pid,gid,iid){
    const g = getGroup(pid,gid);
    const item = g.items.find(candidate=>candidate.id===iid);
    queueGoogleEventDeletes(item);
    g.items = g.items.filter(i=>i.id!==iid);
    scheduleSave(); render();
  }
  function makeDuplicateItem(source){
    const now = Date.now();
    const copy = {
      ...source,
      id:uid(),
      title:`${source.title} (copy)`,
      tagIds:[...(source.tagIds||[])],
      attachments:(source.attachments||[]).map(attachment=>({...attachment})),
      values:{...(source.values||{})},
      subitems:(source.subitems||[]).map(subitem=>({...subitem,id:uid(),done:false})),
      comments:[],
      activity:[],
      archived:false,
      completedAt:null,
      createdAt:now,
      updatedAt:now
    };
    recordItemActivity(copy, "created");
    delete copy.googleEventIds;
    delete copy.googleSyncMeta;
    return copy;
  }
  function duplicateItem(pid,gid,iid){
    const group = getGroup(pid,gid);
    const index = group?.items.findIndex(candidate=>candidate.id===iid) ?? -1;
    if (index<0) return null;
    const copy = makeDuplicateItem(group.items[index]);
    group.items.splice(index+1,0,copy);
    scheduleSave();
    render();
    return copy;
  }
  function toggleArchiveItem(pid,gid,iid){
    const item = getItem(pid,gid,iid);
    if (!item) return;
    item.archived = !item.archived;
    item.updatedAt = Date.now();
    scheduleSave(); render(); renderProjectList();
  }
  function addComment(pid,gid,iid,text){
    const item = getItem(pid,gid,iid);
    if (!item || !text.trim()) return;
    item.comments.push({id:uid(), text:text.trim(), createdAt:Date.now()});
    recordItemActivity(item, "commented");
    item.updatedAt = Date.now();
    scheduleSave(); render();
  }
  function deleteComment(pid,gid,iid,cid){
    const item = getItem(pid,gid,iid);
    if (!item) return;
    item.comments = item.comments.filter(c=>c.id!==cid);
    item.updatedAt = Date.now();
    scheduleSave(); render();
  }
  async function quickAddViaShortcut(){
    const project = getProject(activeProjectId);
    if (!project){ showNotice("Pick a project", "Open a project from the sidebar first, then press n to quickly add an item."); return; }
    const group = project.groups[0];
    if (!group) return;
    openNewItemModal(project, group);
  }
  function undoLastChange(){
    const previous = undoStack.pop();
    if (!previous){ showNotice("Nothing to undo", "There are no changes to undo yet."); return; }
    try{
      state = migrateState(JSON.parse(previous));
      lastSavedState = JSON.stringify(state);
      selectedItemIds.clear();
      scheduleSave(); renderAll();
    }catch(err){ showNotice("Undo failed", "Could not undo that change: " + err.message); }
  }
  function bulkSetCompleted(project, completed){
    if (!selectedItemIds.size) return;
    const now = Date.now();
    project.groups.forEach(group=>{
      group.items.forEach(item=>{
        if (!selectedItemIds.has(item.id)) return;
        const wasCompleted = isItemCompleted(item);
        item.completedAt = completed ? (wasCompleted ? item.completedAt || now : now) : null;
        item.updatedAt = now;
        recordItemActivity(item, completed ? "completed" : "reopened");
      });
    });
    selectedItemIds.clear(); scheduleSave(); renderAll();
  }
  async function bulkDelete(project){
    if (!selectedItemIds.size) return;
    if (!await showConfirm("Delete selected items", `Delete ${selectedItemIds.size} selected item(s)?`, true)) return;
    project.groups.forEach(g=>{
      g.items.forEach(item=>{ if (selectedItemIds.has(item.id)) queueGoogleEventDeletes(item); });
      g.items = g.items.filter(item=>!selectedItemIds.has(item.id));
    });
    selectedItemIds.clear(); scheduleSave(); render(); renderProjectList();
  }
  async function bulkMove(project){
    if (!selectedItemIds.size) return;
    const choice = await showDialog({title:"Move selected items", message:"Choose a destination group.", fields:[{label:"Destination", type:"select", options:project.groups.map(group=>({value:group.id,label:group.name})), value:project.groups[0]?.id}], confirmLabel:"Move"});
    const target = project.groups.find(group=>group.id===choice);
    if (!target) return;
    const now = Date.now();
    project.groups.forEach(g=>{
      const moving = g.items.filter(item=>selectedItemIds.has(item.id));
      g.items = g.items.filter(item=>!selectedItemIds.has(item.id));
      moving.forEach(item=>{ item.updatedAt = now; if (g.id!==target.id) recordItemActivity(item,"moved",{from:g.name,to:target.name}); target.items.push(item); });
    });
    selectedItemIds.clear(); scheduleSave(); render();
  }
  async function bulkTag(project){
    if (!selectedItemIds.size) return;
    const name = await showDialog({title:"Tag selected items", message:`Add a tag to ${selectedItemIds.size} selected item(s).`, fields:[{label:"Tag name", value:project.tags[0]?.name || "", placeholder:"e.g. urgent"}], confirmLabel:"Apply tag"});
    if (!name || !name.trim()) return;
    let tag = project.tags.find(t=>t.name.toLowerCase()===name.trim().toLowerCase());
    if (!tag){
      const color = await showDialog({title:`Pill color for ${name.trim()}`, fields:[
        {label:"Pill color", type:"tagColor", value:TAG_COLOR_OPTIONS[project.tags.length % TAG_COLOR_OPTIONS.length].value}
      ], confirmLabel:"Create tag"});
      if (!color) return;
      tag = createTag(project, name.trim(), color);
    }
    project.groups.forEach(g=>g.items.forEach(item=>{
      if (selectedItemIds.has(item.id) && !item.tagIds.includes(tag.id)){
        item.tagIds.push(tag.id); item.updatedAt = Date.now();
      }
    }));
    selectedItemIds.clear(); scheduleSave(); renderAll();
  }
  function bulkDuplicate(project){
    if (!selectedItemIds.size) return;
    const selected = new Set(selectedItemIds);
    project.groups.forEach(group=>{
      const items = [];
      group.items.forEach(item=>{
        items.push(item);
        if (selected.has(item.id)) items.push(makeDuplicateItem(item));
      });
      group.items = items;
    });
    selectedItemIds.clear();
    scheduleSave(); render(); renderProjectList();
  }
  function moveItem(pid, fromGid, toGid, iid, toIndex){
    const from = getGroup(pid, fromGid);
    const idx = from.items.findIndex(i=>i.id===iid);
    if (idx<0) return;
    const [item] = from.items.splice(idx,1);
    const to = getGroup(pid, toGid);
    if (toIndex==null || toIndex>to.items.length) to.items.push(item);
    else to.items.splice(toIndex,0,item);
    item.updatedAt = Date.now();
    if (fromGid!==toGid) recordItemActivity(item,"moved",{from:from.name,to:to.name});
    scheduleSave(); render();
  }
  function createTag(project, name, color){
    const t = {id:uid(), name, color: color || TAG_COLOR_OPTIONS[project.tags.length % TAG_COLOR_OPTIONS.length].value};
    project.tags.push(t);
    scheduleSave();
    return t;
  }
  function deleteTag(project, tid){
    project.tags = project.tags.filter(t=>t.id!==tid);
    project.groups.forEach(g=>g.items.forEach(it=> it.tagIds = it.tagIds.filter(id=>id!==tid)));
    boardFilterTags.delete(tid);
    scheduleSave(); renderAll();
  }
  async function addField(project, label, type){
    if (type==="date"&&/^(start|start date|starts on|due|due date|deadline)$/.test(label.trim().toLowerCase())){
      await showNotice("Choose a date-specific column type",`Use Start date or Due date for "${label}". Choose Date for a different kind of date.`);
      return;
    }
    if ((type==="start-date"||type==="due-date")&&project.fields.some(field=>field.type===type)){
      await showNotice(`${type==="start-date"?"Start date":"Due date"} column already exists`,
        "Each project can have one dedicated start date column and one dedicated due date column.");
      return;
    }
    const field = {id:uid(), label, type, options:[]};
    if (type==="select" || type==="multi-select"){
      const opts = await showDialog({title:"Column options", message:`Add options for "${label}" separated by commas.`, fields:[{label:"Options", placeholder:"Backlog, In progress, Blocked"}], confirmLabel:"Create column"});
      if (opts === null) return;
      field.options = (opts||"").split(",").map(s=>s.trim()).filter(Boolean)
        .map((l,i)=>({id:uid(), label:l, color:TAG_COLORS[i % TAG_COLORS.length]}));
    }
    project.fields.push(field);
    scheduleSave(); renderAll();
  }
  function deleteField(project, fid){
    project.fields = project.fields.filter(f=>f.id!==fid);
    project.groups.forEach(g=>g.items.forEach(it=>{ delete it.values[fid]; }));
    boardFilterFields.delete(fid);
    if (listSort.field===fid) listSort = {field:"updated", dir:"desc"};
    scheduleSave(); renderAll();
  }
  async function addColumnFlow(project){
    const availableFieldTypes=FIELD_TYPE_OPTIONS.filter(option=>
      !["start-date","due-date"].includes(option.value)
      || !project.fields.some(field=>field.type===option.value));
    const details = await showDialog({title:"Add column", fields:[
      {label:"Column type", type:"select", options:availableFieldTypes.map(({value,label,description})=>({value,label,description})), value:"select"},
      {label:"Column name", placeholder:"e.g. Status, Type, Effort"}
    ], confirmLabel:"Add column"});
    if (!details) return;
    const [type,label] = details;
    const fieldType=FIELD_TYPES.includes(type)?type:"select";
    const columnName=label?.trim()||(fieldType==="start-date"?"Start date":fieldType==="due-date"?"Due date":"");
    if (!columnName) return;
    await addField(project,columnName,fieldType);
  }
  function orderedTableColumns(project,viewType,columnIds){
    const saved=project.columnOrders?.[viewType]||[];
    const available=new Set(columnIds);
    const order=saved.filter(id=>available.has(id));
    columnIds.forEach(id=>{ if (!order.includes(id)) order.push(id); });
    return order;
  }
  function reorderTableColumn(project,viewType,columnIds,sourceId,targetId,position){
    if (!columnIds.includes(sourceId) || !columnIds.includes(targetId) || sourceId===targetId) return false;
    const order=orderedTableColumns(project,viewType,columnIds);
    const sourceIndex=order.indexOf(sourceId);
    order.splice(sourceIndex,1);
    const targetIndex=order.indexOf(targetId);
    order.splice(targetIndex+(position==="after"?1:0),0,sourceId);
    if (!project.columnOrders || typeof project.columnOrders!=="object") project.columnOrders={};
    project.columnOrders[viewType]=order;
    return true;
  }
  function columnDragHandleHtml(label){
    return `<button type="button" class="fieldColumnDragHandle" draggable="true" aria-label="Reorder ${escapeHtml(label)} column" title="Drag to reorder column"><iconify-icon icon="mdi:drag-horizontal" aria-hidden="true"></iconify-icon></button>`;
  }
  function applyTableColumnOrder(table,project,viewType){
    const headerRow=table.tHead?.rows[0];
    if (!headerRow) return;
    const headers=[...headerRow.cells].filter(cell=>cell.dataset.columnId);
    const columnIds=headers.map(cell=>cell.dataset.columnId);
    const order=orderedTableColumns(project,viewType,columnIds);
    const reorderRow=row=>{
      const cells=new Map([...row.cells].filter(cell=>cell.dataset.columnId).map(cell=>[cell.dataset.columnId,cell]));
      order.forEach(id=>{ const cell=cells.get(id); if (cell) row.appendChild(cell); });
    };
    reorderRow(headerRow);
    [...table.tBodies].forEach(body=>[...body.rows].forEach(reorderRow));
  }
  function wireTableColumnReordering(table,project,viewType){
    const getColumnIds=()=>[...table.tHead.rows[0].cells].filter(cell=>cell.dataset.columnId).map(cell=>cell.dataset.columnId);
    table.querySelectorAll("th[data-column-id]").forEach(th=>{
      const dragHandle=th.querySelector(".fieldColumnDragHandle");
      if (!dragHandle) return;
      const clearDragStyles=()=>table.querySelectorAll(".columnDragging,.columnDropTarget,.columnDropAfter").forEach(header=>header.classList.remove("columnDragging","columnDropTarget","columnDropAfter"));
      dragHandle.addEventListener("click",event=>event.stopPropagation());
      dragHandle.addEventListener("dragstart",event=>{
        event.stopPropagation();
        event.dataTransfer.effectAllowed="move";
        event.dataTransfer.setData("application/x-beforework-column",th.dataset.columnId);
        th.classList.add("columnDragging");
      });
      dragHandle.addEventListener("dragend",clearDragStyles);
      th.addEventListener("dragover",event=>{
        if (![...event.dataTransfer.types].includes("application/x-beforework-column")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect="move";
        th.classList.add("columnDropTarget");
        th.classList.toggle("columnDropAfter",event.clientX>=th.getBoundingClientRect().left+th.getBoundingClientRect().width/2);
      });
      th.addEventListener("dragleave",event=>{
        if (th.contains(event.relatedTarget)) return;
        th.classList.remove("columnDropTarget","columnDropAfter");
      });
      th.addEventListener("drop",event=>{
        const sourceId=event.dataTransfer.getData("application/x-beforework-column");
        if (!sourceId) return;
        event.preventDefault();
        const position=event.clientX>=th.getBoundingClientRect().left+th.getBoundingClientRect().width/2 ? "after" : "before";
        clearDragStyles();
        if (reorderTableColumn(project,viewType,getColumnIds(),sourceId,th.dataset.columnId,position)){
          scheduleSave();
          render();
        }
      });
    });
  }
  function wireCustomColumnHeader(th, field, project){
    const menuButton = th.querySelector(".fieldColumnMenuBtn");
    const menu = th.querySelector(".fieldColumnMenu");
    menuButton.onclick = event => {
      event.stopPropagation();
      const shouldOpen = !menu.classList.contains("open");
      document.querySelectorAll(".fieldColumnMenu.open").forEach(other=>other.classList.remove("open"));
      menu.classList.toggle("open", shouldOpen);
    };
    menu.querySelector('[data-column-action="edit"]').onclick = async event => {
      event.stopPropagation();
      menu.classList.remove("open");
      const label = await showDialog({title:"Edit column", fields:[{label:"Column name", value:field.label}], confirmLabel:"Save"});
      if (!label || !label.trim()) return;
      field.label = label.trim();
      scheduleSave(); renderAll();
    };
    menu.querySelector('[data-column-action="delete"]').onclick = async event => {
      event.stopPropagation();
      menu.classList.remove("open");
      if (await showConfirm(`Delete column ${field.label}`, "This removes its values from every item in this project.", true)) deleteField(project, field.id);
    };
  }
  function wireGroupColumnHeader(th, project){
    const menuButton = th.querySelector(".fieldColumnMenuBtn");
    const menu = th.querySelector(".fieldColumnMenu");
    menuButton.onclick = event=>{
      event.stopPropagation();
      const shouldOpen = !menu.classList.contains("open");
      document.querySelectorAll(".fieldColumnMenu.open").forEach(other=>other.classList.remove("open"));
      menu.classList.toggle("open", shouldOpen);
    };
    menu.querySelectorAll("[data-group-action]").forEach(button=>{
      button.onclick = async event=>{
        event.stopPropagation();
        menu.classList.remove("open");
        const action = button.dataset.groupAction;
        const groupId = await showDialog({
          title:action==="edit" ? "Choose group to edit" : "Choose group to delete",
          fields:[{label:"Group", type:"select", options:project.groups.map(group=>({value:group.id,label:group.name})), value:project.groups[0]?.id}],
          confirmLabel:"Continue"
        });
        if (!groupId) return;
        const group = project.groups.find(candidate=>candidate.id===groupId);
        if (!group) return;
        if (action==="edit") await editGroupName(project, group);
        else await confirmDeleteGroup(project, group);
      };
    });
  }

  /* ---------- Shared helpers ---------- */
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }
  function fmtDate(dateStr){
    if (!dateStr) return "";
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString(undefined, {month:"short", day:"numeric"});
  }
  function formatUpdatedAt(timestamp){
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) return "Unknown";
    const now = new Date();
    const dayStamp = value => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
    const daysAgo = Math.round((dayStamp(now) - dayStamp(date)) / 86400000);
    const time = formatTime(date);
    if (daysAgo===0) return `Today at ${time}`;
    if (daysAgo===1) return `Yesterday at ${time}`;
    if (daysAgo>1 && daysAgo<7) return `${daysAgo} days ago at ${time}`;
    const dateLabel = date.toLocaleDateString(undefined, {
      day:"numeric", month:"short", ...(date.getFullYear()===now.getFullYear() ? {} : {year:"numeric"})
    });
    return `${dateLabel} at ${time}`;
  }
  function dueClass(dateStr){
    if (!dateStr) return "";
    if (dateStr < todayStr(0)) return "Label--danger";
    if (dateStr <= todayStr(3)) return "Label--attention";
    return "";
  }
  function duePillHtml(dateStr){
    if (!dateStr) return "";
    return `<span class="Label Label--secondary ${dueClass(dateStr)}">${fmtDate(dateStr)}</span>`;
  }
  function tagPillHtml(t, selected=false, filterable=false){
    const color = t.color || TAG_COLORS[0];
    const filterAttribute = filterable ? ` data-tagfilter="${t.id}"` : "";
    return `<span class="Label Label--secondary tagColorPill${selected?" selected":""}" style="--tag-color:${escapeHtml(color)}"${filterAttribute}>
      <span class="dot"></span>${escapeHtml(t.name)}</span>`;
  }
  function tagDotHtml(t, selected){
    return tagPillHtml(t, selected, true);
  }
  function formatFileSize(bytes){
    if (bytes<1024) return `${bytes} B`;
    const units=["KB","MB","GB","TB"];
    let size=bytes/1024;
    let unitIndex=0;
    while (size>=1024 && unitIndex<units.length-1){ size/=1024; unitIndex++; }
    return `${size<10?size.toFixed(1):Math.round(size)} ${units[unitIndex]}`;
  }
  function attachmentListHtml(attachments){
    return attachments.length ? attachments.map(attachment=>`<div class="itemAttachmentRow">
      <iconify-icon class="itemAttachmentIcon" icon="mdi:paperclip" aria-hidden="true"></iconify-icon>
      <span class="itemAttachmentName" title="${escapeHtml(attachment.name)}">${escapeHtml(attachment.name)}</span>
      <span class="itemAttachmentSize">${formatFileSize(attachment.size)}</span>
      <button class="btn btn-invisible btn-sm itemAttachmentAction" type="button" data-attachment-action="download" data-attachment-id="${escapeHtml(attachment.id)}" aria-label="Download ${escapeHtml(attachment.name)}" title="Download"><iconify-icon icon="mdi:download" aria-hidden="true"></iconify-icon></button>
      <button class="btn btn-invisible btn-sm itemAttachmentAction" type="button" data-attachment-action="remove" data-attachment-id="${escapeHtml(attachment.id)}" aria-label="Remove ${escapeHtml(attachment.name)}" title="Remove"><iconify-icon icon="mdi:close" aria-hidden="true"></iconify-icon></button>
    </div>`).join("") : `<div class="itemAttachmentEmpty">No attachments</div>`;
  }
  function attachmentSectionHtml(item,prefix){
    const attachments=Array.isArray(item.attachments)?item.attachments:[];
    const available=window.BeforeworkStorage.supportsAttachments();
    if (prefix==="item") return `<div class="itemAttachmentControls">
      <button class="btn btn-invisible btn-sm itemAttachmentAdd" type="button" data-attachment-add aria-label="Attach files" title="Attach files" ${available?"":"disabled"}><iconify-icon icon="mdi:paperclip" aria-hidden="true"></iconify-icon><span>Attach</span></button>
      <input type="file" id="${prefix}AttachmentInput" multiple hidden>
    </div>`;
    return `<div class="mainSection itemAttachmentsSection">
      <div class="mainSectionHead"><div class="mainSectionLabel">Attachments</div><span class="itemAttachmentCount">${attachments.length}</span></div>
      <button class="btn btn-sm itemAttachmentAdd" type="button" data-attachment-add ${available?"":"disabled"}><iconify-icon icon="mdi:paperclip" aria-hidden="true"></iconify-icon><span>Attach files</span></button>
      <input type="file" id="${prefix}AttachmentInput" multiple hidden>
      <div class="itemAttachmentList" data-attachment-list>${attachmentListHtml(attachments)}</div>
      ${available?"":`<p class="itemAttachmentNote">Attachments require a folder workspace.</p>`}
    </div>`;
  }
  function wireAttachmentControls(modal,item,{prefix,isNew}){
    const input=modal.querySelector(`#${prefix}AttachmentInput`);
    const addButton=modal.querySelector("[data-attachment-add]");
    const list=modal.querySelector("[data-attachment-list]");
    const count=modal.querySelector(".itemAttachmentCount");
    const renderList=()=>{
      const attachments=item.attachments||[];
      list.innerHTML=attachmentListHtml(attachments);
      if (count) count.textContent=String(attachments.length);
    };
    addButton.onclick=()=>input.click();
    input.onchange=async()=>{
      const files=[...input.files];
      const errors=[];
      for (const file of files){
        const attachment={id:uid(),name:file.name,size:file.size,type:file.type||"application/octet-stream"};
        try{
          await window.BeforeworkStorage.writeAttachment(attachment.id,file);
          if (!Array.isArray(item.attachments)) item.attachments=[];
          item.attachments.push(attachment);
        }catch(error){ errors.push(`${file.name}: ${error.message}`); }
      }
      input.value="";
      renderList();
      const addedCount=files.length-errors.length;
      if (addedCount>0 && !isNew){
        item.updatedAt=Date.now();
        scheduleSave();
        modal.querySelector('[data-item-tab="attachments"]')?.click();
      }
      if (errors.length) await showNotice("Some attachments couldn't be added",errors.join(" "));
    };
    list.onclick=async event=>{
      const button=event.target.closest("[data-attachment-action]");
      if (!button) return;
      const attachment=(item.attachments||[]).find(entry=>entry.id===button.dataset.attachmentId);
      if (!attachment) return;
      if (button.dataset.attachmentAction==="remove"){
        if (!await showConfirm("Remove attachment",`Remove ${attachment.name} from this item?`,true)) return;
        item.attachments=item.attachments.filter(entry=>entry.id!==attachment.id);
        if (!isNew){ item.updatedAt=Date.now(); scheduleSave(); }
        renderList();
        return;
      }
      try{
        const file=await window.BeforeworkStorage.readAttachment(attachment.id);
        const link=document.createElement("a");
        const url=URL.createObjectURL(file);
        link.href=url;
        link.download=attachment.name;
        link.click();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
      }catch(error){ await showNotice("Couldn't download attachment",error.message); }
    };
  }
  function fieldChipHtml(field, value){
    if (!value) return "";
    if (field.type==="priority"){
      const opt = PRIORITY_OPTIONS.find(o=>o.id===value); if (!opt) return "";
      return `<span class="priorityDot" style="background:${opt.color}" title="${opt.label} ${escapeHtml(field.label)}"></span>`;
    }
    if (["date","start-date","due-date"].includes(field.type)) return duePillHtml(value);
    if (field.type==="select"){
      const opt = (field.options||[]).find(o=>o.id===value); if (!opt) return "";
      return `<span class="Label Label--secondary"><span class="dot" style="background:${opt.color}"></span>${escapeHtml(opt.label)}</span>`;
    }
    if (field.type==="multi-select"){
      const selected=Array.isArray(value) ? value : [];
      return selected.map(id=>{
        const opt=(field.options||[]).find(option=>option.id===id);
        return opt ? `<span class="Label Label--secondary"><span class="dot" style="background:${opt.color}"></span>${escapeHtml(opt.label)}</span>` : "";
      }).join("");
    }
    if (field.type==="checkbox") return value ? `<span class="Label Label--secondary">✓</span>` : "";
    return `<span class="Label Label--secondary">${escapeHtml(String(value))}</span>`;
  }
  function fieldCellHtml(field, value){
    if (field.type==="priority"){
      const opt = PRIORITY_OPTIONS.find(o=>o.id===value);
      return opt ? `${fieldChipHtml(field,value)}${opt.label}` : "-";
    }
    if (["date","start-date","due-date"].includes(field.type)) return value ? duePillHtml(value) : "-";
    if (field.type==="select"){
      const opt = (field.options||[]).find(o=>o.id===value);
      return opt ? fieldChipHtml(field,value) : "-";
    }
    if (field.type==="multi-select") return fieldChipHtml(field,value) || "-";
    if (field.type==="checkbox") return value ? "Yes" : "No";
    if (field.type==="url"){
      const href=safeUrlHref(value);
      return href ? `<a class="fieldUrlLink" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(value)}</a>` : (value ? escapeHtml(value) : "-");
    }
    if (field.type==="email"){
      const href=safeEmailHref(value);
      return href ? `<a class="fieldUrlLink" href="${escapeHtml(href)}">${escapeHtml(value)}</a>` : (value ? escapeHtml(value) : "-");
    }
    if (field.type==="number") return value!=="" && value!=null ? escapeHtml(String(value)) : "-";
    return value ? escapeHtml(value) : "-";
  }

  function safeUrlHref(value){
    const raw=String(value??"").trim();
    if (!raw) return "";
    try{
      const url=new URL(/^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`);
      return url.protocol==="http:" || url.protocol==="https:" ? url.href : "";
    }catch(err){ return ""; }
  }

  function safeEmailHref(value){
    const address=String(value??"").trim();
    return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(address) ? `mailto:${address}` : "";
  }

  function fieldSortValue(field,value){
    if (field.type==="number"){
      if (value==="" || value==null) return Number.POSITIVE_INFINITY;
      const number=Number(value);
      return Number.isFinite(number) ? number : Number.POSITIVE_INFINITY;
    }
    if (field.type==="multi-select"){
      const selected=Array.isArray(value) ? value : [];
      return selected.map(id=>(field.options||[]).find(option=>option.id===id)?.label||"").join(", ").toLowerCase();
    }
    return String(value??"").toLowerCase();
  }

  function itemMatchesFilter(project, item, group){
    if (item.archived && !showArchived) return false;
    if (project && project.id===activeProjectId && isItemCompleted(item)!==(completionFilter==="completed")) return false;
    if (boardFilterGroups.size && (!group || !boardFilterGroups.has(group.id))) return false;
    if (boardFilterTags.size && ![...boardFilterTags].every(tid=>(item.tagIds||[]).includes(tid))) return false;
    for (const [fid, mode] of boardFilterFields){
      const val = (item.values||{})[fid] ?? "";
      if (Array.isArray(mode)){
        const selectedOptions=mode.filter(optionId=>optionId!=="__none__");
        const itemOptions=Array.isArray(val) ? val : val ? [val] : [];
        if (!mode.length || itemOptions.some(optionId=>selectedOptions.includes(optionId)) || (!itemOptions.length && mode.includes("__none__"))) continue;
        return false;
      }
      if (mode==="__all__") continue;
      if (mode==="__none__"){ if (val) return false; }
      else {
        const field = project?.fields?.find(candidate=>candidate.id===fid);
        if (field?.type==="text" || field?.type==="url" || field?.type==="email"){
          if (!val.toLowerCase().includes(mode.toLowerCase())) return false;
        } else if (field?.type==="number"){
          if (val==="" || Number(val)!==Number(mode)) return false;
        } else if (val !== mode) return false;
      }
    }
    if (boardFilterText){
      const q = boardFilterText.toLowerCase();
      const hay = [item.title, item.description, ...(item.subitems||[]).map(s=>s.title), ...Object.values(item.values||{})].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }
  function rowsForSelection(project){
    const rows = [];
    project.groups.forEach(group=> group.items
      .filter(item=>itemMatchesFilter(project, item, group))
      .forEach(item=>rows.push({item, group})));
    return rows;
  }

  function sortProjectRows(project,rows){
    return [...rows].sort((first,second)=>{
      let firstValue,secondValue;
      const field=project.fields.find(candidate=>candidate.id===listSort.field);
      if (listSort.field==="title"){
        firstValue=first.item.title.toLowerCase(); secondValue=second.item.title.toLowerCase();
      } else if (listSort.field==="group"){
        firstValue=first.group.name.toLowerCase(); secondValue=second.group.name.toLowerCase();
      } else if (listSort.field==="updated"){
        firstValue=first.item.updatedAt; secondValue=second.item.updatedAt;
      } else if (field?.type==="priority"){
        firstValue=(PRIORITY_OPTIONS.find(option=>option.id===first.item.values[field.id])||{rank:0}).rank;
        secondValue=(PRIORITY_OPTIONS.find(option=>option.id===second.item.values[field.id])||{rank:0}).rank;
      } else if (field?.type==="checkbox"){
        firstValue=first.item.values[field.id] ? 1 : 0;
        secondValue=second.item.values[field.id] ? 1 : 0;
      } else if (isDateField(field)){
        firstValue=first.item.values[field.id]||"9999-99-99";
        secondValue=second.item.values[field.id]||"9999-99-99";
      } else if (field){
        firstValue=fieldSortValue(field,first.item.values[field.id]);
        secondValue=fieldSortValue(field,second.item.values[field.id]);
      } else {
        firstValue=first.item.updatedAt; secondValue=second.item.updatedAt;
      }
      if (firstValue<secondValue) return listSort.dir==="asc" ? -1 : 1;
      if (firstValue>secondValue) return listSort.dir==="asc" ? 1 : -1;
      return 0;
    });
  }

  function csvFieldValue(field,value){
    if (value==null || value==="") return "";
    if (field.type==="priority") return PRIORITY_OPTIONS.find(option=>option.id===value)?.label||String(value);
    if (field.type==="select") return (field.options||[]).find(option=>option.id===value)?.label||String(value);
    if (field.type==="multi-select") return (Array.isArray(value)?value:[]).map(id=>(field.options||[]).find(option=>option.id===id)?.label||"").filter(Boolean).join("; ");
    if (field.type==="checkbox") return value===true || ["true","1","yes"].includes(String(value).toLowerCase()) ? "Yes" : "No";
    return String(value);
  }

  function serializeCsvRows(rows){
    return rows.map(row=>row.map(value=>{
      let text=String(value??"");
      const leading=text.trimStart();
      const isNumber=/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(leading);
      if (/^[=+@\-\t\r]/.test(leading) && !isNumber) text="'"+text;
      return `"${text.replace(/"/g,'""')}"`;
    }).join(",")).join("\r\n");
  }

  function buildProjectCsv(project,viewType,showProgressColumn,rows){
    const showGroupColumn=project.groups.length>1;
    const columns=[
      {id:"title",label:"Title",value:row=>row.item.title},
      ...(showGroupColumn?[{id:"group",label:"Group",value:row=>row.group.name}]:[]),
      ...project.fields.map(field=>({id:`field:${field.id}`,label:field.label,value:row=>csvFieldValue(field,row.item.values[field.id])})),
      {id:"tags",label:"Tags",value:row=>(row.item.tagIds||[]).map(id=>project.tags.find(tag=>tag.id===id)?.name||"").filter(Boolean).join("; ")},
      ...(viewType==="list" && showProgressColumn?[{id:"progress",label:"Progress",value:row=>row.item.subitems.length?`${row.item.subitems.filter(subitem=>subitem.done).length}/${row.item.subitems.length}`:""}]:[]),
      ...(viewType==="list"?[{id:"updated",label:"Updated",value:row=>formatUpdatedAt(row.item.updatedAt)}]:[])
    ];
    const byId=new Map(columns.map(column=>[column.id,column]));
    const ordered=orderedTableColumns(project,viewType,columns.map(column=>column.id)).map(id=>byId.get(id)).filter(Boolean);
    return serializeCsvRows([ordered.map(column=>column.label),...rows.map(row=>ordered.map(column=>column.value(row)))]);
  }

  function exportProjectCsv(project,viewType,showProgressColumn=false){
    const rows=sortProjectRows(project,rowsForSelection(project));
    const csv=buildProjectCsv(project,viewType,showProgressColumn,rows);
    const blob=new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    const safeName=project.name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g,"-")||"beforework";
    link.href=url;
    link.download=`${safeName}.csv`;
    link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  /* ---------- Rendering: shell ---------- */
  function renderAll(){
    renderProjectList();
    renderSidebarTags();
    render();
  }

  function renderProjectList(){
    document.getElementById("overviewNav").className = activeProjectId===OVERVIEW ? "active" : "";
    document.getElementById("calendarNav").className = activeProjectId===CALENDAR ? "active" : "";
    document.getElementById("roadmapNav").className = activeProjectId===ROADMAP ? "active" : "";
    document.getElementById("integrationsNav").className = activeProjectId===INTEGRATIONS ? "active" : "";
    document.getElementById("settingsNav").className = activeProjectId===SETTINGS ? "active" : "";
    document.getElementById("supportNav").classList.toggle("active",activeProjectId===SUPPORT);
    const ul = document.getElementById("projectList");
    ul.innerHTML = "";
    const appendProject = (p, inFolder=false) => {
      const count = Number.isFinite(p.itemCount) ? p.itemCount : (p.groups||[]).reduce((n,g)=>n+(g.items||[]).length,0);
      const li = document.createElement("li");
      li.className = "SideNav-item" + (p.id===activeProjectId ? " active" : "") + (inFolder ? " inFolder" : "");
      const icon = document.createElement("iconify-icon");
      icon.className = "projectIcon";
      icon.setAttribute("icon", p.icon || DEFAULT_PROJECT_ICON);
      icon.setAttribute("aria-hidden", "true");
      const name = document.createElement("span");
      name.className = "projectName";
      name.textContent = p.name;
      const cnt = document.createElement("span");
      cnt.className = "cnt";
      cnt.textContent = String(count);
      const wrap = document.createElement("div");
      wrap.className = "projectQuickMenuWrap";
      const menuBtn = document.createElement("button");
      menuBtn.type = "button";
      menuBtn.className = "projectMenuBtnSmall";
      menuBtn.title = "Project actions";
      menuBtn.setAttribute("aria-label", `Project actions for ${p.name}`);
      menuBtn.textContent = "⋯";
      const menu = document.createElement("div");
      menu.className = "projectQuickMenu";
      menu.innerHTML = `
        <button type="button" data-project-action="edit">Edit project</button>
        <button type="button" data-project-action="group">New group</button>
        <button type="button" data-project-action="add-column">Add column</button>
        <button type="button" data-project-action="duplicate">Duplicate project</button>
        <button type="button" data-project-action="move">Move to folder</button>
        <button type="button" data-project-action="undo">Undo</button>
        <button type="button" data-project-action="print">Print / PDF</button>
        <button type="button" data-project-action="delete" class="danger">Delete</button>
      `;
      const closeMenu = () => menu.classList.remove("open");
      menuBtn.onclick = event => {
        event.stopPropagation();
        const isOpen = menu.classList.toggle("open");
        if (!isOpen) return;
        document.querySelectorAll(".projectQuickMenu.open, .folderQuickMenu.open").forEach(other => { if (other !== menu) other.classList.remove("open"); });
      };
      menu.querySelectorAll("[data-project-action]").forEach(button => {
        button.onclick = async event => {
          event.stopPropagation();
          closeMenu();
          const action = button.dataset.projectAction;
          if (action === "edit") {
            await editProject(await ensureProjectLoaded(p.id));
          } else if (action === "duplicate") {
            await duplicateProject(await ensureProjectLoaded(p.id));
          } else if (action === "add-column") {
            await addColumnFlow(await ensureProjectLoaded(p.id));
          } else if (action === "group") {
            const name = await showDialog({title:"New group", fields:[{label:"Group name", placeholder:"e.g. In progress"}], confirmLabel:"Create group"});
            if (name && name.trim()){
              await ensureProjectLoaded(p.id);
              addGroup(p.id, name.trim());
            }
          } else if (action === "move") {
            await moveProjectToFolder(await ensureProjectLoaded(p.id));
          } else if (action === "undo") {
            undoLastChange();
          } else if (action === "print") {
            window.print();
          } else if (action === "delete") {
            if (await showConfirm(`Delete project ${p.name}`, "This will delete everything in the project.", true)) deleteProject(p.id);
          }
        };
      });
      wrap.append(menuBtn, menu);
      li.append(icon, name, cnt, wrap);
      li.onclick = () => { selectProject(p.id); };
      ul.appendChild(li);
    };
    const projects=projectRecords();
    const unfiled = projects.filter(project=>!project.folderId || !state.folders.some(folder=>folder.id===project.folderId));
    unfiled.forEach(project=>appendProject(project));
    state.folders.forEach(folder=>{
      const heading = document.createElement("li");
      heading.className = "folderHeading";
      if (ul.children.length){
        const divider = document.createElement("div");
        divider.className = "uiDivider folderHeadingDivider";
        divider.setAttribute("aria-hidden","true");
        heading.appendChild(divider);
      }
      const projectCount = projects.filter(project=>project.folderId===folder.id).length;
      const icon = document.createElement("iconify-icon");
      icon.className = "folderIcon";
      icon.setAttribute("icon", "mdi:folder-outline");
      icon.setAttribute("aria-hidden", "true");
      const name = document.createElement("span");
      name.className = "folderName";
      name.textContent = folder.name;
      const count = document.createElement("span");
      count.className = "folderCount";
      count.textContent = String(projectCount);
      const wrap = document.createElement("div");
      wrap.className = "folderQuickMenuWrap";
      const menuBtn = document.createElement("button");
      menuBtn.type = "button";
      menuBtn.className = "folderMenuBtn";
      menuBtn.title = "Folder actions";
      menuBtn.setAttribute("aria-label", `Folder actions for ${folder.name}`);
      menuBtn.textContent = "⋯";
      const menu = document.createElement("div");
      menu.className = "folderQuickMenu";
      menu.innerHTML = `
        <button type="button" data-folder-action="rename">Rename</button>
        <button type="button" data-folder-action="delete" class="danger">Delete</button>
      `;
      menuBtn.onclick = event => {
        event.stopPropagation();
        const isOpen = menu.classList.toggle("open");
        if (!isOpen) return;
        document.querySelectorAll(".projectQuickMenu.open, .folderQuickMenu.open").forEach(other => { if (other !== menu) other.classList.remove("open"); });
      };
      menu.querySelectorAll("[data-folder-action]").forEach(button => {
        button.onclick = async event => {
          event.stopPropagation();
          menu.classList.remove("open");
          const action = button.dataset.folderAction;
          if (action === "rename") {
            const updated = await showDialog({
              title: "Rename folder",
              fields: [{label: "Folder name", value: folder.name}],
              confirmLabel: "Save"
            });
            if (!updated || !updated.trim()) return;
            const trimmed = updated.trim();
            if (trimmed === folder.name) return;
            folder.name = trimmed;
            scheduleSave(); renderProjectList();
          } else if (action === "delete") {
            const projectsInFolder = projectRecords().filter(project => project.folderId === folder.id);
            if (!projectsInFolder.length) {
              state.folders = state.folders.filter(f => f.id !== folder.id);
              scheduleSave(); renderProjectList();
              return;
            }
            if (await showConfirm(`Delete folder ${folder.name}`, "This moves all projects in it out of the folder, but does not delete the projects themselves.", true)) {
              projectRecords().forEach(project => {
                if (project.folderId === folder.id){
                  project.folderId = null;
                  const loaded=getLoadedProject(project.id);
                  if (loaded) loaded.folderId=null;
                }
              });
              state.folders = state.folders.filter(f => f.id !== folder.id);
              scheduleSave(); renderProjectList();
            }
          }
        };
      });
      wrap.append(menuBtn, menu);
      heading.append(icon, name, count, wrap);
      ul.appendChild(heading);
      projects.filter(project=>project.folderId===folder.id).forEach(project=>appendProject(project, true));
    });
  }

  async function selectProject(pid){
    if (state?.folderLazy && ![OVERVIEW,CALENDAR,ROADMAP,INTEGRATIONS,SETTINGS,SUPPORT].includes(pid)){
      if (activeProjectId!==pid && state.projects.length){
        if (!await flushSave()){
          await showNotice("Project switch paused","Resolve the current save or conflict before unloading the open project.");
          return;
        }
        state.projects=[];
      }
      try{ await ensureProjectLoaded(pid); }
      catch(err){ await showNotice("Couldn't load project",err.message); return; }
    }else if(state?.folderLazy && state.projects.length){
      if (!await flushSave()){
        await showNotice("Navigation paused","Resolve the pending save before unloading the open project.");
        return;
      }
      state.projects=[];
    }
    activeProjectId = pid;
    persistActiveLocation();
    restoreProjectFilters(pid);
    selectedItemIds.clear();
    renderAll();
    closeSidebarOnMobile();
  }

  async function openRoadmapItem(projectId,groupId,itemId){
    await selectProject(projectId);
    if (activeProjectId===projectId) openItemModal(projectId,groupId,itemId);
  }

  async function openRoadmapMilestone(projectId,milestoneId){
    await selectProject(projectId);
    if (activeProjectId!==projectId) return;
    const project=getProject(projectId);
    const milestone=project?.milestones?.find(candidate=>candidate.id===milestoneId);
    if (project&&milestone) editMilestone(project,milestone);
  }

  function persistActiveLocation(){
    try{ localStorage.setItem(LOCATION_KEY, activeProjectId); }catch(err){/* ignore */}
  }

  function navigateToIntegrations(){
    activeProjectId = INTEGRATIONS;
    persistActiveLocation();
    renderAll();
    closeSidebarOnMobile();
  }

  function navigateToSettings(){
    activeProjectId = SETTINGS;
    persistActiveLocation();
    renderAll();
    closeSidebarOnMobile();
  }
  function navigateToSupport(){
    activeProjectId = SUPPORT;
    persistActiveLocation();
    renderAll();
    closeSidebarOnMobile();
  }

  function restoreActiveLocation(){
    let saved = null;
    try{ saved = localStorage.getItem(LOCATION_KEY); }catch(err){/* ignore */}
    if (saved===OVERVIEW || saved===CALENDAR || saved===ROADMAP || saved===INTEGRATIONS || saved===SETTINGS || saved===SUPPORT || getProject(saved)) activeProjectId = saved;
    else activeProjectId = OVERVIEW;
    if (activeProjectId !== OVERVIEW && activeProjectId !== CALENDAR && activeProjectId !== ROADMAP && activeProjectId !== SUPPORT) restoreProjectFilters(activeProjectId);
  }

  function renderSidebarTags(){
    const section = document.getElementById("tagsSection");
    const wrap = document.getElementById("sideTagsList");
    const label = document.getElementById("tagsSectionLabel");
    const project = getProject(activeProjectId);
    if (activeProjectId===OVERVIEW || activeProjectId===CALENDAR || activeProjectId===ROADMAP || activeProjectId===INTEGRATIONS || activeProjectId===SETTINGS || !project){ section.style.display = "none"; return; }
    section.style.display = "block";
    label.textContent = "Tags in " + project.name;
    wrap.innerHTML = project.tags.map(t=>tagDotHtml(t, boardFilterTags.has(t.id))).join("")
      || `<div style="font-size:12px;color:var(--faint);">No tags yet</div>`;
    wrap.querySelectorAll("[data-tagfilter]").forEach(el=>{
      el.onclick = () => {
        const tid = el.dataset.tagfilter;
        if (boardFilterTags.has(tid)) boardFilterTags.delete(tid); else boardFilterTags.add(tid);
        render(); renderSidebarTags();
      };
    });
  }

  /* Integrations view moved to js/services/google-calendar/google-calendar.js */

  function renderSupport(board){
    board.replaceChildren(window.BeforeworkViewTemplates.clone("support"));
  }

  function renderSettings(board){
    const accountName = currentAuthUser && activeAuthProvider ? activeAuthProvider.label(currentAuthUser) : "";
    settingsView.render(board, {
      theme:document.documentElement.getAttribute("data-theme")==="dark" ? "Dark" : "Light",
      timeFormat:getTimeFormat(),
      sidebarCollapsed:document.getElementById("sidebar").classList.contains("collapsed"),
      storageStatus:getSyncStatusText(),
      hasBackup:hasMigrationBackup(),
      isLegacyFile:window.BeforeworkStorage.isLegacyFile(),
      recoverySnapshots:window.BeforeworkStorage.getRecoverySnapshots(),
      reminderStatus:reminderService.getStatus(),
      accountName
    });
  }

  function createSettingsView(SettingsView){
    return new SettingsView({
      cloneTemplate:()=>window.BeforeworkViewTemplates.clone("settings"),
      actions:{
      toggleTheme(board){ window.BeforeworkAppearance.toggleTheme(); renderSettings(board); },
      setTimeFormat(value){
        try{ localStorage.setItem(TIME_FORMAT_KEY, value); }catch(err){/* ignore */}
        renderAll();
      },
      toggleSidebar(board){ window.BeforeworkAppearance.toggleSidebarCollapsed(); renderSettings(board); },
      async toggleReminders(board){
        if (reminderService.getStatus().enabled) reminderService.disable();
        else await reminderService.enable();
        renderSettings(board);
      },
      showShortcuts:showShortcutsModal,
      openIssues(){ window.open(FEEDBACK_URL, "_blank", "noopener,noreferrer"); },
      openSponsors(){ window.open(GITHUB_SPONSORS_URL, "_blank", "noopener,noreferrer"); },
      openCoffee(){ window.open(BUY_ME_A_COFFEE_URL, "_blank", "noopener,noreferrer"); },
      switchFile,
      openLegacy:openExistingFile,
      migrateLegacy:migrateCurrentFileToFolder,
      retrySave(){ scheduleSave(); },
      createFile:startNewFileFromMenu,
      exportJSON,
      importJSON(){ document.getElementById("fileImportInput").click(); },
      exportRecovery:exportRecoverySnapshot,
      restoreRecovery:restoreRecoverySnapshot,
      restoreBackup:restoreMigrationBackup,
      logout(){ if (activeAuthProvider) activeAuthProvider.logout(); }
      }
    });
  }

  function render(){
    const filterBar = document.getElementById("boardFilterBar");
    const editBtn = document.getElementById("editProjectBtn");
    const duplicateBtn = document.getElementById("duplicateProjectBtn");
    const deleteBtn = document.getElementById("deleteProjectBtn");
    const fieldsBtn = document.getElementById("manageFieldsBtn");
    const addGroupBtn = document.getElementById("addGroupBtn");
    const moveFolderBtn = document.getElementById("moveProjectFolderBtn");
    const projectMenuWrap = document.getElementById("projectMenuWrap");
    const viewTabs = document.getElementById("viewTabs");
    const completionTabs = document.getElementById("completionTabs");
    const topLabel = document.getElementById("projectTitleLabel");
    const descriptionLabel = document.getElementById("projectDescriptionLabel");
    const board = document.getElementById("board");
    if (completionTabs && !filterBar.contains(completionTabs)){
      filterBar.insertBefore(completionTabs,filterBar.querySelector(".filterMainRow"));
    }
    board.innerHTML = "";

    if (activeProjectId === OVERVIEW || activeProjectId === CALENDAR || activeProjectId === ROADMAP || activeProjectId === INTEGRATIONS || activeProjectId === SETTINGS || activeProjectId === SUPPORT){
      topLabel.textContent = "Overview";
      descriptionLabel.hidden = true;
      if (activeProjectId===CALENDAR) topLabel.textContent = "Calendar";
      if (activeProjectId===ROADMAP) topLabel.textContent = "Roadmap";
      if (activeProjectId===INTEGRATIONS) topLabel.textContent = "Integrations";
      if (activeProjectId===SETTINGS) topLabel.textContent = "Settings";
      if (activeProjectId===SUPPORT) topLabel.textContent = "Support Beforework";
      filterBar.style.display = "none";
      editBtn.style.display = "none";
      duplicateBtn.style.display = "none";
      deleteBtn.style.display = "none";
      fieldsBtn.style.display = "none";
      addGroupBtn.style.display = "none";
      moveFolderBtn.style.display = "none";
      projectMenuWrap.style.display = "none";
      document.getElementById("projectMenu").classList.remove("open");
      document.getElementById("projectMenuBtn").classList.remove("active");
      viewTabs.style.display = "none";
      completionTabs.style.display = "none";
      if (activeProjectId===CALENDAR) calendarView.render(board, null);
      else if (activeProjectId===ROADMAP) roadmapView.render(board,window.BeforeworkRoadmapModel.rowsForWorkspace(projectRecords()),{
        scope:"workspace",
        fmtDate,
        onOpenProject:selectProject,
        onOpenItem:openRoadmapItem,
        onOpenMilestone:openRoadmapMilestone
      });
      else if (activeProjectId===INTEGRATIONS) renderIntegrations(board);
      else if (activeProjectId===SETTINGS) renderSettings(board);
      else if (activeProjectId===SUPPORT) renderSupport(board);
      else overviewView.render(board);
      return;
    }

    const project = getProject(activeProjectId);
    if (!project){
      activeProjectId = OVERVIEW;
      renderProjectList();
      render();
      return;
    }

    persistActiveFilters();

    const titleIcon = document.createElement("iconify-icon");
    titleIcon.className = "projectTitleIcon";
    titleIcon.setAttribute("icon", project.icon || DEFAULT_PROJECT_ICON);
    titleIcon.setAttribute("aria-hidden", "true");
    topLabel.replaceChildren(titleIcon, document.createTextNode(project.name));
    descriptionLabel.textContent = project.description||"";
    descriptionLabel.hidden = !project.description;
    filterBar.style.display = "block";
    editBtn.style.display = "inline-block";
    duplicateBtn.style.display = "inline-block";
    deleteBtn.style.display = "inline-block";
    fieldsBtn.style.display = "inline-block";
    addGroupBtn.style.display = "inline-block";
    moveFolderBtn.style.display = "inline-block";
    projectMenuWrap.style.display = "inline-flex";
    if (!Array.isArray(project.views) || !project.views.length){
      project.views = [{id:uid(), type:"list", name:"List"}];
    }
    if (!project.activeViewId || !project.views.some(v=>v.id===project.activeViewId)){
      project.activeViewId = project.views[0].id;
    }
    viewTabs.style.display = "flex";
    renderViewTabs(project);
    completionTabs.style.display = "flex";
    renderCompletionTabs(project);

    document.getElementById("boardSearch").value = boardFilterText;
    renderFilterCategories(project);
    renderBoardTagFilters(project);
    renderGroupFilters(project);
    renderFieldFilters(project);
    renderFilterCategoryState(project);
    updateFilterSummary();

    fieldsBtn.onclick = () => addColumnFlow(project);
    moveFolderBtn.onclick = () => moveProjectToFolder(project);
    addGroupBtn.onclick = async () => {
      const name = await showDialog({title:"New group", fields:[{label:"Group name", placeholder:"e.g. In progress"}], confirmLabel:"Create group"});
      if (name && name.trim()) addGroup(project.id, name.trim());
    };
    editBtn.onclick = () => editProject(project);
    duplicateBtn.onclick = () => duplicateProject(project);
    deleteBtn.onclick = async () => {
      if (await showConfirm(`Delete project ${project.name}`, "This will delete everything in the project.", true)) deleteProject(project.id);
    };

    const activeView = project.views.find(v=>v.id===project.activeViewId) || project.views[0];
    if (activeView.type==="milestones"){
      filterBar.style.display="none";
      completionTabs.style.display="none";
      milestonesView.render(project,board,{
        isItemCompleted,
        fmtDate,
        todayStr,
        createMilestone,
        editMilestone,
        deleteMilestone,
        openNewItem:openNewItemModal,
        openItem:openItemModal
      });
      return;
    }
    if (activeView.type==="roadmap"){
      filterBar.style.display="none";
      completionTabs.style.display="none";
      roadmapView.render(board,window.BeforeworkRoadmapModel.rowsForProject(project),{
        scope:"project",
        fmtDate,
        onOpenProject:selectProject,
        onOpenItem:openItemModal,
        onOpenMilestone:openRoadmapMilestone
      });
      return;
    }
    if (activeView.type === "list") listView.render(project, board);
    else if (activeView.type === "table") tableView.render(project, board);
    else if (activeView.type === "calendar") calendarView.render(board, project);
    else boardView.render(project, board);
    if (activeView.type==="list" || activeView.type==="table"){
      const addRow = board.querySelector(".listAddRow");
      if (addRow){
        completionTabs.classList.add("completionTabsInList");
        addRow.prepend(completionTabs);
      }
    } else {
      completionTabs.classList.remove("completionTabsInList");
      filterBar.insertBefore(completionTabs,filterBar.querySelector(".filterMainRow"));
    }
  }

  function renderViewTabs(project){
    const wrap = document.getElementById("viewTabs");
    const tabsHtml = project.views.map(v=>`
      <span class="tab ${v.id===project.activeViewId?"active":""}" data-view-id="${v.id}">
        ${escapeHtml(viewLabel(v.type))}${project.views.length>1 ? `<span class="tabClose" data-remove-view="${v.id}" title="Remove this view">✕</span>` : ""}
      </span>`).join("");
    const missing = VIEW_DEFS.filter(d=>!project.views.some(v=>v.type===d.type));
    const addBtn = missing.length ? `<button class="btn btn-invisible btn-sm addViewBtn" id="addViewBtn" title="Add a view">+</button>` : "";
    wrap.innerHTML = tabsHtml + addBtn;
    wrap.querySelectorAll(".tab").forEach(tab=>{
      tab.addEventListener("click", e=>{
        if (e.target.closest(".tabClose")) return;
        if (project.activeViewId === tab.dataset.viewId) return;
        project.activeViewId = tab.dataset.viewId;
        scheduleSave(); render();
      });
    });
    wrap.querySelectorAll("[data-remove-view]").forEach(x=>{
      x.onclick = async (e) => {
        e.stopPropagation();
        if (await showConfirm("Remove this view", "This only removes the tab - your items and their data are unaffected.")) removeView(project, x.dataset.removeView);
      };
    });
    const addViewBtn = document.getElementById("addViewBtn");
    if (addViewBtn) addViewBtn.onclick = async () => {
      const type = await showDialog({title:"Add a view", fields:[{label:"View type", type:"select", options:missing.map(m=>({value:m.type,label:m.label}))}], confirmLabel:"Add view"});
      if (type) addView(project, type);
    };
  }

  function renderCompletionTabs(project){
    const wrap = document.getElementById("completionTabs");
    const items = project.groups.flatMap(group=>group.items).filter(item=>showArchived || !item.archived);
    const completedCount = items.filter(isItemCompleted).length;
    const openCount = items.length-completedCount;
    wrap.innerHTML = `<div class="completionTabList" role="group" aria-label="Filter items by completion">
      <button type="button" class="completionTab ${completionFilter==="open"?"active":""}" aria-pressed="${completionFilter==="open"}" data-completion-filter="open"><iconify-icon icon="mdi:circle-outline" aria-hidden="true"></iconify-icon><span>Open</span><span class="completionTabCount">${openCount}</span></button>
      <button type="button" class="completionTab ${completionFilter==="completed"?"active":""}" aria-pressed="${completionFilter==="completed"}" data-completion-filter="completed"><iconify-icon icon="mdi:check-circle-outline" aria-hidden="true"></iconify-icon><span>Completed</span><span class="completionTabCount">${completedCount}</span></button>
    </div>`;
    wrap.querySelectorAll("[data-completion-filter]").forEach(button=>{
      button.onclick = () => {
        const nextFilter = button.dataset.completionFilter;
        if (completionFilter===nextFilter) return;
        completionFilter = nextFilter;
        render();
      };
    });
  }

  function renderFilterCategories(project){
    const wrap = document.getElementById("filterCategoryList");
    const categories = [
      ...(project.groups.length>1 ? [{id:"groupFilters", label:"Groups"}] : []),
      {id:"boardTagFilters", label:"Tags"},
      ...project.fields.map(field=>({id:`field:${field.id}`, label:field.label}))
    ];
    if (!categories.some(category=>category.id===activeFilterCategory)) activeFilterCategory = categories[0].id;
    wrap.innerHTML = categories.map(category=>`<button class="filterCategory" type="button" data-filter-category="${escapeHtml(category.id)}">${escapeHtml(category.label)}</button>`).join("");
    wrap.querySelectorAll("[data-filter-category]").forEach(button=>{
      button.onclick = () => {
        activeFilterCategory = button.dataset.filterCategory;
        renderFilterCategoryState(project);
        renderFieldFilters(project);
      };
    });
  }

  function renderFilterCategoryState(project){
    document.querySelectorAll("[data-filter-category]").forEach(button=>button.classList.toggle("active", button.dataset.filterCategory===activeFilterCategory));
    document.querySelectorAll("#filterOptions > div").forEach(section=>section.classList.toggle("active", section.id===activeFilterCategory || (activeFilterCategory.startsWith("field:") && section.id==="fieldFilters")));
  }

  function renderBoardTagFilters(project){
    const wrap = document.getElementById("boardTagFilters");
    wrap.innerHTML = `<div class="filterControlBody filterOptionList">${project.tags.length ? project.tags.map(tag=>`<label class="filterOptionCheck"><input type="checkbox" data-tag-filter="${tag.id}" ${boardFilterTags.has(tag.id)?"checked":""}><span class="filterValuePill tagPill" style="--pill-color:${tag.color}"><span class="dot" style="background:${tag.color}"></span>${escapeHtml(tag.name)}</span></label>`).join("") : `<span class="filterEmpty">No tags in this project</span>`}</div>`;
    wrap.querySelectorAll("[data-tag-filter]").forEach(input=>{
      input.onchange = () => {
        if (input.checked) boardFilterTags.add(input.dataset.tagFilter); else boardFilterTags.delete(input.dataset.tagFilter);
        render();
      };
    });
  }

  function renderGroupFilters(project){
    const wrap = document.getElementById("groupFilters");
    wrap.innerHTML = `<div class="filterControlBody filterOptionList">${project.groups.map(group=>`<label class="filterOptionCheck"><input type="checkbox" data-group-filter="${group.id}" ${boardFilterGroups.has(group.id)?"checked":""}><span class="filterValuePill groupPill">${escapeHtml(group.name)}</span></label>`).join("")}</div>`;
    wrap.querySelectorAll("[data-group-filter]").forEach(input=>{
      input.onchange = () => {
        if (input.checked) boardFilterGroups.add(input.dataset.groupFilter); else boardFilterGroups.delete(input.dataset.groupFilter);
        render();
      };
    });
  }

  function renderFieldFilters(project){
    const wrap = document.getElementById("fieldFilters");
    const selectedField = project.fields.find(field=>`field:${field.id}`===activeFilterCategory);
    const visibleOptions = selectedField ? [selectedField].map(f=>{
      const opts = f.type==="priority" ? PRIORITY_OPTIONS : (f.options||[]);
      const current = boardFilterFields.get(f.id);
      let control;
      if (isDateField(f)) control = `<input class="form-control" type="date" data-fieldfilter="${f.id}" value="${typeof current==="string"?escapeHtml(current):""}" aria-label="Filter ${escapeHtml(f.label)}">`;
      else if (f.type==="text" || f.type==="url" || f.type==="email") control = `<input class="form-control" type="text" data-fieldfilter="${f.id}" value="${typeof current==="string"?escapeHtml(current):""}" placeholder="${f.type==="url"?"Filter URL":f.type==="email"?"Filter email":"Enter text"}" aria-label="Filter ${escapeHtml(f.label)}">`;
      else if (f.type==="number") control = `<input class="form-control" type="number" step="any" data-fieldfilter="${f.id}" value="${typeof current==="string"?escapeHtml(current):""}" placeholder="Exact value" aria-label="Filter ${escapeHtml(f.label)}">`;
      else if (f.type==="checkbox") {
        const selected = Array.isArray(current) ? current : (current && current!=="__all__" ? [current] : []);
        control = `<div class="filterOptionList fieldOptionList"><label class="filterOptionCheck"><input type="checkbox" data-field-option="${f.id}" value="true" ${selected.includes("true")?"checked":""}><span>Yes</span></label><label class="filterOptionCheck"><input type="checkbox" data-field-option="${f.id}" value="__none__" ${selected.includes("__none__")?"checked":""}><span>No</span></label></div>`;
      }
      else {
        const selected = Array.isArray(current) ? current : (current && current!=="__all__" ? [current] : []);
        control = `<div class="filterOptionList fieldOptionList">${opts.map(o=>`<label class="filterOptionCheck"><input type="checkbox" data-field-option="${f.id}" value="${o.id}" ${selected.includes(o.id)?"checked":""}><span>${escapeHtml(o.label)}</span></label>`).join("")}<label class="filterOptionCheck"><input type="checkbox" data-field-option="${f.id}" value="__none__" ${selected.includes("__none__")?"checked":""}><span>No ${escapeHtml(f.label)}</span></label></div>`;
      }
      return control;
    }).join("") : "";
    wrap.innerHTML = `<div class="filterControlBody">${visibleOptions || `<span class="filterEmpty">Select a field from the left.</span>`}</div>`;
    wrap.querySelectorAll("[data-fieldfilter]").forEach(control=>{
      control.addEventListener("change", e=>{
        if (e.target.value) boardFilterFields.set(control.dataset.fieldfilter, e.target.value); else boardFilterFields.delete(control.dataset.fieldfilter);
        render();
      });
    });
    wrap.querySelectorAll("[data-field-option]").forEach(control=>{
      control.onchange = () => {
        const selected = [...wrap.querySelectorAll(`[data-field-option="${control.dataset.fieldOption}"]:checked`)].map(input=>input.value);
        if (selected.length) boardFilterFields.set(control.dataset.fieldOption, selected); else boardFilterFields.delete(control.dataset.fieldOption);
        render();
      };
    });
  }
  function updateFilterSummary(){
    const summary = document.getElementById("filterSummary");
    if (!summary) return;
    const fieldCount = [...boardFilterFields.values()].filter(value=>Array.isArray(value) ? value.length : value!=="__all__").length;
    const count = fieldCount + boardFilterGroups.size + boardFilterTags.size + (boardFilterText ? 1 : 0);
    summary.innerHTML = count ? `<strong>${count}</strong> filter${count===1?"":"s"} applied` : "All items";
  }

  function calendarEntries(scopeProject){
    const entries = [];
    if (!scopeProject){
      (state.calendarItems||[]).forEach(item=>{
        const date = item.startDate || item.endDate;
        if (date){
          const repeatDates = expandRecurringDates(date, item.endDate && item.endDate>=date ? item.endDate : date, normaliseRecurrence(item.recurrence));
          repeatDates.forEach(({date:occurrenceDate, endDate})=>{
            entries.push({project:null, group:null, item, field:{id:"__standalone__", label:"Calendar", type:"date"}, date:occurrenceDate, endDate});
          });
        }
      });
    }
    const projects = scopeProject ? [scopeProject] : projectRecords();
    projects.forEach(project=>{
      const projectItems=state.folderLazy && !scopeProject
        ? project.itemIndex.map(item=>({item,group:project.groups.find(group=>group.id===item.groupId)||{id:item.groupId,name:item.groupName}}))
        : project.groups.flatMap(group=>group.items.map(item=>({item,group})));
      projectItems.forEach(({group,item})=>{
      const fields = calendarDateFields(project);
      const datedField = fields.find(field=>item.values[field.id]);
      const repeatDates = expandRecurringDates(item.values[datedField?.id] || item.endDate || "", item.endDate || item.values[datedField?.id] || "", normaliseRecurrence(item.recurrence));
      if (datedField){
        repeatDates.forEach(({date, endDate})=>{
          entries.push({project, group, item, field:datedField, date, endDate:endDate && endDate>=date ? endDate : date});
        });
      } else if (item.endDate || item.values[datedField?.id]){
        // A schedule date is sufficient for a high-level calendar event even
        // when the project has no custom date column.
        const field = fields[0] || {id:"__schedule__", label:"Schedule", type:"date"};
        repeatDates.forEach(({date, endDate})=>{
          entries.push({project, group, item, field, date, endDate:endDate && endDate>=date ? endDate : date});
        });
      }
      });
    });
    return entries;
  }
  function calendarDateCode(date, addDays){
    const parts = date.split("-").map(Number);
    const value = new Date(parts[0], parts[1]-1, parts[2] + (addDays||0));
    return value.getFullYear()+String(value.getMonth()+1).padStart(2,"0")+String(value.getDate()).padStart(2,"0");
  }
  function parseCalendarDate(dateKey){
    if (!dateKey) return null;
    const [year, month, day] = String(dateKey).split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  function formatCalendarDate(date){
    const year = date.getFullYear();
    const month = String(date.getMonth()+1).padStart(2,"0");
    const day = String(date.getDate()).padStart(2,"0");
    return `${year}-${month}-${day}`;
  }
  function addDaysToDate(date, days){
    const next = new Date(date); next.setDate(next.getDate() + days); return next;
  }
  function addMonthsToDate(date, months){
    const next = new Date(date);
    const day = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + months);
    next.setDate(Math.min(day, new Date(next.getFullYear(), next.getMonth()+1, 0).getDate()));
    return next;
  }
  function normaliseRecurrence(recurrence){
    if (!recurrence || recurrence.frequency === "none") return null;
    const allowed = ["daily","weekly","monthly","custom"];
    const frequency = allowed.includes(recurrence.frequency) ? recurrence.frequency : "custom";
    const interval = Number.isFinite(Number(recurrence.interval)) ? Math.max(1, Number(recurrence.interval)) : 1;
    const byDay = Array.isArray(recurrence.byDay) ? recurrence.byDay.filter(day=>day && ["sun","mon","tue","wed","thu","fri","sat"].includes(day)) : [];
    return {
      frequency,
      interval,
      unit: ["day","week","month"].includes(recurrence.unit) ? recurrence.unit : "week",
      byDay,
      until: recurrence.until || null,
      customText: recurrence.customText || ""
    };
  }
  function recurrenceSummary(recurrence){
    const normalized = normaliseRecurrence(recurrence);
    if (!normalized) return "Does not repeat";

    const weekdayMap = {sun:"Sun",mon:"Mon",tue:"Tue",wed:"Wed",thu:"Thu",fri:"Fri",sat:"Sat"};
    const dayText = normalized.byDay.length ? normalized.byDay.map(day=>weekdayMap[day] || day).join(", ") : "";

    let summary;
    if (normalized.frequency === "daily") summary = normalized.interval === 1 ? "Every day" : `Every ${normalized.interval} days`;
    else if (normalized.frequency === "weekly"){
      if (!dayText) summary = normalized.interval === 1 ? "Every week" : `Every ${normalized.interval} weeks`;
      else summary = normalized.interval === 1 ? `Every week on ${dayText}` : `Every ${normalized.interval} weeks on ${dayText}`;
    } else if (normalized.frequency === "monthly") summary = normalized.interval === 1 ? "Every month" : `Every ${normalized.interval} months`;
    else {
      const unit = normalized.unit || "week";
      const unitLabel = normalized.interval === 1 ? unit : `${unit}s`;
      summary = `Every ${normalized.interval} ${unitLabel}${unit === "week" && dayText ? ` on ${dayText}` : ""}`;
    }
    return normalized.until ? `${summary} · through ${normalized.until}` : summary;
  }
  function updateRecurrenceSummary(modal, standalone=false){
    const prefix = standalone ? "standalone" : "item";
    const frequencyEl = modal.querySelector(`#${prefix}RepeatFrequency`);
    const intervalEl = modal.querySelector(`#${prefix}RepeatInterval`);
    const unitEl = modal.querySelector(`#${prefix}RepeatUnit`);
    const untilEl = modal.querySelector(`#${prefix}RepeatUntil`);
    const summaryEl = modal.querySelector(standalone ? "#standaloneRepeatSummary" : "#recurrenceSummary");
    const frequency = frequencyEl?.value || "none";
    const interval = Number(intervalEl?.value || 1);
    const until = untilEl?.value || null;
    const byDay = [...modal.querySelectorAll(".repeatDayChip input:checked")].map(input=>input.value);
    const unit = unitEl?.value || "week";
    const summary = recurrenceSummary(frequency === "none" ? null : {frequency, interval: Math.max(1, isNaN(interval) ? 1 : interval), unit, until, byDay});
    if (!summaryEl) return summary;
    summaryEl.textContent = summary;
    summaryEl.title = summary;
    const intervalLabel = modal.querySelector(`#${prefix}RepeatIntervalLabel`);
    if (intervalLabel){
      const intervalUnit = frequency === "daily" ? "days" : frequency === "monthly" ? "months" : frequency === "weekly" ? "weeks" : "";
      intervalLabel.textContent = intervalUnit ? `Every (${intervalUnit})` : "Every";
    }
    const rows = modal.querySelectorAll("[data-repeat-field]");
    rows.forEach(row=>{
      const field = row.dataset.repeatField;
      const visible = frequency !== "none" && (field !== "weekdays" || frequency === "weekly" || (frequency === "custom" && unit === "week")) && (field !== "customUnit" || frequency === "custom");
      row.hidden = !visible;
    });
    return summary;
  }
  function getWeekdayIndex(date){
    return date.getDay();
  }
  function expandRecurringDates(startDate, endDate, recurrence, limit = 320){
    if (!startDate || !recurrence || recurrence.frequency === "none") return [{date:startDate, endDate:endDate || startDate}];
    const normalized = normaliseRecurrence(recurrence);
    if (!normalized) return [{date:startDate, endDate:endDate || startDate}];
    const start = parseCalendarDate(startDate);
    const initialEnd = parseCalendarDate(endDate || startDate);
    const durationDays = Math.max(0, Math.round((initialEnd - start) / 86400000));
    const until = normalized.until ? parseCalendarDate(normalized.until) : null;
    const results = [];
    const weekdayMap = {sun:0,mon:1,tue:2,wed:3,thu:4,fri:5,sat:6};
    const selectedDays = normalized.byDay.map(day=>weekdayMap[day]).filter(day=>day !== undefined).sort((a,b)=>a-b);
    const addOccurrence = occurrenceStart=>{
      results.push({date:formatCalendarDate(occurrenceStart), endDate:formatCalendarDate(addDaysToDate(occurrenceStart, durationDays))});
    };

    if ((normalized.frequency === "weekly" || (normalized.frequency === "custom" && normalized.unit === "week")) && selectedDays.length){
      const firstWeek = addDaysToDate(start, -getWeekdayIndex(start));
      for (let weekOffset=0; results.length<limit; weekOffset+=normalized.interval){
        let hasFutureDate = false;
        for (const weekday of selectedDays){
          const occurrenceStart = addDaysToDate(firstWeek, weekOffset * 7 + weekday);
          if (occurrenceStart < start) continue;
          if (until && occurrenceStart > until) continue;
          hasFutureDate = true;
          addOccurrence(occurrenceStart);
          if (results.length >= limit) break;
        }
        const nextWeekStart = addDaysToDate(firstWeek, (weekOffset + normalized.interval) * 7);
        if (!hasFutureDate && until && nextWeekStart > until) break;
        if (until && nextWeekStart > until && results.length === 0) break;
      }
    } else {
      let currentStart = new Date(start);
      for (let index=0; index<limit; index++){
        if (until && currentStart > until) break;
        addOccurrence(currentStart);
        if (normalized.frequency === "daily" || (normalized.frequency === "custom" && normalized.unit === "day")) currentStart = addDaysToDate(currentStart, normalized.interval);
        else if (normalized.frequency === "monthly" || (normalized.frequency === "custom" && normalized.unit === "month")) currentStart = addMonthsToDate(start, (index + 1) * normalized.interval);
        else currentStart = addDaysToDate(currentStart, 7 * normalized.interval);
      }
    }
    return results;
  }
  /* Google Calendar integration moved to js/services/google-calendar/google-calendar.js */
  async function showGoogleCalendarInfo(){
    await showNotice("Google Calendar sync", "This local file cannot silently sync with Google Calendar because Google requires OAuth credentials and a server-side token flow. Use the GCal link on an event for one-click creation, or export an .ics file and import it into Google Calendar.");
  }
  function openStandaloneCalendarItemModal(item, isNew=false){
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.id = "standaloneCalendarOverlay";
    overlay.innerHTML = `<div class="Overlay Overlay--size-medium position-relative" data-modal id="standaloneCalendarModal"></div>`;
    overlay.addEventListener("click", event=>{ if (event.target===overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    const modal = overlay.querySelector("#standaloneCalendarModal");
    let selectedType = item.calendarType==="event" ? "event" : "task";
    const recurrenceUnit = item.recurrence?.unit || (item.recurrence?.frequency === "custom" ? "week" : "day");
    modal.innerHTML = `<button class="btn btn-invisible closeX" data-calendar-close aria-label="Close">✕</button>
      <div class="standaloneCalendarHeading"><h3>${isNew ? "New calendar item" : "Edit calendar item"}</h3><div class="typeTabs" role="group" aria-label="Calendar item type"><button type="button" data-calendar-type="task" aria-pressed="${selectedType==="task"}">Task</button><button type="button" data-calendar-type="event" aria-pressed="${selectedType==="event"}">Event</button></div></div>
      <div class="modalRow"><label for="standaloneTitle">Title</label><input class="form-control" id="standaloneTitle" value="${escapeHtml(item.title||"")}" placeholder="Calendar item title"></div>
      <div class="modalRow"><label for="standaloneDescription">Description</label><textarea class="form-control" id="standaloneDescription" placeholder="Add notes...">${escapeHtml(item.description||"")}</textarea></div>
      ${attachmentSectionHtml(item,"standalone")}
      <div class="modalGrid calendarScheduleGrid">
        <div class="calendarDateTimeGroup">
          <div class="modalRow"><label for="standaloneStartDate">Start date</label><input class="form-control" id="standaloneStartDate" type="date" value="${escapeHtml(item.startDate||item.endDate||"")}"></div>
          <div class="modalRow"><label for="standaloneStart">Start time</label><input class="form-control" id="standaloneStart" type="time" value="${escapeHtml(item.startTime||"")}"></div>
        </div>
        <div class="calendarDateTimeGroup">
          <div class="modalRow"><label for="standaloneEndDate">End date</label><input class="form-control" id="standaloneEndDate" type="date" min="${escapeHtml(item.startDate||item.endDate||"")}" value="${escapeHtml(item.endDate||item.startDate||"")}"></div>
          <div class="modalRow"><label for="standaloneEnd">End time</label><input class="form-control" id="standaloneEnd" type="time" value="${escapeHtml(item.endTime||"")}"></div>
        </div>
        <div class="modalRow calendarLocationRow"><label for="standaloneLocation">Location</label><input class="form-control" id="standaloneLocation" value="${escapeHtml(item.location||"")}" placeholder="Optional location"></div>
        <div class="modalRow calendarLocationRow"><label for="standaloneReminderAt">Reminder</label><input class="form-control" id="standaloneReminderAt" type="datetime-local" value="${escapeHtml(dateTimeLocalValue(item.reminderAt))}"></div>
      </div>
      <div class="recurrencePanel">
        <div class="recurrenceRow">
          <label class="recurrenceLabel" for="standaloneRepeatFrequency">Repeat</label>
          <select class="form-control" id="standaloneRepeatFrequency">
            <option value="none" ${!item.recurrence || item.recurrence.frequency==="none" ? "selected" : ""}>Does not repeat</option>
            <option value="daily" ${item.recurrence && item.recurrence.frequency==="daily" ? "selected" : ""}>Daily</option>
            <option value="weekly" ${item.recurrence && item.recurrence.frequency==="weekly" ? "selected" : ""}>Weekly</option>
            <option value="monthly" ${item.recurrence && item.recurrence.frequency==="monthly" ? "selected" : ""}>Monthly</option>
            <option value="custom" ${item.recurrence && item.recurrence.frequency==="custom" ? "selected" : ""}>Custom</option>
          </select>
        </div>
        <div class="recurrenceRow" data-repeat-field="interval">
          <label class="recurrenceLabel" id="standaloneRepeatIntervalLabel" for="standaloneRepeatInterval">Every</label>
          <div class="recurrenceIntervalControls">
            <input class="form-control" id="standaloneRepeatInterval" type="number" min="1" max="365" value="${Number(item.recurrence?.interval || 1)}">
            <select class="form-control" id="standaloneRepeatUnit" data-repeat-field="customUnit" aria-label="Custom repeat unit">
              <option value="day" ${recurrenceUnit==="day"?"selected":""}>days</option>
              <option value="week" ${recurrenceUnit==="week"?"selected":""}>weeks</option>
              <option value="month" ${recurrenceUnit==="month"?"selected":""}>months</option>
            </select>
          </div>
        </div>
        <div class="recurrenceRow" data-repeat-field="weekdays">
          <span class="recurrenceLabel">On</span>
          <div class="repeatDayPicker">${["sun","mon","tue","wed","thu","fri","sat"].map(day=>`<label class="repeatDayChip ${item.recurrence?.byDay?.includes(day) ? "selected" : ""}"><input type="checkbox" value="${day}" ${item.recurrence?.byDay?.includes(day) ? "checked" : ""}><span>${day.slice(0,3)}</span></label>`).join("")}</div>
        </div>
        <div class="recurrenceRow" data-repeat-field="until">
          <label class="recurrenceLabel" for="standaloneRepeatUntil">Ends</label>
          <input class="form-control" id="standaloneRepeatUntil" type="date" value="${escapeHtml(item.recurrence?.until || "")}">
        </div>
        <div class="recurrenceRow recurrenceRuleRow" data-repeat-field="summary">
          <span class="recurrenceLabel">Rule</span>
          <div class="recurrenceRuleText" id="standaloneRepeatSummary" aria-live="polite">${escapeHtml(recurrenceSummary(item.recurrence))}</div>
        </div>
      </div>
      <div class="uiDivider modalDivider" aria-hidden="true"></div>
      <div class="modalFooter"><button class="btn btn-invisible" data-calendar-close>Cancel</button>${isNew ? "" : `<button class="btn" data-calendar-duplicate>Duplicate</button><button class="btn ${isItemCompleted(item)?"btn-invisible":"btn-primary"} btn-sm" data-calendar-complete ${item.calendarType==="event"?"hidden":""}>${isItemCompleted(item)?"Reopen":"Mark complete"}</button>`}<button class="btn btn-primary btn-sm" data-calendar-save>${isNew ? "Add item" : "Save changes"}</button></div>`;
    modal.querySelectorAll("[data-calendar-close]").forEach(button=>button.onclick=()=>overlay.remove());
    wireAttachmentControls(modal,item,{prefix:"standalone",isNew});
    const completeButton = modal.querySelector("[data-calendar-complete]");
    const updateTypeControls = () => {
      modal.querySelectorAll("[data-calendar-type]").forEach(button=>{
        const active = button.dataset.calendarType===selectedType;
        button.classList.toggle("active",active);
        button.setAttribute("aria-pressed",String(active));
      });
      if (completeButton) completeButton.hidden = selectedType==="event";
    };
    modal.querySelectorAll("[data-calendar-type]").forEach(button=>button.onclick=()=>{
      selectedType = button.dataset.calendarType;
      updateTypeControls();
    });
    updateTypeControls();
    if (completeButton) completeButton.onclick = () => {
      item.calendarType = selectedType;
      const wasCompleted = isItemCompleted(item);
      item.completedAt = wasCompleted ? null : Date.now();
      item.updatedAt = Date.now();
      recordItemActivity(item,wasCompleted ? "reopened" : "completed");
      completeButton.textContent = wasCompleted ? "Mark complete" : "Reopen";
      completeButton.classList.toggle("btn-primary",wasCompleted);
      completeButton.classList.toggle("btn-invisible",!wasCompleted);
      scheduleSave();
      renderAll();
    };
    updateRecurrenceSummary(modal, true);
    modal.querySelectorAll(".repeatDayChip input").forEach(input=>{
      input.addEventListener("change", ()=>{
        input.closest(".repeatDayChip")?.classList.toggle("selected", input.checked);
        updateRecurrenceSummary(modal, true);
      });
    });
    ["standaloneRepeatFrequency","standaloneRepeatInterval","standaloneRepeatUnit","standaloneRepeatUntil"].forEach(id=>{
      const input = modal.querySelector(`#${id}`);
      if (!input) return;
      input.addEventListener("input", ()=>updateRecurrenceSummary(modal, true));
      input.addEventListener("change", ()=>updateRecurrenceSummary(modal, true));
    });
    const startDateInput = modal.querySelector("#standaloneStartDate");
    const endDateInput = modal.querySelector("#standaloneEndDate");
    startDateInput.onchange = () => {
      endDateInput.min = startDateInput.value;
      if (endDateInput.value && endDateInput.value < startDateInput.value) endDateInput.value = startDateInput.value;
    };
    const duplicateButton = modal.querySelector("[data-calendar-duplicate]");
    if (duplicateButton) duplicateButton.onclick = () => {
      const now = Date.now();
      const copy = {
        ...item,
        id:uid(),
        calendarType:selectedType,
        title:`${modal.querySelector("#standaloneTitle").value.trim()||item.title} (copy)`,
        description:modal.querySelector("#standaloneDescription").value,
        startDate:startDateInput.value,
        endDate:endDateInput.value,
        location:modal.querySelector("#standaloneLocation").value.trim(),
        reminderAt:modal.querySelector("#standaloneReminderAt").value ? new Date(modal.querySelector("#standaloneReminderAt").value).toISOString() : null,
        startTime:modal.querySelector("#standaloneStart").value,
        endTime:modal.querySelector("#standaloneEnd").value,
        completedAt:null,
        recurrence: normaliseRecurrence({
          frequency: modal.querySelector("#standaloneRepeatFrequency").value,
          interval: Number(modal.querySelector("#standaloneRepeatInterval").value || 1),
          unit: modal.querySelector("#standaloneRepeatUnit").value,
          until: modal.querySelector("#standaloneRepeatUntil").value || null,
          byDay: [...modal.querySelectorAll(".repeatDayChip input:checked")].map(input=>input.value),
          customText: updateRecurrenceSummary(modal, true)
        }),
        tagIds:[...(item.tagIds||[])],
        values:{...(item.values||{})},
        comments:[],
        subitems:(item.subitems||[]).map(subitem=>({...subitem,id:uid(),done:false})),
        archived:false,
        createdAt:now,
        updatedAt:now
      };
      delete copy.googleEventIds;
      delete copy.googleSyncMeta;
      state.calendarItems.push(copy);
      scheduleSave();
      overlay.remove();
      renderAll();
      openStandaloneCalendarItemModal(copy);
    };
    modal.querySelector("[data-calendar-save]").onclick = () => {
      const title = modal.querySelector("#standaloneTitle").value.trim();
      const startDate = startDateInput.value;
      const endDate = endDateInput.value;
      if (!title || !startDate || !endDate || endDate < startDate) return;
      item.title = title;
      item.calendarType = selectedType;
      if (selectedType==="event") item.completedAt = null;
      item.description = modal.querySelector("#standaloneDescription").value;
      item.startDate = startDate;
      item.endDate = endDate;
      item.location = modal.querySelector("#standaloneLocation").value.trim();
      item.reminderAt = modal.querySelector("#standaloneReminderAt").value ? new Date(modal.querySelector("#standaloneReminderAt").value).toISOString() : null;
      item.startTime = modal.querySelector("#standaloneStart").value;
      item.endTime = modal.querySelector("#standaloneEnd").value;
      item.recurrence = normaliseRecurrence({
        frequency: modal.querySelector("#standaloneRepeatFrequency").value,
        interval: Number(modal.querySelector("#standaloneRepeatInterval").value || 1),
        unit: modal.querySelector("#standaloneRepeatUnit").value,
        until: modal.querySelector("#standaloneRepeatUntil").value || null,
        byDay: [...modal.querySelectorAll(".repeatDayChip input:checked")].map(input=>input.value),
          customText: updateRecurrenceSummary(modal, true)
      });
      item.updatedAt = Date.now();
      if (isNew){
        item.activity = Array.isArray(item.activity) ? item.activity : [];
        recordItemActivity(item, "created");
        state.calendarItems.push(item);
      }
      scheduleSave();
      overlay.remove();
      renderAll();
      if (googleAccessToken && linkedGoogleCalendarIds().length) syncGoogleCalendar(null);
    };
    modal.querySelector("#standaloneTitle").focus();
  }
  async function openNewCalendarItemModal(scopeProject, date){
    if (!scopeProject){
      openStandaloneCalendarItemModal({id:uid(), title:"", description:"", attachments:[], calendarType:"task", startTime:"", endTime:"", location:"", startDate:date, endDate:date, tagIds:[], values:{}, subitems:[], comments:[], activity:[], archived:false, standalone:true, createdAt:Date.now(), updatedAt:Date.now()}, true);
      return;
    }
    const project = scopeProject;
    if (!project) return;
    const dateField = calendarDateFields(project)[0];
    if (!dateField){ await showNotice("Date column required", `Add a date column to ${project.name} before creating calendar items.`); return; }
    const group = project.groups[0];
    openItemRef = {projectId:project.id, groupId:group.id, itemId:null, isNew:true, globalNew:!scopeProject, draft:{
      id:uid(), title:"", description:"", attachments:[], calendarType:"task", startTime:"", endTime:"", location:"", endDate:"",
      tagIds:[], values:{[dateField.id]:date}, subitems:[], comments:[], activity:[], archived:false, createdAt:Date.now(), updatedAt:Date.now()
    }};
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.id = "itemOverlay";
    overlay.innerHTML = `<div class="Overlay Overlay--size-medium position-relative" data-modal id="itemModal"></div>`;
    overlay.addEventListener("click", event=>{ if (event.target===overlay) closeItemModal(); });
    document.body.appendChild(overlay);
    renderItemModal();
  }
  /* ---------- Item modal ---------- */
  function openItemModal(pid, gid, iid){
    if (state.folderLazy && !getLoadedProject(pid)){
      ensureProjectLoaded(pid).then(()=>openItemModal(pid,gid,iid)).catch(err=>showNotice("Couldn't load project item",err.message));
      return;
    }
    openItemRef = {projectId:pid, groupId:gid, itemId:iid};
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.id = "itemOverlay";
    overlay.innerHTML = `<div class="Overlay Overlay--size-medium position-relative" data-modal id="itemModal"></div>`;
    overlay.addEventListener("click", (e)=>{ if (e.target===overlay) closeItemModal(); });
    document.body.appendChild(overlay);
    renderItemModal();
  }
  function closeItemModal(){
    const el = document.getElementById("itemOverlay");
    if (el) el.remove();
    openItemRef = null;
  }
  function positionFloatingSelectMenu(button,menu){
    if (!button?.isConnected || menu.hidden) return;
    const rect=button.getBoundingClientRect();
    const menuMaxHeight=Math.min(360,window.innerHeight-16);
    const naturalHeight=Math.min(menu.scrollHeight,menuMaxHeight);
    const spaceBelow=window.innerHeight-rect.bottom-8;
    const spaceAbove=rect.top-8;
    const placeAbove=spaceBelow<naturalHeight && spaceAbove>spaceBelow;
    const maxHeight=Math.max(40,Math.min(menuMaxHeight,placeAbove?spaceAbove:spaceBelow));
    const width=Math.min(rect.width,window.innerWidth-16);
    menu.style.maxHeight=`${maxHeight}px`;
    menu.style.width=`${width}px`;
    menu.style.left=`${Math.max(8,Math.min(rect.left,window.innerWidth-width-8))}px`;
    menu.style.top=placeAbove
      ? `${Math.max(8,rect.top-Math.min(naturalHeight,maxHeight)-4)}px`
      : `${rect.bottom+4}px`;
  }
  function openFloatingSelectMenu(button,menu){
    menu._selectHome={parent:menu.parentNode,nextSibling:menu.nextSibling};
    menu._selectAnchor=button;
    document.body.appendChild(menu);
    menu.hidden=false;
    button.setAttribute("aria-expanded","true");
    positionFloatingSelectMenu(button,menu);
  }
  function closeFloatingSelectMenu(menu){
    menu.hidden=true;
    menu._selectAnchor?.setAttribute("aria-expanded","false");
    const home=menu._selectHome;
    if (home?.parent?.isConnected){
      home.parent.insertBefore(menu,home.nextSibling?.parentNode===home.parent?home.nextSibling:null);
    }
    menu._selectAnchor=null;
    menu._selectHome=null;
    menu.style.removeProperty("top");
    menu.style.removeProperty("left");
    menu.style.removeProperty("width");
    menu.style.removeProperty("max-height");
  }
  function repositionFloatingSelectMenus(){
    document.querySelectorAll(".appSelectMenu:not([hidden]),.dialogSelectMenu:not([hidden])").forEach(menu=>{
      positionFloatingSelectMenu(menu._selectAnchor,menu);
    });
  }
  function enhanceSelectControl(select){
    if (select.dataset.appSelectEnhanced || !select.options.length) return;
    select.dataset.appSelectEnhanced="true";
    const wrapper=document.createElement("div");
    wrapper.className="appSelectWrap";
    const isTableSelect=!!select.closest(".listTable");
    const width=select.getBoundingClientRect().width;
    if (isTableSelect) wrapper.style.width="100%";
    else if (width>0) wrapper.style.width=`${width}px`;
    select.parentNode.insertBefore(wrapper,select);
    wrapper.appendChild(select);
    select.classList.add("appSelectNative");
    const button=document.createElement("button");
    button.type="button";
    button.className="appSelectButton";
    button.setAttribute("aria-haspopup","listbox");
    button.setAttribute("aria-expanded","false");
    const label=document.createElement("span");
    const chevron=document.createElement("iconify-icon");
    chevron.setAttribute("icon","mdi:chevron-down");
    chevron.setAttribute("aria-hidden","true");
    button.append(label,chevron);
    const menu=document.createElement("div");
    menu.className="appSelectMenu";
    menu.setAttribute("role","listbox");
    menu.hidden=true;
    const options=[...select.options].map(option=>{
      const item=document.createElement("button");
      item.type="button";
      item.className="appSelectOption";
      item.setAttribute("role","option");
      item.dataset.value=option.value;
      item.textContent=option.textContent;
      menu.appendChild(item);
      return item;
    });
    wrapper.append(button,menu);
    const sync=()=>{
      const selected=select.options[select.selectedIndex]||select.options[0];
      label.textContent=selected.textContent;
      options.forEach((option,index)=>{
        const active=select.options[index]===selected;
        option.classList.toggle("selected",active);
        option.setAttribute("aria-selected",String(active));
      });
    };
    const close=()=>closeFloatingSelectMenu(menu);
    const open=()=>{ openFloatingSelectMenu(button,menu); options.find(option=>option.dataset.value===select.value)?.focus(); };
    button.onclick=event=>{ event.stopPropagation(); menu.hidden ? open() : close(); };
    button.onkeydown=event=>{
      if (event.key==="ArrowDown" || event.key==="Enter" || event.key===" "){ event.preventDefault(); open(); }
    };
    options.forEach(option=>option.onclick=()=>{
      select.value=option.dataset.value;
      select.dispatchEvent(new Event("change",{bubbles:true}));
      sync(); close(); button.focus();
    });
    menu.onkeydown=event=>{
      const current=Math.max(0,options.indexOf(document.activeElement));
      if (event.key==="ArrowDown"){ event.preventDefault(); options[Math.min(options.length-1,current+1)]?.focus(); }
      if (event.key==="ArrowUp"){ event.preventDefault(); options[Math.max(0,current-1)]?.focus(); }
      if (event.key==="Escape"){ event.preventDefault(); close(); button.focus(); }
    };
    select.addEventListener("change",sync);
    sync();
  }
  function enhanceSelectControls(root=document){
    root.querySelectorAll("select:not([data-app-select-enhanced])").forEach(enhanceSelectControl);
  }
  function enhanceDateInput(input){
    if (input.dataset.datePickerEnhanced) return;
    input.dataset.datePickerEnhanced="true";
    const isDateTime=input.type==="datetime-local";
    const wrapper=document.createElement("div");
    wrapper.className="datePickerWrap";
    const width=input.getBoundingClientRect().width;
    if (width>0) wrapper.style.width=`${width}px`;
    input.parentNode.insertBefore(wrapper,input);
    wrapper.appendChild(input);
    input.classList.add("datePickerNative");
    const button=document.createElement("button");
    button.type="button";
    button.className="datePickerButton";
    button.setAttribute("aria-haspopup","dialog");
    button.setAttribute("aria-expanded","false");
    if (input.getAttribute("aria-label")) button.setAttribute("aria-label",input.getAttribute("aria-label"));
    const label=document.createElement("span");
    const icon=document.createElement("iconify-icon");
    icon.setAttribute("icon",isDateTime?"mdi:clock-outline":"mdi:calendar-month-outline");
    icon.setAttribute("aria-hidden","true");
    button.append(label,icon);
    const popover=document.createElement("div");
    popover.className="datePickerPopover";
    popover.hidden=true;
    popover.setAttribute("role","dialog");
    popover.setAttribute("aria-label",input.getAttribute("aria-label")||"Choose date");
    wrapper.appendChild(button);
    document.body.appendChild(popover);
    let month=new Date();
    const parseDate=()=>{
      const value=input.value.slice(0,10);
      const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      return match ? new Date(Number(match[1]),Number(match[2])-1,Number(match[3])) : null;
    };
    const isoDate=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
    const labelDate=()=>{
      const date=parseDate();
      if (!date) return isDateTime ? "Choose date and time" : "Choose date";
      const text=date.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
      return isDateTime && input.value.includes("T") ? `${text} · ${input.value.slice(11,16)}` : text;
    };
    const emitChange=()=>input.dispatchEvent(new Event("change",{bubbles:true}));
    const render=()=>{
      const selected=parseDate();
      const today=new Date();
      const firstDay=new Date(month.getFullYear(),month.getMonth(),1);
      const start=new Date(month.getFullYear(),month.getMonth(),1-firstDay.getDay());
      const days=[];
      for (let index=0;index<42;index++){
        const date=new Date(start.getFullYear(),start.getMonth(),start.getDate()+index);
        const currentMonth=date.getMonth()===month.getMonth();
        const isSelected=selected && date.getTime()===selected.getTime();
        const isToday=date.toDateString()===today.toDateString();
        days.push(`<button type="button" class="datePickerDay${currentMonth?"":" is-outside"}${isSelected?" is-selected":""}${isToday?" is-today":""}" data-date="${isoDate(date)}" aria-label="${date.toLocaleDateString()}">${date.getDate()}</button>`);
      }
      popover.innerHTML=`<div class="datePickerHeader"><button type="button" class="datePickerNav" data-date-action="previous" aria-label="Previous month">‹</button><strong>${month.toLocaleDateString(undefined,{month:"long",year:"numeric"})}</strong><button type="button" class="datePickerNav" data-date-action="next" aria-label="Next month">›</button></div><div class="datePickerWeekdays">${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(day=>`<span>${day}</span>`).join("")}</div><div class="datePickerGrid">${days.join("")}</div>${isDateTime?`<label class="datePickerTimeLabel">Time<input class="datePickerTimeInput" type="time" value="${input.value.slice(11,16)}"></label>`:""}<div class="datePickerFooter"><button type="button" data-date-action="clear">Clear</button><button type="button" data-date-action="today">Today</button></div>`;
      const timeInput=popover.querySelector(".datePickerTimeInput");
      if (timeInput) timeInput.onchange=()=>{ if (input.value.slice(0,10)) { input.value=`${input.value.slice(0,10)}T${timeInput.value}`; label.textContent=labelDate(); emitChange(); } };
    };
    const close=()=>{ popover.hidden=true; button.setAttribute("aria-expanded","false"); };
    const chooseDate=date=>{
      const time=isDateTime ? (input.value.slice(11,16)||"09:00") : "";
      input.value=`${isoDate(date)}${isDateTime?`T${time}`:""}`;
      label.textContent=labelDate(); emitChange();
      if (!isDateTime) close(); else { month=new Date(date.getFullYear(),date.getMonth(),1); render(); }
    };
    popover.addEventListener("click",event=>{
      const control=event.target.closest("[data-date-action]");
      if (control){
        event.preventDefault();
        event.stopPropagation();
        const action=control.dataset.dateAction;
        if (action==="previous") month=new Date(month.getFullYear(),month.getMonth()-1,1);
        if (action==="next") month=new Date(month.getFullYear(),month.getMonth()+1,1);
        if (action==="clear"){ input.value=""; emitChange(); close(); }
        if (action==="today") chooseDate(new Date());
        if (action==="previous" || action==="next"){
          render();
          popover.querySelector(`[data-date-action="${action}"]`)?.focus();
        }
        return;
      }
      const day=event.target.closest(".datePickerDay");
      if (day){
        event.preventDefault();
        event.stopPropagation();
        chooseDate(new Date(`${day.dataset.date}T00:00:00`));
      }
    });
    const positionPopover=()=>{
      const rect=wrapper.getBoundingClientRect();
      const width=Math.min(278,window.innerWidth-24);
      popover.style.width=`${Math.max(1,width)}px`;
      popover.style.left=`${Math.max(12,Math.min(rect.left,window.innerWidth-width-12))}px`;
      popover.style.top=`${rect.bottom+6}px`;
      const popoverRect=popover.getBoundingClientRect();
      if (popoverRect.bottom>window.innerHeight-12) popover.style.top=`${Math.max(12,rect.top-popoverRect.height-6)}px`;
    };
    button.onclick=event=>{ event.stopPropagation(); if (popover.hidden){ const selected=parseDate(); month=selected?new Date(selected.getFullYear(),selected.getMonth(),1):new Date(); render(); popover.hidden=false; button.setAttribute("aria-expanded","true"); positionPopover(); }else close(); };
    button.onkeydown=event=>{ if (event.key==="Enter" || event.key===" "){ event.preventDefault(); button.click(); } };
    input.addEventListener("change",()=>{ label.textContent=labelDate(); });
    label.textContent=labelDate();
  }
  function enhanceDateInputs(root=document){
    root.querySelectorAll("input[type=date]:not([data-date-picker-enhanced]),input[type=datetime-local]:not([data-date-picker-enhanced])").forEach(enhanceDateInput);
  }
  function showDialog(options){ return dialogs.showDialog(options); }
  function showNotice(title, message){ return dialogs.showNotice(title, message); }
  function showConfirm(title, message, danger=false){ return dialogs.showConfirm(title, message, danger); }
  function fieldInputHtml(field, item){
    const val = item.values[field.id] ?? "";
    const isChecked = val === true || val === "true" || val === "1" || val === "yes" || val === 1;
    if (field.type==="priority"){
      const opts = [{id:"",label:"None"}, ...PRIORITY_OPTIONS].map(o=>
        `<option value="${o.id}" ${val===o.id?"selected":""}>${escapeHtml(o.label)}</option>`).join("");
      return `<div class="sideItem"><div class="sideItemLabel">${escapeHtml(field.label)}</div><select class="form-control fieldInput" data-fieldid="${field.id}">${opts}</select></div>`;
    }
    if (field.type==="select"){
      const opts = [{id:"",label:"None"}, ...(field.options||[])].map(o=>
        `<option value="${o.id}" ${val===o.id?"selected":""}>${escapeHtml(o.label)}</option>`).join("");
      return `<div class="sideItem"><div class="sideItemLabel">${escapeHtml(field.label)}</div><select class="form-control fieldInput" data-fieldid="${field.id}">${opts}</select></div>`;
    }
    if (field.type==="multi-select"){
      const selected=new Set(Array.isArray(val) ? val : []);
      const options=(field.options||[]).map(option=>`<label class="multiSelectFieldOption"><input type="checkbox" class="fieldInput" data-fieldid="${field.id}" value="${option.id}" ${selected.has(option.id)?"checked":""}><span>${escapeHtml(option.label)}</span></label>`).join("");
      return `<div class="sideItem"><div class="sideItemLabel">${escapeHtml(field.label)}</div><div class="multiSelectFieldOptions">${options||`<span class="fieldOptionsEmpty">Add options to this column first.</span>`}</div></div>`;
    }
    if (["date","start-date","due-date"].includes(field.type)){
      return `<div class="sideItem"><div class="sideItemLabel">${escapeHtml(field.label)}</div><input type="date" class="form-control fieldInput" data-fieldid="${field.id}" value="${val}"></div>`;
    }
    if (field.type==="checkbox"){
      return `<div class="sideItem sideItemCheckbox"><div class="sideItemLabel">${escapeHtml(field.label)}</div><label class="checkboxFieldControl"><input type="checkbox" class="fieldInput" data-fieldid="${field.id}" value="true" ${isChecked?"checked":""}><span class="checkboxFieldValue">${isChecked ? "Yes" : "No"}</span></label></div>`;
    }
    if (field.type==="url") return `<div class="sideItem"><div class="sideItemLabel">${escapeHtml(field.label)}</div><input type="url" class="form-control fieldInput" data-fieldid="${field.id}" value="${escapeHtml(val)}" placeholder="https://example.com"></div>`;
    if (field.type==="email") return `<div class="sideItem"><div class="sideItemLabel">${escapeHtml(field.label)}</div><input type="email" class="form-control fieldInput" data-fieldid="${field.id}" value="${escapeHtml(val)}" placeholder="name@example.com"></div>`;
    if (field.type==="number") return `<div class="sideItem"><div class="sideItemLabel">${escapeHtml(field.label)}</div><input type="number" step="any" class="form-control fieldInput" data-fieldid="${field.id}" value="${escapeHtml(val)}"></div>`;
    return `<div class="sideItem"><div class="sideItemLabel">${escapeHtml(field.label)}</div><input type="text" class="form-control fieldInput" data-fieldid="${field.id}" value="${escapeHtml(val)}"></div>`;
  }
  function renderItemModal(){
    if (!openItemRef) return;
    const {projectId,groupId,itemId} = openItemRef;
    const isNew = !!openItemRef.isNew;
    const project = getProject(projectId);
    const group = project.groups.find(candidate=>candidate.id===groupId);
    const item = isNew ? openItemRef.draft : getItem(projectId, groupId, itemId);
    const modal = document.getElementById("itemModal");
    if (!item || !modal) { closeItemModal(); return; }

    const projectOptions = isNew && openItemRef.globalNew ? `<div class="sideItem"><div class="sideItemLabel">Project</div><select class="form-control" id="itemProjectSelect">${projectRecords().map(candidate=>`<option value="${candidate.id}" ${candidate.id===projectId?"selected":""}>${escapeHtml(candidate.name)}</option>`).join("")}</select></div>` : "";
    const milestoneOptions = (project.milestones||[]).map(milestone=>
      `<option value="${escapeHtml(milestone.id)}" ${item.milestoneId===milestone.id?"selected":""}>${escapeHtml(milestone.title)}</option>`).join("");
    const milestoneSelector = item.calendarType!=="event" && milestoneOptions ? `<div class="sideItem">
      <label class="sideItemLabel" for="itemMilestoneSelect">Milestone</label>
      <select class="form-control" id="itemMilestoneSelect"><option value="">No milestone</option>${milestoneOptions}</select>
    </div>` : "";
    const groupOptions = project.groups.map(g=>
      `<option value="${g.id}" ${g.id===groupId?"selected":""}>${escapeHtml(g.name)}</option>`).join("");
    const groupSelector = project.groups.length>1 ? `<div class="sideItem">
            <div class="sideItemLabel">Group</div>
            <select class="form-control" id="itemGroupSelect">${groupOptions}</select>
          </div>` : "";
    const isCompleted = isItemCompleted(item);

    const doneSubCount = item.subitems.filter(s=>s.done).length;
    const subPct = item.subitems.length ? Math.round(doneSubCount/item.subitems.length*100) : 0;
    const subitemsHtml = item.subitems.map(s=>`
      <div class="subitemRow ${s.done?"done":""}" data-sid="${s.id}">
        <input type="checkbox" ${s.done?"checked":""} data-action="toggleSub">
        <span class="subitemTitle" contenteditable="true" data-action="editSub">${escapeHtml(s.title)}</span>
        <button class="btn btn-invisible btn-sm" data-action="delSub">✕</button>
      </div>`).join("");

    const tagChips = project.tags.map(t=>tagDotHtml(t, item.tagIds.includes(t.id))).join("");
    const fieldsHtml=fieldsWithStartBeforeDue(project.fields).map(field=>fieldInputHtml(field,item)).join("");
    const hasSchedule = !!(item.startTime || item.endTime || item.endDate || item.recurrence || item.reminderAt);
    const recurrence = normaliseRecurrence(item.recurrence);
    const recurrenceUnit = item.recurrence?.unit || (item.recurrence?.frequency === "custom" ? "week" : "day");
    const scheduleHtml = hasSchedule || openItemRef.scheduleOpen ? `
      <div class="scheduleEditor">
        <div class="sideItemRow2">
          <div class="sideItem">
            <div class="sideItemLabel">Start time</div>
            <input class="form-control" type="time" id="itemStartTimeInput" value="${escapeHtml(item.startTime||"")}" aria-label="Start time">
          </div>
          <div class="sideItem">
            <div class="sideItemLabel">End time</div>
            <input class="form-control" type="time" id="itemEndTimeInput" value="${escapeHtml(item.endTime||"")}" aria-label="End time">
          </div>
        </div>
        <div class="sideItem">
          <div class="sideItemLabel">End date</div>
          <input class="form-control" type="date" id="itemEndDateInput" value="${escapeHtml(item.endDate||"")}" aria-label="End date">
        </div>
        <div class="sideItem">
          <label class="sideItemLabel" for="itemReminderAt">Reminder</label>
          <input class="form-control" type="datetime-local" id="itemReminderAt" value="${escapeHtml(dateTimeLocalValue(item.reminderAt))}" aria-label="Reminder date and time">
        </div>
        <div class="recurrencePanel">
          <div class="recurrenceRow">
            <label class="recurrenceLabel" for="itemRepeatFrequency">Repeat</label>
            <select class="form-control" id="itemRepeatFrequency">
              <option value="none" ${!recurrence ? "selected" : ""}>Does not repeat</option>
              <option value="daily" ${recurrence && recurrence.frequency==="daily" ? "selected" : ""}>Daily</option>
              <option value="weekly" ${recurrence && recurrence.frequency==="weekly" ? "selected" : ""}>Weekly</option>
              <option value="monthly" ${recurrence && recurrence.frequency==="monthly" ? "selected" : ""}>Monthly</option>
              <option value="custom" ${recurrence && recurrence.frequency==="custom" ? "selected" : ""}>Custom</option>
            </select>
          </div>
          <div class="recurrenceRow" data-repeat-field="interval">
            <label class="recurrenceLabel" id="itemRepeatIntervalLabel" for="itemRepeatInterval">Every</label>
            <div class="recurrenceIntervalControls">
              <input class="form-control" type="number" id="itemRepeatInterval" min="1" max="365" value="${escapeHtml(String(recurrence?.interval || 1))}">
              <select class="form-control" id="itemRepeatUnit" data-repeat-field="customUnit" aria-label="Custom repeat unit">
                <option value="day" ${recurrenceUnit==="day"?"selected":""}>days</option>
                <option value="week" ${recurrenceUnit==="week"?"selected":""}>weeks</option>
                <option value="month" ${recurrenceUnit==="month"?"selected":""}>months</option>
              </select>
            </div>
          </div>
          <div class="recurrenceRow" data-repeat-field="weekdays">
            <span class="recurrenceLabel">On</span>
            <div class="repeatDayPicker">${["sun","mon","tue","wed","thu","fri","sat"].map(day=>`<label class="repeatDayChip ${recurrence?.byDay?.includes(day) ? "selected" : ""}"><input type="checkbox" value="${day}" ${recurrence?.byDay?.includes(day) ? "checked" : ""}><span>${day.slice(0,3)}</span></label>`).join("")}</div>
          </div>
          <div class="recurrenceRow" data-repeat-field="until">
            <label class="recurrenceLabel" for="itemRepeatUntil">Ends</label>
            <input class="form-control" type="date" id="itemRepeatUntil" value="${escapeHtml(recurrence?.until || "")}">
          </div>
          <div class="recurrenceRow recurrenceRuleRow" data-repeat-field="summary">
            <span class="recurrenceLabel">Rule</span>
            <div class="recurrenceRuleText" id="recurrenceSummary" aria-live="polite">${escapeHtml(recurrenceSummary(recurrence))}</div>
          </div>
        </div>
      </div>` : `<button class="btn btn-invisible btn-sm scheduleAddBtn" type="button" data-action="addSchedule">+ Add date and time</button>`;
    const comments = item.comments || [];
    const commentsHtml = comments.length
      ? [...comments].sort((a,b)=>b.createdAt-a.createdAt).map(c=>`
        <div class="commentRow" data-cid="${c.id}">
          <div class="commentBody">
            <div class="commentMeta">${escapeHtml(formatDateTime(c.createdAt))}</div>
            <div class="commentText">${escapeHtml(c.text)}</div>
          </div>
          <button class="btn btn-invisible btn-sm" data-action="delComment" data-cid="${c.id}" title="Delete comment">✕</button>
        </div>`).join("")
      : `<div class="commentEmpty">No comments yet.</div>`;
    const activityEvents = [...(item.activity||[])].sort((a,b)=>b.at-a.at);
    const activityHtml = activityEvents.length
      ? activityEvents.map(event=>{
          const label = event.type==="created" ? "Created" : event.type==="commented" ? "Commented" : event.type==="completed" ? "Marked complete" : event.type==="reopened" ? "Reopened" : event.type==="moved" ? `Moved${event.from?` from ${event.from}`:""}${event.to?` to ${event.to}`:""}` : "Updated";
          return `<div class="activityRow"><div class="activityBadge">${escapeHtml(label)}</div><div class="activityMeta">${escapeHtml(formatUpdatedAt(event.at))}</div></div>`;
        }).join("")
      : `<div class="commentEmpty">No activity yet.</div>`;
    const defaultTab = "comments";

    modal.innerHTML = `
      <button class="btn btn-invisible closeX" data-action="close">✕</button>
      <div class="itemModalHeader">
        <div class="itemModalBreadcrumb">${escapeHtml(project.name)} <span aria-hidden="true">/</span> ${escapeHtml(group?.name||"")}</div>
        <div class="itemModalTitleRow">
          <input class="form-control" type="text" id="itemTitleInput" placeholder="Item title" value="${escapeHtml(item.title)}">
          ${!isNew ? `<div class="itemModalActions">
            <button class="btn btn-invisible btn-sm itemModalMenuButton" type="button" data-action="toggleItemMenu" aria-label="More item actions" aria-haspopup="menu" aria-expanded="false" aria-controls="itemModalActionMenu"><iconify-icon icon="mdi:dots-horizontal" aria-hidden="true"></iconify-icon></button>
            <div class="itemModalActionMenu" id="itemModalActionMenu" role="menu" hidden>
              <button type="button" role="menuitem" data-action="duplicateItem"><iconify-icon icon="mdi:content-copy" aria-hidden="true"></iconify-icon><span>Duplicate</span></button>
              <button type="button" role="menuitem" data-action="toggleArchive"><iconify-icon icon="mdi:archive-outline" aria-hidden="true"></iconify-icon><span>${item.archived ? "Unarchive" : "Archive"}</span></button>
              <div class="itemModalActionSeparator" role="separator"></div>
              <button type="button" role="menuitem" class="danger" data-action="deleteItem"><iconify-icon icon="mdi:trash-can-outline" aria-hidden="true"></iconify-icon><span>Delete item</span></button>
            </div>
          </div>` : ""}
        </div>
      </div>
      <div class="itemModalBody">
        <div class="itemModalMain">
          <div class="mainSection">
            <div class="itemDescriptionHead"><div class="mainSectionLabel">Description</div>${attachmentSectionHtml(item,"item")}</div>
            <textarea class="form-control" id="itemDescInput" placeholder="Add notes...">${escapeHtml(item.description)}</textarea>
          </div>
          <div class="mainSection">
            <div class="mainSectionHead">
              <div class="mainSectionLabel">Subitems</div>
              ${item.subitems.length ? `<span class="subitemsProgressCount">${doneSubCount}/${item.subitems.length}</span>` : ""}
            </div>
            ${item.subitems.length ? `<div class="progressTrack"><div class="progressFill" style="width:${subPct}%"></div></div>` : ""}
            <div id="subitemsList">${subitemsHtml}</div>
            <button class="btn btn-invisible btn-sm" data-action="addSub" style="align-self:flex-start;padding-left:6px;">+ Add subitem</button>
          </div>
          ${!isNew ? `
          <div class="mainSection">
            <div class="itemDetailTabs" role="tablist" aria-label="Item details tabs">
              <button type="button" class="itemDetailTab active" data-item-tab="comments" role="tab" aria-selected="true">Comments</button>
              <button type="button" class="itemDetailTab" data-item-tab="attachments" role="tab" aria-selected="false">Attachments <span class="itemAttachmentCount">${(item.attachments||[]).length}</span></button>
              <button type="button" class="itemDetailTab" data-item-tab="activity" role="tab" aria-selected="false">Activity</button>
            </div>
            <div class="itemDetailPanel active" data-item-panel="comments">
              ${commentsHtml}
              <div style="display:flex;gap:6px;margin-top:10px;">
                <input class="form-control" type="text" id="newCommentInput" placeholder="Add a comment..." style="flex:1;">
                <button class="btn btn-sm" data-action="addComment">Add</button>
              </div>
            </div>
            <div class="itemDetailPanel" data-item-panel="attachments">
              <div class="itemAttachmentList" data-attachment-list>${attachmentListHtml(item.attachments||[])}</div>
            </div>
            <div class="itemDetailPanel" data-item-panel="activity">${activityHtml}</div>
          </div>` : ""}
          ${isNew ? `<div class="mainSection itemAttachmentsSection">
            <div class="mainSectionHead"><div class="mainSectionLabel">Attachments</div><span class="itemAttachmentCount">${(item.attachments||[]).length}</span></div>
            <div class="itemAttachmentList" data-attachment-list>${attachmentListHtml(item.attachments||[])}</div>
          </div>` : ""}
        </div>
        <div class="uiDivider itemModalSidebarDivider" aria-hidden="true"></div>
        <div class="itemModalSidebar">
          ${projectOptions}
          ${groupSelector}
          <div class="sideItem">
            <div class="sideItemLabel">Type</div>
            <div class="typeTabs" id="itemCalendarType">
              <button type="button" data-calendar-type="task" class="${item.calendarType!=="event"?"active":""}">Task</button>
              <button type="button" data-calendar-type="event" class="${item.calendarType==="event"?"active":""}">Event</button>
            </div>
          </div>
          ${milestoneSelector}
          ${fieldsHtml}
          <div class="sideItem">
            <div class="sideItemLabel">Tags</div>
            <div id="itemTagChips" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
              ${tagChips}
              <button class="btn btn-invisible btn-sm" data-action="newTagFromItem" title="New tag" style="padding:2px 6px;">+</button>
            </div>
          </div>
          <div class="sideItem">
            <div class="sideItemLabel">Location</div>
            <input class="form-control" type="text" id="itemLocationInput" value="${escapeHtml(item.location||"")}" placeholder="Optional location or link">
          </div>
          <div class="sideItem">
            <div class="sideItemLabel">Schedule</div>
            ${scheduleHtml}
          </div>
        </div>
      </div>
      <div class="uiDivider itemModalDivider" aria-hidden="true"></div>
      <div class="itemModalFooter">
        <span class="itemModalFooterNote">${isNew ? "New item" : `Updated ${escapeHtml(formatDateTime(item.updatedAt))}`}</span>
        <div class="itemModalFooterActions">
          ${isNew ? `<button class="btn btn-primary btn-sm" data-action="saveItem">Add item</button>` : `
            ${item.calendarType!=="event" ? `<button class="btn ${isCompleted?"btn-invisible":"btn-primary"} btn-sm" data-action="completeItem">${isCompleted?"Reopen":"Mark complete"}</button>` : ""}`}
        </div>
      </div>
    `;

    modal.querySelector('[data-action="close"]').onclick = closeItemModal;
    const actionMenu = modal.querySelector("#itemModalActionMenu");
    const actionMenuButton = modal.querySelector('[data-action="toggleItemMenu"]');
    if (actionMenu && actionMenuButton){
      const closeActionMenu = () => {
        actionMenu.hidden = true;
        actionMenuButton.setAttribute("aria-expanded","false");
      };
      actionMenuButton.onclick = () => {
        actionMenu.hidden = !actionMenu.hidden;
        actionMenuButton.setAttribute("aria-expanded",String(!actionMenu.hidden));
        if (!actionMenu.hidden) actionMenu.querySelector('[role="menuitem"]')?.focus();
      };
      modal.addEventListener("click", event=>{
        if (!event.target.closest(".itemModalActions")) closeActionMenu();
      });
      actionMenu.addEventListener("keydown", event=>{
        if (event.key==="Escape"){
          closeActionMenu();
          actionMenuButton.focus();
        } else if (event.key==="ArrowDown" || event.key==="ArrowUp"){
          const menuItems = [...actionMenu.querySelectorAll('[role="menuitem"]')];
          const currentIndex = menuItems.indexOf(document.activeElement);
          const direction = event.key==="ArrowDown" ? 1 : -1;
          menuItems[(currentIndex+direction+menuItems.length)%menuItems.length].focus();
          event.preventDefault();
        }
      });
    }
    if (isNew && openItemRef.globalNew){
      modal.querySelector("#itemProjectSelect").addEventListener("change", e=>{
        const nextProject = getProject(e.target.value);
        const nextGroup = nextProject.groups[0];
        const nextDateField = calendarDateFields(nextProject)[0];
        if (!nextDateField){ showNotice("Date column required", `Add a date column to ${nextProject.name} before creating calendar items.`); return; }
        openItemRef.projectId = nextProject.id;
        openItemRef.groupId = nextGroup.id;
        openItemRef.draft.values = {[nextDateField.id]:openItemRef.draft.values[Object.keys(openItemRef.draft.values)[0]] || todayStr(0)};
        renderItemModal();
      });
    }
    const titleInput = modal.querySelector("#itemTitleInput");
    titleInput.addEventListener("keydown",event=>{
      if (event.key!=="Enter" || event.isComposing) return;
      event.preventDefault();
      if (isNew) modal.querySelector('[data-action="saveItem"]').click();
      else titleInput.blur();
    });
    titleInput.addEventListener("change", e=>{
      item.title = e.target.value.trim() || item.title;
      if (isNew) return;
      item.updatedAt = Date.now(); scheduleSave(); render(); renderItemModal();
    });
    const groupSelect = modal.querySelector("#itemGroupSelect");
    if (groupSelect) groupSelect.addEventListener("change", e=>{
      const newGid = e.target.value;
      const nextGroup = project.groups.find(candidate=>candidate.id===newGid);
      modal.querySelector(".itemModalBreadcrumb").textContent = `${project.name} / ${nextGroup?.name||""}`;
      if (isNew){ openItemRef.groupId = newGid; return; }
      if (newGid !== groupId){
        moveItem(projectId, groupId, newGid, itemId, null);
        openItemRef.groupId = newGid;
      }
    });
    const milestoneSelect=modal.querySelector("#itemMilestoneSelect");
    if (milestoneSelect) milestoneSelect.addEventListener("change",event=>{
      item.milestoneId=event.target.value||null;
      if (isNew) return;
      item.updatedAt=Date.now();
      scheduleSave();
      render();
      renderItemModal();
    });
    const addScheduleBtn = modal.querySelector('[data-action="addSchedule"]');
    if (addScheduleBtn) addScheduleBtn.onclick = () => {
      openItemRef.scheduleOpen = true;
      renderItemModal();
      const firstScheduleInput = modal.querySelector("#itemEndDateInput") || modal.querySelector("#itemStartTimeInput");
      if (firstScheduleInput) firstScheduleInput.focus();
    };
    modal.querySelectorAll("[data-calendar-type]").forEach(button=>{
      button.onclick = () => {
        item.calendarType = button.dataset.calendarType;
        if (item.calendarType==="event") item.milestoneId=null;
        modal.querySelectorAll("[data-calendar-type]").forEach(tab=>tab.classList.toggle("active", tab===button));
        if (isNew) return;
        item.updatedAt = Date.now(); scheduleSave(); render(); renderItemModal();
      };
    });
    ["itemLocationInput","itemStartTimeInput","itemEndTimeInput","itemEndDateInput","itemReminderAt","itemRepeatFrequency","itemRepeatInterval","itemRepeatUnit","itemRepeatUntil"].forEach(id=>{
      const input = modal.querySelector("#"+id);
      if (!input) return;
      if (id==="itemRepeatInterval" || id==="itemRepeatUntil"){
        input.addEventListener("input", ()=>updateRecurrenceSummary(modal));
      }
      input.addEventListener("change", e=>{
        if (id==="itemLocationInput") item.location = e.target.value.trim();
        if (id==="itemStartTimeInput") item.startTime = e.target.value;
        if (id==="itemEndTimeInput") item.endTime = e.target.value;
        if (id==="itemEndDateInput"){
          if (item.endDate && !e.target.value) queueGoogleEventDeletes(item);
          item.endDate = e.target.value;
        }
        if (id==="itemReminderAt") item.reminderAt = e.target.value ? new Date(e.target.value).toISOString() : null;
        if (id==="itemRepeatFrequency" || id==="itemRepeatInterval" || id==="itemRepeatUnit" || id==="itemRepeatUntil"){
          const frequency = modal.querySelector("#itemRepeatFrequency")?.value || "none";
          const interval = Number(modal.querySelector("#itemRepeatInterval")?.value || 1);
          const unit = modal.querySelector("#itemRepeatUnit")?.value || "week";
          const until = modal.querySelector("#itemRepeatUntil")?.value || null;
          const byDay = [...modal.querySelectorAll(".repeatDayChip input:checked")].map(input=>input.value);
          const summary = updateRecurrenceSummary(modal, "");
          item.recurrence = frequency === "none" ? null : {frequency, interval: Math.max(1, isNaN(interval) ? 1 : interval), unit, until, byDay, customText: summary};
        }
        if (isNew){ renderItemModal(); return; }
        item.updatedAt = Date.now(); scheduleSave(); render(); renderItemModal();
        if (id==="itemReminderAt") reminderService.check();
      });
    });
    updateRecurrenceSummary(modal);
    modal.querySelectorAll(".repeatDayChip input").forEach(input=>{
      input.addEventListener("change", () => {
        input.closest(".repeatDayChip")?.classList.toggle("selected", input.checked);
        const frequency = modal.querySelector("#itemRepeatFrequency")?.value || "none";
        const interval = Number(modal.querySelector("#itemRepeatInterval")?.value || 1);
        const unit = modal.querySelector("#itemRepeatUnit")?.value || "week";
        const until = modal.querySelector("#itemRepeatUntil")?.value || null;
        const byDay = [...modal.querySelectorAll(".repeatDayChip input:checked")].map(input=>input.value);
        const summary = updateRecurrenceSummary(modal);
        item.recurrence = frequency === "none" ? null : {frequency, interval: Math.max(1, isNaN(interval) ? 1 : interval), unit, until, byDay, customText: summary};
        if (!openItemRef.isNew) {
          item.updatedAt = Date.now(); scheduleSave(); render();
        }
      });
    });
    modal.querySelectorAll(".fieldInput").forEach(el=>{
      el.addEventListener("change", e=>{
        const field = project.fields.find(candidate=>candidate.id===el.dataset.fieldid);
        const startField=startDateField(project);
        const dueField=dueDateField(project);
        const startValue=startField?item.values[startField.id]:"";
        const dueValue=dueField?item.values[dueField.id]:"";
        if (field===startField&&e.target.value&&dueValue&&e.target.value>dueValue){
          e.target.value=startValue||"";
          showNotice("Start date is after the due date","Choose a start date on or before the due date.");
          return;
        }
        if (field===dueField&&e.target.value&&startValue&&e.target.value<startValue){
          e.target.value=item.values[el.dataset.fieldid]||"";
          showNotice("Task date is before its start date","Choose a task date on or after the task's start date.");
          return;
        }
        if (isDateField(field) && item.values[el.dataset.fieldid] && !e.target.value) queueGoogleEventDeletes(item);
        const nextValue = field?.type==="checkbox" ? (e.target.checked ? "true" : "")
          : field?.type==="multi-select" ? [...modal.querySelectorAll(".fieldInput")].filter(input=>input.dataset.fieldid===el.dataset.fieldid && input.checked).map(input=>input.value)
          : field?.type==="number" ? (e.target.value==="" ? "" : Number(e.target.value))
          : e.target.value;
        item.values[el.dataset.fieldid] = nextValue;
        if (isNew){ renderItemModal(); return; }
        item.updatedAt = Date.now(); scheduleSave(); render(); renderItemModal();
      });
    });
    modal.querySelector("#itemDescInput").addEventListener("change", e=>{
      item.description = e.target.value;
      if (isNew) return;
      item.updatedAt = Date.now(); scheduleSave(); render();
    });
    wireAttachmentControls(modal,item,{prefix:"item",isNew});
    modal.querySelectorAll(".itemDetailTab").forEach(tab=>{
      tab.onclick=()=>{
        const target=tab.dataset.itemTab;
        modal.querySelectorAll(".itemDetailTab").forEach(button=>{
          const active=button===tab;
          button.classList.toggle("active",active);
          button.setAttribute("aria-selected",String(active));
        });
        modal.querySelectorAll(".itemDetailPanel").forEach(panel=>{
          const active=panel.dataset.itemPanel===target;
          panel.classList.toggle("active",active);
          panel.hidden=!active;
        });
      };
    });
    modal.querySelectorAll('#itemTagChips [data-tagfilter]').forEach(chip=>{
      chip.onclick = () => {
        const tid = chip.dataset.tagfilter;
        if (item.tagIds.includes(tid)) item.tagIds = item.tagIds.filter(id=>id!==tid);
        else item.tagIds.push(tid);
        item.updatedAt = Date.now(); scheduleSave(); render(); renderItemModal();
      };
    });
    modal.querySelector('[data-action="newTagFromItem"]').onclick = async () => {
      const result = await showDialog({title:"New tag", fields:[
        {label:"Tag name", placeholder:"e.g. urgent"},
        {label:"Pill color", type:"tagColor", value:TAG_COLOR_OPTIONS[project.tags.length % TAG_COLOR_OPTIONS.length].value}
      ], confirmLabel:"Create tag"});
      if (result && result[0] && result[0].trim()){
        const t = createTag(project, result[0].trim(), result[1]);
        item.tagIds.push(t.id);
        scheduleSave(); renderSidebarTags(); render(); renderItemModal();
      }
    };
    modal.querySelector('[data-action="addSub"]').onclick = async () => {
      const title = await showDialog({title:"New subitem", fields:[{label:"Subitem", placeholder:"Break this item into a step"}], confirmLabel:"Add subitem"});
      if (title && title.trim()){
        item.subitems.push({id:uid(), title:title.trim(), done:false});
        item.updatedAt = Date.now(); scheduleSave(); render(); renderItemModal();
      }
    };
    modal.querySelectorAll(".subitemRow").forEach(row=>{
      const sid = row.dataset.sid;
      const sub = item.subitems.find(s=>s.id===sid);
      row.querySelector('[data-action="toggleSub"]').addEventListener("change", e=>{
        sub.done = e.target.checked;
        item.updatedAt = Date.now(); scheduleSave(); render(); renderItemModal();
      });
      row.querySelector('[data-action="editSub"]').addEventListener("blur", e=>{
        sub.title = e.target.textContent.trim() || sub.title;
        item.updatedAt = Date.now(); scheduleSave(); render();
      });
      row.querySelector('[data-action="delSub"]').onclick = () => {
        item.subitems = item.subitems.filter(s=>s.id!==sid);
        item.updatedAt = Date.now(); scheduleSave(); render(); renderItemModal();
      };
    });
    if (!isNew){
      modal.querySelector('[data-action="duplicateItem"]').onclick = () => {
        const copy = duplicateItem(projectId, groupId, itemId);
        if (!copy) return;
        closeItemModal();
        openItemModal(projectId, groupId, copy.id);
      };
      const commentInput = modal.querySelector("#newCommentInput");
      const addCommentBtn = modal.querySelector('[data-action="addComment"]');
      if (addCommentBtn){
        const submitComment = () => {
          if (commentInput.value.trim()){
            addComment(projectId, groupId, itemId, commentInput.value);
            renderItemModal();
          }
        };
        addCommentBtn.onclick = submitComment;
        commentInput.addEventListener("keydown", e=>{ if (e.key==="Enter"){ e.preventDefault(); submitComment(); } });
      }
      modal.querySelectorAll('[data-action="delComment"]').forEach(btn=>{
        btn.onclick = () => { deleteComment(projectId, groupId, itemId, btn.dataset.cid); renderItemModal(); };
      });
      modal.querySelectorAll(".itemDetailTab").forEach(tab=>{
        tab.onclick = () => {
          const target = tab.dataset.itemTab;
          modal.querySelectorAll(".itemDetailTab").forEach(btn=>{
            const active = btn===tab;
            btn.classList.toggle("active", active);
            btn.setAttribute("aria-selected", String(active));
          });
          modal.querySelectorAll(".itemDetailPanel").forEach(panel=>{
            panel.classList.toggle("active", panel.dataset.itemPanel===target);
            panel.hidden = panel.dataset.itemPanel!==target;
          });
        };
      });
      const archiveBtn = modal.querySelector('[data-action="toggleArchive"]');
      if (archiveBtn) archiveBtn.onclick = () => { toggleArchiveItem(projectId, groupId, itemId); renderItemModal(); };
      const completeBtn = modal.querySelector('[data-action="completeItem"]');
      if (completeBtn) completeBtn.onclick = () => {
        const wasCompleted = isItemCompleted(item);
        item.completedAt = wasCompleted ? null : Date.now();
        item.updatedAt = Date.now();
        recordItemActivity(item, wasCompleted ? "reopened" : "completed");
        scheduleSave();
        render();
        renderItemModal();
      };
    }
    if (isNew){
      modal.querySelector('[data-action="saveItem"]').onclick = () => {
        const title = modal.querySelector("#itemTitleInput").value.trim();
        const targetProject = getProject(openItemRef.projectId);
        const targetGroup = getGroup(openItemRef.projectId, openItemRef.groupId) || targetProject.groups[0];
        if (!title || !targetProject || !targetGroup) return;
        item.title = title;
        item.updatedAt = Date.now();
        recordItemActivity(item, "created");
        targetGroup.items.push(item);
        scheduleSave();
        closeItemModal();
        renderAll();
      };
    } else {
      modal.querySelector('[data-action="deleteItem"]').onclick = async () => {
        if (await showConfirm(`Delete ${item.title}`, "This item and its subitems will be deleted.", true)){
          deleteItem(projectId, groupId, itemId);
          closeItemModal();
        }
      };
    }
  }

  /* ---------- Mobile sidebar ---------- */
  function toggleSidebar(){
    document.getElementById("sidebar").classList.toggle("open");
    document.getElementById("sidebarScrim").classList.toggle("show");
  }
  function closeSidebarOnMobile(){
    document.getElementById("sidebar").classList.remove("open");
    document.getElementById("sidebarScrim").classList.remove("show");
  }

  /* ---------- Wiring ---------- */
  function wireConnectGate(){
    const runFromGate = async action => {
      hideConnectGate();
      await action();
      if (!fileHandle) showConnectGate();
    };
    document.getElementById("gateNewBtn").onclick = () => runFromGate(createNewWorkspaceFolder);
    document.getElementById("gateOpenBtn").onclick = () => runFromGate(openExistingWorkspaceFolder);
    document.getElementById("gateLegacyFileBtn").onclick = () => runFromGate(openExistingFile);
    document.getElementById("gateReconnectBtn").onclick = reconnectPendingFile;
    document.getElementById("gateLegacyBtn").onclick = migrateLegacyBrowserData;
  }
  function wireStaticControls(){
    const projectCreateMenu = document.getElementById("projectCreateMenu");
    const projectCreateBtn = document.getElementById("projectCreateBtn");
    const workspaceSwitcherBtn = document.getElementById("workspaceSwitcherBtn");
    const workspaceSwitcherMenu = document.getElementById("workspaceSwitcherMenu");
    const closeWorkspaceSwitcher = () => {
      workspaceSwitcherMenu.classList.remove("open");
      workspaceSwitcherBtn.setAttribute("aria-expanded", "false");
    };
    const closeProjectCreateMenu = () => {
      projectCreateMenu.classList.remove("open");
      projectCreateBtn.classList.remove("active");
      projectCreateBtn.setAttribute("aria-expanded", "false");
    };
    const goToOverview = () => {
      activeProjectId = OVERVIEW; persistActiveLocation(); renderAll(); closeSidebarOnMobile();
    };
    document.getElementById("overviewNav").onclick = goToOverview;
    document.getElementById("brandHomeBtn").onclick = goToOverview;
    document.getElementById("calendarNav").onclick = () => {
      activeProjectId = CALENDAR; persistActiveLocation(); renderAll(); closeSidebarOnMobile();
    };
    document.getElementById("roadmapNav").onclick = () => selectProject(ROADMAP);
    document.getElementById("integrationsNav").onclick = () => {
      navigateToIntegrations();
    };
    document.getElementById("settingsNav").onclick = navigateToSettings;
    document.getElementById("supportNav").onclick = navigateToSupport;
    document.getElementById("feedbackNav").onclick = () => window.open(FEEDBACK_URL, "_blank", "noopener,noreferrer");
    workspaceSwitcherBtn.onclick = event => {
      event.stopPropagation();
      const open = workspaceSwitcherMenu.classList.toggle("open");
      workspaceSwitcherBtn.setAttribute("aria-expanded", String(open));
    };
    document.getElementById("workspaceSwitchBtn").onclick = async () => {
      closeWorkspaceSwitcher();
      await switchFile();
    };
    document.getElementById("workspaceNewBtn").onclick = async () => {
      closeWorkspaceSwitcher();
      await startNewFileFromMenu();
    };
    document.getElementById("projectMenuBtn").onclick = event => {
      event.stopPropagation();
      const menu = document.getElementById("projectMenu");
      const open = menu.classList.toggle("open");
      event.currentTarget.classList.toggle("active", open);
    };
    document.getElementById("projectMenu").addEventListener("click", event=>{
      if (event.target.closest("button")){
        document.getElementById("projectMenu").classList.remove("open");
        document.getElementById("projectMenuBtn").classList.remove("active");
      }
    });
    projectCreateBtn.onclick = event => {
      event.stopPropagation();
      const open = projectCreateMenu.classList.toggle("open");
      projectCreateBtn.classList.toggle("active", open);
      projectCreateBtn.setAttribute("aria-expanded", String(open));
    };
    projectCreateMenu.addEventListener("click", event=>{
      if (event.target.closest("button")) closeProjectCreateMenu();
    });
    document.addEventListener("click", event=>{
      if (!event.target.closest("#projectMenuWrap")){
        document.getElementById("projectMenu").classList.remove("open");
        document.getElementById("projectMenuBtn").classList.remove("active");
      }
      const filterPanel = document.getElementById("filterPanel");
      if (filterPanel.classList.contains("open") && !event.target.closest("#filterPanel") && !event.target.closest("#toggleFilters")){
        filterPanel.classList.remove("open");
        document.getElementById("toggleFilters").classList.remove("active");
      }
      if (!event.target.closest(".projectCreateWrap")) closeProjectCreateMenu();
      if (!event.target.closest(".workspaceSwitcher")) closeWorkspaceSwitcher();
      const quickMenuWrap = event.target.closest(".projectQuickMenuWrap, .folderQuickMenuWrap");
      document.querySelectorAll(".projectQuickMenu.open, .folderQuickMenu.open").forEach(menu=>{
        if (!quickMenuWrap || !quickMenuWrap.contains(menu)) menu.classList.remove("open");
      });
      if (!event.target.closest(".fieldColumnHeader")){
        document.querySelectorAll(".fieldColumnMenu.open").forEach(menu=>menu.classList.remove("open"));
      }
    });
    document.getElementById("addProjectBtn").onclick = async () => {
      const templateOptions = Object.entries(PROJECT_TEMPLATES).map(([value,tpl])=>({value,label:tpl.label}));
      const result = await showDialog({title:"New project", fields:[
        {label:"Project name", placeholder:"e.g. Marketing launch"},
        {label:"Description", type:"textarea", placeholder:"What is this project about?"},
        {label:"Template", type:"select", options:templateOptions, value:"taskboard"}
      ], confirmLabel:"Create project"});
      if (!result) return;
      const [name, description, templateKey] = result;
      if (name && name.trim()) await addProject(name.trim(), templateKey, description.trim()||null);
    };
    document.getElementById("importProjectBtn").onclick = () => openCsvImportDialog("new");
    document.getElementById("importProjectCsvBtn").onclick = () => openCsvImportDialog("existing",activeProjectId);
    document.getElementById("addFolderBtn").onclick = createFolder;
    document.getElementById("manageTagsBtn").onclick = async () => {
      const project = getProject(activeProjectId);
      if (!project) return;
      if (!project.tags.length){ await showNotice("No tags", "Create a tag from an item before managing tags."); return; }
      const result = await showDialog({title:`Manage tags in ${project.name}`, fields:[
        {label:"Action", type:"select", value:"edit", options:[{value:"edit",label:"Edit tag"},{value:"delete",label:"Delete tag"}]},
        {label:"Tag", type:"select", options:project.tags.map(tag=>({value:tag.id,label:tag.name}))}
      ], confirmLabel:"Continue"});
      if (!result) return;
      const [action,tagId] = result;
      const tag = project.tags.find(candidate=>candidate.id===tagId);
      if (!tag) return;
      if (action === "edit"){
        const changes = await showDialog({title:`Edit tag ${tag.name}`, fields:[
          {label:"Tag name", value:tag.name},
          {label:"Pill color", type:"tagColor", value:tag.color}
        ], confirmLabel:"Save changes"});
        if (!changes) return;
        const [name,color] = changes;
        if (!name.trim()){ await showNotice("Tag name required", "Enter a name for this tag."); return; }
        tag.name = name.trim();
        tag.color = color;
        scheduleSave(); renderAll();
      } else if (await showConfirm(`Delete tag ${tag.name}`, "This removes the tag from all items in this project.", true)){
        deleteTag(project, tag.id);
      }
    };
    const globalSearch = document.getElementById("globalSearch");
    globalSearch.addEventListener("focus",()=>{
      if (suppressGlobalSearchFocus){ suppressGlobalSearchFocus=false; return; }
      commandPalette.open(globalSearch.value);
    });
    globalSearch.addEventListener("click",()=>commandPalette.open(globalSearch.value));
    globalSearch.addEventListener("keydown",event=>{
      if (event.key==="/"){
        event.preventDefault();
        commandPalette.open(globalSearch.value);
      }
    });
    document.getElementById("boardSearch").addEventListener("input", e=>{
      boardFilterText = e.target.value.trim(); render();
    });
    document.getElementById("clearBoardFilters").onclick = () => {
      boardFilterText=""; boardFilterGroups.clear(); boardFilterTags.clear(); boardFilterFields.clear();
      render();
    };
    document.getElementById("showArchivedToggle").addEventListener("change", e=>{
      showArchived = e.target.checked;
      render();
    });
    document.getElementById("printViewBtn").onclick = () => {
      document.getElementById("projectMenu").classList.remove("open");
      document.getElementById("projectMenuBtn").classList.remove("active");
      window.print();
    };
    document.getElementById("toggleFilters").onclick = () => {
      const panel = document.getElementById("filterPanel");
      const button = document.getElementById("toggleFilters");
      const isOpen = panel.classList.toggle("open");
      button.classList.toggle("active", isOpen);
    };
    document.getElementById("closeFilters").onclick = () => {
      document.getElementById("filterPanel").classList.remove("open");
      document.getElementById("toggleFilters").classList.remove("active");
    };
    document.querySelectorAll("[data-filter-category]").forEach(button=>{
      button.onclick = () => {
        document.querySelectorAll("[data-filter-category]").forEach(item=>item.classList.toggle("active", item===button));
        document.querySelectorAll("#filterOptions > div").forEach(section=>section.classList.toggle("active", section.id===button.dataset.filterCategory));
      };
    });
    document.getElementById("filterPanelDone").onclick = document.getElementById("closeFilters").onclick;
    document.getElementById("filterPanelClear").onclick = () => {
      boardFilterText=""; boardFilterGroups.clear(); boardFilterTags.clear(); boardFilterFields.clear();
      render();
    };
    document.getElementById("sidebarToggle").onclick = toggleSidebar;
    document.getElementById("sidebarScrim").onclick = closeSidebarOnMobile;
    document.getElementById("sidebarCollapseHandle").onclick = window.BeforeworkAppearance.toggleSidebarCollapsed;
    document.getElementById("undoBtn").onclick = undoLastChange;
    document.getElementById("fileImportInput").addEventListener("change", e=>{
      if (e.target.files[0]) importJSON(e.target.files[0]);
      e.target.value = "";
    });
    document.addEventListener("keydown", e=>{
      if (e.key==="Escape"){
        const overlays = document.querySelectorAll(".overlay");
        if (overlays.length){
          const top = overlays[overlays.length-1];
          if (top.id==="dialogOverlay") dialogs.dismissActive();
          else {
            if (top.id==="itemOverlay") openItemRef = null;
            top.remove();
          }
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==="z"){
        e.preventDefault(); undoLastChange(); return;
      }
      const active = document.activeElement;
      const tag = (active && active.tagName) || "";
      const editable = tag==="INPUT" || tag==="TEXTAREA" || (active && active.isContentEditable);
      if (e.key==="/" && !editable){
        e.preventDefault();
        document.getElementById("globalSearch").focus();
        return;
      }
      if (editable) return;
      if (e.key==="n"){ e.preventDefault(); quickAddViaShortcut(); return; }
      if (e.key==="d"){ e.preventDefault(); window.BeforeworkAppearance.toggleTheme(); return; }
      if (e.key==="["){ e.preventDefault(); window.BeforeworkAppearance.toggleSidebarCollapsed(); return; }
      if (e.key==="t"){ e.preventDefault(); toggleFocusTimer(); return; }
      if (e.key==="?"){ e.preventDefault(); showShortcutsModal(); return; }
    });
  }

  /* ---------- Boot ----------
     There is no in-memory-only or browser-storage-only mode: the connected
     file is the single source of truth. Boot either silently resumes the
     last-connected file, or shows the connect gate and waits - it never
     falls back to a default or previously-legacy-saved workspace on its
     own, since that would let the app "work" without ever settling on one
     file. Auth (if a provider is available) is initialized independently
     and never blocks or gates this flow. */
  async function boot({loadViewModules}){
    window.BeforeworkAppearance.initTheme();
    window.BeforeworkAppearance.initSidebarCollapse();
    wireStaticControls();
    wireConnectGate();
    enhanceSelectControls();
    enhanceDateInputs();
    new MutationObserver(mutations=>mutations.forEach(mutation=>mutation.addedNodes.forEach(node=>{
      if (node.nodeType===Node.ELEMENT_NODE){
        enhanceSelectControls(node);
        enhanceDateInputs(node);
      }
    }))).observe(document.body,{childList:true,subtree:true});
    window.addEventListener("resize",repositionFloatingSelectMenus);
    document.addEventListener("scroll",repositionFloatingSelectMenus,true);
    document.addEventListener("click",event=>{
      if (event.target.closest(".appSelectWrap,.dialogSelectWrap,.appSelectMenu,.dialogSelectMenu,.datePickerWrap,.datePickerPopover")) return;
      document.querySelectorAll(".appSelectMenu:not([hidden]),.dialogSelectMenu:not([hidden]),.datePickerPopover:not([hidden])").forEach(menu=>{
        if (menu.matches(".appSelectMenu,.dialogSelectMenu")) closeFloatingSelectMenu(menu);
        else {
          menu.hidden=true;
          menu.previousElementSibling?.setAttribute("aria-expanded","false");
        }
      });
    });
    reminderService.start();
    if (NETLIFY_IDENTITY_ENABLED){
      try{
        await loadNetlifyIdentity();
        await initAuth();
      }catch(err){ /* Identity is optional; the workspace runs without it. */ }
    }
    try{
      const [settingsModule,overviewDetailsViewModule,overviewDetailsModelModule,milestonesViewModule,roadmapViewModule,overviewViewModule,listViewModule,tableViewModule,boardViewModule,calendarViewModule] = await loadViewModules();
      settingsView = createSettingsView(settingsModule.SettingsView);
      overviewDetailsView = new overviewDetailsViewModule.OverviewDetailsView({
        model:new overviewDetailsModelModule.OverviewDetailsModel(),
        cloneTemplate:async()=>{
          await window.BeforeworkViewTemplates.load("overviewDetails");
          return window.BeforeworkViewTemplates.clone("overviewDetails");
        }
      });
      milestonesView = new milestonesViewModule.MilestonesView({
        cloneTemplate:()=>window.BeforeworkViewTemplates.clone("milestones")
      });
      roadmapView = new roadmapViewModule.RoadmapView();
      listView = new listViewModule.ListView({
        itemMatchesFilter,
        wireTableColumnReordering,
        openNewItemModal,
        exportProjectCsv,
        selectedItemIds,
        isItemCompleted,
        rowsForSelection,
        bulkSetCompleted,
        bulkMove,
        bulkDuplicate,
        bulkTag,
        bulkDelete,
        getListSort:()=>listSort,
        setListSort:value=>{ listSort=value; },
        wireGroupColumnHeader,
        wireCustomColumnHeader,
        render,
        sortProjectRows,
        tagById,
        tagPillHtml,
        fieldCellHtml,
        formatUpdatedAt,
        openItemModal,
        applyTableColumnOrder,
        cloneTemplate:()=>window.BeforeworkViewTemplates.clone("listView")
      });
      tableView = new tableViewModule.TableView({
        wireTableColumnReordering,
        openNewItemModal,
        exportProjectCsv,
        selectedItemIds,
        isItemCompleted,
        rowsForSelection,
        bulkSetCompleted,
        bulkMove,
        bulkDuplicate,
        bulkTag,
        bulkDelete,
        getListSort:()=>listSort,
        setListSort:value=>{ listSort=value; },
        wireGroupColumnHeader,
        wireCustomColumnHeader,
        render,
        sortProjectRows,
        tagById,
        tagPillHtml,
        priorityOptions:PRIORITY_OPTIONS,
        getItem,
        scheduleSave,
        renderProjectList,
        applyTableColumnOrder,
        cloneTemplate:()=>window.BeforeworkViewTemplates.clone("tableView")
      });
      boardView = new boardViewModule.BoardView({
        itemMatchesFilter,
        scheduleSave,
        renderProjectList,
        editGroupName,
        confirmDeleteGroup,
        openNewItemModal,
        moveItem,
        priorityField,
        dateFields,
        fieldsWithStartBeforeDue,
        fieldChipHtml,
        tagById,
        tagPillHtml,
        openItemModal,
        cloneTemplate:()=>window.BeforeworkViewTemplates.clone("boardView")
      });
      calendarView = new calendarViewModule.CalendarView({
        calendarEntries,
        getCalendarCursor:()=>calendarCursor,
        setCalendarCursor:value=>{ calendarCursor=value; },
        getState:()=>state,
        todayStr,
        calendarDateKey,
        itemMatchesFilter,
        isItemCompleted,
        formatTimeValue,
        googleCalendarUrl,
        updateGoogleCalendarButtons,
        updateGoogleCalendarStatus,
        render,
        openNewCalendarItemModal,
        exportCalendarIcs,
        navigateToIntegrations,
        connectGoogleCalendar,
        getItem,
        scheduleSave,
        uid,
        toggleCalendarTaskCompletion,
        openItemModal,
        openStandaloneCalendarItemModal,
        cloneTemplate:()=>window.BeforeworkViewTemplates.clone("calendar")
      });
      overviewView = new overviewViewModule.OverviewView({
        getState:()=>state,
        model:{
          allItemsFlat,
          isItemCompleted,
          dueDateField,
          priorityField,
          todayStr,
          projectRecords,
          formatUpdatedAt,
          priorityColor:value=>PRIORITY_OPTIONS.find(option=>option.id===value)?.color
        },
        actions:{
          scheduleSave,
          selectProject,
          openItemModal,
          openStandaloneCalendarItemModal,
          showNotice,
          openNewCalendarItemModal,
          showDialog,
          ensureProjectLoaded,
          addItem,
          navigateCalendar(){
            activeProjectId=CALENDAR;
            persistActiveLocation();
            renderAll();
          }
        },
        overviewDetailsView,
        cloneTemplate:()=>window.BeforeworkViewTemplates.clone("overview")
      });
      await window.BeforeworkViewTemplates.loadAll();
    }catch(err){
      showNotice("Couldn't load views", err.message);
      return;
    }
    try{ await focusTimer.init(); }
    catch(err){
      showNotice("Couldn't load focus timer", err.message);
      return;
    }
    const reconnected = await tryReconnectFile();
    try{ await window.BeforeworkStorage.refreshRecoverySnapshots(); }
    catch(err){ setSyncStatus("Recovery snapshots are unavailable in this browser: " + err.message); }
    if (reconnected){
      restoreActiveLocation();
      if (state.folderLazy && ![OVERVIEW,CALENDAR,ROADMAP,INTEGRATIONS,SETTINGS,SUPPORT].includes(activeProjectId)){
        try{ await ensureProjectLoaded(activeProjectId); }
        catch(err){ activeProjectId=OVERVIEW; setSyncStatus("Couldn't restore the last project: " + err.message); }
      }
      renderAll();
      resumeGoogleCalendarSync();
      await maybeShowMigrationNotice();
    } else {
      showConnectGate();
    }
  }
  window.BeforeworkApp = {
    start(dependencies){
      if (!dependencies || typeof dependencies.loadViewModules !== "function"){
        throw new TypeError("Application startup requires a view-module loader.");
      }
      return boot(dependencies);
    }
  };
