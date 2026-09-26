  "use strict";

  /* ---------- Constants ---------- */
  const uid = () => crypto.randomUUID();
  // Primer's own semantic fg tokens, not hand-picked hex - these track
  // light/dark theme automatically instead of needing a second palette.
  const TAG_COLORS = [
    "var(--color-accent-fg)","var(--color-severe-fg)","var(--color-sponsors-fg)","var(--color-open-fg)",
    "var(--color-danger-fg)","var(--color-attention-fg)","var(--color-success-fg)","var(--color-fg-muted)"
  ];
  const OVERVIEW = "__overview__";
  const CALENDAR = "__calendar__";
  const INTEGRATIONS = "__integrations__";
  const SETTINGS = "__settings__";
  const PRIORITY_OPTIONS = [
    {id:"high",label:"High",color:"var(--color-danger-fg)",rank:3},
    {id:"medium",label:"Medium",color:"var(--color-attention-fg)",rank:2},
    {id:"low",label:"Low",color:"var(--color-fg-muted)",rank:1},
  ];
  const FIELD_TYPES = ["priority","select","date","text"];
  const THEME_KEY = "personal_dashboard_theme_v1";
  const TIME_FORMAT_KEY = "personal_dashboard_time_format_v1";
  const SIDEBAR_KEY = "personal_dashboard_sidebar_collapsed_v1";
  const LOCATION_KEY = "personal_dashboard_location_v1";
  const GOOGLE_CLIENT_ID = "1082047072334-rovrplv89dp521ue1qra4dl3v8jqe1qu.apps.googleusercontent.com";
  const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly";

  let state = null;                 // { projects:[] }
  let showArchived = false;
  let focusInterval = null;
  let focusSeconds = 25*60;
  let focusTotal = 25*60;
  let activeProjectId = OVERVIEW;
  // View type is per-project now (project.views + project.activeViewId), not global.
  const VIEW_DEFS = [
    {type:"list", label:"List"},
    {type:"table", label:"Table"},
    {type:"kanban", label:"Board"},
    {type:"calendar", label:"Calendar"},
  ];
  function viewLabel(type){ return (VIEW_DEFS.find(v=>v.type===type)||{}).label || type; }
  const PROJECT_TEMPLATES = {
    simple:   {label:"Simple list",               views:["list"],               fields:[],               groups:["Items"]},
    table:    {label:"Table (spreadsheet-style)",  views:["table"],              fields:[],               groups:["Rows"]},
    taskboard:{label:"Project / task management",  views:["list","kanban","calendar"], fields:["priority","due"], groups:["To do","Doing","Done"]},
    calendarTpl:{label:"Calendar / events",        views:["calendar","list"],    fields:["due"],          groups:["Items"], itemDefaultType:"event"},
    blank:    {label:"Blank",                      views:["list"],              fields:[],               groups:["Items"]},
  };
  function buildFieldsForTemplate(keys){
    return (keys||[]).map(k=>{
      if (k==="priority") return {id:uid(), label:"Priority", type:"priority", options:[]};
      if (k==="due") return {id:uid(), label:"Due date", type:"date", options:[]};
      return null;
    }).filter(Boolean);
  }
  let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let boardFilterText = "";
  let boardFilterTags = new Set();
  let boardFilterFields = new Map(); // fieldId -> "__all__" | "__none__" | optionId
  let listSort = {field:"updated", dir:"desc"};
  let openItemRef = null;
  let fileHandle = null;
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

  /* ---------- Theme ---------- */
  function applyTheme(theme){
    document.documentElement.setAttribute("data-theme", theme);
    // Primer's own color tokens switch off this attribute (set alongside
    // data-light-theme/data-dark-theme on <html> - see the head).
    document.documentElement.setAttribute("data-color-mode", theme==="dark" ? "dark" : "light");
    const btn = document.getElementById("themeToggle");
    if (btn) btn.textContent = theme==="dark" ? "☀️" : "🌙";
    try{ localStorage.setItem(THEME_KEY, theme); }catch(err){/* ignore */}
  }
  function toggleTheme(){
    const current = document.documentElement.getAttribute("data-theme")==="dark" ? "dark" : "light";
    applyTheme(current==="dark" ? "light" : "dark");
  }
  function initTheme(){
    let saved = null;
    try{ saved = localStorage.getItem(THEME_KEY); }catch(err){/* ignore */}
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(saved || (prefersDark ? "dark" : "light"));
  }

  function getTimeFormat(){
    try{ return localStorage.getItem(TIME_FORMAT_KEY)==="24" ? "24" : "12"; }catch(err){ return "12"; }
  }
  function formatTime(date){
    return date.toLocaleTimeString(undefined, {hour:"numeric", minute:"2-digit", hour12:getTimeFormat()==="12"});
  }
  function formatDateTime(timestamp){
    const date = new Date(timestamp);
    return date.toLocaleString(undefined, {dateStyle:"medium", timeStyle:"short", hour12:getTimeFormat()==="12"});
  }

  /* ---------- Sidebar collapse (desktop) ---------- */
  function applySidebarCollapsed(collapsed){
    const sidebar = document.getElementById("sidebar");
    const handle = document.getElementById("sidebarCollapseHandle");
    sidebar.classList.toggle("collapsed", collapsed);
    handle.textContent = collapsed ? "›" : "‹";
    handle.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
    handle.setAttribute("aria-label", handle.title);
    try{ localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0"); }catch(err){/* ignore */}
  }
  function toggleSidebarCollapsed(){
    const sidebar = document.getElementById("sidebar");
    applySidebarCollapsed(!sidebar.classList.contains("collapsed"));
  }
  function initSidebarCollapse(){
    let saved = null;
    try{ saved = localStorage.getItem(SIDEBAR_KEY); }catch(err){/* ignore */}
    applySidebarCollapsed(saved === "1");
  }

  /* ---------- Auth (optional, pluggable) ----------
     Authentication is entirely additive here: if no provider is available
     (script blocked, feature not enabled on this deployment, offline, or a
     future provider isn't configured), #authBar just stays hidden and the
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
  const AUTH_PROVIDERS = {};
  const AUTH_PROVIDER_ORDER = ["netlify"]; // try in this order; add new provider names here
  let activeAuthProvider = null;
  let currentAuthUser = null;

  function registerAuthProvider(name, provider){ AUTH_PROVIDERS[name] = provider; }

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
      netlifyIdentity.init();
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
    const bar = document.getElementById("authBar");
    if (bar){ bar.style.display = "none"; bar.innerHTML = ""; }
  }
  function renderAuthUI(){
    const bar = document.getElementById("authBar");
    if (!bar || !activeAuthProvider) return;
    bar.style.display = "flex";
    if (currentAuthUser){
      bar.innerHTML = `<span class="authUser" title="${escapeHtml(activeAuthProvider.label(currentAuthUser))}">${escapeHtml(activeAuthProvider.label(currentAuthUser))}</span><button class="btn btn-sm btn-invisible" id="authLogoutBtn">Log out</button>`;
      document.getElementById("authLogoutBtn").onclick = () => activeAuthProvider.logout();
    } else {
      bar.innerHTML = `<button class="btn btn-sm btn-invisible" id="authLoginBtn">Log in</button>`;
      document.getElementById("authLoginBtn").onclick = () => activeAuthProvider.login();
    }
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
    // No provider available: #authBar stays hidden (its default state),
    // and the rest of the app is completely unaffected.
  }

  /* ---------- Focus timer ---------- */
  function renderFocusTimer(){
    const disp = document.getElementById("focusTimerDisplay");
    if (!disp) return;
    const m = Math.floor(focusSeconds/60), s = focusSeconds%60;
    disp.textContent = `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
    document.title = focusInterval ? `${disp.textContent} · Beforework` : "Beforework";
  }
  function startFocusTimer(){
    if (focusInterval || focusSeconds<=0) return;
    focusInterval = setInterval(()=>{
      focusSeconds = Math.max(0, focusSeconds-1);
      renderFocusTimer();
      if (focusSeconds<=0){
        clearInterval(focusInterval); focusInterval=null;
        const startBtn = document.getElementById("focusStartBtn");
        if (startBtn) startBtn.textContent = "Start";
        showNotice("Time's up", "The focus timer has finished. Take a short break or start another session.");
      }
    }, 1000);
    const startBtn = document.getElementById("focusStartBtn");
    if (startBtn) startBtn.textContent = "Pause";
  }
  function pauseFocusTimer(){
    if (focusInterval){ clearInterval(focusInterval); focusInterval=null; }
    const startBtn = document.getElementById("focusStartBtn");
    if (startBtn) startBtn.textContent = "Start";
    renderFocusTimer();
  }
  function resetFocusTimer(){
    pauseFocusTimer();
    focusSeconds = focusTotal;
    renderFocusTimer();
  }

  /* ---------- Keyboard shortcuts modal ---------- */
  function showShortcutsModal(){
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    const rows = [
      ["/", "Focus the global search"],
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

  function defaultState(){
    const pr = {id:uid(), label:"Priority", type:"priority", options:[]};
    const due = {id:uid(), label:"Due date", type:"date", options:[]};
    const t1 = {id:uid(), name:"feature", color:TAG_COLORS[0]};
    const t2 = {id:uid(), name:"urgent", color:TAG_COLORS[1]};
    const proj1Views = [
      {id:uid(), type:"list", name:"List"},
      {id:uid(), type:"kanban", name:"Board"},
      {id:uid(), type:"calendar", name:"Calendar"},
    ];
    const proj1 = {
      id:uid(), name:"Product roadmap", createdAt:Date.now(),
      tags:[t1,t2], fields:[pr,due], views:proj1Views, activeViewId:proj1Views[0].id, itemDefaultType:"task",
      groups:[
        {id:uid(), name:"To do", items:[
          {id:uid(), title:"This is a card - click to open it",
           description:"Add notes here. Search everything from the sidebar, drag cards between groups, switch between List and Board, and add columns that fit this project from the Columns button above.",
           calendarType:"task", startTime:"", endTime:"", location:"", endDate:"",
           tagIds:[t1.id], values:{[pr.id]:"medium",[due.id]:todayStr(2)},
           subitems:[{id:uid(),title:"Try checking this off",done:false}], comments:[], archived:false,
           createdAt:Date.now(), updatedAt:Date.now()},
        ]},
        {id:uid(), name:"Doing", items:[]},
        {id:uid(), name:"Done", items:[]}
      ]
    };
    const status = {id:uid(), label:"Status", type:"select", options:[
      {id:uid(), label:"To read", color:TAG_COLORS[2]},
      {id:uid(), label:"Reading", color:TAG_COLORS[3]},
      {id:uid(), label:"Finished", color:TAG_COLORS[6]},
    ]};
    const proj2Views = [
      {id:uid(), type:"table", name:"Table"},
      {id:uid(), type:"list", name:"List"},
    ];
    const proj2 = {
      id:uid(), name:"Reading list", createdAt:Date.now(),
      tags:[], fields:[status], views:proj2Views, activeViewId:proj2Views[0].id, itemDefaultType:"task",
      groups:[{id:uid(), name:"Books", items:[]}]
    };
    return {schemaVersion:SCHEMA_VERSION, projects:[proj1, proj2], folders:[], calendarItems:[], googleDeletedEventIds:[], googleCalendarLinks:[], googleCalendarCatalog:[], googleLastSyncAt:0};
  }

  /* ---------- Schema migrations ----------
     Every saved file carries a schemaVersion. On load we walk it forward
     one step at a time through MIGRATIONS until it reaches SCHEMA_VERSION.
     Each step assumes its input is exactly the previous version's shape -
     rules:
       1. Never delete a property here. If a field is retired, just stop
          reading it in the app; leave it sitting in the JSON so an
          incorrect migration can still be recovered from.
       2. Keep steps small and defensive (Array.isArray / ?? guards) so a
          hand-edited or partially-corrupt import doesn't throw.
       3. Once shipped, a step's body doesn't change - add a new step
          instead of editing an old one. */
  const MIGRATIONS = {
    // v0 (unversioned / legacy) -> v1: global tags + fixed priority/dueDate
    // become per-project tags and a per-project fields array.
    1: s => {
      const globalTags = s.tags || [];
      s.projects.forEach(p=>{
        if (!Array.isArray(p.tags)) p.tags = globalTags.map(t=>({id:t.id, name:t.name, color:t.color}));
        if (!Array.isArray(p.fields)){
          const pr = {id:uid(), label:"Priority", type:"priority", options:[]};
          const due = {id:uid(), label:"Due date", type:"date", options:[]};
          p.fields = [pr, due];
          p.groups.forEach(g=>g.items.forEach(it=>{
            it.values = it.values || {};
            if (it.priority) it.values[pr.id] = it.priority;
            if (it.dueDate) it.values[due.id] = it.dueDate;
            delete it.priority; delete it.dueDate;
          }));
        }
      });
      delete s.tags;
      return s;
    },
    // v1 -> v2: subitems, tag links and calendar scheduling fields on items.
    2: s => {
      s.projects.forEach(p=>p.groups.forEach(g=>g.items.forEach(it=>{
        it.values = it.values || {};
        it.subitems = Array.isArray(it.subitems) ? it.subitems : [];
        it.tagIds = Array.isArray(it.tagIds) ? it.tagIds : [];
        it.calendarType = it.calendarType === "event" ? "event" : "task";
        it.startTime = it.startTime || "";
        it.endTime = it.endTime || "";
        it.location = it.location || "";
        it.endDate = it.endDate || "";
      })));
      return s;
    },
    // v2 -> v3: comment threads and archiving.
    3: s => {
      s.projects.forEach(p=>p.groups.forEach(g=>g.items.forEach(it=>{
        it.comments = Array.isArray(it.comments) ? it.comments : [];
        it.archived = !!it.archived;
      })));
      return s;
    },
    // v3 -> v4: projects gain their own set of views (list/table/kanban/
    // calendar tabs) instead of one global List/Board/Calendar toggle that
    // applied to every project. Existing projects keep the full set they
    // already behaved like, so nothing they had access to disappears.
    4: s => {
      s.projects.forEach(p=>{
        if (!Array.isArray(p.views) || !p.views.length){
          p.views = [
            {id:uid(), type:"list", name:"List"},
            {id:uid(), type:"kanban", name:"Board"},
            {id:uid(), type:"calendar", name:"Calendar"},
          ];
        }
        if (!p.activeViewId || !p.views.some(v=>v.id===p.activeViewId)) p.activeViewId = p.views[0].id;
        if (p.itemDefaultType !== "event") p.itemDefaultType = "task";
      });
      return s;
    },
    // v4 -> v5: projects may belong to one optional folder.
    5: s => {
      if (!Array.isArray(s.folders)) s.folders = [];
      s.projects.forEach(project=>{
        if (!Object.prototype.hasOwnProperty.call(project, "folderId")) project.folderId = null;
      });
      return s;
    },
  };
  const SCHEMA_VERSION = Math.max(...Object.keys(MIGRATIONS).map(Number));
  const MIGRATION_BACKUP_KEY = "personal_dashboard_pre_migration_backup_v1";
  // Set by migrateState() whenever it actually upgrades something, so the
  // caller can surface a one-time notice instead of leaving the upgrade
  // silent. Cleared by maybeShowMigrationNotice() once shown.
  let lastMigrationInfo = null;

  function migrateState(raw){
    if (!raw || !Array.isArray(raw.projects)) return defaultState();
    let version = Number.isInteger(raw.schemaVersion) ? raw.schemaVersion : 0;
    const fromVersion = version;
    if (version < SCHEMA_VERSION){
      // One safety-net backup per load, taken before any step runs, so a
      // bad migration can always be undone from the sync menu.
      try{ localStorage.setItem(MIGRATION_BACKUP_KEY, JSON.stringify({savedAt:Date.now(), fromVersion:version, data:raw})); }catch(err){/* storage full - proceed anyway */}
    }
    let s = raw;
    s.projects = s.projects.filter(Boolean).map(project=>({
      ...project,
      groups:(Array.isArray(project.groups) ? project.groups : [{id:uid(), name:"Items", items:[]}])
        .filter(Boolean)
        .map(group=>({...group, items:Array.isArray(group.items) ? group.items.filter(Boolean) : []}))
    }));
    while (version < SCHEMA_VERSION){
      version += 1;
      const step = MIGRATIONS[version];
      if (!step) break; // no step registered for this gap - leave state as-is rather than throw
      s = step(s);
    }
    if (!Array.isArray(s.folders)) s.folders = [];
    if (!Array.isArray(s.calendarItems)) s.calendarItems = [];
    if (!Array.isArray(s.googleDeletedEventIds)) s.googleDeletedEventIds = [];
    if (!Array.isArray(s.googleCalendarLinks)) s.googleCalendarLinks = [];
    if (!Array.isArray(s.googleCalendarCatalog)) s.googleCalendarCatalog = [];
    if (!Number.isFinite(s.googleLastSyncAt)) s.googleLastSyncAt = 0;
    s.schemaVersion = SCHEMA_VERSION;
    if (fromVersion < s.schemaVersion) lastMigrationInfo = {fromVersion, toVersion:s.schemaVersion};
    return s;
  }
  async function maybeShowMigrationNotice(){
    if (!lastMigrationInfo) return;
    const info = lastMigrationInfo;
    lastMigrationInfo = null;
    await showNotice("Beforework data upgraded",
      `This file was saved by an older version of Beforework (format v${info.fromVersion}) and has been upgraded to the current format (v${info.toVersion}). `+
      `A copy of the pre-upgrade data was saved automatically - use "Restore pre-upgrade backup" in the storage menu (⋮ at the bottom) if anything looks off.`);
  }

  function hasMigrationBackup(){
    try{ return !!localStorage.getItem(MIGRATION_BACKUP_KEY); }catch(err){ return false; }
  }
  async function restoreMigrationBackup(){
    let saved = null;
    try{ saved = JSON.parse(localStorage.getItem(MIGRATION_BACKUP_KEY) || "null"); }catch(err){ saved = null; }
    if (!saved){ showNotice("No backup found", "There is no pre-migration backup saved in this browser."); return; }
    const when = new Date(saved.savedAt).toLocaleString();
    if (!await showConfirm("Restore pre-migration data", `This replaces your current data with the version saved automatically on ${when}, just before it was last upgraded (from schema v${saved.fromVersion}). This cannot be undone with Ctrl+Z.`, true)) return;
    state = { ...saved.data, schemaVersion: saved.fromVersion };
    lastSavedState = null;
    undoStack.length = 0;
    scheduleSave();
    renderAll();
  }

  /* Persistence moved to js/storage.js */

/* ---------- Connect gate ---------- */
  // Nothing in the app is usable until a file is connected - there is no
  // in-memory-only or browser-storage-only mode. This keeps the file the
  // one and only source of truth at all times.
  function showConnectGate(){
    const gate = document.getElementById("connectGate");
    const supported = "showOpenFilePicker" in window && "showSaveFilePicker" in window;
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

  function importJSON(file){
    if (!fileHandle){ showNotice("Connect a file first", "Import replaces the data in your connected file - connect or create one first."); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      try{
        const parsed = JSON.parse(reader.result);
        if (!parsed.projects) throw new Error("not an Beforework file");
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
      }catch(err){ showNotice("Import failed", "Could not read that file: " + err.message); }
    };
    reader.readAsText(file);
  }

  function saveFilterPrefs(){
    localStorage.setItem(FILTER_KEY, JSON.stringify(filterPrefs));
  }
  function persistActiveFilters(){
    if (activeProjectId===OVERVIEW) return;
    filterPrefs[activeProjectId] = {
      text: boardFilterText,
      tags: [...boardFilterTags],
      fields: Object.fromEntries(boardFilterFields)
    };
    saveFilterPrefs();
  }
  function restoreProjectFilters(pid){
    const saved = filterPrefs[pid] || {};
    boardFilterText = saved.text || "";
    boardFilterTags = new Set(Array.isArray(saved.tags) ? saved.tags : []);
    boardFilterFields = new Map(Object.entries(saved.fields || {}));
  }

  /* ---------- Model helpers ---------- */
  function getProject(pid){ return state.projects.find(p=>p.id===pid); }
  function getGroup(pid,gid){ return getProject(pid)?.groups.find(g=>g.id===gid); }
  function getItem(pid,gid,iid){ return getGroup(pid,gid)?.items.find(i=>i.id===iid); }
  function tagById(project,tid){ return project.tags.find(t=>t.id===tid); }
  function priorityField(project){ return project.fields.find(f=>f.type==="priority"); }
  function dateFields(project){ return project.fields.filter(f=>f.type==="date"); }

  function allItemsFlat(){
    const out = [];
    state.projects.forEach(p=> p.groups.forEach(g=> g.items.forEach(it=>
      out.push({project:p, group:g, item:it}))));
    return out;
  }

  function addProject(name, templateKey){
    const tpl = PROJECT_TEMPLATES[templateKey] || PROJECT_TEMPLATES.blank;
    const views = tpl.views.map(type=>({id:uid(), type, name:viewLabel(type)}));
    const p = {
      id:uid(), name, createdAt:Date.now(), folderId:null,
      tags:[],
      fields: buildFieldsForTemplate(tpl.fields),
      groups: tpl.groups.map(gName=>({id:uid(), name:gName, items:[]})),
      views, activeViewId: views[0].id,
      itemDefaultType: tpl.itemDefaultType || "task",
    };
    state.projects.push(p);
    activeProjectId = p.id;
    persistActiveLocation();
    scheduleSave(); renderAll();
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
    scheduleSave(); renderMain();
  }
  function removeView(project, viewId){
    if (project.views.length <= 1) return;
    project.views = project.views.filter(v=>v.id!==viewId);
    if (project.activeViewId===viewId) project.activeViewId = project.views[0].id;
    scheduleSave(); renderMain();
  }
  function deleteProject(pid){
    const project = getProject(pid);
    if (project) project.groups.forEach(group=>group.items.forEach(queueGoogleEventDeletes));
    state.projects = state.projects.filter(p=>p.id!==pid);
    if (activeProjectId===pid){
      activeProjectId = state.projects[0]?.id || OVERVIEW;
      persistActiveLocation();
    }
    scheduleSave(); renderAll();
  }
  function addGroup(pid, name){
    const project = getProject(pid);
    if (!project) return;
    project.groups.push({id:uid(), name, items:[]});
    scheduleSave(); renderMain();
  }
  function deleteGroup(pid, gid){
    const p = getProject(pid);
    if (!p || p.groups.length <= 1){
      showNotice("Group required", "A project needs at least one group.");
      return;
    }
    const group = p.groups.find(candidate=>candidate.id===gid);
    if (group) group.items.forEach(queueGoogleEventDeletes);
    p.groups = p.groups.filter(g=>g.id!==gid);
    scheduleSave(); renderMain();
  }
  function addItem(pid, gid, title){
    const project = getProject(pid);
    const it = {id:uid(), title, description:"", calendarType:(project && project.itemDefaultType==="event") ? "event" : "task",
      startTime:"", endTime:"", location:"", endDate:"", tagIds:[], values:{}, subitems:[],
      comments:[], archived:false, createdAt:Date.now(), updatedAt:Date.now()};
    getGroup(pid,gid).items.push(it);
    scheduleSave(); renderMain();
    return it;
  }
  function openNewItemModal(project, group){
    if (!project || !group) return;
    openItemRef = {projectId:project.id, groupId:group.id, itemId:null, isNew:true, globalNew:false, draft:{
      id:uid(), title:"", description:"", calendarType:project.itemDefaultType==="event" ? "event" : "task",
      startTime:"", endTime:"", location:"", endDate:"", tagIds:[], values:{}, subitems:[], comments:[],
      archived:false, createdAt:Date.now(), updatedAt:Date.now()
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
    scheduleSave(); renderMain();
  }
  function toggleArchiveItem(pid,gid,iid){
    const item = getItem(pid,gid,iid);
    if (!item) return;
    item.archived = !item.archived;
    item.updatedAt = Date.now();
    scheduleSave(); renderMain(); renderProjectList();
  }
  function addComment(pid,gid,iid,text){
    const item = getItem(pid,gid,iid);
    if (!item || !text.trim()) return;
    item.comments.push({id:uid(), text:text.trim(), createdAt:Date.now()});
    item.updatedAt = Date.now();
    scheduleSave(); renderMain();
  }
  function deleteComment(pid,gid,iid,cid){
    const item = getItem(pid,gid,iid);
    if (!item) return;
    item.comments = item.comments.filter(c=>c.id!==cid);
    item.updatedAt = Date.now();
    scheduleSave(); renderMain();
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
  async function bulkDelete(project){
    if (!selectedItemIds.size) return;
    if (!await showConfirm("Delete selected items", `Delete ${selectedItemIds.size} selected item(s)?`, true)) return;
    project.groups.forEach(g=>{
      g.items.forEach(item=>{ if (selectedItemIds.has(item.id)) queueGoogleEventDeletes(item); });
      g.items = g.items.filter(item=>!selectedItemIds.has(item.id));
    });
    selectedItemIds.clear(); scheduleSave(); renderMain(); renderProjectList();
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
      moving.forEach(item=>{ item.updatedAt = now; target.items.push(item); });
    });
    selectedItemIds.clear(); scheduleSave(); renderMain();
  }
  async function bulkTag(project){
    if (!selectedItemIds.size) return;
    const name = await showDialog({title:"Tag selected items", message:`Add a tag to ${selectedItemIds.size} selected item(s).`, fields:[{label:"Tag name", value:project.tags[0]?.name || "", placeholder:"e.g. urgent"}], confirmLabel:"Apply tag"});
    if (!name || !name.trim()) return;
    let tag = project.tags.find(t=>t.name.toLowerCase()===name.trim().toLowerCase());
    if (!tag) tag = createTag(project, name.trim());
    project.groups.forEach(g=>g.items.forEach(item=>{
      if (selectedItemIds.has(item.id) && !item.tagIds.includes(tag.id)){
        item.tagIds.push(tag.id); item.updatedAt = Date.now();
      }
    }));
    selectedItemIds.clear(); scheduleSave(); renderAll();
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
    scheduleSave(); renderMain();
  }
  function createTag(project, name, color){
    const t = {id:uid(), name, color: color || TAG_COLORS[project.tags.length % TAG_COLORS.length]};
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
    const field = {id:uid(), label, type, options:[]};
    if (type==="select"){
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
  async function manageFieldsFlow(project){
    const names = project.fields.map(f=>`${f.label} (${f.type})`).join(", ") || "(none yet)";
    const action = await showDialog({title:`Columns for ${project.name}`, message:`Current columns: ${names}`, confirmLabel:"Add column", secondaryLabel:"Delete column"});
    if (!action) return;
    if (action === "__confirm__"){
      const details = await showDialog({title:"New column", fields:[
        {label:"Column name", placeholder:"e.g. Status, Type, Effort"},
        {label:"Column type", type:"select", options:FIELD_TYPES.map(value=>({value,label:value})), value:"select"}
      ], confirmLabel:"Create column"});
      if (!details) return;
      const [label,type] = details;
      if (!label || !label.trim()) return;
      addField(project, label.trim(), FIELD_TYPES.includes(type) ? type : "select");
      return;
    }
    const fid = await showDialog({title:"Delete column", fields:[{label:"Column", type:"select", options:project.fields.map(field=>({value:field.id,label:`${field.label} (${field.type})`})), value:project.fields[0]?.id}], confirmLabel:"Choose column"});
    const f = project.fields.find(field=>field.id===fid);
    if (!f) return;
    if (await showConfirm(`Delete column ${f.label}`, "This removes its values from every item in this project.", true)) deleteField(project, f.id);
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
    if (daysAgo===0) return time;
    if (daysAgo===1) return `Yesterday at ${time}`;
    if (daysAgo>1 && daysAgo<7) return `${daysAgo}d ago at ${time}`;
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
  function tagDotHtml(t, selected){
    return `<span class="Label Label--secondary${selected?" selected":""}" data-tagfilter="${t.id}">
      <span class="dot" style="background:${t.color}"></span>${escapeHtml(t.name)}</span>`;
  }
  function fieldChipHtml(field, value){
    if (!value) return "";
    if (field.type==="priority"){
      const opt = PRIORITY_OPTIONS.find(o=>o.id===value); if (!opt) return "";
      return `<span class="priorityDot" style="background:${opt.color}" title="${opt.label} ${escapeHtml(field.label)}"></span>`;
    }
    if (field.type==="date") return duePillHtml(value);
    if (field.type==="select"){
      const opt = (field.options||[]).find(o=>o.id===value); if (!opt) return "";
      return `<span class="Label Label--secondary"><span class="dot" style="background:${opt.color}"></span>${escapeHtml(opt.label)}</span>`;
    }
    return `<span class="Label Label--secondary">${escapeHtml(String(value))}</span>`;
  }
  function fieldCellHtml(field, value){
    if (field.type==="priority"){
      const opt = PRIORITY_OPTIONS.find(o=>o.id===value);
      return opt ? `${fieldChipHtml(field,value)}${opt.label}` : "-";
    }
    if (field.type==="date") return value ? duePillHtml(value) : "-";
    if (field.type==="select"){
      const opt = (field.options||[]).find(o=>o.id===value);
      return opt ? fieldChipHtml(field,value) : "-";
    }
    return value ? escapeHtml(value) : "-";
  }

  function itemMatchesFilter(project, item){
    if (item.archived && !showArchived) return false;
    if (boardFilterTags.size && ![...boardFilterTags].every(tid=>(item.tagIds||[]).includes(tid))) return false;
    for (const [fid, mode] of boardFilterFields){
      if (mode==="__all__") continue;
      const val = (item.values||{})[fid] || "";
      if (mode==="__none__"){ if (val) return false; }
      else {
        const field = project?.fields?.find(candidate=>candidate.id===fid);
        if (field?.type==="text"){
          if (!val.toLowerCase().includes(mode.toLowerCase())) return false;
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
      .filter(item=>itemMatchesFilter(project, item))
      .forEach(item=>rows.push({item, group})));
    return rows;
  }

  /* ---------- Rendering: shell ---------- */
  function renderAll(){
    renderProjectList();
    renderSidebarTags();
    renderMain();
  }

  function renderProjectList(){
    document.getElementById("overviewNav").className = activeProjectId===OVERVIEW ? "active" : "";
    document.getElementById("calendarNav").className = activeProjectId===CALENDAR ? "active" : "";
    document.getElementById("integrationsNav").className = activeProjectId===INTEGRATIONS ? "active" : "";
    document.getElementById("settingsNav").className = activeProjectId===SETTINGS ? "active" : "";
    const ul = document.getElementById("projectList");
    ul.innerHTML = "";
    const appendProject = (p, inFolder=false) => {
      const count = p.groups.reduce((n,g)=>n+g.items.length,0);
      const li = document.createElement("li");
      li.className = "SideNav-item" + (p.id===activeProjectId ? " active" : "") + (inFolder ? " inFolder" : "");
      li.innerHTML = `<span>${escapeHtml(p.name)}</span><span class="cnt">${count}</span>`;
      li.onclick = () => { selectProject(p.id); };
      ul.appendChild(li);
    };
    const unfiled = state.projects.filter(project=>!project.folderId || !state.folders.some(folder=>folder.id===project.folderId));
    unfiled.forEach(project=>appendProject(project));
    state.folders.forEach(folder=>{
      const heading = document.createElement("li");
      heading.className = "folderHeading";
      const projectCount = state.projects.filter(project=>project.folderId===folder.id).length;
      heading.innerHTML = `<iconify-icon icon="mdi:folder-outline" aria-hidden="true"></iconify-icon><span class="folderName">${escapeHtml(folder.name)}</span><span class="folderCount">${projectCount}</span>`;
      ul.appendChild(heading);
      state.projects.filter(project=>project.folderId===folder.id).forEach(project=>appendProject(project, true));
    });
  }

  function selectProject(pid){
    activeProjectId = pid;
    persistActiveLocation();
    restoreProjectFilters(pid);
    selectedItemIds.clear();
    renderAll();
    closeSidebarOnMobile();
  }

  function persistActiveLocation(){
    try{ localStorage.setItem(LOCATION_KEY, activeProjectId); }catch(err){/* ignore */}
  }

  function navigateToIntegrations(){
    if (window.location.protocol==="http:" || window.location.protocol==="https:") window.history.pushState({}, "", "/integrations");
    else window.location.hash = "integrations";
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

  function restoreActiveLocation(){
    let saved = null;
    try{ saved = localStorage.getItem(LOCATION_KEY); }catch(err){/* ignore */}
    const integrationPath = window.location.pathname==="/integrations" || window.location.pathname.endsWith("/integrations/");
    const hashLocation = integrationPath || window.location.hash==="#integrations" ? INTEGRATIONS : null;
    if (hashLocation) activeProjectId = hashLocation;
    else if (saved===OVERVIEW || saved===CALENDAR || saved===INTEGRATIONS || saved===SETTINGS || getProject(saved)) activeProjectId = saved;
    else activeProjectId = OVERVIEW;
    if (activeProjectId !== OVERVIEW && activeProjectId !== CALENDAR) restoreProjectFilters(activeProjectId);
  }

  function renderSidebarTags(){
    const section = document.getElementById("tagsSection");
    const wrap = document.getElementById("sideTagsList");
    const label = document.getElementById("tagsSectionLabel");
    const project = getProject(activeProjectId);
    if (activeProjectId===OVERVIEW || activeProjectId===CALENDAR || activeProjectId===INTEGRATIONS || activeProjectId===SETTINGS || !project){ section.style.display = "none"; return; }
    section.style.display = "block";
    label.textContent = "Tags in " + project.name;
    wrap.innerHTML = project.tags.map(t=>tagDotHtml(t, boardFilterTags.has(t.id))).join("")
      || `<div style="font-size:12px;color:var(--faint);">No tags yet</div>`;
    wrap.querySelectorAll("[data-tagfilter]").forEach(el=>{
      el.onclick = () => {
        const tid = el.dataset.tagfilter;
        if (boardFilterTags.has(tid)) boardFilterTags.delete(tid); else boardFilterTags.add(tid);
        renderMain(); renderSidebarTags();
      };
    });
  }

  /* Integrations view moved to js/google-calendar.js */

  function renderSettings(board){
    const theme = document.documentElement.getAttribute("data-theme")==="dark" ? "Dark" : "Light";
    const timeFormat = getTimeFormat();
    const sidebarCollapsed = document.getElementById("sidebar").classList.contains("collapsed");
    board.innerHTML = `<div class="settingsWrap">
      <div class="Subhead settingsIntro"><div><h3 class="Subhead-heading">Settings</h3><p class="color-fg-muted">Personalise how Beforework looks and behaves on this device.</p></div></div>
      <div class="settingsGrid">
        <section class="Box settingsSection">
          <div class="Box-header settingsSectionHead"><h4>Appearance</h4><span>Visual preferences</span></div>
          <div class="Box-row settingsRow"><div><strong>Colour mode</strong><p>Use a light or dark workspace.</p></div><button class="btn btn-sm" id="settingsThemeToggle">${theme} mode</button></div>
          <div class="Box-row settingsRow"><div><strong>Time format</strong><p>Choose how times appear throughout the app.</p></div><select class="form-control settingsSelect" id="settingsTimeFormat" aria-label="Time format"><option value="12" ${timeFormat==="12"?"selected":""}>12-hour</option><option value="24" ${timeFormat==="24"?"selected":""}>24-hour</option></select></div>
          <div class="Box-row settingsRow"><div><strong>Sidebar</strong><p>Keep the project navigation visible.</p></div><button class="btn btn-sm" id="settingsSidebarToggle">${sidebarCollapsed ? "Expand" : "Collapse"} sidebar</button></div>
        </section>
        <section class="Box settingsSection">
          <div class="Box-header settingsSectionHead"><h4>Focus</h4><span>Stay on task</span></div>
          <div class="Box-row settingsRow"><div><strong>Focus timer</strong><p>Open the timer and choose a session length.</p></div><button class="btn btn-sm" id="settingsFocusTimer">Open timer</button></div>
          <div class="Box-row settingsRow"><div><strong>Keyboard shortcuts</strong><p>View the shortcuts available throughout the app.</p></div><button class="btn btn-sm" id="settingsShortcuts">View shortcuts</button></div>
        </section>
      </div>
    </div>`;
    board.querySelector("#settingsThemeToggle").onclick = () => { toggleTheme(); renderSettings(board); };
    board.querySelector("#settingsTimeFormat").onchange = event => {
      try{ localStorage.setItem(TIME_FORMAT_KEY, event.target.value); }catch(err){/* ignore */}
      renderAll();
    };
    board.querySelector("#settingsSidebarToggle").onclick = () => { toggleSidebarCollapsed(); renderSettings(board); };
    board.querySelector("#settingsFocusTimer").onclick = () => document.getElementById("focusTimerPanel").classList.toggle("open");
    board.querySelector("#settingsShortcuts").onclick = showShortcutsModal;
  }

  function renderMain(){
    const filterBar = document.getElementById("boardFilterBar");
    const renameBtn = document.getElementById("renameProjectBtn");
    const deleteBtn = document.getElementById("deleteProjectBtn");
    const fieldsBtn = document.getElementById("manageFieldsBtn");
    const addGroupBtn = document.getElementById("addGroupBtn");
    const moveFolderBtn = document.getElementById("moveProjectFolderBtn");
    const projectMenuWrap = document.getElementById("projectMenuWrap");
    const viewTabs = document.getElementById("viewTabs");
    const topLabel = document.getElementById("projectTitleLabel");
    const board = document.getElementById("board");
    board.innerHTML = "";

    if (activeProjectId === OVERVIEW || activeProjectId === CALENDAR || activeProjectId === INTEGRATIONS || activeProjectId === SETTINGS){
      topLabel.textContent = "Overview";
      if (activeProjectId===CALENDAR) topLabel.textContent = "Calendar";
      if (activeProjectId===INTEGRATIONS) topLabel.textContent = "Integrations";
      if (activeProjectId===SETTINGS) topLabel.textContent = "Settings";
      filterBar.style.display = "none";
      renameBtn.style.display = "none";
      deleteBtn.style.display = "none";
      fieldsBtn.style.display = "none";
      addGroupBtn.style.display = "none";
      moveFolderBtn.style.display = "none";
      projectMenuWrap.style.display = "none";
      document.getElementById("projectMenu").classList.remove("open");
      document.getElementById("projectMenuBtn").classList.remove("active");
      viewTabs.style.display = "none";
      if (activeProjectId===CALENDAR) renderCalendar(board, null);
      else if (activeProjectId===INTEGRATIONS) renderIntegrations(board);
      else if (activeProjectId===SETTINGS) renderSettings(board);
      else renderOverview(board);
      return;
    }

    const project = getProject(activeProjectId);
    if (!project){
      activeProjectId = OVERVIEW;
      renderProjectList();
      renderMain();
      return;
    }

    persistActiveFilters();

    topLabel.textContent = project.name;
    filterBar.style.display = "block";
    renameBtn.style.display = "inline-block";
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

    document.getElementById("boardSearch").value = boardFilterText;
    renderBoardTagFilters(project);
    renderFieldFilters(project);
    updateFilterSummary();

    fieldsBtn.onclick = () => manageFieldsFlow(project);
    moveFolderBtn.onclick = () => moveProjectToFolder(project);
    addGroupBtn.onclick = async () => {
      const name = await showDialog({title:"New group", fields:[{label:"Group name", placeholder:"e.g. In progress"}], confirmLabel:"Create group"});
      if (name && name.trim()) addGroup(project.id, name.trim());
    };
    renameBtn.onclick = async () => {
      const name = await showDialog({title:"Rename project", fields:[{label:"Project name", value:project.name}], confirmLabel:"Rename"});
      if (name && name.trim()){ project.name = name.trim(); scheduleSave(); renderAll(); }
    };
    deleteBtn.onclick = async () => {
      if (await showConfirm(`Delete project ${project.name}`, "This will delete everything in the project.", true)) deleteProject(project.id);
    };

    const activeView = project.views.find(v=>v.id===project.activeViewId) || project.views[0];
    if (activeView.type === "list") renderListView(project, board);
    else if (activeView.type === "table") renderTableView(project, board);
    else if (activeView.type === "calendar") renderCalendar(board, project);
    else renderKanban(project, board);
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
        scheduleSave(); renderMain();
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

  function renderBoardTagFilters(project){
    const wrap = document.getElementById("boardTagFilters");
    const availableTags = project.tags.filter(tag=>!boardFilterTags.has(tag.id));
    const activeTags = project.tags.filter(tag=>boardFilterTags.has(tag.id));
    wrap.innerHTML = `<select class="form-control" id="tagFilterPicker" aria-label="Add tag filter">
      <option value="">Add tag filter...</option>
      ${availableTags.map(tag=>`<option value="${tag.id}">${escapeHtml(tag.name)}</option>`).join("")}
    </select>${activeTags.map(tag=>`<span class="tagFilterGroup"><span class="Label Label--secondary"><span class="dot" style="background:${tag.color}"></span>${escapeHtml(tag.name)}</span><button class="btn btn-invisible removeFieldFilter" data-remove-tag-filter="${tag.id}" title="Remove ${escapeHtml(tag.name)} filter">✕</button></span>`).join("")}`;
    wrap.querySelector("#tagFilterPicker").addEventListener("change", event=>{
      if (!event.target.value) return;
      boardFilterTags.add(event.target.value);
      renderMain();
    });
    wrap.querySelectorAll("[data-remove-tag-filter]").forEach(button=>{
      button.onclick = () => {
        boardFilterTags.delete(button.dataset.removeTagFilter);
        renderMain();
      };
    });
  }

  function renderFieldFilters(project){
    const wrap = document.getElementById("fieldFilters");
    const filterable = project.fields;
    const activeFields = filterable.filter(field=>boardFilterFields.has(field.id));
    const availableFields = filterable.filter(field=>!activeFields.includes(field));
    const picker = `<select class="form-control" id="fieldFilterPicker" aria-label="Add a filter">
      <option value="">Add filter...</option>
      ${availableFields.map(field=>`<option value="${field.id}">${escapeHtml(field.label)}</option>`).join("")}
    </select>`;
    const activeControls = activeFields.map(f=>{
      const opts = f.type==="priority" ? PRIORITY_OPTIONS : (f.options||[]);
      const current = boardFilterFields.get(f.id) || "__all__";
      let control;
      if (f.type==="date"){
        control = `<input class="form-control" type="date" data-fieldfilter="${f.id}" value="${current==="__all__"?"":escapeHtml(current)}" title="Filter ${escapeHtml(f.label)}" aria-label="Filter ${escapeHtml(f.label)}">`;
      } else if (f.type==="text"){
        control = `<input class="form-control" type="text" data-fieldfilter="${f.id}" value="${current==="__all__"?"":escapeHtml(current)}" placeholder="Filter ${escapeHtml(f.label)}" aria-label="Filter ${escapeHtml(f.label)}">`;
      } else {
        control = `<select class="form-control" data-fieldfilter="${f.id}" aria-label="Filter ${escapeHtml(f.label)}">
          <option value="__all__" ${current==="__all__"?"selected":""}>All ${escapeHtml(f.label)}</option>
          ${opts.map(o=>`<option value="${o.id}" ${current===o.id?"selected":""}>${escapeHtml(o.label)}</option>`).join("")}
          <option value="__none__" ${current==="__none__"?"selected":""}>No ${escapeHtml(f.label)}</option>
        </select>`;
      }
      return `<span class="fieldFilterGroup"><span class="Label color-fg-muted">${escapeHtml(f.label)}</span>${control}<button class="btn btn-invisible removeFieldFilter" data-remove-field-filter="${f.id}" title="Remove ${escapeHtml(f.label)} filter">✕</button></span>`;
    }).join("");
    wrap.innerHTML = picker + activeControls;
    wrap.querySelector("#fieldFilterPicker").addEventListener("change", event=>{
      if (!event.target.value) return;
      boardFilterFields.set(event.target.value, "__all__");
      renderMain();
    });
    wrap.querySelectorAll("[data-fieldfilter]").forEach(control=>{
      control.addEventListener("change", e=>{
        boardFilterFields.set(control.dataset.fieldfilter, e.target.value || "__all__");
        renderMain();
      });
    });
    wrap.querySelectorAll("[data-remove-field-filter]").forEach(button=>{
      button.onclick = () => {
        boardFilterFields.delete(button.dataset.removeFieldFilter);
        renderMain();
      };
    });
  }
  function updateFilterSummary(){
    const summary = document.getElementById("filterSummary");
    if (!summary) return;
    const fieldCount = [...boardFilterFields.values()].filter(value=>value!=="__all__").length;
    const count = fieldCount + boardFilterTags.size + (boardFilterText ? 1 : 0);
    summary.innerHTML = count ? `<strong>${count}</strong> filter${count===1?"":"s"} applied` : "All items";
  }

  /* ---------- Kanban ---------- */
  function renderKanban(project, board){
    project.groups.forEach(group=>{
      const col = document.createElement("div");
      col.className = "group Box";
      col.dataset.groupId = group.id;

      const visibleItems = group.items.filter(it=>itemMatchesFilter(project, it));

      col.innerHTML = `
        <div class="groupHead">
          <input class="form-control groupTitle" value="${escapeHtml(group.name)}">
          <span class="Counter Counter--secondary">${visibleItems.length}${visibleItems.length!==group.items.length?"/"+group.items.length:""}</span>
          <button class="btn btn-invisible btn-sm" data-action="delGroup" title="Delete group">✕</button>
        </div>
        <div class="groupBody"></div>
        <button class="btn addItemBtn" data-action="addItem">+ Add item</button>
      `;

      col.querySelector(".groupTitle").addEventListener("change", (e)=>{
        group.name = e.target.value.trim() || group.name;
        scheduleSave(); renderProjectList();
      });
      col.querySelector('[data-action="delGroup"]').onclick = async () => {
        if (await showConfirm(`Delete group ${group.name}`, `This will delete the group and its ${group.items.length} item(s).`, true)) deleteGroup(project.id, group.id);
      };
      col.querySelector('[data-action="addItem"]').onclick = async () => {
        openNewItemModal(project, group);
      };

      const body = col.querySelector(".groupBody");
      visibleItems.forEach(item=> body.appendChild(renderCard(project, group.id, item)));

      col.addEventListener("dragover", (e)=>{ e.preventDefault(); col.classList.add("dragover"); });
      col.addEventListener("dragleave", ()=> col.classList.remove("dragover"));
      col.addEventListener("drop", (e)=>{
        e.preventDefault(); col.classList.remove("dragover");
        const data = JSON.parse(e.dataTransfer.getData("text/plain"));
        moveItem(project.id, data.groupId, group.id, data.itemId, null);
      });

      board.appendChild(col);
    });
  }

  function renderCard(project, gid, item){
    const card = document.createElement("div");
    card.className = "card Box" + (item.archived ? " archived" : "");
    card.draggable = true;
    const doneSub = item.subitems.filter(s=>s.done).length;
    const pf = priorityField(project);
    const dfs = dateFields(project);
    const titlePrefix = pf ? fieldChipHtml(pf, item.values[pf.id]) : "";
    const dueChips = dfs.map(f=>fieldChipHtml(f, item.values[f.id])).join("");
    const tagsHtml = item.tagIds.map(tid=>{
      const t = tagById(project, tid); if (!t) return "";
      return `<span class="Label Label--secondary"><span class="dot" style="background:${t.color}"></span>${escapeHtml(t.name)}</span>`;
    }).join("");
    card.innerHTML = `
      <div class="cardTitle">${titlePrefix}${escapeHtml(item.title)}</div>
      <div class="cardMeta">
        ${item.archived ? `<span class="Label Label--secondary">Archived</span>` : ""}
        ${item.subitems.length? `<span class="Counter Counter--secondary">${doneSub}/${item.subitems.length}</span>`:""}
        ${item.comments && item.comments.length ? `<span class="Counter Counter--secondary" title="Comments">💬 ${item.comments.length}</span>` : ""}
        ${dueChips}
        ${tagsHtml}
      </div>`;
    card.onclick = () => openItemModal(project.id, gid, item.id);
    card.addEventListener("dragstart", (e)=>{
      card.classList.add("dragging");
      e.dataTransfer.setData("text/plain", JSON.stringify({groupId:gid, itemId:item.id}));
    });
    card.addEventListener("dragend", ()=> card.classList.remove("dragging"));
    return card;
  }

  /* ---------- List view ---------- */
  function renderListView(project, board){
    const wrap = document.createElement("div");
    wrap.className = "listWrap";

    const groupOptionsHtml = project.groups.map(g=>`<option value="${g.id}">${escapeHtml(g.name)}</option>`).join("");
    const TH_CLASS = "p-2 text-left color-bg-subtle color-fg-muted text-bold f6 border-bottom";
    const TD_CLASS = "p-2 border-bottom";
    const fieldHeaders = project.fields.map(f=>`<th class="${TH_CLASS}" data-field="${f.id}">${escapeHtml(f.label)}</th>`).join("");
    wrap.innerHTML = `
      <div class="listAddRow">
        <select class="form-control" id="quickAddGroup">${groupOptionsHtml}</select>
        <button class="btn btn-primary addListItemBtn" id="quickAddBtn">+ Add item</button>
      </div>
      <div class="bulkBar">
        <strong><span id="selectedCount">0</span> selected</strong>
        <button class="btn btn-sm" id="bulkSelectAll">Select all</button>
        <button class="btn btn-sm" id="bulkMove">Move</button>
        <button class="btn btn-sm" id="bulkTag">Tag</button>
        <button class="btn btn-sm btn-danger" id="bulkDelete">Delete</button>
      </div>
      <table class="listTable width-full">
        <thead><tr>
          <th class="selectCell ${TH_CLASS}"><input type="checkbox" id="selectAllItems" title="Select all visible items"></th>
          <th class="${TH_CLASS}" data-field="title">Title</th>
          <th class="${TH_CLASS}" data-field="group">Group</th>
          ${fieldHeaders}
          <th class="${TH_CLASS}">Tags</th>
          <th class="${TH_CLASS}">Progress</th>
          <th class="${TH_CLASS}" data-field="updated">Updated</th>
        </tr></thead>
        <tbody id="listTbody"></tbody>
      </table>
    `;
    board.appendChild(wrap);

    const doQuickAdd = () => {
      const gid = document.getElementById("quickAddGroup").value;
      const group = project.groups.find(candidate=>candidate.id===gid);
      openNewItemModal(project, group);
    };
    document.getElementById("quickAddBtn").onclick = doQuickAdd;
    const updateSelection = () => {
      document.getElementById("selectedCount").textContent = selectedItemIds.size;
      wrap.querySelectorAll("input[data-item-select]").forEach(input=>{
        input.checked = selectedItemIds.has(input.dataset.itemSelect);
      });
    };
    document.getElementById("bulkSelectAll").onclick = () => {
      rowsForSelection(project).forEach(row=>selectedItemIds.add(row.item.id));
      updateSelection();
    };
    document.getElementById("selectAllItems").onchange = e => {
      rowsForSelection(project).forEach(row=>{
        if (e.target.checked) selectedItemIds.add(row.item.id);
        else selectedItemIds.delete(row.item.id);
      });
      updateSelection();
    };
    document.getElementById("bulkMove").onclick = () => bulkMove(project);
    document.getElementById("bulkTag").onclick = () => bulkTag(project);
    document.getElementById("bulkDelete").onclick = () => bulkDelete(project);

    wrap.querySelectorAll("th[data-field]").forEach(th=>{
      const field = th.dataset.field;
      const arrow = listSort.field===field ? (listSort.dir==="asc"?" ↑":" ↓") : "";
      th.innerHTML = th.textContent + `<span class="arrow">${arrow}</span>`;
      th.onclick = () => {
        if (listSort.field===field) listSort.dir = listSort.dir==="asc"?"desc":"asc";
        else listSort = {field, dir: field==="updated" ? "desc" : "asc"};
        renderMain();
      };
    });

    let rows = [];
    project.groups.forEach(g=> g.items.filter(it=>itemMatchesFilter(project, it)).forEach(it=> rows.push({item:it, group:g})));

    rows.sort((a,b)=>{
      let va, vb;
      const f = project.fields.find(x=>x.id===listSort.field);
      if (listSort.field==="title"){ va=a.item.title.toLowerCase(); vb=b.item.title.toLowerCase(); }
      else if (listSort.field==="group"){ va=a.group.name.toLowerCase(); vb=b.group.name.toLowerCase(); }
      else if (listSort.field==="updated"){ va=a.item.updatedAt; vb=b.item.updatedAt; }
      else if (f && f.type==="priority"){
        va=(PRIORITY_OPTIONS.find(o=>o.id===a.item.values[f.id])||{rank:0}).rank;
        vb=(PRIORITY_OPTIONS.find(o=>o.id===b.item.values[f.id])||{rank:0}).rank;
      } else if (f && f.type==="date"){
        va=a.item.values[f.id]||"9999-99-99"; vb=b.item.values[f.id]||"9999-99-99";
      } else if (f){
        va=(a.item.values[f.id]||"").toLowerCase(); vb=(b.item.values[f.id]||"").toLowerCase();
      } else { va=a.item.updatedAt; vb=b.item.updatedAt; }
      if (va<vb) return listSort.dir==="asc" ? -1 : 1;
      if (va>vb) return listSort.dir==="asc" ? 1 : -1;
      return 0;
    });

    const tbody = document.getElementById("listTbody");
    const colCount = 6 + project.fields.length;
    if (!rows.length){
      tbody.innerHTML = `<tr><td colspan="${colCount}" style="color:var(--faint);padding:16px 10px;white-space:normal;">No items match the current filters.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(({item,group})=>{
      const doneSub = item.subitems.filter(s=>s.done).length;
      const tagsHtml = item.tagIds.map(tid=>{
        const t = tagById(project, tid); if (!t) return "";
        return `<span class="Label Label--secondary"><span class="dot" style="background:${t.color}"></span>${escapeHtml(t.name)}</span>`;
      }).join("");
      const fieldCells = project.fields.map(f=>`<td class="${TD_CLASS}">${fieldCellHtml(f, item.values[f.id])}</td>`).join("");
      return `<tr class="rowClickable${item.archived?" archived":""}" data-pid="${project.id}" data-gid="${group.id}" data-iid="${item.id}">
        <td class="selectCell ${TD_CLASS}"><input type="checkbox" data-item-select="${item.id}" ${selectedItemIds.has(item.id)?"checked":""}></td>
        <td class="${TD_CLASS}">${item.archived?`<span class="Label Label--secondary" style="margin-right:6px;">Archived</span>`:""}${escapeHtml(item.title)}</td>
        <td class="${TD_CLASS}">${escapeHtml(group.name)}</td>
        ${fieldCells}
        <td class="${TD_CLASS}"><div class="rowTags">${tagsHtml||"-"}</div></td>
        <td class="${TD_CLASS}">${item.subitems.length? doneSub+"/"+item.subitems.length : "-"}</td>
        <td class="${TD_CLASS}">${escapeHtml(formatUpdatedAt(item.updatedAt))}</td>
      </tr>`;
    }).join("");
    tbody.querySelectorAll("tr[data-iid]").forEach(tr=>{
      tr.onclick = e => {
        if (e.target.matches("input[data-item-select]")){
          if (e.target.checked) selectedItemIds.add(e.target.dataset.itemSelect);
          else selectedItemIds.delete(e.target.dataset.itemSelect);
          updateSelection();
          return;
        }
        openItemModal(tr.dataset.pid, tr.dataset.gid, tr.dataset.iid);
      };
    });
    updateSelection();
  }

  /* ---------- Table view ---------- */
  function renderTableView(project, board){
    const wrap = document.createElement("div");
    wrap.className = "listWrap";

    const groupOptionsHtml = project.groups.map(g=>`<option value="${g.id}">${escapeHtml(g.name)}</option>`).join("");
    const TH_CLASS = "p-2 text-left color-bg-subtle color-fg-muted text-bold f6 border-bottom";
    const TD_CLASS = "p-2 border-bottom";
    const fieldHeaders = project.fields.map(f=>`<th class="${TH_CLASS}" data-field="${f.id}">${escapeHtml(f.label)}</th>`).join("");
    wrap.innerHTML = `
      <div class="listAddRow">
        <select class="form-control" id="quickAddGroup">${groupOptionsHtml}</select>
        <button class="btn btn-primary addListItemBtn" id="quickAddBtn">+ Add row</button>
      </div>
      <div class="bulkBar">
        <strong><span id="selectedCount">0</span> selected</strong>
        <button class="btn btn-sm" id="bulkSelectAll">Select all</button>
        <button class="btn btn-sm" id="bulkMove">Move</button>
        <button class="btn btn-sm" id="bulkTag">Tag</button>
        <button class="btn btn-sm btn-danger" id="bulkDelete">Delete</button>
      </div>
      <table class="listTable width-full">
        <thead><tr>
          <th class="selectCell ${TH_CLASS}"><input type="checkbox" id="selectAllItems" title="Select all visible rows"></th>
          <th class="${TH_CLASS}" data-field="title">Title</th>
          <th class="${TH_CLASS}" data-field="group">Group</th>
          ${fieldHeaders}
          <th class="${TH_CLASS}">Tags</th>
        </tr></thead>
        <tbody id="listTbody"></tbody>
      </table>
    `;
    board.appendChild(wrap);

    const doQuickAdd = () => {
      const gid = document.getElementById("quickAddGroup").value;
      const group = project.groups.find(candidate=>candidate.id===gid);
      openNewItemModal(project, group);
    };
    document.getElementById("quickAddBtn").onclick = doQuickAdd;
    const updateSelection = () => {
      document.getElementById("selectedCount").textContent = selectedItemIds.size;
      wrap.querySelectorAll("input[data-item-select]").forEach(input=>{
        input.checked = selectedItemIds.has(input.dataset.itemSelect);
      });
    };
    document.getElementById("bulkSelectAll").onclick = () => {
      rowsForSelection(project).forEach(row=>selectedItemIds.add(row.item.id));
      updateSelection();
    };
    document.getElementById("selectAllItems").onchange = e => {
      rowsForSelection(project).forEach(row=>{
        if (e.target.checked) selectedItemIds.add(row.item.id);
        else selectedItemIds.delete(row.item.id);
      });
      updateSelection();
    };
    document.getElementById("bulkMove").onclick = () => bulkMove(project);
    document.getElementById("bulkTag").onclick = () => bulkTag(project);
    document.getElementById("bulkDelete").onclick = () => bulkDelete(project);

    wrap.querySelectorAll("th[data-field]").forEach(th=>{
      const field = th.dataset.field;
      const arrow = listSort.field===field ? (listSort.dir==="asc"?" ↑":" ↓") : "";
      th.innerHTML = th.textContent + `<span class="arrow">${arrow}</span>`;
      th.onclick = () => {
        if (listSort.field===field) listSort.dir = listSort.dir==="asc"?"desc":"asc";
        else listSort = {field, dir: field==="updated" ? "desc" : "asc"};
        renderMain();
      };
    });

    let rows = [];
    project.groups.forEach(g=> g.items.filter(it=>itemMatchesFilter(project, it)).forEach(it=> rows.push({item:it, group:g})));

    rows.sort((a,b)=>{
      let va, vb;
      const f = project.fields.find(x=>x.id===listSort.field);
      if (listSort.field==="title"){ va=a.item.title.toLowerCase(); vb=b.item.title.toLowerCase(); }
      else if (listSort.field==="group"){ va=a.group.name.toLowerCase(); vb=b.group.name.toLowerCase(); }
      else if (listSort.field==="updated"){ va=a.item.updatedAt; vb=b.item.updatedAt; }
      else if (f && f.type==="priority"){
        va=(PRIORITY_OPTIONS.find(o=>o.id===a.item.values[f.id])||{rank:0}).rank;
        vb=(PRIORITY_OPTIONS.find(o=>o.id===b.item.values[f.id])||{rank:0}).rank;
      } else if (f && f.type==="date"){
        va=a.item.values[f.id]||"9999-99-99"; vb=b.item.values[f.id]||"9999-99-99";
      } else if (f){
        va=(a.item.values[f.id]||"").toLowerCase(); vb=(b.item.values[f.id]||"").toLowerCase();
      } else { va=a.item.updatedAt; vb=b.item.updatedAt; }
      if (va<vb) return listSort.dir==="asc" ? -1 : 1;
      if (va>vb) return listSort.dir==="asc" ? 1 : -1;
      return 0;
    });

    const tbody = document.getElementById("listTbody");
    const colCount = 4 + project.fields.length;
    if (!rows.length){
      tbody.innerHTML = `<tr><td colspan="${colCount}" style="color:var(--faint);padding:16px 10px;white-space:normal;">No rows match the current filters.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(({item,group})=>{
      const tagsHtml = item.tagIds.map(tid=>{
        const t = tagById(project, tid); if (!t) return "";
        return `<span class="Label Label--secondary"><span class="dot" style="background:${t.color}"></span>${escapeHtml(t.name)}</span>`;
      }).join("");
      const fieldCells = project.fields.map(f=>{
        const val = item.values[f.id] || "";
        if (f.type==="priority"){
          const opts = [{id:"",label:"None"}, ...PRIORITY_OPTIONS].map(o=>`<option value="${o.id}" ${val===o.id?"selected":""}>${escapeHtml(o.label)}</option>`).join("");
          return `<td class="${TD_CLASS}"><select class="form-control tableCell" data-pid="${project.id}" data-gid="${group.id}" data-iid="${item.id}" data-fieldid="${f.id}">${opts}</select></td>`;
        }
        if (f.type==="select"){
          const opts = [{id:"",label:"None"}, ...(f.options||[])].map(o=>`<option value="${o.id}" ${val===o.id?"selected":""}>${escapeHtml(o.label)}</option>`).join("");
          return `<td class="${TD_CLASS}"><select class="form-control tableCell" data-pid="${project.id}" data-gid="${group.id}" data-iid="${item.id}" data-fieldid="${f.id}">${opts}</select></td>`;
        }
        if (f.type==="date"){
          return `<td class="${TD_CLASS}"><input type="date" class="form-control tableCell" data-pid="${project.id}" data-gid="${group.id}" data-iid="${item.id}" data-fieldid="${f.id}" value="${escapeHtml(val)}"></td>`;
        }
        return `<td class="${TD_CLASS}"><input type="text" class="form-control tableCell" data-pid="${project.id}" data-gid="${group.id}" data-iid="${item.id}" data-fieldid="${f.id}" value="${escapeHtml(val)}"></td>`;
      }).join("");
      return `<tr data-pid="${project.id}" data-gid="${group.id}" data-iid="${item.id}">
        <td class="selectCell ${TD_CLASS}"><input type="checkbox" data-item-select="${item.id}" ${selectedItemIds.has(item.id)?"checked":""}></td>
        <td class="${TD_CLASS}"><input type="text" class="form-control tableCell" data-title-cell="1" data-pid="${project.id}" data-gid="${group.id}" data-iid="${item.id}" value="${escapeHtml(item.title)}"></td>
        <td class="${TD_CLASS}">${escapeHtml(group.name)}</td>
        ${fieldCells}
        <td class="${TD_CLASS}"><div class="rowTags">${tagsHtml||"-"}</div></td>
      </tr>`;
    }).join("");
    tbody.querySelectorAll("input[data-item-select]").forEach(input=>{
      input.addEventListener("change", e=>{
        if (e.target.checked) selectedItemIds.add(input.dataset.itemSelect);
        else selectedItemIds.delete(input.dataset.itemSelect);
        updateSelection();
      });
    });
    tbody.querySelectorAll("input[data-title-cell]").forEach(input=>{
      input.addEventListener("change", e=>{
        const it = getItem(input.dataset.pid, input.dataset.gid, input.dataset.iid);
        if (!it) return;
        it.title = e.target.value.trim() || it.title;
        it.updatedAt = Date.now();
        scheduleSave(); renderProjectList();
      });
    });
    tbody.querySelectorAll(".tableCell[data-fieldid]").forEach(control=>{
      control.addEventListener("change", e=>{
        const it = getItem(control.dataset.pid, control.dataset.gid, control.dataset.iid);
        if (!it) return;
        it.values[control.dataset.fieldid] = e.target.value;
        it.updatedAt = Date.now();
        scheduleSave();
      });
    });
    updateSelection();
  }

  function calendarEntries(scopeProject){
    const entries = [];
    if (!scopeProject){
      (state.calendarItems||[]).forEach(item=>{
        if (item.endDate) entries.push({project:null, group:null, item, field:{id:"__standalone__", label:"Calendar", type:"date"}, date:item.endDate, endDate:item.endDate});
      });
    }
    const projects = scopeProject ? [scopeProject] : state.projects;
    projects.forEach(project=>project.groups.forEach(group=>group.items.forEach(item=>{
      const fields = dateFields(project);
      const datedField = fields.find(field=>item.values[field.id]);
      if (datedField){
        const date = item.values[datedField.id];
        entries.push({project, group, item, field:datedField, date, endDate:item.endDate && item.endDate>=date ? item.endDate : date});
      } else if (item.endDate){
        // A schedule date is sufficient for a high-level calendar event even
        // when the project has no custom date column.
        const field = fields[0] || {id:"__schedule__", label:"Schedule", type:"date"};
        entries.push({project, group, item, field, date:item.endDate, endDate:item.endDate});
      }
    })));
    return entries;
  }
  function calendarDateCode(date, addDays){
    const parts = date.split("-").map(Number);
    const value = new Date(parts[0], parts[1]-1, parts[2] + (addDays||0));
    return value.getFullYear()+String(value.getMonth()+1).padStart(2,"0")+String(value.getDate()).padStart(2,"0");
  }
  /* Google Calendar integration moved to js/google-calendar.js */
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
    modal.innerHTML = `<button class="btn btn-invisible closeX" data-calendar-close aria-label="Close">✕</button>
      <h3>${isNew ? "New calendar item" : "Edit calendar item"}</h3>
      <div class="modalRow"><label for="standaloneTitle">Title</label><input class="form-control" id="standaloneTitle" value="${escapeHtml(item.title||"")}" placeholder="Calendar item title"></div>
      <div class="modalRow"><label for="standaloneDescription">Description</label><textarea class="form-control" id="standaloneDescription" placeholder="Add notes...">${escapeHtml(item.description||"")}</textarea></div>
      <div class="modalGrid">
        <div class="modalRow"><label for="standaloneDate">Date</label><input class="form-control" id="standaloneDate" type="date" value="${escapeHtml(item.endDate||"")}"></div>
        <div class="modalRow"><label for="standaloneLocation">Location</label><input class="form-control" id="standaloneLocation" value="${escapeHtml(item.location||"")}" placeholder="Optional location"></div>
        <div class="modalRow"><label for="standaloneStart">Start time</label><input class="form-control" id="standaloneStart" type="time" value="${escapeHtml(item.startTime||"")}"></div>
        <div class="modalRow"><label for="standaloneEnd">End time</label><input class="form-control" id="standaloneEnd" type="time" value="${escapeHtml(item.endTime||"")}"></div>
      </div>
      <div class="modalFooter"><button class="btn btn-invisible" data-calendar-close>Cancel</button><button class="btn btn-primary btn-sm" data-calendar-save>${isNew ? "Add item" : "Save changes"}</button></div>`;
    modal.querySelectorAll("[data-calendar-close]").forEach(button=>button.onclick=()=>overlay.remove());
    modal.querySelector("[data-calendar-save]").onclick = () => {
      const title = modal.querySelector("#standaloneTitle").value.trim();
      const date = modal.querySelector("#standaloneDate").value;
      if (!title || !date) return;
      item.title = title;
      item.description = modal.querySelector("#standaloneDescription").value;
      item.endDate = date;
      item.location = modal.querySelector("#standaloneLocation").value.trim();
      item.startTime = modal.querySelector("#standaloneStart").value;
      item.endTime = modal.querySelector("#standaloneEnd").value;
      item.updatedAt = Date.now();
      if (isNew) state.calendarItems.push(item);
      scheduleSave();
      overlay.remove();
      renderAll();
      if (googleAccessToken && linkedGoogleCalendarIds().length) syncGoogleCalendar(null);
    };
    modal.querySelector("#standaloneTitle").focus();
  }
  async function openNewCalendarItemModal(scopeProject, date){
    if (!scopeProject){
      openStandaloneCalendarItemModal({id:uid(), title:"", description:"", calendarType:"event", startTime:"", endTime:"", location:"", endDate:date, tagIds:[], values:{}, subitems:[], comments:[], archived:false, standalone:true, createdAt:Date.now(), updatedAt:Date.now()}, true);
      return;
    }
    const project = scopeProject;
    if (!project) return;
    const dateField = dateFields(project)[0];
    if (!dateField){ await showNotice("Date column required", `Add a date column to ${project.name} before creating calendar items.`); return; }
    const group = project.groups[0];
    openItemRef = {projectId:project.id, groupId:group.id, itemId:null, isNew:true, globalNew:!scopeProject, draft:{
      id:uid(), title:"", description:"", calendarType:"event", startTime:"09:00", endTime:"10:00", location:"", endDate:date,
      tagIds:[], values:{[dateField.id]:date}, subitems:[], comments:[], archived:false, createdAt:Date.now(), updatedAt:Date.now()
    }};
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.id = "itemOverlay";
    overlay.innerHTML = `<div class="Overlay Overlay--size-medium position-relative" data-modal id="itemModal"></div>`;
    overlay.addEventListener("click", event=>{ if (event.target===overlay) closeItemModal(); });
    document.body.appendChild(overlay);
    renderItemModal();
  }
  function renderCalendar(board, scopeProject){
    const wrap = document.createElement("div");
    wrap.className = "calendarWrap";
    const entries = calendarEntries(scopeProject);
    const year = calendarCursor.getFullYear();
    const month = calendarCursor.getMonth();
    const monthLabel = calendarCursor.toLocaleDateString(undefined,{month:"long",year:"numeric"});
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const today = todayStr(0);
    const cells = [];
    for (let index=0; index<42; index++){
      const dayOffset = index - firstDay;
      const cell = new Date(year, month, dayOffset + 1);
      const dateNumber = cell.getDate();
      const cellDate = calendarDateKey(cell);
      const inMonth = dayOffset >= 0 && dayOffset < daysInMonth;
      const dayEntries = entries.filter(entry=>cellDate>=entry.date && cellDate<=entry.endDate && itemMatchesFilter(entry.project, entry.item));
      const eventHtml = dayEntries.map((entry,index)=>`
        <div class="calendarEvent ${entry.item.calendarType==="event"?"event":"task"}" draggable="true" data-pid="${entry.project ? entry.project.id : ""}" data-gid="${entry.group ? entry.group.id : ""}" data-iid="${entry.item.id}" data-fid="${entry.field.id}" data-start="${entry.date}" data-end="${entry.endDate}">
          <span class="eventDot"></span><span class="eventTitle">${entry.item.startTime ? escapeHtml(entry.item.startTime+" ") : ""}${escapeHtml(entry.item.title)}</span>
          ${scopeProject || !entry.project ? "" : `<span class="eventProject">${escapeHtml(entry.project.name)}</span>`}
          <a class="gcalLink" href="${escapeHtml(googleCalendarUrl(entry))}" target="_blank" rel="noopener" title="Add to Google Calendar">GCal</a>
        </div>`).join("");
      cells.push(`<div class="calendarDay${inMonth?"":" muted"}${cellDate===today?" today":""}" data-date="${cellDate}"><div class="calendarDayNumber">${dateNumber}</div>${eventHtml}</div>`);
    }
    wrap.innerHTML = `<div class="calendarToolbar">
      <button class="btn btn-sm" data-calendar-action="prev" aria-label="Previous month">‹</button>
      <button class="btn btn-sm" data-calendar-action="today">Today</button>
      <button class="btn btn-sm" data-calendar-action="next" aria-label="Next month">›</button>
      <h3>${monthLabel}</h3>
      <span class="filterSummary">${scopeProject ? escapeHtml(scopeProject.name) : "All projects"}</span>
      <button class="btn btn-sm" data-calendar-action="new">+ New</button>
      <button class="btn btn-sm" data-calendar-action="ics">Export .ics</button>
      ${scopeProject ? "" : `<button class="btn btn-sm" data-calendar-action="integrations"><iconify-icon icon="mdi:link-variant" style="vertical-align:-2px;margin-right:4px;"></iconify-icon>Link calendars</button><button class="btn btn-sm btn-primary" data-calendar-action="google"><iconify-icon icon="mdi:sync" style="vertical-align:-2px;margin-right:4px;"></iconify-icon>Sync now</button><span class="calendarSyncStatus" data-calendar-sync-status></span>`}
    </div><div class="calendarGrid"><div class="calendarWeekday">Sun</div><div class="calendarWeekday">Mon</div><div class="calendarWeekday">Tue</div><div class="calendarWeekday">Wed</div><div class="calendarWeekday">Thu</div><div class="calendarWeekday">Fri</div><div class="calendarWeekday">Sat</div>${cells.join("")}</div>`;
    updateGoogleCalendarButtons();
    wrap.querySelector('[data-calendar-action="prev"]').onclick = () => { calendarCursor = new Date(year, month-1, 1); renderMain(); };
    wrap.querySelector('[data-calendar-action="next"]').onclick = () => { calendarCursor = new Date(year, month+1, 1); renderMain(); };
    wrap.querySelector('[data-calendar-action="today"]').onclick = () => { const now = new Date(); calendarCursor = new Date(now.getFullYear(), now.getMonth(), 1); renderMain(); };
    wrap.querySelector('[data-calendar-action="new"]').onclick = () => openNewCalendarItemModal(scopeProject, todayStr(0));
    wrap.querySelector('[data-calendar-action="ics"]').onclick = () => exportCalendarIcs(scopeProject);
    const integrationsButton = wrap.querySelector('[data-calendar-action="integrations"]');
    if (integrationsButton) integrationsButton.onclick = navigateToIntegrations;
    const googleButton = wrap.querySelector('[data-calendar-action="google"]');
    if (googleButton) googleButton.onclick = () => connectGoogleCalendar(null);
    updateGoogleCalendarStatus();
    wrap.querySelectorAll(".calendarDay").forEach(day=>{
      day.addEventListener("click", event=>{
        if (event.target.closest(".calendarEvent")) return;
        if (!day.classList.contains("muted")) openNewCalendarItemModal(scopeProject, day.dataset.date);
      });
      day.addEventListener("dragover", event=>{ event.preventDefault(); day.classList.add("dragover"); });
      day.addEventListener("dragleave", ()=>day.classList.remove("dragover"));
      day.addEventListener("drop", event=>{
        event.preventDefault(); day.classList.remove("dragover");
        const data = JSON.parse(event.dataTransfer.getData("text/plain"));
        const item = data.pid
          ? getItem(data.pid,data.gid,data.iid)
          : (state.calendarItems||[]).find(candidate=>candidate.id===data.iid);
        if (!item) return;
        if (data.fid === "__schedule__") item.endDate = day.dataset.date;
        else item.values[data.fid] = day.dataset.date;
        const start = new Date(`${data.start}T00:00:00`);
        const end = new Date(`${data.end}T00:00:00`);
        const duration = Math.max(0, Math.round((end-start)/86400000));
        item.endDate = calendarDateKey(new Date(new Date(`${day.dataset.date}T00:00:00`).getTime() + duration*86400000));
        item.updatedAt = Date.now();
        scheduleSave(); renderMain();
      });
    });
    wrap.querySelectorAll(".calendarEvent").forEach(event=>{
      event.addEventListener("dragstart", dragEvent=>{
        dragEvent.dataTransfer.setData("text/plain", JSON.stringify({pid:event.dataset.pid,gid:event.dataset.gid,iid:event.dataset.iid,fid:event.dataset.fid,start:event.dataset.start,end:event.dataset.end}));
      });
      event.onclick = click => {
        if (click.target.closest("a")) return;
        if (event.dataset.pid) openItemModal(event.dataset.pid,event.dataset.gid,event.dataset.iid);
        else {
          const item = (state.calendarItems||[]).find(candidate=>candidate.id===event.dataset.iid);
          if (item) openStandaloneCalendarItemModal(item);
        }
      };
    });
    board.appendChild(wrap);
  }

  /* ---------- Overview ---------- */
  function renderOverview(board){
    const wrap = document.createElement("div");
    wrap.className = "overviewWrap";
    const flat = allItemsFlat();
    const isDoneGroup = g => g.name.trim().toLowerCase()==="done";
    const openItems = flat.filter(r=>!isDoneGroup(r.group) && !r.item.archived);
    function dueOf(r){ const f = dateFields(r.project)[0]; return f ? (r.item.values[f.id]||"") : ""; }
    function priorityOf(r){ const f = priorityField(r.project); return f ? (r.item.values[f.id]||"") : ""; }
    const overdue = openItems.filter(r=> dueOf(r) && dueOf(r) < todayStr(0)).sort((a,b)=> dueOf(a) < dueOf(b) ? -1 : 1);
    const soon = openItems.filter(r=> dueOf(r) && dueOf(r) >= todayStr(0) && dueOf(r) <= todayStr(7)).sort((a,b)=> dueOf(a) < dueOf(b) ? -1 : 1);
    const recent = [...flat].sort((a,b)=> b.item.updatedAt - a.item.updatedAt).slice(0,6);
    const archivedCount = flat.filter(r=>r.item.archived).length;
    const activeOpen = openItems.filter(r=>!r.item.archived);

    function priorityBreakdownHtml(){
      const counts = {high:0, medium:0, low:0, none:0};
      activeOpen.forEach(r=>{
        const p = priorityOf(r);
        if (p==="high"||p==="medium"||p==="low") counts[p]++; else counts.none++;
      });
      const max = Math.max(1, ...Object.values(counts));
      const rows = [
        {label:"High", key:"high", color:"var(--color-danger-fg)"},
        {label:"Medium", key:"medium", color:"var(--color-attention-fg)"},
        {label:"Low", key:"low", color:"var(--color-fg-muted)"},
        {label:"No priority", key:"none", color:"var(--faint)"},
      ];
      const body = rows.map(row=>`<div class="barRow">
        <span class="barLabel">${row.label}</span>
        <div class="barTrack"><div class="barFill" style="width:${(counts[row.key]/max*100)}%;background:${row.color};"></div></div>
        <span class="barCount">${counts[row.key]}</span>
      </div>`).join("");
      return `<div class="ovSection"><div class="ovSectionTitle">Open items by priority</div>${body}</div>`;
    }
    function projectBreakdownHtml(){
      if (!state.projects.length) return "";
      const counts = state.projects.map(p=>({
        name:p.name,
        count:p.groups.reduce((n,g)=>n+g.items.filter(it=>!it.archived).length,0)
      }));
      const max = Math.max(1, ...counts.map(c=>c.count));
      const body = counts.map(c=>`<div class="barRow">
        <span class="barLabel" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</span>
        <div class="barTrack"><div class="barFill" style="width:${(c.count/max*100)}%;background:var(--accent);"></div></div>
        <span class="barCount">${c.count}</span>
      </div>`).join("");
      return `<div class="ovSection"><div class="ovSectionTitle">Items by project</div>${body}</div>`;
    }

    function rowHtml(r, showDue){
      const pf = priorityField(r.project);
      const dot = pf ? fieldChipHtml(pf, priorityOf(r)) : "";
      return `<div class="ovRow" data-pid="${r.project.id}" data-gid="${r.group.id}" data-iid="${r.item.id}">
        <div class="rowLeft">${dot}<span class="t">${escapeHtml(r.item.title)}</span></div>
        <span class="path">${showDue && dueOf(r) ? fmtDate(dueOf(r))+" · " : `Updated ${formatUpdatedAt(r.item.updatedAt)} · `}${escapeHtml(r.project.name)} / ${escapeHtml(r.group.name)}</span>
      </div>`;
    }
    function section(title, rows, showDue, emptyMsg){
      const body = rows.length ? rows.map(r=>rowHtml(r,showDue)).join("") : `<div class="ovEmpty">${emptyMsg}</div>`;
      return `<div class="ovSection"><div class="ovSectionTitle">${title}</div>${body}</div>`;
    }

    wrap.innerHTML = `
      <div class="overviewStats">
        <div class="overviewStat"><div class="h2">${state.projects.length}</div><div class="color-fg-muted text-small">Projects</div></div>
        <div class="overviewStat"><div class="h2">${openItems.length}</div><div class="color-fg-muted text-small">Open items</div></div>
        <div class="overviewStat"><div class="h2">${overdue.length}</div><div class="color-fg-muted text-small">Overdue</div></div>
        <div class="overviewStat"><div class="h2">${soon.length}</div><div class="color-fg-muted text-small">Due in 7 days</div></div>
        <div class="overviewStat"><div class="h2">${archivedCount}</div><div class="color-fg-muted text-small">Archived</div></div>
      </div>
      <div class="overviewColumns">
        <div class="overviewMain">
          ${section("Overdue", overdue, true, "Nothing overdue.")}
          ${section("Due soon", soon, true, "Nothing due in the next 7 days.")}
          ${section("Recently updated", recent, false, "Nothing yet - add a project to get started.")}
        </div>
        <aside class="overviewAside">
          ${priorityBreakdownHtml()}
          ${projectBreakdownHtml()}
        </aside>
      </div>
    `;
    wrap.querySelectorAll(".ovRow[data-iid]").forEach(el=>{
      el.onclick = () => {
        activeProjectId = el.dataset.pid;
        persistActiveLocation();
        renderAll();
        openItemModal(el.dataset.pid, el.dataset.gid, el.dataset.iid);
      };
    });
    board.appendChild(wrap);
  }

  /* ---------- Item modal ---------- */
  function openItemModal(pid, gid, iid){
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
  function showDialog({title, message="", fields=[], confirmLabel="Continue", secondaryLabel="", danger=false, cancelLabel="Cancel"}){
    return new Promise(resolve=>{
      const overlay = document.createElement("div");
      overlay.className = "overlay";
      overlay.id = "dialogOverlay";
      const fieldsHtml = fields.map((field,index)=>{
        const id = `dialogField${index}`;
        const label = field.label ? `<label for="${id}">${escapeHtml(field.label)}</label>` : "";
        if (field.type === "select"){
          const options = (field.options||[]).map(option=>
            `<option value="${escapeHtml(option.value)}" ${option.value===field.value?"selected":""}>${escapeHtml(option.label)}</option>`).join("");
          return `<div class="modalRow">${label}<select class="form-control" id="${id}">${options}</select></div>`;
        }
        const type = field.type === "textarea" ? "textarea" : "input";
        const control = type === "textarea"
          ? `<textarea class="form-control" id="${id}" placeholder="${escapeHtml(field.placeholder||"")}">${escapeHtml(field.value||"")}</textarea>`
          : `<input class="form-control" id="${id}" type="text" placeholder="${escapeHtml(field.placeholder||"")}" value="${escapeHtml(field.value||"")}">`;
        return `<div class="modalRow">${label}${control}</div>`;
      }).join("");
      overlay.innerHTML = `<div class="Overlay Overlay--size-medium position-relative" data-modal role="dialog" aria-modal="true">
        <button class="btn btn-invisible closeX" data-dialog-cancel aria-label="Close">✕</button>
        <h3>${escapeHtml(title)}</h3>
        ${message ? `<p class="dialogMessage">${escapeHtml(message)}</p>` : ""}
        ${fieldsHtml}
        <div class="modalFooter">
          <button class="btn btn-invisible" data-dialog-cancel>${escapeHtml(cancelLabel)}</button>
          ${secondaryLabel ? `<button class="btn" data-dialog-secondary>${escapeHtml(secondaryLabel)}</button>` : ""}
          <button class="btn ${danger?"btn-danger":"btn-primary"} btn-sm" data-dialog-confirm>${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`;
      document.body.appendChild(overlay);
      const finish = value => { overlay.remove(); resolve(value); };
      overlay.querySelectorAll("[data-dialog-cancel]").forEach(button=>button.onclick=()=>finish(null));
      const secondary = overlay.querySelector("[data-dialog-secondary]");
      if (secondary) secondary.onclick = () => finish("__secondary__");
      overlay.querySelector("[data-dialog-confirm]").onclick = () => {
        const values = fields.map((field,index)=>overlay.querySelector(`#dialogField${index}`).value);
        finish(values.length===1 ? values[0] : values.length ? values : "__confirm__");
      };
      overlay.addEventListener("click", event=>{ if (event.target===overlay) finish(null); });
      const first = overlay.querySelector("input, textarea, select");
      if (first) first.focus();
    });
  }
  function showNotice(title, message){
    return showDialog({title, message, confirmLabel:"OK", cancelLabel:"Close", fields:[]});
  }
  function showConfirm(title, message, danger=false){
    return showDialog({title, message, confirmLabel:danger?"Delete":"Continue", danger});
  }
  function fieldInputHtml(field, item){
    const val = item.values[field.id] || "";
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
    if (field.type==="date"){
      return `<div class="sideItem"><div class="sideItemLabel">${escapeHtml(field.label)}</div><input type="date" class="form-control fieldInput" data-fieldid="${field.id}" value="${val}"></div>`;
    }
    return `<div class="sideItem"><div class="sideItemLabel">${escapeHtml(field.label)}</div><input type="text" class="form-control fieldInput" data-fieldid="${field.id}" value="${escapeHtml(val)}"></div>`;
  }
  function renderItemModal(){
    if (!openItemRef) return;
    const {projectId,groupId,itemId} = openItemRef;
    const isNew = !!openItemRef.isNew;
    const project = getProject(projectId);
    const item = isNew ? openItemRef.draft : getItem(projectId, groupId, itemId);
    const modal = document.getElementById("itemModal");
    if (!item || !modal) { closeItemModal(); return; }

    const projectOptions = isNew && openItemRef.globalNew ? `<div class="sideItem"><div class="sideItemLabel">Project</div><select class="form-control" id="itemProjectSelect">${state.projects.map(candidate=>`<option value="${candidate.id}" ${candidate.id===projectId?"selected":""}>${escapeHtml(candidate.name)}</option>`).join("")}</select></div>` : "";
    const groupOptions = project.groups.map(g=>
      `<option value="${g.id}" ${g.id===groupId?"selected":""}>${escapeHtml(g.name)}</option>`).join("");

    const doneSubCount = item.subitems.filter(s=>s.done).length;
    const subPct = item.subitems.length ? Math.round(doneSubCount/item.subitems.length*100) : 0;
    const subitemsHtml = item.subitems.map(s=>`
      <div class="subitemRow ${s.done?"done":""}" data-sid="${s.id}">
        <input type="checkbox" ${s.done?"checked":""} data-action="toggleSub">
        <span class="subitemTitle" contenteditable="true" data-action="editSub">${escapeHtml(s.title)}</span>
        <button class="btn btn-invisible btn-sm" data-action="delSub">✕</button>
      </div>`).join("");

    const tagChips = project.tags.map(t=>tagDotHtml(t, item.tagIds.includes(t.id))).join("");
    const fieldsHtml = project.fields.map(f=>fieldInputHtml(f, item)).join("");
    const hasSchedule = !!(item.startTime || item.endTime || item.endDate);
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

    modal.innerHTML = `
      <button class="btn btn-invisible closeX" data-action="close">✕</button>
      <div class="itemModalHeader">
        <input class="form-control" type="text" id="itemTitleInput" placeholder="Item title" value="${escapeHtml(item.title)}">
      </div>
      <div class="itemModalBody">
        <div class="itemModalMain">
          <div class="mainSection">
            <div class="mainSectionLabel">Description</div>
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
            <div class="mainSectionLabel">Comments</div>
            <div id="commentsList">${commentsHtml}</div>
            <div style="display:flex;gap:6px;">
              <input class="form-control" type="text" id="newCommentInput" placeholder="Add a comment..." style="flex:1;">
              <button class="btn btn-sm" data-action="addComment">Add</button>
            </div>
          </div>` : ""}
        </div>
        <div class="itemModalSidebar">
          ${projectOptions}
          <div class="sideItem">
            <div class="sideItemLabel">Group</div>
            <select class="form-control" id="itemGroupSelect">${groupOptions}</select>
          </div>
          <div class="sideItem">
            <div class="sideItemLabel">Type</div>
            <div class="typeTabs" id="itemCalendarType">
              <button type="button" data-calendar-type="task" class="${item.calendarType!=="event"?"active":""}">Task</button>
              <button type="button" data-calendar-type="event" class="${item.calendarType==="event"?"active":""}">Event</button>
            </div>
          </div>
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
      <div class="itemModalFooter">
        <span class="itemModalFooterNote">${isNew ? "New item" : `Updated ${escapeHtml(formatDateTime(item.updatedAt))}`}</span>
        <div style="display:flex;gap:8px;">
          ${isNew ? `<button class="btn btn-primary btn-sm" data-action="saveItem">Add item</button>` : `
            <button class="btn btn-invisible btn-sm" data-action="toggleArchive">${item.archived ? "Unarchive" : "Archive"}</button>
            <button class="btn btn-danger btn-sm" data-action="deleteItem">Delete item</button>`}
        </div>
      </div>
    `;

    modal.querySelector('[data-action="close"]').onclick = closeItemModal;
    if (isNew && openItemRef.globalNew){
      modal.querySelector("#itemProjectSelect").addEventListener("change", e=>{
        const nextProject = getProject(e.target.value);
        const nextGroup = nextProject.groups[0];
        const nextDateField = dateFields(nextProject)[0];
        if (!nextDateField){ showNotice("Date column required", `Add a date column to ${nextProject.name} before creating calendar items.`); return; }
        openItemRef.projectId = nextProject.id;
        openItemRef.groupId = nextGroup.id;
        openItemRef.draft.values = {[nextDateField.id]:openItemRef.draft.values[Object.keys(openItemRef.draft.values)[0]] || todayStr(0)};
        renderItemModal();
      });
    }
    modal.querySelector("#itemTitleInput").addEventListener("change", e=>{
      item.title = e.target.value.trim() || item.title;
      if (isNew) return;
      item.updatedAt = Date.now(); scheduleSave(); renderMain(); renderItemModal();
    });
    modal.querySelector("#itemGroupSelect").addEventListener("change", e=>{
      const newGid = e.target.value;
      if (isNew){ openItemRef.groupId = newGid; return; }
      if (newGid !== groupId){
        moveItem(projectId, groupId, newGid, itemId, null);
        openItemRef.groupId = newGid;
      }
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
        modal.querySelectorAll("[data-calendar-type]").forEach(tab=>tab.classList.toggle("active", tab===button));
        if (isNew) return;
        item.updatedAt = Date.now(); scheduleSave(); renderMain(); renderItemModal();
      };
    });
    ["itemLocationInput","itemStartTimeInput","itemEndTimeInput","itemEndDateInput"].forEach(id=>{
      const input = modal.querySelector("#"+id);
      if (!input) return;
      input.addEventListener("change", e=>{
        if (id==="itemCalendarType") item.calendarType = e.target.value;
        if (id==="itemLocationInput") item.location = e.target.value.trim();
        if (id==="itemStartTimeInput") item.startTime = e.target.value;
        if (id==="itemEndTimeInput") item.endTime = e.target.value;
        if (id==="itemEndDateInput"){
          if (item.endDate && !e.target.value) queueGoogleEventDeletes(item);
          item.endDate = e.target.value;
        }
        if (isNew){ renderItemModal(); return; }
        item.updatedAt = Date.now(); scheduleSave(); renderMain(); renderItemModal();
      });
    });
    modal.querySelectorAll(".fieldInput").forEach(el=>{
      el.addEventListener("change", e=>{
        const field = project.fields.find(candidate=>candidate.id===el.dataset.fieldid);
        if (field?.type==="date" && item.values[el.dataset.fieldid] && !e.target.value) queueGoogleEventDeletes(item);
        item.values[el.dataset.fieldid] = e.target.value;
        if (isNew){ renderItemModal(); return; }
        item.updatedAt = Date.now(); scheduleSave(); renderMain(); renderItemModal();
      });
    });
    modal.querySelector("#itemDescInput").addEventListener("change", e=>{
      item.description = e.target.value;
      if (isNew) return;
      item.updatedAt = Date.now(); scheduleSave(); renderMain();
    });
    modal.querySelectorAll('#itemTagChips [data-tagfilter]').forEach(chip=>{
      chip.onclick = () => {
        const tid = chip.dataset.tagfilter;
        if (item.tagIds.includes(tid)) item.tagIds = item.tagIds.filter(id=>id!==tid);
        else item.tagIds.push(tid);
        item.updatedAt = Date.now(); scheduleSave(); renderMain(); renderItemModal();
      };
    });
    modal.querySelector('[data-action="newTagFromItem"]').onclick = async () => {
      const name = await showDialog({title:"New tag", fields:[{label:"Tag name", placeholder:"e.g. urgent"}], confirmLabel:"Create tag"});
      if (name && name.trim()){
        const t = createTag(project, name.trim());
        item.tagIds.push(t.id);
        scheduleSave(); renderSidebarTags(); renderMain(); renderItemModal();
      }
    };
    modal.querySelector('[data-action="addSub"]').onclick = async () => {
      const title = await showDialog({title:"New subitem", fields:[{label:"Subitem", placeholder:"Break this item into a step"}], confirmLabel:"Add subitem"});
      if (title && title.trim()){
        item.subitems.push({id:uid(), title:title.trim(), done:false});
        item.updatedAt = Date.now(); scheduleSave(); renderMain(); renderItemModal();
      }
    };
    modal.querySelectorAll(".subitemRow").forEach(row=>{
      const sid = row.dataset.sid;
      const sub = item.subitems.find(s=>s.id===sid);
      row.querySelector('[data-action="toggleSub"]').addEventListener("change", e=>{
        sub.done = e.target.checked;
        item.updatedAt = Date.now(); scheduleSave(); renderMain(); renderItemModal();
      });
      row.querySelector('[data-action="editSub"]').addEventListener("blur", e=>{
        sub.title = e.target.textContent.trim() || sub.title;
        item.updatedAt = Date.now(); scheduleSave(); renderMain();
      });
      row.querySelector('[data-action="delSub"]').onclick = () => {
        item.subitems = item.subitems.filter(s=>s.id!==sid);
        item.updatedAt = Date.now(); scheduleSave(); renderMain(); renderItemModal();
      };
    });
    if (!isNew){
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
      const archiveBtn = modal.querySelector('[data-action="toggleArchive"]');
      if (archiveBtn) archiveBtn.onclick = () => { toggleArchiveItem(projectId, groupId, itemId); renderItemModal(); };
    }
    if (isNew){
      modal.querySelector('[data-action="saveItem"]').onclick = () => {
        const title = item.title.trim();
        const targetProject = getProject(openItemRef.projectId);
        const targetGroup = getGroup(openItemRef.projectId, openItemRef.groupId) || targetProject.groups[0];
        if (!title || !targetProject || !targetGroup) return;
        item.title = title;
        item.updatedAt = Date.now();
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

  /* ---------- Global search ---------- */
  function runGlobalSearch(q){
    const box = document.getElementById("searchResults");
    if (!q){ box.style.display="none"; box.innerHTML=""; return; }
    const query = q.toLowerCase();
    const results = [];
    state.projects.forEach(p=>{
      if (p.name.toLowerCase().includes(query)) results.push({type:"Project", label:p.name, path:p.name, pid:p.id});
      p.groups.forEach(g=>{
        if (g.name.toLowerCase().includes(query)) results.push({type:"Group", label:g.name, path:p.name, pid:p.id});
        g.items.forEach(it=>{
          const tagNames = it.tagIds.map(tid=>tagById(p,tid)?.name||"").join(" ");
          const hay = [it.title, it.description, tagNames, ...it.subitems.map(s=>s.title), ...Object.values(it.values)].join(" ").toLowerCase();
          if (hay.includes(query)) results.push({type:"Item", label:it.title, path:`${p.name} / ${g.name}`, pid:p.id, gid:g.id, iid:it.id});
        });
      });
    });
    if (!results.length){ box.style.display="block"; box.innerHTML = `<div class="res">No matches</div>`; return; }
    box.style.display = "block";
    box.innerHTML = results.slice(0,40).map((r,idx)=>
      `<div class="res" data-idx="${idx}"><div>${escapeHtml(r.label)}</div><div class="path">${escapeHtml(r.path)}</div></div>`
    ).join("");
    [...box.querySelectorAll(".res")].forEach((el,idx)=>{
      el.onclick = () => {
        const r = results[idx];
        if (!r.pid) return;
        selectProject(r.pid);
        box.style.display = "none";
        document.getElementById("globalSearch").value = "";
        if (r.type==="Item") openItemModal(r.pid, r.gid, r.iid);
      };
    });
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
    document.getElementById("gateNewBtn").onclick = createNewFile;
    document.getElementById("gateOpenBtn").onclick = openExistingFile;
    document.getElementById("gateReconnectBtn").onclick = reconnectPendingFile;
    document.getElementById("gateLegacyBtn").onclick = migrateLegacyBrowserData;
  }
  function wireStaticControls(){
    const projectCreateMenu = document.getElementById("projectCreateMenu");
    const projectCreateBtn = document.getElementById("projectCreateBtn");
    const closeProjectCreateMenu = () => {
      projectCreateMenu.classList.remove("open");
      projectCreateBtn.classList.remove("active");
      projectCreateBtn.setAttribute("aria-expanded", "false");
    };
    document.getElementById("overviewNav").onclick = () => {
      activeProjectId = OVERVIEW; persistActiveLocation(); renderAll(); closeSidebarOnMobile();
    };
    document.getElementById("calendarNav").onclick = () => {
      activeProjectId = CALENDAR; persistActiveLocation(); renderAll(); closeSidebarOnMobile();
    };
    document.getElementById("integrationsNav").onclick = () => {
      navigateToIntegrations();
    };
    document.getElementById("settingsNav").onclick = navigateToSettings;
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
    document.getElementById("syncMenuBtn").onclick = event => {
      event.stopPropagation();
      const menu = document.getElementById("syncMenu");
      const open = menu.classList.toggle("open");
      event.currentTarget.classList.toggle("active", open);
    };
    document.getElementById("syncMenu").addEventListener("click", event=>{
      if (event.target.closest("button")){
        document.getElementById("syncMenu").classList.remove("open");
        document.getElementById("syncMenuBtn").classList.remove("active");
      }
    });
    document.addEventListener("click", event=>{
      if (!event.target.closest("#projectMenuWrap")){
        document.getElementById("projectMenu").classList.remove("open");
        document.getElementById("projectMenuBtn").classList.remove("active");
      }
      if (!event.target.closest(".projectCreateWrap")) closeProjectCreateMenu();
      if (!event.target.closest(".syncMenuWrap")){
        document.getElementById("syncMenu").classList.remove("open");
        document.getElementById("syncMenuBtn").classList.remove("active");
      }
    });
    document.getElementById("addProjectBtn").onclick = async () => {
      const templateOptions = Object.entries(PROJECT_TEMPLATES).map(([value,tpl])=>({value,label:tpl.label}));
      const result = await showDialog({title:"New project", fields:[
        {label:"Project name", placeholder:"e.g. Marketing launch"},
        {label:"Template", type:"select", options:templateOptions, value:"taskboard"}
      ], confirmLabel:"Create project"});
      if (!result) return;
      const [name, templateKey] = result;
      if (name && name.trim()) addProject(name.trim(), templateKey);
    };
    document.getElementById("addFolderBtn").onclick = createFolder;
    document.getElementById("manageTagsBtn").onclick = async () => {
      const project = getProject(activeProjectId);
      if (!project) return;
      const list = project.tags.map(t=>t.name).join(", ") || "(none yet)";
      const action = await showDialog({title:`Manage tags in ${project.name}`, message:`Current tags: ${list}`, fields:[{label:"Tag to delete", placeholder:"Enter an exact tag name"}], confirmLabel:"Continue"});
      if (action && action.trim()){
        const t = project.tags.find(t=>t.name.toLowerCase()===action.trim().toLowerCase());
        if (t && await showConfirm(`Delete tag ${t.name}`, "This removes the tag from all items in this project.", true)) deleteTag(project, t.id);
        else if (!t) showNotice("Tag not found", "No tag with that name exists in this project.");
      }
    };
    document.getElementById("globalSearch").addEventListener("input", e=> runGlobalSearch(e.target.value.trim()));
    document.addEventListener("click", (e)=>{
      if (!e.target.closest("#sidebarWrap")) document.getElementById("searchResults").style.display="none";
    });
    document.getElementById("boardSearch").addEventListener("input", e=>{
      boardFilterText = e.target.value.trim(); renderMain();
    });
    document.getElementById("clearBoardFilters").onclick = () => {
      boardFilterText=""; boardFilterTags.clear(); boardFilterFields.clear();
      renderMain();
    };
    document.getElementById("showArchivedToggle").addEventListener("change", e=>{
      showArchived = e.target.checked;
      renderMain();
    });
    document.getElementById("printViewBtn").onclick = () => {
      document.getElementById("projectMenu").classList.remove("open");
      document.getElementById("projectMenuBtn").classList.remove("active");
      window.print();
    };
    document.getElementById("shortcutsBtn").onclick = showShortcutsModal;
    document.getElementById("focusTimerBtn").onclick = () => {
      document.getElementById("focusTimerPanel").classList.toggle("open");
    };
    document.getElementById("focusStartBtn").onclick = () => {
      if (focusInterval) pauseFocusTimer(); else startFocusTimer();
    };
    document.getElementById("focusResetBtn").onclick = resetFocusTimer;
    document.querySelectorAll("[data-focus-preset]").forEach(btn=>{
      btn.onclick = () => {
        pauseFocusTimer();
        focusTotal = Number(btn.dataset.focusPreset) * 60;
        focusSeconds = focusTotal;
        renderFocusTimer();
      };
    });
    document.getElementById("toggleFilters").onclick = () => {
      const panel = document.getElementById("filterPanel");
      const button = document.getElementById("toggleFilters");
      const isOpen = panel.classList.toggle("open");
      button.classList.toggle("active", isOpen);
    };
    document.getElementById("sidebarToggle").onclick = toggleSidebar;
    document.getElementById("sidebarScrim").onclick = closeSidebarOnMobile;
    document.getElementById("sidebarCollapseHandle").onclick = toggleSidebarCollapsed;
    document.getElementById("undoBtn").onclick = undoLastChange;
    document.getElementById("switchFileBtn").onclick = switchFile;
    document.getElementById("newFileBtn").onclick = startNewFileFromMenu;
    document.getElementById("exportBtn").onclick = exportJSON;
    document.getElementById("importBtn").onclick = () => document.getElementById("fileImportInput").click();
    document.getElementById("restoreBackupBtn").onclick = restoreMigrationBackup;
    document.getElementById("fileImportInput").addEventListener("change", e=>{
      if (e.target.files[0]) importJSON(e.target.files[0]);
      e.target.value = "";
    });
    document.addEventListener("keydown", e=>{
      if (e.key==="Escape"){
        const overlays = document.querySelectorAll(".overlay");
        if (overlays.length){
          const top = overlays[overlays.length-1];
          if (top.id==="itemOverlay") openItemRef = null;
          top.remove();
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
      if (e.key==="d"){ e.preventDefault(); toggleTheme(); return; }
      if (e.key==="["){ e.preventDefault(); toggleSidebarCollapsed(); return; }
      if (e.key==="t"){ e.preventDefault(); document.getElementById("focusTimerPanel").classList.toggle("open"); return; }
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
  async function boot(){
    initTheme();
    initSidebarCollapse();
    wireStaticControls();
    wireConnectGate();
    initAuth(); // no-op / stays hidden if no provider is available - see "Auth" section above
    const reconnected = await tryReconnectFile();
    document.getElementById("restoreBackupBtn").style.display = hasMigrationBackup() ? "block" : "none";
    if (reconnected){
      restoreActiveLocation();
      renderAll();
      resumeGoogleCalendarSync();
      await maybeShowMigrationNotice();
    } else {
      showConnectGate();
    }
  }
  boot();
