  "use strict";

  /* ---------- Constants ---------- */
  const uid = () => crypto.randomUUID();
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
  const FIELD_TYPES = ["priority","select","date","text"];
  const THEME_KEY = "personal_dashboard_theme_v1";
  const TIME_FORMAT_KEY = "personal_dashboard_time_format_v1";
  const SIDEBAR_KEY = "personal_dashboard_sidebar_collapsed_v1";
  const LOCATION_KEY = "personal_dashboard_location_v1";
  const FEEDBACK_URL = "https://github.com/shrestha-bishal/beforework/issues";
  const GITHUB_SPONSORS_URL = "https://github.com/sponsors/shrestha-bishal";
  const BUY_ME_A_COFFEE_URL = "https://www.buymeacoffee.com/shresthabishal";
  const GOOGLE_CLIENT_ID = "1082047072334-rovrplv89dp521ue1qra4dl3v8jqe1qu.apps.googleusercontent.com";
  const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly";

  let state = null;                 // { projects:[] }
  let settingsView = null;
  let overviewDetailsView = null;
  let showArchived = false;
  let focusInterval = null;
  let focusMode = "focus";
  let focusSeconds = 25*60;
  let focusTotal = 25*60;
  let focusDuration = 25*60;
  let breakDuration = 5*60;
  let focusSessionStartedAt = null;
  let focusSessionProjectId = null;
  let focusSessionElapsedSeconds = 0;
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
    taskboard:{label:"Project / task management",  views:["list","kanban","calendar"], fields:["priority","due"], groups:["To do","In progress","Review"]},
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
  let boardFilterGroups = new Set();
  let boardFilterTags = new Set();
  let boardFilterFields = new Map(); // fieldId -> "__all__" | "__none__" | optionId
  let activeFilterCategory = "groupFilters";
  let completionFilter = "open";
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

  /* ---------- Focus timer ---------- */
  function renderFocusTimer(){
    const disp = document.getElementById("focusTimerDisplay");
    if (!disp) return;
    const m = Math.floor(focusSeconds/60), s = focusSeconds%60;
    disp.textContent = `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
    document.title = focusInterval ? `${disp.textContent} · Beforework` : "Beforework";
  }
  function clearFocusSessionTracking(){
    focusSessionStartedAt = null;
    focusSessionProjectId = null;
    focusSessionElapsedSeconds = 0;
  }
  function recordCompletedFocusSession(){
    if (focusSessionElapsedSeconds>0){
      const completedAt = Date.now();
      if (!Array.isArray(state.focusSessions)) state.focusSessions = [];
      state.focusSessions.push({
        id:uid(),
        projectId:focusSessionProjectId,
        startedAt:focusSessionStartedAt || completedAt,
        completedAt,
        durationSeconds:focusSessionElapsedSeconds
      });
      scheduleSave();
      if (activeProjectId===OVERVIEW) render();
    }
    clearFocusSessionTracking();
  }
  function startFocusTimer(){
    if (focusInterval || focusSeconds<=0) return;
    if (focusMode==="focus" && focusSessionStartedAt===null){
      focusSessionStartedAt = Date.now();
      focusSessionProjectId = getProject(activeProjectId)?.id || null;
      focusSessionElapsedSeconds = 0;
    }
    focusInterval = setInterval(()=>{
      focusSeconds = Math.max(0, focusSeconds-1);
      if (focusMode==="focus") focusSessionElapsedSeconds++;
      renderFocusTimer();
      if (focusSeconds<=0){
        clearInterval(focusInterval); focusInterval=null;
        if (focusMode==="focus") recordCompletedFocusSession();
        const startBtn = document.getElementById("focusStartBtn");
        if (startBtn) startBtn.textContent = "Start";
        showNotice(focusMode==="break" ? "Break finished" : "Focus session finished", focusMode==="break" ? "Your break has finished. Start another focus session when you're ready." : "Your focus session has finished. Take a short break or start another session.");
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
    clearFocusSessionTracking();
    focusSeconds = focusTotal;
    renderFocusTimer();
  }
  function setFocusDuration(minutes){
    pauseFocusTimer();
    clearFocusSessionTracking();
    focusTotal = minutes * 60;
    if (focusMode==="focus") focusDuration = focusTotal;
    else breakDuration = focusTotal;
    focusSeconds = focusTotal;
    const input = document.getElementById("focusDurationInput");
    input.setCustomValidity("");
    input.value = "";
    input.placeholder = String(minutes);
    renderFocusTimer();
    renderFocusQuickOptions();
  }
  function renderFocusQuickOptions(){
    const container = document.getElementById("focusTimerQuickOptions");
    if (!container) return;
    const options = focusMode==="focus" ? [25,50,90] : [5,10,15];
    const currentMinutes = focusTotal/60;
    container.innerHTML = options.map(minutes=>
      `<button class="btn btn-sm${minutes===currentMinutes?" selected":""}" type="button" data-focus-quick="${minutes}" aria-label="${minutes} minute ${focusMode}" aria-pressed="${minutes===currentMinutes}">${minutes}m</button>`
    ).join("");
    container.querySelectorAll("[data-focus-quick]").forEach(button=>{
      button.onclick = () => setFocusDuration(Number(button.dataset.focusQuick));
    });
  }
  function setFocusMode(mode){
    if (mode!=="focus" && mode!=="break") return;
    if (focusMode===mode) return;
    pauseFocusTimer();
    clearFocusSessionTracking();
    focusMode = mode;
    focusTotal = mode==="focus" ? focusDuration : breakDuration;
    focusSeconds = focusTotal;
    const input = document.getElementById("focusDurationInput");
    input.value = "";
    input.placeholder = String(focusTotal/60);
    input.setCustomValidity("");
    document.querySelectorAll("[data-focus-mode]").forEach(button=>{
      const selected = button.dataset.focusMode===mode;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    renderFocusTimer();
    renderFocusQuickOptions();
  }
  function applyCustomFocusDuration(){
    const input = document.getElementById("focusDurationInput");
    const minutes = input.valueAsNumber;
    if (!Number.isInteger(minutes) || minutes<1 || minutes>180){
      input.setCustomValidity("Enter a whole number from 1 to 180.");
      input.reportValidity();
      return;
    }
    input.setCustomValidity("");
    setFocusDuration(minutes);
  }
  function toggleFocusTimer(){
    const panel = document.getElementById("focusTimerPanel");
    const open = panel.classList.toggle("open");
    const timerNav = document.getElementById("focusTimerNav");
    timerNav.classList.toggle("active", open);
    timerNav.setAttribute("aria-expanded", String(open));
    if (open){
      applySidebarCollapsed(false);
      if (window.innerWidth<=860){
        document.getElementById("sidebar").classList.add("open");
        document.getElementById("sidebarScrim").classList.add("show");
      }
    }
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

  function defaultState(){
    const now = Date.now();
    const workFolder = {id:uid(), name:"Work"};
    const personalFolder = {id:uid(), name:"Personal"};
    const makeField = (label, type, options=[]) => ({id:uid(), label, type, options});
    const makeTag = (name, colour) => ({id:uid(), name, color:colour});
    const makeItem = (title, description, values={}, options={}) => ({
      id:uid(), title, description, calendarType:options.calendarType || "task",
      startTime:options.startTime || "", endTime:options.endTime || "", location:options.location || "",
      endDate:options.endDate || "", completedAt:options.completedAt || null, tagIds:options.tagIds || [], values,
      subitems:options.subitems || [], comments:options.comments || [], archived:!!options.archived,
      createdAt:now, updatedAt:now - (options.ageDays || 0) * 86400000
    });
    const views = types => types.map(type=>({id:uid(), type, name:viewLabel(type)}));

    const roadmapPriority = makeField("Priority", "priority");
    const roadmapDue = makeField("Due date", "date");
    const roadmapStatus = makeField("Status", "select", [
      {id:uid(), label:"Planned", color:TAG_COLORS[3]},
      {id:uid(), label:"In progress", color:TAG_COLORS[5]},
      {id:uid(), label:"Ready to ship", color:TAG_COLORS[6]},
    ]);
    const featureTag = makeTag("feature", TAG_COLORS[0]);
    const urgentTag = makeTag("urgent", TAG_COLORS[1]);
    const designTag = makeTag("design", TAG_COLORS[2]);
    const roadmapViews = views(["list", "kanban", "calendar"]);
    const roadmapGroups = [
      {id:uid(), name:"To do", items:[]},
      {id:uid(), name:"In progress", items:[]},
      {id:uid(), name:"Review", items:[]}
    ];
    const roadmap = {
      id:uid(), name:"Product roadmap", folderId:workFolder.id, createdAt:now,
      tags:[featureTag, urgentTag, designTag], fields:[roadmapPriority, roadmapDue, roadmapStatus],
      views:roadmapViews, activeViewId:roadmapViews[0].id, itemDefaultType:"task", groups:roadmapGroups
    };
    roadmapGroups[0].items.push(
      makeItem("Write launch notes", "Capture the key changes and migration notes for the next release.", {[roadmapPriority.id]:"high", [roadmapDue.id]:todayStr(3), [roadmapStatus.id]:roadmapStatus.options[0].id}, {tagIds:[featureTag.id, urgentTag.id], subitems:[{id:uid(), title:"Collect screenshots", done:true}, {id:uid(), title:"Draft release notes", done:false}]}),
      makeItem("Plan onboarding flow", "Map the first five minutes for a new workspace owner.", {[roadmapPriority.id]:"medium", [roadmapDue.id]:todayStr(7), [roadmapStatus.id]:roadmapStatus.options[0].id}, {tagIds:[designTag.id], ageDays:1})
    );
    roadmapGroups[1].items.push(
      makeItem("Build recurring tasks", "Decide how repeating work should appear in list and calendar views.", {[roadmapPriority.id]:"high", [roadmapDue.id]:todayStr(1), [roadmapStatus.id]:roadmapStatus.options[1].id}, {tagIds:[featureTag.id], startTime:"10:00", endTime:"11:30", endDate:todayStr(1), comments:[{id:uid(), text:"Check the calendar edge cases before merging.", createdAt:now - 3600000}]}),
      makeItem("Refresh empty states", "Give first-time users a clear next action in each view.", {[roadmapPriority.id]:"low", [roadmapDue.id]:todayStr(5), [roadmapStatus.id]:roadmapStatus.options[1].id}, {tagIds:[designTag.id], ageDays:2})
    );
    roadmapGroups[2].items.push(
      makeItem("Add keyboard shortcuts", "Search, quick add, theme switching, and timer shortcuts are now available.", {[roadmapPriority.id]:"medium", [roadmapDue.id]:todayStr(-2), [roadmapStatus.id]:roadmapStatus.options[2].id}, {tagIds:[featureTag.id], ageDays:4}),
      makeItem("Connect local JSON storage", "Keep the workspace portable and under the user's control.", {[roadmapPriority.id]:"high", [roadmapDue.id]:todayStr(-6), [roadmapStatus.id]:roadmapStatus.options[2].id}, {tagIds:[featureTag.id, urgentTag.id], ageDays:8})
    );

    const readingStatus = makeField("Status", "select", [
      {id:uid(), label:"To read", color:TAG_COLORS[2]},
      {id:uid(), label:"Reading", color:TAG_COLORS[3]},
      {id:uid(), label:"Finished", color:TAG_COLORS[6]}
    ]);
    const readingRating = makeField("Rating", "select", [
      {id:uid(), label:"Essential", color:TAG_COLORS[1]},
      {id:uid(), label:"Useful", color:TAG_COLORS[5]},
      {id:uid(), label:"Optional", color:TAG_COLORS[7]}
    ]);
    const readingViews = views(["table", "list"]);
    const readingGroup = {id:uid(), name:"Books and essays", items:[]};
    const reading = {
      id:uid(), name:"Reading list", folderId:personalFolder.id, createdAt:now,
      tags:[makeTag("research", TAG_COLORS[0]), makeTag("ideas", TAG_COLORS[6])], fields:[readingStatus, readingRating],
      views:readingViews, activeViewId:readingViews[0].id, itemDefaultType:"task", groups:[readingGroup]
    };
    readingGroup.items.push(
      makeItem("The Design of Everyday Things", "Notes on affordances, feedback, and making complex tools easier to understand.", {[readingStatus.id]:readingStatus.options[2].id, [readingRating.id]:readingRating.options[0].id}, {ageDays:12}),
      makeItem("Thinking in Systems", "A reference for understanding feedback loops and unintended consequences.", {[readingStatus.id]:readingStatus.options[1].id, [readingRating.id]:readingRating.options[1].id}, {ageDays:3}),
      makeItem("The Manager's Path", "Keep for the next planning cycle.", {[readingStatus.id]:readingStatus.options[0].id, [readingRating.id]:readingRating.options[2].id})
    );

    const planningDate = makeField("Date", "date");
    const planningViews = views(["calendar", "list"]);
    const planningGroup = {id:uid(), name:"Schedule", items:[]};
    const planning = {
      id:uid(), name:"Team planning", folderId:workFolder.id, createdAt:now,
      tags:[makeTag("meeting", TAG_COLORS[5]), makeTag("milestone", TAG_COLORS[1])], fields:[planningDate],
      views:planningViews, activeViewId:planningViews[0].id, itemDefaultType:"event", groups:[planningGroup]
    };
    planningGroup.items.push(
      makeItem("Sprint planning", "Set priorities and confirm owners for the coming fortnight.", {[planningDate.id]:todayStr(0)}, {calendarType:"event", startTime:"09:30", endTime:"10:15", location:"Studio meeting room", endDate:todayStr(0), tagIds:[planning.tags[0].id]}),
      makeItem("Design review", "Review the new project overview and empty states.", {[planningDate.id]:todayStr(2)}, {calendarType:"event", startTime:"14:00", endTime:"15:00", location:"Video call", endDate:todayStr(2), tagIds:[planning.tags[0].id]}),
      makeItem("Release milestone", "Ship the next stable version to the public repository.", {[planningDate.id]:todayStr(10)}, {calendarType:"event", startTime:"16:00", endTime:"16:30", endDate:todayStr(10), tagIds:[planning.tags[1].id]})
    );

    const calendarItems = [
      {id:uid(), title:"Dentist appointment", description:"Routine check-up.", calendarType:"event", startTime:"08:30", endTime:"09:15", location:"Northside Dental", endDate:todayStr(4), tagIds:[], values:{}, subitems:[], comments:[], archived:false, standalone:true, createdAt:now, updatedAt:now},
      {id:uid(), title:"Weekend hike", description:"Pack water and a rain jacket.", calendarType:"event", startTime:"07:00", endTime:"11:00", location:"Mount Lofty trailhead", endDate:todayStr(6), tagIds:[], values:{}, subitems:[], comments:[], archived:false, standalone:true, createdAt:now, updatedAt:now}
    ];
    return {schemaVersion:SCHEMA_VERSION, projects:[roadmap, reading, planning], folders:[workFolder, personalFolder], calendarItems, focusSessions:[], googleDeletedEventIds:[], googleCalendarLinks:[], googleCalendarCatalog:[], googleCalendarSyncTokens:{}, googleLastSyncAt:0};
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
    // v5 -> v6: completed focus sessions are kept in the workspace file.
    6: s => {
      if (!Array.isArray(s.focusSessions)) s.focusSessions = [];
      return s;
    },
    // v6 -> v7: completion is stored on each task instead of inferred from
    // its group name. Preserve the previous Done-group state once on upgrade.
    7: s => {
      s.projects.forEach(project=>project.groups.forEach(group=>group.items.forEach(item=>{
        if (Object.prototype.hasOwnProperty.call(item,"completedAt")) return;
        const wasInDoneGroup = item.calendarType!=="event" && String(group.name||"").trim().toLowerCase()==="done";
        item.completedAt = wasInDoneGroup
          ? (Number.isFinite(item.updatedAt) ? item.updatedAt : Date.now())
          : null;
      })));
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
    if (!Array.isArray(s.focusSessions)) s.focusSessions = [];
    if (!Array.isArray(s.googleDeletedEventIds)) s.googleDeletedEventIds = [];
    if (!Array.isArray(s.googleCalendarLinks)) s.googleCalendarLinks = [];
    if (!Array.isArray(s.googleCalendarCatalog)) s.googleCalendarCatalog = [];
    if (!s.googleCalendarSyncTokens || typeof s.googleCalendarSyncTokens!=="object" || Array.isArray(s.googleCalendarSyncTokens)) s.googleCalendarSyncTokens = {};
    if (!Number.isFinite(s.googleLastSyncAt)) s.googleLastSyncAt = 0;
    s.projects.forEach(project=>project.groups.forEach(group=>group.items.forEach(item=>{
      if (!Number.isFinite(item.completedAt) || item.completedAt<=0) item.completedAt = null;
    })));
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
  function getProject(pid){ return state.projects.find(p=>p.id===pid); }
  function getGroup(pid,gid){ return getProject(pid)?.groups.find(g=>g.id===gid); }
  function getItem(pid,gid,iid){ return getGroup(pid,gid)?.items.find(i=>i.id===iid); }
  function isItemCompleted(item){
    return !!item && item.calendarType!=="event" && Number.isFinite(item.completedAt) && item.completedAt>0;
  }
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
  async function editProject(project){
    const result = await showDialog({title:"Edit project", fields:[
      {label:"Project name", value:project.name},
      {label:"Project icon", type:"iconPicker", value:project.icon || DEFAULT_PROJECT_ICON}
    ], confirmLabel:"Save"});
    if (!result) return;
    const [name,icon] = result;
    if (!name.trim()){
      await showNotice("Project name required", "Enter a name for this project.");
      return;
    }
    project.name = name.trim();
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
  async function duplicateProject(project){
    const proposedName = `${project.name} (copy)`;
    const name = await showDialog({
      title:"Duplicate project",
      message:"Groups, fields, tags, views, and items will be copied. Comments and Google Calendar sync history won't be copied. Scheduled items may sync as new events.",
      fields:[{label:"Project name", value:proposedName}],
      confirmLabel:"Duplicate"
    });
    if (!name || !name.trim()) return;

    const fieldIds = new Map();
    const optionIds = new Map();
    const tagIds = new Map();
    const groupIds = new Map();
    const viewIds = new Map();
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

    const copyItem = item=>{
      const values = {};
      Object.entries(item.values||{}).forEach(([fieldId,value])=>{
        values[fieldIds.get(fieldId)||fieldId] = optionIds.get(value)||value;
      });
      const copy = {
        ...item,
        id:uid(),
        tagIds:(item.tagIds||[]).map(id=>tagIds.get(id)).filter(Boolean),
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
      groups:groups.map(group=>({
        ...group,
        id:groupIds.get(group.id),
        items:(group.items||[]).map(copyItem)
      })),
      views:views.map(view=>({...view,id:viewIds.get(view.id)})),
      activeViewId:viewIds.get(project.activeViewId)||viewIds.get(views[0]?.id)
    };
    state.projects.push(copy);
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
    const project = getProject(pid);
    const it = {id:uid(), title, description:"", calendarType:(project && project.itemDefaultType==="event") ? "event" : "task",
      startTime:"", endTime:"", location:"", endDate:"", completedAt:null, tagIds:[], values:{}, subitems:[],
      comments:[], archived:false, createdAt:Date.now(), updatedAt:Date.now()};
    getGroup(pid,gid).items.push(it);
    scheduleSave(); render();
    return it;
  }
  function openNewItemModal(project, group){
    if (!project || !group) return;
    openItemRef = {projectId:project.id, groupId:group.id, itemId:null, isNew:true, globalNew:false, draft:{
      id:uid(), title:"", description:"", calendarType:project.itemDefaultType==="event" ? "event" : "task",
      startTime:"", endTime:"", location:"", endDate:"", completedAt:null, tagIds:[], values:{}, subitems:[], comments:[],
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
    scheduleSave(); render();
  }
  function makeDuplicateItem(source){
    const now = Date.now();
    const copy = {
      ...source,
      id:uid(),
      title:`${source.title} (copy)`,
      tagIds:[...(source.tagIds||[])],
      values:{...(source.values||{})},
      subitems:(source.subitems||[]).map(subitem=>({...subitem,id:uid(),done:false})),
      comments:[],
      archived:false,
      completedAt:null,
      createdAt:now,
      updatedAt:now
    };
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
      moving.forEach(item=>{ item.updatedAt = now; target.items.push(item); });
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
  async function addColumnFlow(project){
    const details = await showDialog({title:"Add column", fields:[
      {label:"Column name", placeholder:"e.g. Status, Type, Effort"},
      {label:"Column type", type:"select", options:FIELD_TYPES.map(value=>({value,label:value})), value:"select"}
    ], confirmLabel:"Add column"});
    if (!details) return;
    const [label,type] = details;
    if (!label || !label.trim()) return;
    await addField(project, label.trim(), FIELD_TYPES.includes(type) ? type : "select");
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
  function tagPillHtml(t, selected=false, filterable=false){
    const color = t.color || TAG_COLORS[0];
    const filterAttribute = filterable ? ` data-tagfilter="${t.id}"` : "";
    return `<span class="Label Label--secondary tagColorPill${selected?" selected":""}" style="--tag-color:${escapeHtml(color)}"${filterAttribute}>
      <span class="dot"></span>${escapeHtml(t.name)}</span>`;
  }
  function tagDotHtml(t, selected){
    return tagPillHtml(t, selected, true);
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

  function itemMatchesFilter(project, item, group){
    if (item.archived && !showArchived) return false;
    if (project && project.id===activeProjectId && isItemCompleted(item)!==(completionFilter==="completed")) return false;
    if (boardFilterGroups.size && (!group || !boardFilterGroups.has(group.id))) return false;
    if (boardFilterTags.size && ![...boardFilterTags].every(tid=>(item.tagIds||[]).includes(tid))) return false;
    for (const [fid, mode] of boardFilterFields){
      const val = (item.values||{})[fid] || "";
      if (Array.isArray(mode)){
        if (!mode.length || (val && mode.includes(val)) || (!val && mode.includes("__none__"))) continue;
        return false;
      }
      if (mode==="__all__") continue;
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
      .filter(item=>itemMatchesFilter(project, item, group))
      .forEach(item=>rows.push({item, group})));
    return rows;
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
    document.getElementById("integrationsNav").className = activeProjectId===INTEGRATIONS ? "active" : "";
    document.getElementById("settingsNav").className = activeProjectId===SETTINGS ? "active" : "";
    document.getElementById("supportNav").classList.toggle("active",activeProjectId===SUPPORT);
    const ul = document.getElementById("projectList");
    ul.innerHTML = "";
    const appendProject = (p, inFolder=false) => {
      const count = p.groups.reduce((n,g)=>n+g.items.length,0);
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
        <button type="button" data-project-action="edit">Edit</button>
        <button type="button" data-project-action="duplicate">Duplicate project</button>
        <button type="button" data-project-action="add-column">Add column</button>
        <button type="button" data-project-action="group">New group</button>
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
            await editProject(p);
          } else if (action === "duplicate") {
            await duplicateProject(p);
          } else if (action === "add-column") {
            await addColumnFlow(p);
          } else if (action === "group") {
            const name = await showDialog({title:"New group", fields:[{label:"Group name", placeholder:"e.g. In progress"}], confirmLabel:"Create group"});
            if (name && name.trim()) addGroup(p.id, name.trim());
          } else if (action === "move") {
            await moveProjectToFolder(p);
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
    const unfiled = state.projects.filter(project=>!project.folderId || !state.folders.some(folder=>folder.id===project.folderId));
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
      const projectCount = state.projects.filter(project=>project.folderId===folder.id).length;
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
            const projectsInFolder = state.projects.filter(project => project.folderId === folder.id);
            if (!projectsInFolder.length) {
              state.folders = state.folders.filter(f => f.id !== folder.id);
              scheduleSave(); renderProjectList();
              return;
            }
            if (await showConfirm(`Delete folder ${folder.name}`, "This moves all projects in it out of the folder, but does not delete the projects themselves.", true)) {
              state.projects.forEach(project => {
                if (project.folderId === folder.id) project.folderId = null;
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
    if (saved===OVERVIEW || saved===CALENDAR || saved===INTEGRATIONS || saved===SETTINGS || saved===SUPPORT || getProject(saved)) activeProjectId = saved;
    else activeProjectId = OVERVIEW;
    if (activeProjectId !== OVERVIEW && activeProjectId !== CALENDAR && activeProjectId !== SUPPORT) restoreProjectFilters(activeProjectId);
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
        render(); renderSidebarTags();
      };
    });
  }

  /* Integrations view moved to js/google-calendar.js */

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
      accountName
    });
  }

  function createSettingsView(SettingsView){
    return new SettingsView({
      cloneTemplate:()=>window.BeforeworkViewTemplates.clone("settings"),
      actions:{
      toggleTheme(board){ toggleTheme(); renderSettings(board); },
      setTimeFormat(value){
        try{ localStorage.setItem(TIME_FORMAT_KEY, value); }catch(err){/* ignore */}
        renderAll();
      },
      toggleSidebar(board){ toggleSidebarCollapsed(); renderSettings(board); },
      showShortcuts:showShortcutsModal,
      openIssues(){ window.open(FEEDBACK_URL, "_blank", "noopener,noreferrer"); },
      openSponsors(){ window.open(GITHUB_SPONSORS_URL, "_blank", "noopener,noreferrer"); },
      openCoffee(){ window.open(BUY_ME_A_COFFEE_URL, "_blank", "noopener,noreferrer"); },
      switchFile,
      createFile:startNewFileFromMenu,
      exportJSON,
      importJSON(){ document.getElementById("fileImportInput").click(); },
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
    const board = document.getElementById("board");
    if (completionTabs && !filterBar.contains(completionTabs)){
      filterBar.insertBefore(completionTabs,filterBar.querySelector(".filterMainRow"));
    }
    board.innerHTML = "";

    if (activeProjectId === OVERVIEW || activeProjectId === CALENDAR || activeProjectId === INTEGRATIONS || activeProjectId === SETTINGS || activeProjectId === SUPPORT){
      topLabel.textContent = "Overview";
      if (activeProjectId===CALENDAR) topLabel.textContent = "Calendar";
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
      if (activeProjectId===CALENDAR) renderCalendar(board, null);
      else if (activeProjectId===INTEGRATIONS) renderIntegrations(board);
      else if (activeProjectId===SETTINGS) renderSettings(board);
      else if (activeProjectId===SUPPORT) renderSupport(board);
      else renderOverview(board);
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
    if (activeView.type === "list") renderListView(project, board);
    else if (activeView.type === "table") renderTableView(project, board);
    else if (activeView.type === "calendar") renderCalendar(board, project);
    else renderKanban(project, board);
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
      if (f.type==="date") control = `<input class="form-control" type="date" data-fieldfilter="${f.id}" value="${typeof current==="string"?escapeHtml(current):""}" aria-label="Filter ${escapeHtml(f.label)}">`;
      else if (f.type==="text") control = `<input class="form-control" type="text" data-fieldfilter="${f.id}" value="${typeof current==="string"?escapeHtml(current):""}" placeholder="Enter text" aria-label="Filter ${escapeHtml(f.label)}">`;
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

  /* ---------- Kanban ---------- */
  function renderKanban(project, board){
    project.groups.forEach(group=>{
      const col = document.createElement("div");
      col.className = "group Box";
      col.dataset.groupId = group.id;

      const visibleItems = group.items.filter(it=>itemMatchesFilter(project, it, group));

      col.innerHTML = `
        <div class="groupHead">
          <input class="form-control groupTitle" value="${escapeHtml(group.name)}">
          <span class="Counter Counter--secondary">${visibleItems.length}${visibleItems.length!==group.items.length?"/"+group.items.length:""}</span>
          <button class="btn btn-invisible btn-sm fieldColumnMenuBtn" data-action="groupMenu" type="button" title="Group actions" aria-label="Group actions for ${escapeHtml(group.name)}">⋮</button>
          <div class="fieldColumnMenu"><button type="button" data-group-action="edit">Edit</button><button type="button" data-group-action="delete" class="danger">Delete</button></div>
        </div>
        <div class="groupBody"></div>
        <button class="btn addItemBtn" data-action="addItem">+ Add item</button>
      `;

      col.querySelector(".groupTitle").addEventListener("change", (e)=>{
        group.name = e.target.value.trim() || group.name;
        scheduleSave(); renderProjectList();
      });
      const groupMenuButton = col.querySelector('[data-action="groupMenu"]');
      const groupMenu = col.querySelector(".fieldColumnMenu");
      groupMenuButton.onclick = event=>{
        event.stopPropagation();
        const shouldOpen = !groupMenu.classList.contains("open");
        document.querySelectorAll(".fieldColumnMenu.open").forEach(other=>other.classList.remove("open"));
        groupMenu.classList.toggle("open", shouldOpen);
      };
      groupMenu.querySelector('[data-group-action="edit"]').onclick = event=>{
        event.stopPropagation();
        groupMenu.classList.remove("open");
        editGroupName(project, group);
      };
      groupMenu.querySelector('[data-group-action="delete"]').onclick = event=>{
        event.stopPropagation();
        groupMenu.classList.remove("open");
        confirmDeleteGroup(project, group);
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
      const tag = tagById(project, tid); return tag ? tagPillHtml(tag) : "";
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
    const showGroupColumn = project.groups.length>1;
    const showProgressColumn = project.groups.some(group=>group.items.some(item=>
      itemMatchesFilter(project,item,group) && Array.isArray(item.subitems) && item.subitems.length>0));

    const TH_CLASS = "p-2 text-left color-bg-subtle color-fg-muted text-bold f6 border-bottom";
    const TD_CLASS = "p-2 border-bottom";
    const fieldHeaders = project.fields.map(f=>`<th class="${TH_CLASS} fieldColumnHeader" data-field="${f.id}"><span class="fieldColumnLabel">${escapeHtml(f.label)}</span><span class="arrow"></span><button type="button" class="fieldColumnMenuBtn" aria-label="Actions for ${escapeHtml(f.label)}" title="Column actions">⋮</button><div class="fieldColumnMenu"><button type="button" data-column-action="edit">Edit</button><button type="button" data-column-action="delete" class="danger">Delete</button></div></th>`).join("");
    const groupHeader = showGroupColumn ? `<th class="${TH_CLASS} fieldColumnHeader groupColumnHeader" data-field="group"><span class="fieldColumnLabel">Group</span><span class="arrow"></span><button type="button" class="fieldColumnMenuBtn" aria-label="Group actions" title="Group actions">⋮</button><div class="fieldColumnMenu"><button type="button" data-group-action="edit">Edit group</button><button type="button" data-group-action="delete" class="danger">Delete group</button></div></th>` : "";
    wrap.innerHTML = `
      <div class="listAddRow">
        <button class="btn btn-primary addListItemBtn" id="quickAddBtn">+ Add item</button>
      </div>
      <div class="bulkBar">
        <strong class="selectionSummary"><span id="selectedCount">0</span> selected</strong>
        <span class="bulkSelectionActions">
          <button class="btn btn-sm" id="bulkSelectAll">Select all</button>
          <button class="btn btn-sm" id="bulkDuplicate">Duplicate</button>
          <button class="btn btn-sm" id="bulkMove">Move</button>
          <button class="btn btn-sm" id="bulkTag">Tag</button>
          <button class="btn btn-sm btn-danger" id="bulkDelete">Delete</button>
        </span>
      </div>
      <table class="listTable width-full">
        <thead><tr>
          <th class="selectCell ${TH_CLASS}"><input type="checkbox" id="selectAllItems" title="Select all visible items"></th>
          <th class="${TH_CLASS}" data-field="title">Title</th>
          ${groupHeader}
          ${fieldHeaders}
          <th class="${TH_CLASS}">Tags</th>
          ${showProgressColumn ? `<th class="${TH_CLASS}">Progress</th>` : ""}
          <th class="${TH_CLASS}" data-field="updated">Updated</th>
        </tr></thead>
        <tbody id="listTbody"></tbody>
      </table>
    `;
    board.appendChild(wrap);

    const doQuickAdd = () => {
      openNewItemModal(project, project.groups[0]);
    };
    document.getElementById("quickAddBtn").onclick = doQuickAdd;
    const updateSelection = () => {
      document.getElementById("selectedCount").textContent = selectedItemIds.size;
      wrap.querySelector(".bulkBar").dataset.selected = selectedItemIds.size ? "true" : "false";
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
    document.getElementById("bulkDuplicate").onclick = () => bulkDuplicate(project);
    document.getElementById("bulkTag").onclick = () => bulkTag(project);
    document.getElementById("bulkDelete").onclick = () => bulkDelete(project);

    wrap.querySelectorAll("th[data-field]").forEach(th=>{
      const field = th.dataset.field;
      const arrow = listSort.field===field ? (listSort.dir==="asc"?" ↑":" ↓") : "";
      const customField = project.fields.find(candidate=>candidate.id===field);
      if (field==="group"){
        th.querySelector(".arrow").textContent = arrow;
        wireGroupColumnHeader(th, project);
      } else if (customField){
        th.querySelector(".arrow").textContent = arrow;
        wireCustomColumnHeader(th, customField, project);
      } else {
        th.innerHTML = th.textContent + `<span class="arrow">${arrow}</span>`;
      }
      th.onclick = () => {
        if (listSort.field===field) listSort.dir = listSort.dir==="asc"?"desc":"asc";
        else listSort = {field, dir: field==="updated" ? "desc" : "asc"};
        render();
      };
    });

    let rows = [];
    project.groups.forEach(g=> g.items.filter(it=>itemMatchesFilter(project, it, g)).forEach(it=> rows.push({item:it, group:g})));

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
    const colCount = 4 + project.fields.length + (showGroupColumn?1:0) + (showProgressColumn?1:0);
    if (!rows.length){
      tbody.innerHTML = `<tr><td colspan="${colCount}" style="color:var(--faint);padding:16px 10px;white-space:normal;">No items match the current filters.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(({item,group})=>{
      const doneSub = item.subitems.filter(s=>s.done).length;
      const tagsHtml = item.tagIds.map(tid=>{
        const tag = tagById(project, tid); return tag ? tagPillHtml(tag) : "";
      }).join("");
      const fieldCells = project.fields.map(f=>`<td class="${TD_CLASS}">${fieldCellHtml(f, item.values[f.id])}</td>`).join("");
      return `<tr class="rowClickable${item.archived?" archived":""}" data-pid="${project.id}" data-gid="${group.id}" data-iid="${item.id}">
        <td class="selectCell ${TD_CLASS}"><input type="checkbox" data-item-select="${item.id}" ${selectedItemIds.has(item.id)?"checked":""}></td>
        <td class="${TD_CLASS}">${item.archived?`<span class="Label Label--secondary" style="margin-right:6px;">Archived</span>`:""}${escapeHtml(item.title)}</td>
        ${showGroupColumn ? `<td class="${TD_CLASS}">${escapeHtml(group.name)}</td>` : ""}
        ${fieldCells}
        <td class="${TD_CLASS}"><div class="rowTags">${tagsHtml||"-"}</div></td>
        ${showProgressColumn ? `<td class="${TD_CLASS}">${item.subitems.length? doneSub+"/"+item.subitems.length : "-"}</td>` : ""}
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
    const showGroupColumn = project.groups.length>1;

    const TH_CLASS = "p-2 text-left color-bg-subtle color-fg-muted text-bold f6 border-bottom";
    const TD_CLASS = "p-2 border-bottom";
    const fieldHeaders = project.fields.map(f=>`<th class="${TH_CLASS} fieldColumnHeader" data-field="${f.id}"><span class="fieldColumnLabel">${escapeHtml(f.label)}</span><span class="arrow"></span><button type="button" class="fieldColumnMenuBtn" aria-label="Actions for ${escapeHtml(f.label)}" title="Column actions">⋮</button><div class="fieldColumnMenu"><button type="button" data-column-action="edit">Edit</button><button type="button" data-column-action="delete" class="danger">Delete</button></div></th>`).join("");
    const groupHeader = showGroupColumn ? `<th class="${TH_CLASS} fieldColumnHeader groupColumnHeader" data-field="group"><span class="fieldColumnLabel">Group</span><span class="arrow"></span><button type="button" class="fieldColumnMenuBtn" aria-label="Group actions" title="Group actions">⋮</button><div class="fieldColumnMenu"><button type="button" data-group-action="edit">Edit group</button><button type="button" data-group-action="delete" class="danger">Delete group</button></div></th>` : "";
    wrap.innerHTML = `
      <div class="listAddRow">
        <button class="btn btn-primary addListItemBtn" id="quickAddBtn">+ Add item</button>
      </div>
      <div class="bulkBar">
        <strong class="selectionSummary"><span id="selectedCount">0</span> selected</strong>
        <span class="bulkSelectionActions">
          <button class="btn btn-sm" id="bulkSelectAll">Select all</button>
          <button class="btn btn-sm" id="bulkDuplicate">Duplicate</button>
          <button class="btn btn-sm" id="bulkMove">Move</button>
          <button class="btn btn-sm" id="bulkTag">Tag</button>
          <button class="btn btn-sm btn-danger" id="bulkDelete">Delete</button>
        </span>
      </div>
      <table class="listTable width-full">
        <thead><tr>
          <th class="selectCell ${TH_CLASS}"><input type="checkbox" id="selectAllItems" title="Select all visible rows"></th>
          <th class="${TH_CLASS}" data-field="title">Title</th>
          ${groupHeader}
          ${fieldHeaders}
          <th class="${TH_CLASS}">Tags</th>
        </tr></thead>
        <tbody id="listTbody"></tbody>
      </table>
    `;
    board.appendChild(wrap);

    const doQuickAdd = () => {
      openNewItemModal(project, project.groups[0]);
    };
    document.getElementById("quickAddBtn").onclick = doQuickAdd;
    const updateSelection = () => {
      document.getElementById("selectedCount").textContent = selectedItemIds.size;
      wrap.querySelector(".bulkBar").dataset.selected = selectedItemIds.size ? "true" : "false";
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
    document.getElementById("bulkDuplicate").onclick = () => bulkDuplicate(project);
    document.getElementById("bulkTag").onclick = () => bulkTag(project);
    document.getElementById("bulkDelete").onclick = () => bulkDelete(project);

    wrap.querySelectorAll("th[data-field]").forEach(th=>{
      const field = th.dataset.field;
      const arrow = listSort.field===field ? (listSort.dir==="asc"?" ↑":" ↓") : "";
      const customField = project.fields.find(candidate=>candidate.id===field);
      if (field==="group"){
        th.querySelector(".arrow").textContent = arrow;
        wireGroupColumnHeader(th, project);
      } else if (customField){
        th.querySelector(".arrow").textContent = arrow;
        wireCustomColumnHeader(th, customField, project);
      } else {
        th.innerHTML = th.textContent + `<span class="arrow">${arrow}</span>`;
      }
      th.onclick = () => {
        if (listSort.field===field) listSort.dir = listSort.dir==="asc"?"desc":"asc";
        else listSort = {field, dir: field==="updated" ? "desc" : "asc"};
        render();
      };
    });

    let rows = [];
    project.groups.forEach(g=> g.items.filter(it=>itemMatchesFilter(project, it, g)).forEach(it=> rows.push({item:it, group:g})));

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
    const colCount = 3 + project.fields.length + (showGroupColumn?1:0);
    if (!rows.length){
      tbody.innerHTML = `<tr><td colspan="${colCount}" style="color:var(--faint);padding:16px 10px;white-space:normal;">No rows match the current filters.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(({item,group})=>{
      const tagsHtml = item.tagIds.map(tid=>{
        const tag = tagById(project, tid); return tag ? tagPillHtml(tag) : "";
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
        ${showGroupColumn ? `<td class="${TD_CLASS}">${escapeHtml(group.name)}</td>` : ""}
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
        const date = item.startDate || item.endDate;
        if (date) entries.push({project:null, group:null, item, field:{id:"__standalone__", label:"Calendar", type:"date"}, date, endDate:item.endDate && item.endDate>=date ? item.endDate : date});
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
      </div>
      <div class="uiDivider modalDivider" aria-hidden="true"></div>
      <div class="modalFooter"><button class="btn btn-invisible" data-calendar-close>Cancel</button>${isNew ? "" : `<button class="btn" data-calendar-duplicate>Duplicate</button>`}<button class="btn btn-primary btn-sm" data-calendar-save>${isNew ? "Add item" : "Save changes"}</button></div>`;
    modal.querySelectorAll("[data-calendar-close]").forEach(button=>button.onclick=()=>overlay.remove());
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
        title:`${modal.querySelector("#standaloneTitle").value.trim()||item.title} (copy)`,
        description:modal.querySelector("#standaloneDescription").value,
        startDate:startDateInput.value,
        endDate:endDateInput.value,
        location:modal.querySelector("#standaloneLocation").value.trim(),
        startTime:modal.querySelector("#standaloneStart").value,
        endTime:modal.querySelector("#standaloneEnd").value,
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
      item.description = modal.querySelector("#standaloneDescription").value;
      item.startDate = startDate;
      item.endDate = endDate;
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
      openStandaloneCalendarItemModal({id:uid(), title:"", description:"", calendarType:"event", startTime:"", endTime:"", location:"", startDate:date, endDate:date, tagIds:[], values:{}, subitems:[], comments:[], archived:false, standalone:true, createdAt:Date.now(), updatedAt:Date.now()}, true);
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
    const view = window.BeforeworkViewTemplates.clone("calendar");
    const entries = calendarEntries(scopeProject);
    const year = calendarCursor.getFullYear();
    const month = calendarCursor.getMonth();
    const monthLabel = calendarCursor.toLocaleDateString(undefined,{month:"long",year:"numeric"});
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const today = todayStr(0);
    const lanesByWeek = Array.from({length:6},()=>new Map());
    for (let week=0; week<6; week++){
      const weekStart = calendarDateKey(new Date(year, month, 1-firstDay+week*7));
      const weekEnd = calendarDateKey(new Date(year, month, 7-firstDay+week*7));
      const weekEntries = entries.filter(entry=>entry.date<=weekEnd && entry.endDate>=weekStart && itemMatchesFilter(entry.project, entry.item, entry.group))
        .sort((a,b)=>a.date.localeCompare(b.date) || b.endDate.localeCompare(a.endDate) || (a.item.title||"").localeCompare(b.item.title||""));
      const laneEnds = [];
      weekEntries.forEach(entry=>{
        let lane = laneEnds.findIndex(endDate=>endDate<entry.date);
        if (lane===-1) lane = laneEnds.length;
        laneEnds[lane] = entry.endDate;
        lanesByWeek[week].set(entry,lane);
      });
    }
    const cells = [];
    for (let index=0; index<42; index++){
      const dayOffset = index - firstDay;
      const cell = new Date(year, month, dayOffset + 1);
      const dateNumber = cell.getDate();
      const cellDate = calendarDateKey(cell);
      const inMonth = dayOffset >= 0 && dayOffset < daysInMonth;
      const weekLanes = lanesByWeek[Math.floor(index/7)];
      const dayEntries = entries.filter(entry=>cellDate>=entry.date && cellDate<=entry.endDate && itemMatchesFilter(entry.project, entry.item, entry.group))
        .sort((a,b)=>weekLanes.get(a)-weekLanes.get(b));
      const day = view.querySelector("#calendarDayTemplate").content.firstElementChild.cloneNode(true);
      day.dataset.date = cellDate;
      day.classList.toggle("muted", !inMonth);
      day.classList.toggle("today", cellDate===today);
      day.querySelector(".calendarDayNumber").textContent = String(dateNumber);
      dayEntries.forEach(entry=>{
        const event = view.querySelector("#calendarEventTemplate").content.firstElementChild.cloneNode(true);
        const isEvent = entry.item.calendarType==="event";
        const isMultiDay = entry.endDate>entry.date;
        event.classList.toggle("event", isEvent);
        event.classList.toggle("task", !isEvent);
        event.classList.toggle("multiDay", isMultiDay);
        if (isMultiDay){
          const startsSegment = cellDate===entry.date || index%7===0;
          const endsSegment = cellDate===entry.endDate || index%7===6;
          event.classList.toggle("multiDayStart", startsSegment);
          event.classList.toggle("multiDayEnd", endsSegment);
          event.classList.toggle("multiDayLabel", startsSegment);
          event.classList.toggle("multiDayOrigin", cellDate===entry.date);
        }
        event.dataset.pid = entry.project ? entry.project.id : "";
        event.dataset.gid = entry.group ? entry.group.id : "";
        event.dataset.iid = entry.item.id;
        event.dataset.fid = entry.field.id;
        event.dataset.start = entry.date;
        event.dataset.end = entry.endDate;
        const startTime = formatTimeValue(entry.item.startTime);
        const endTime = formatTimeValue(entry.item.endTime);
        const timeRange = startTime && endTime ? `${startTime} – ${endTime}` : startTime || endTime;
        event.querySelector(".eventTitle").textContent = `${timeRange ? timeRange+" " : ""}${entry.item.title}`;
        const startDateLabel = new Date(`${entry.date}T00:00:00`).toLocaleDateString(undefined,{dateStyle:"medium"});
        const endDateLabel = entry.endDate===entry.date ? "" : new Date(`${entry.endDate}T00:00:00`).toLocaleDateString(undefined,{dateStyle:"medium"});
        const dateRange = `${startDateLabel}${endDateLabel ? ` – ${endDateLabel}` : ""}`;
        const description = String(entry.item.description||"").trim();
        const eventDetails = [
          entry.item.title,
          `Date: ${dateRange}`,
          timeRange ? `Time: ${timeRange}` : "All day",
          entry.project ? `Project: ${entry.project.name}` : "",
          entry.group ? `Group: ${entry.group.name}` : "",
          entry.item.location ? `Location: ${entry.item.location}` : "",
          description
        ].filter(Boolean).join("\n");
        event.setAttribute("aria-label",eventDetails.replace(/\n/g,". "));
        event.calendarTooltipDetails = {
          type:isEvent ? "Event" : "Task",
          title:entry.item.title||"Untitled item",
          date:dateRange,
          time:timeRange||"All day",
          project:entry.project?.name||"",
          group:entry.group?.name||"",
          location:entry.item.location||"",
          description
        };
        const projectName = event.querySelector(".eventProject");
        if (scopeProject || !entry.project) projectName.remove();
        else {
          projectName.textContent = entry.project.name;
          projectName.title = entry.project.name;
          projectName.hidden = false;
        }
        event.querySelector(".gcalLink").href = googleCalendarUrl(entry);
        day.appendChild(event);
      });
      cells.push(day);
    }
    view.querySelector("[data-calendar-month]").textContent = monthLabel;
    view.querySelector("[data-calendar-scope]").textContent = scopeProject ? scopeProject.name : "All projects";
    view.querySelectorAll("[data-calendar-global]").forEach(element=>{ element.hidden = !!scopeProject; });
    view.querySelector("[data-calendar-sync-status]").textContent = state.googleLastSyncAt ? `Last synced ${new Date(state.googleLastSyncAt).toLocaleString()}` : "Not synced yet";
    const grid = view.querySelector(".calendarGrid");
    cells.forEach(day=>grid.appendChild(day));
    wrap.appendChild(view);
    updateGoogleCalendarButtons();
    wrap.querySelector('[data-calendar-action="prev"]').onclick = () => { calendarCursor = new Date(year, month-1, 1); render(); };
    wrap.querySelector('[data-calendar-action="next"]').onclick = () => { calendarCursor = new Date(year, month+1, 1); render(); };
    wrap.querySelector('[data-calendar-action="today"]').onclick = () => { const now = new Date(); calendarCursor = new Date(now.getFullYear(), now.getMonth(), 1); render(); };
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
        if (data.fid === "__standalone__") item.startDate = day.dataset.date;
        else if (data.fid === "__schedule__") item.endDate = day.dataset.date;
        else item.values[data.fid] = day.dataset.date;
        const start = new Date(`${data.start}T00:00:00`);
        const end = new Date(`${data.end}T00:00:00`);
        const duration = Math.max(0, Math.round((end-start)/86400000));
        item.endDate = calendarDateKey(new Date(new Date(`${day.dataset.date}T00:00:00`).getTime() + duration*86400000));
        item.updatedAt = Date.now();
        scheduleSave(); render();
      });
    });
    let activeCalendarPopover = null;
    let calendarPopoverHideTimer = 0;
    const hideCalendarPopover = () => {
      clearTimeout(calendarPopoverHideTimer);
      if (!activeCalendarPopover) return;
      activeCalendarPopover.anchor.removeAttribute("aria-describedby");
      activeCalendarPopover.element.remove();
      activeCalendarPopover = null;
    };
    const positionCalendarPopover = (anchor,popover) => {
      const anchorRect = anchor.getBoundingClientRect();
      const popoverRect = popover.getBoundingClientRect();
      const margin = 12;
      let left = anchorRect.left;
      if (left+popoverRect.width>window.innerWidth-margin) left = anchorRect.right-popoverRect.width;
      left = Math.max(margin,Math.min(left,window.innerWidth-popoverRect.width-margin));
      let top = anchorRect.bottom+8;
      if (top+popoverRect.height>window.innerHeight-margin) top = anchorRect.top-popoverRect.height-8;
      top = Math.max(margin,Math.min(top,window.innerHeight-popoverRect.height-margin));
      popover.style.left = `${left}px`;
      popover.style.top = `${top}px`;
    };
    wrap.addEventListener("scroll",hideCalendarPopover,{passive:true});
    wrap.querySelectorAll(".calendarEvent").forEach(event=>{
      event.tabIndex = 0;
      event.setAttribute("role","button");
      const schedulePopoverHide = () => {
        clearTimeout(calendarPopoverHideTimer);
        calendarPopoverHideTimer = window.setTimeout(()=>{
          if (activeCalendarPopover?.anchor!==event) return;
          if (event.matches(":hover,:focus-within") || activeCalendarPopover.element.matches(":hover")) return;
          hideCalendarPopover();
        },160);
      };
      const showCalendarPopover = () => {
        clearTimeout(calendarPopoverHideTimer);
        if (activeCalendarPopover?.anchor===event) return;
        hideCalendarPopover();
        const details = event.calendarTooltipDetails;
        const popover = document.createElement("div");
        popover.className = "calendarContextPopover";
        popover.id = `calendar-context-${uid()}`;
        popover.setAttribute("role","tooltip");
        const header = document.createElement("div");
        header.className = "calendarContextHeader";
        const marker = document.createElement("span");
        marker.className = `calendarContextMarker ${details.type.toLowerCase()}`;
        const heading = document.createElement("div");
        heading.className = "calendarContextHeading";
        const type = document.createElement("span");
        type.className = "calendarContextType";
        type.textContent = details.type;
        const title = document.createElement("strong");
        title.className = "calendarContextTitle";
        title.textContent = details.title;
        heading.append(type,title);
        header.append(marker,heading);
        popover.appendChild(header);
        const facts = document.createElement("div");
        facts.className = "calendarContextFacts";
        const addFact = (label,value) => {
          if (!value) return;
          const row = document.createElement("div");
          row.className = "calendarContextFact";
          const factLabel = document.createElement("span");
          factLabel.className = "calendarContextFactLabel";
          factLabel.textContent = label;
          const factValue = document.createElement("span");
          factValue.className = "calendarContextFactValue";
          factValue.textContent = value;
          row.append(factLabel,factValue);
          facts.appendChild(row);
        };
        addFact("Date",details.date);
        addFact("Time",details.time);
        addFact("Project",details.project);
        addFact("Group",details.group);
        addFact("Location",details.location);
        popover.appendChild(facts);
        if (details.description){
          const description = document.createElement("p");
          description.className = "calendarContextDescription";
          description.textContent = details.description;
          popover.appendChild(description);
        }
        document.body.appendChild(popover);
        activeCalendarPopover = {anchor:event,element:popover};
        event.setAttribute("aria-describedby",popover.id);
        positionCalendarPopover(event,popover);
        popover.addEventListener("pointerenter",()=>clearTimeout(calendarPopoverHideTimer));
        popover.addEventListener("pointerleave",schedulePopoverHide);
      };
      event.addEventListener("pointerenter",showCalendarPopover);
      event.addEventListener("pointerleave",schedulePopoverHide);
      event.addEventListener("focus",showCalendarPopover);
      event.addEventListener("blur",schedulePopoverHide);
      event.addEventListener("keydown",keyEvent=>{
        if (keyEvent.key==="Escape") hideCalendarPopover();
        else if (!keyEvent.target.closest("a") && (keyEvent.key==="Enter" || keyEvent.key===" ")){
          keyEvent.preventDefault();
          event.click();
        }
      });
      event.addEventListener("dragstart", dragEvent=>{
        dragEvent.dataTransfer.setData("text/plain", JSON.stringify({pid:event.dataset.pid,gid:event.dataset.gid,iid:event.dataset.iid,fid:event.dataset.fid,start:event.dataset.start,end:event.dataset.end}));
      });
      event.onclick = click => {
        if (click.target.closest("a")) return;
        hideCalendarPopover();
        if (event.dataset.pid) openItemModal(event.dataset.pid,event.dataset.gid,event.dataset.iid);
        else {
          const item = (state.calendarItems||[]).find(candidate=>candidate.id===event.dataset.iid);
          if (item) openStandaloneCalendarItemModal(item);
        }
      };
    });
    board.appendChild(wrap);
    updateGoogleCalendarButtons();
  }

  /* ---------- Overview ---------- */
  function renderOverview(board){
    const wrap = document.createElement("div");
    wrap.className = "overviewWrap";
    const flat = allItemsFlat();
    const activeItems = flat.filter(row=>!row.item.archived);
    const openItems = activeItems.filter(row=>!isItemCompleted(row.item));
    const completedItems = activeItems.filter(row=>isItemCompleted(row.item));
    function dueOf(row){
      const field = dateFields(row.project).find(candidate=>row.item.values[candidate.id]);
      return field ? row.item.values[field.id] : row.item.endDate||"";
    }
    function priorityOf(r){ const f = priorityField(r.project); return f ? (r.item.values[f.id]||"") : ""; }
    const today = todayStr(0);
    const weekEnd = todayStr(7);
    const overdue = openItems.filter(row=>dueOf(row) && dueOf(row)<today);
    const dueThisWeek = openItems.filter(row=>dueOf(row)>=today && dueOf(row)<=weekEnd);
    const recent = [...activeItems].sort((a,b)=>b.item.updatedAt-a.item.updatedAt).slice(0,5);

    function priorityBreakdownHtml(){
      const counts = {high:0, medium:0, low:0, none:0};
      openItems.forEach(r=>{
        const p = priorityOf(r);
        if (p==="high"||p==="medium"||p==="low") counts[p]++; else counts.none++;
      });
      const max = Math.max(1, ...Object.values(counts));
      const rows = [
        {label:"High",key:"high",color:"var(--color-danger-fg)"},
        {label:"Medium",key:"medium",color:"var(--color-attention-fg)"},
        {label:"Low",key:"low",color:"var(--color-attention-fg)"},
        {label:"No priority",key:"none",color:"var(--color-neutral-muted)"},
      ];
      const body = rows.map((row,index)=>`${index?'<div class="uiDivider overviewDivider" aria-hidden="true"></div>':""}<div class="overviewPriorityRow">
        <span class="barLabel">${row.label}</span>
        <div class="barTrack"><div class="barFill" style="width:${(counts[row.key]/max*100)}%;background:${row.color};"></div></div>
        <span class="barCount">${counts[row.key]}</span>
      </div>`).join("");
      return body;
    }
    function projectBreakdownHtml(){
      return state.projects.map((project,index)=>{
        const projectItems = project.groups.flatMap(group=>group.items.filter(item=>!item.archived).map(item=>({group,item})));
        const complete = projectItems.filter(row=>isItemCompleted(row.item)).length;
        const percent = projectItems.length ? Math.round(complete/projectItems.length*100) : 0;
        return `${index?'<div class="uiDivider overviewDivider" aria-hidden="true"></div>':""}<button class="overviewProjectRow" type="button" data-overview-project="${escapeHtml(project.id)}">
          <span class="overviewProjectInfo"><strong>${escapeHtml(project.name)}</strong><small>${percent}%</small></span>
          <span class="overviewProjectTrack" role="progressbar" aria-label="${escapeHtml(project.name)} progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></span>
          <span class="overviewProjectMeta">${complete} of ${projectItems.length} complete</span>
        </button>`;
      }).join("") || `<div class="overviewQuiet">No projects yet.</div>`;
    }
    function focusSummaryHtml(){
      const now = Date.now();
      const weekStart = new Date(now);
      weekStart.setHours(0,0,0,0);
      weekStart.setDate(weekStart.getDate()-((weekStart.getDay()+6)%7));
      const sessions = (state.focusSessions||[]).filter(session=>session &&
        Number.isFinite(session.completedAt) && session.completedAt>=weekStart.getTime() && session.completedAt<=now &&
        Number.isFinite(session.durationSeconds) && session.durationSeconds>0);
      const byProject = new Map();
      let totalSeconds = 0;
      sessions.forEach(session=>{
        const project = state.projects.find(candidate=>candidate.id===session.projectId);
        const key = project ? project.id : (session.projectId ? `deleted:${session.projectId}` : "__unassigned__");
        const name = project ? project.name : (session.projectId ? "Deleted project" : "Unassigned");
        const entry = byProject.get(key) || {name, seconds:0, count:0};
        entry.seconds += session.durationSeconds;
        entry.count++;
        totalSeconds += session.durationSeconds;
        byProject.set(key, entry);
      });
      const formatDuration = seconds=>{
        const totalMinutes = Math.floor(seconds/60);
        const hours = Math.floor(totalMinutes/60);
        const minutes = totalMinutes%60;
        return hours ? `${hours}h${minutes?` ${minutes}m`:""}` : `${totalMinutes}m`;
      };
      const rows = [...byProject.values()].sort((a,b)=>b.seconds-a.seconds).map((entry,index)=>
        `${index?'<div class="uiDivider overviewDivider" aria-hidden="true"></div>':""}<div class="overviewFocusRow"><span>${escapeHtml(entry.name)}</span><strong>${formatDuration(entry.seconds)}</strong><small>${entry.count} focus session${entry.count===1?"":"s"}</small></div>`
      ).join("");
      return `<div class="overviewFocusTotal"><strong>${formatDuration(totalSeconds)}</strong><span>${sessions.length} completed session${sessions.length===1?"":"s"}</span></div>${rows||`<div class="overviewQuiet">Completed sessions will appear here.</div>`}`;
    }
    function workloadChartHtml(rows){
      const counts = rows.map(day=>scheduled.filter(row=>row.date===day.date).length);
      const max = Math.max(1,...counts);
      const bars = rows.map((day,index)=>{
        const x = 46+index*72;
        const height = counts[index] ? counts[index]/max*104 : 2;
        const y = 132-height;
        const label = new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined,{weekday:"short"});
        return `<g class="overviewChartBar"><title>${escapeHtml(label)}: ${counts[index]} item${counts[index]===1?"":"s"}</title>
          <rect x="${x}" y="${y}" width="34" height="${height}" rx="5" fill="var(--accent)" opacity="${counts[index]?".82":".18"}"></rect>
          <text x="${x+17}" y="151" text-anchor="middle">${escapeHtml(label)}</text>
          <text class="overviewChartValue" x="${x+17}" y="${Math.max(18,y-7)}" text-anchor="middle">${counts[index]}</text>
        </g>`;
      }).join("");
      return `<svg viewBox="0 0 560 174" role="img" aria-label="Items due each day over the next seven days">
        <line class="overviewChartGridline" x1="28" y1="132" x2="548" y2="132"></line>${bars}
      </svg>`;
    }
    function taskStatusChartHtml(){
      const total = openItems.length+completedItems.length;
      const circumference = 2*Math.PI*48;
      const completeLength = total ? completedItems.length/total*circumference : 0;
      return `<div class="overviewStatusRing" role="img" aria-label="${openItems.length} open and ${completedItems.length} completed items">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle class="overviewStatusTrack" cx="60" cy="60" r="48"></circle>
          <circle class="overviewStatusComplete" cx="60" cy="60" r="48" stroke-dasharray="${completeLength} ${circumference}" transform="rotate(-90 60 60)"></circle>
        </svg>
        <div class="overviewStatusTotal"><strong>${total}</strong><span>Total</span></div>
      </div>
      <div class="overviewStatusLegend">
        <div><span class="overviewLegendDot open"></span><span>Open</span><strong>${openItems.length}</strong></div>
        <div><span class="overviewLegendDot complete"></span><span>Completed</span><strong>${completedItems.length}</strong></div>
      </div>`;
    }

    const view = window.BeforeworkViewTemplates.clone("overview");
    const statRows = [
      {value:state.projects.length,label:"Projects",detail:"Across your workspace",icon:"mdi:folder-multiple-outline",tone:"projects"},
      {value:openItems.length,label:"Open items",detail:"Ready for your attention",icon:"mdi:progress-clock",tone:"open"},
      {value:overdue.length,label:"Overdue",detail:overdue.length ? "Past their due date" : "You're all caught up",icon:"mdi:alert-circle-outline",tone:"overdue"},
      {value:completedItems.length,label:"Completed",detail:"Marked complete",icon:"mdi:check-circle-outline",tone:"completed"}
    ];
    function openOverviewStatDetails(tone){
      overviewDetailsView.open({
        tone,
        stats:statRows,
        data:{projects:state.projects,openItems,overdueItems:overdue,completedItems,isItemCompleted,dueOf,priorityOf},
        actions:{openProject:selectProject,openItem:openItemModal}
      });
    }
    const stats = view.querySelector("[data-overview-stats]");
    statRows.forEach(({value,label,detail,icon,tone},index)=>{
      const row = document.createElement("button");
      row.type="button";
      row.className = `overviewStat overviewStat-${tone}${tone==="overdue"?(overdue.length?" has-overdue":" is-clear"):""}`;
      row.dataset.overviewStat=tone;
      row.setAttribute("aria-label",`${value} ${label}. Show details`);
      const iconWrap = document.createElement("span");
      iconWrap.className = "overviewStatIcon";
      const iconElement = document.createElement("iconify-icon");
      iconElement.setAttribute("icon",icon);
      iconElement.setAttribute("aria-hidden","true");
      iconWrap.appendChild(iconElement);
      const copy = document.createElement("span");
      copy.className = "overviewStatCopy";
      const count = document.createElement("div");
      count.className = "overviewStatValue";
      count.textContent = String(value);
      const name = document.createElement("div");
      name.className = "overviewStatLabel";
      name.textContent = label;
      const description = document.createElement("div");
      description.className = "overviewStatDetail";
      description.textContent = detail;
      copy.append(count,name,description);
      row.append(iconWrap,copy);
      stats.appendChild(row);
      if (index===1){
        const divider=document.createElement("div");
        divider.className="uiDivider overviewStatsDivider";
        divider.setAttribute("aria-hidden","true");
        stats.appendChild(divider);
      }
    });
    const scheduled = [];
    openItems.forEach(row=>{
      const date = dueOf(row);
      if (date && date>=today && date<=weekEnd) scheduled.push({...row,date,source:"project"});
    });
    (state.calendarItems||[]).filter(item=>!item.archived).forEach(item=>{
      const startDate = item.startDate || item.endDate;
      const endDate = item.endDate && item.endDate>=startDate ? item.endDate : startDate;
      if (!startDate || endDate<today || startDate>weekEnd) return;
      for (let offset=0; offset<7; offset++){
        const date = todayStr(offset);
        if (date>=startDate && date<=endDate) scheduled.push({item,date,project:null,group:null,source:"calendar"});
      }
    });
    scheduled.sort((a,b)=>a.date.localeCompare(b.date) || (a.item.startTime||"").localeCompare(b.item.startTime||""));
    const weekDays = Array.from({length:7},(_,offset)=>{
      const date = todayStr(offset);
      const items = scheduled.filter(row=>row.date===date);
      const day = new Date(`${date}T00:00:00`);
      const entries = items.slice(0,3).map(row=>`<button class="overviewTimelineItem" type="button"${row.source==="project"?` data-pid="${escapeHtml(row.project.id)}" data-gid="${escapeHtml(row.group.id)}" data-iid="${escapeHtml(row.item.id)}"`:` data-calendar-id="${escapeHtml(row.item.id)}"`}>
        <strong>${escapeHtml(row.item.title||"Untitled item")}</strong><span>${row.source==="project"?escapeHtml(`${row.project.name} / ${row.group.name}`):"Calendar item"}</span>
      </button>`).join("");
      return `<div class="overviewDay${offset===0?" today":""}">
        <div class="overviewDayHeader"><span>${day.toLocaleDateString(undefined,{weekday:"short"})}</span><strong>${day.getDate()}</strong></div>
        <div class="overviewDayItems">${entries||`<span class="overviewDayEmpty">No work due</span>`}${items.length>3?`<span class="overviewMore">+${items.length-3} more</span>`:""}</div>
      </div>`;
    }).join("");
    view.querySelector("[data-overview-timeline]").innerHTML = weekDays;
    view.querySelector("[data-overview-week-chart]").innerHTML = workloadChartHtml(Array.from({length:7},(_,offset)=>({date:todayStr(offset)})));
    view.querySelector("[data-overview-status-chart]").innerHTML = taskStatusChartHtml();
    view.querySelector("[data-overview-projects]").innerHTML = projectBreakdownHtml();
    view.querySelector("[data-overview-priorities]").innerHTML = priorityBreakdownHtml();
    view.querySelector("[data-overview-focus]").innerHTML = focusSummaryHtml();
    view.querySelector("[data-overview-recent]").innerHTML = recent.map((row,index)=>{
      const priority = priorityField(row.project);
      const chip = priority ? fieldChipHtml(priority,priorityOf(row)) : "";
      return `${index?'<div class="uiDivider overviewDivider" aria-hidden="true"></div>':""}<button class="overviewRecentRow" type="button" data-pid="${escapeHtml(row.project.id)}" data-gid="${escapeHtml(row.group.id)}" data-iid="${escapeHtml(row.item.id)}">
        <span class="overviewRecentMain">${chip}<strong>${escapeHtml(row.item.title)}</strong></span>
        <span class="overviewRecentMeta">${escapeHtml(row.project.name)} / ${escapeHtml(row.group.name)} <span>· ${escapeHtml(formatUpdatedAt(row.item.updatedAt))}</span></span>
      </button>`;
    }).join("") || `<div class="overviewQuiet">No project activity yet.</div>`;
    const cardContainer = view.querySelector("[data-overview-reorder-container]");
    const cardOrder = Array.isArray(state.overviewCardOrder) ? state.overviewCardOrder : [];
    const cards = [...cardContainer.querySelectorAll("[data-overview-card]")];
    cards.sort((a,b)=>{
      const aIndex = cardOrder.indexOf(a.dataset.overviewCard);
      const bIndex = cardOrder.indexOf(b.dataset.overviewCard);
      return (aIndex<0 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex<0 ? Number.MAX_SAFE_INTEGER : bIndex);
    }).forEach(card=>cardContainer.appendChild(card));
    const cardLayouts = state.overviewCardLayouts && typeof state.overviewCardLayouts==="object" ? state.overviewCardLayouts : {};
    const clamp = (value,min,max)=>Math.max(min,Math.min(max,value));
    function getGridMetrics(){
      const bounds = cardContainer.getBoundingClientRect();
      const style = getComputedStyle(cardContainer);
      const trackSizes = style.gridTemplateColumns.trim().split(/\s+/).map(parseFloat);
      return {width:bounds.width,tracks:trackSizes.length,trackWidth:trackSizes[0]||bounds.width,gap:parseFloat(style.columnGap)||0};
    }
    function setCardColumns(card,columns,metrics=getGridMetrics()){
      const minWidth = Number(card.dataset.overviewMinWidth)||260;
      const savedWidth = Number.parseFloat(card.style.getPropertyValue("--overview-card-width"))||0;
      const requiredWidth = Math.min(metrics.width,Math.max(minWidth,savedWidth));
      const columnWidth = metrics.trackWidth+metrics.gap;
      const requiredColumns = Math.ceil((requiredWidth+metrics.gap)/Math.max(columnWidth,1));
      const safeColumns = clamp(Math.max(Math.round(columns),requiredColumns),1,metrics.tracks);
      card.style.setProperty("--overview-card-columns",String(safeColumns));
      card.style.setProperty("--overview-card-min-width",`${minWidth}px`);
    }
    function getCardColumns(card){
      return Number(card.style.getPropertyValue("--overview-card-columns"))||1;
    }
    function getOrderedCards(){
      return [...cardContainer.querySelectorAll("[data-overview-card]")];
    }
    function arrangeCards(metrics=getGridMetrics()){
      const occupiedRows = [];
      getOrderedCards().forEach(card=>{
        const span = Math.min(getCardColumns(card),metrics.tracks);
        let rowIndex = 0;
        let start = 1;
        while (true){
          const occupied = occupiedRows[rowIndex]||[];
          start = 1;
          while (start+span-1<=metrics.tracks && occupied.some(range=>start<=range.end && start+span-1>=range.start)) start++;
          if (start+span-1<=metrics.tracks) break;
          rowIndex++;
        }
        if (!occupiedRows[rowIndex]) occupiedRows[rowIndex]=[];
        occupiedRows[rowIndex].push({start,end:start+span-1});
        card.style.gridColumn = `${start} / span ${span}`;
        card.style.gridRow = String(rowIndex+1);
        const areaWidth = span*metrics.trackWidth+Math.max(0,span-1)*metrics.gap;
        card.style.width = `${areaWidth}px`;
      });
    }
    function refreshOverviewLayout(){
      const containerWidth = cardContainer.getBoundingClientRect().width;
      if (containerWidth>0){
        const trackCount = Math.max(1,Math.floor(containerWidth/15));
        cardContainer.style.gridTemplateColumns = `repeat(${trackCount},minmax(1px,1fr))`;
        cardContainer.style.columnGap = "10px";
      }
      const metrics = getGridMetrics();
      getOrderedCards().forEach(card=>setCardColumns(card,getCardColumns(card),metrics));
      arrangeCards(metrics);
    }
    function saveCardLayout(card){
      if (!state.overviewCardLayouts || typeof state.overviewCardLayouts!=="object") state.overviewCardLayouts = {};
      state.overviewCardLayouts[card.dataset.overviewCard] = {
        version:2,
        columns:Number(card.style.getPropertyValue("--overview-card-columns"))||1,
        width:Number.parseFloat(card.style.getPropertyValue("--overview-card-width"))||null,
        height:Number.parseFloat(card.style.getPropertyValue("--overview-card-height"))||null
      };
      scheduleSave();
    }
    cards.forEach(card=>{
      const saved = cardLayouts[card.dataset.overviewCard];
      const savedColumns = saved && Number.isFinite(saved.columns) ? (saved.version===2 ? saved.columns : saved.columns>4 ? Math.round(saved.columns/6) : saved.columns) : null;
      const initialColumns = savedColumns || Number(card.style.getPropertyValue("--overview-card-columns"))||1;
      const minWidth = Number(card.dataset.overviewMinWidth)||260;
      if (saved && Number.isFinite(saved.width)) card.style.setProperty("--overview-card-width",`${Math.max(saved.width,minWidth)}px`);
      setCardColumns(card,initialColumns);
      if (saved && Number.isFinite(saved.height)) card.style.setProperty("--overview-card-height",`${Math.max(saved.height,180)}px`);
    });
    refreshOverviewLayout();
    const updateCardColumns = ()=>{
      const metrics = getGridMetrics();
      cards.forEach(card=>setCardColumns(card,Number(card.style.getPropertyValue("--overview-card-columns"))||1,metrics));
      arrangeCards(metrics);
    };
    if ("ResizeObserver" in window) new ResizeObserver(updateCardColumns).observe(cardContainer);
    else window.addEventListener("resize",updateCardColumns);
    let dragState = null;
    cards.forEach(card=>{
      const header = card.querySelector(".overviewPanelHeader");
      const dragHandle = document.createElement("span");
      dragHandle.className = "overviewDragHandle";
      dragHandle.setAttribute("role","button");
      dragHandle.setAttribute("aria-label","Drag to rearrange");
      dragHandle.title = "Drag to rearrange";
      dragHandle.tabIndex = 0;
      const dragIcon = document.createElement("iconify-icon");
      dragIcon.setAttribute("icon","mdi:drag-vertical");
      dragIcon.setAttribute("aria-hidden","true");
      dragHandle.appendChild(dragIcon);
      header.appendChild(dragHandle);
      dragHandle.addEventListener("pointerdown",event=>{
        if (event.button!==0 || dragState) return;
        event.preventDefault();
        const bounds = card.getBoundingClientRect();
        dragState = {card,handle:dragHandle,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,
          offsetX:event.clientX-bounds.left,offsetY:event.clientY-bounds.top,bounds,gridColumn:card.style.gridColumn,gridRow:card.style.gridRow,placeholder:null,dropPreview:null,dropReference:null,moved:false};
        const currentDrag = dragState;
        currentDrag.windowPointerUp = pointerEvent=>{
          if (dragState===currentDrag && currentDrag.pointerId===pointerEvent.pointerId) finishDrag(pointerEvent);
        };
        currentDrag.windowPointerCancel = pointerEvent=>{
          if (dragState===currentDrag && currentDrag.pointerId===pointerEvent.pointerId) finishDrag(pointerEvent,true);
        };
        window.addEventListener("pointerup",currentDrag.windowPointerUp);
        window.addEventListener("pointercancel",currentDrag.windowPointerCancel);
        dragHandle.setPointerCapture(event.pointerId);
      });
      dragHandle.addEventListener("pointermove",event=>{
        if (!dragState || dragState.handle!==dragHandle || dragState.pointerId!==event.pointerId) return;
        const deltaX = event.clientX-dragState.startX;
        const deltaY = event.clientY-dragState.startY;
        if (!dragState.moved && Math.hypot(deltaX,deltaY)<5) return;
        event.preventDefault();
        const dragged = dragState.card;
        if (!dragState.moved){
          dragState.moved = true;
          const placeholder = document.createElement("div");
          placeholder.className = "overviewDropPlaceholder";
          placeholder.style.setProperty("--overview-card-columns",dragged.style.getPropertyValue("--overview-card-columns"));
          placeholder.style.setProperty("--overview-card-min-width",dragged.style.getPropertyValue("--overview-card-min-width"));
          placeholder.style.gridColumn = dragged.style.gridColumn;
          placeholder.style.gridRow = dragged.style.gridRow;
          placeholder.style.boxSizing = "border-box";
          placeholder.style.alignSelf = "start";
          placeholder.style.minWidth = `${dragState.bounds.width}px`;
          placeholder.style.maxWidth = "none";
          placeholder.style.width = `${dragState.bounds.width}px`;
          placeholder.style.minHeight = `${dragState.bounds.height}px`;
          placeholder.style.maxHeight = `${dragState.bounds.height}px`;
          placeholder.style.height = `${dragState.bounds.height}px`;
          dragged.after(placeholder);
          dragState.placeholder = placeholder;
          const dropPreview = document.createElement("div");
          dropPreview.className = "overviewDropPreview";
          dropPreview.style.width = "4px";
          dropPreview.style.height = `${dragState.bounds.height}px`;
          document.body.appendChild(dropPreview);
          dragState.dropPreview = dropPreview;
          dragged.style.removeProperty("transform");
          dragged.classList.add("dragging");
          dragged.style.position = "fixed";
          dragged.style.boxSizing = "border-box";
          dragged.style.minWidth = `${dragState.bounds.width}px`;
          dragged.style.maxWidth = "none";
          dragged.style.width = `${dragState.bounds.width}px`;
          dragged.style.minHeight = `${dragState.bounds.height}px`;
          dragged.style.maxHeight = `${dragState.bounds.height}px`;
          dragged.style.height = `${dragState.bounds.height}px`;
          dragged.style.zIndex = "100";
          dragged.style.pointerEvents = "none";
          dragged.style.gridColumn = "auto";
          dragged.style.margin = "0";
        }
        dragged.style.left = `${event.clientX-dragState.offsetX}px`;
        dragged.style.top = `${event.clientY-dragState.offsetY}px`;
        const draggedBounds = dragged.getBoundingClientRect();
        const targetX = draggedBounds.left+draggedBounds.width/2;
        const targetY = draggedBounds.top+draggedBounds.height/2;
        const rows = [];
        cards.forEach(candidate=>{
          if (candidate===dragged) return;
          const bounds = candidate.getBoundingClientRect();
          let row = rows.find(entry=>Math.abs(entry.top-bounds.top)<6);
          if (!row){ row={top:bounds.top,cards:[]}; rows.push(row); }
          row.cards.push({card:candidate,bounds});
        });
        rows.sort((a,b)=>a.top-b.top);
        rows.forEach(row=>row.cards.sort((a,b)=>a.bounds.left-b.bounds.left));
        const rowIndex = Math.max(0,rows.findIndex((row,index)=>targetY<(rows[index+1]?.top??Infinity)));
        const row = rows[rowIndex];
        const beforeCard = row?.cards.find(entry=>targetX<entry.bounds.left+entry.bounds.width/2)?.card;
        const reference = beforeCard || rows[rowIndex+1]?.cards[0]?.card || null;
        cards.forEach(candidate=>candidate.classList.remove("dropTarget"));
        const placeholder = dragState.placeholder;
        if (reference) reference.classList.add("dropTarget");
        dragState.dropReference = reference;
        const previewTarget = reference || row?.cards[row.cards.length-1]?.card;
        const dropPreview = dragState.dropPreview;
        if (dropPreview && previewTarget){
          const previewBounds = previewTarget.getBoundingClientRect();
          dropPreview.style.left = `${reference ? previewBounds.left-7 : previewBounds.right+7}px`;
          dropPreview.style.top = `${previewBounds.top}px`;
          dropPreview.hidden = false;
        }else if (dropPreview){
          dropPreview.hidden = true;
        }
      });
      const finishDrag = (event,cancelled=false)=>{
        if (!dragState || dragState.handle!==dragHandle || (event && dragState.pointerId!==event.pointerId)) return;
        const currentDrag = dragState;
        const {card:dragged,placeholder,dropPreview,dropReference,moved} = currentDrag;
        dragState = null;
        window.removeEventListener("pointerup",currentDrag.windowPointerUp);
        window.removeEventListener("pointercancel",currentDrag.windowPointerCancel);
        if (moved && !cancelled && placeholder && placeholder.isConnected){
          placeholder.remove();
          if (dropReference && dropReference.isConnected && dropReference!==dragged){
            cardContainer.insertBefore(dragged,dropReference);
          }else if (!dropReference){
            cardContainer.appendChild(dragged);
          }
          state.overviewCardOrder = [...cardContainer.querySelectorAll("[data-overview-card]")].map(candidate=>candidate.dataset.overviewCard);
          scheduleSave();
        }else if (placeholder && placeholder.isConnected){ placeholder.remove(); }
        if (dropPreview && dropPreview.isConnected) dropPreview.remove();
        ["position","left","top","width","height","min-width","max-width","min-height","max-height","box-sizing","z-index","pointer-events","margin"].forEach(property=>dragged.style.removeProperty(property));
        if (moved && !cancelled){
          refreshOverviewLayout();
          wrap.scrollLeft = 0;
          requestAnimationFrame(refreshOverviewLayout);
        }
        else {
          dragged.style.gridColumn = currentDrag.gridColumn;
          dragged.style.gridRow = currentDrag.gridRow;
        }
        cards.forEach(candidate=>candidate.classList.remove("dragging","dropTarget"));
      };
      dragHandle.addEventListener("pointerup",finishDrag);
      dragHandle.addEventListener("pointercancel",event=>finishDrag(event,true));
      dragHandle.addEventListener("lostpointercapture",event=>finishDrag(event));
      dragHandle.addEventListener("keydown",event=>{
        const step = {ArrowLeft:-1,ArrowUp:-1,ArrowRight:1,ArrowDown:1}[event.key];
        if (!step) return;
        event.preventDefault();
        const siblings = [...cardContainer.querySelectorAll("[data-overview-card]")];
        const index = siblings.indexOf(card);
        const next = siblings[index+step];
        if (!next) return;
        cardContainer.insertBefore(card,step<0 ? next : next.nextSibling);
        state.overviewCardOrder = [...cardContainer.querySelectorAll("[data-overview-card]")].map(candidate=>candidate.dataset.overviewCard);
        arrangeCards();
        scheduleSave();
      });

      const resizeHandle = document.createElement("span");
      resizeHandle.className = "overviewResizeHandle";
      resizeHandle.setAttribute("role","button");
      resizeHandle.setAttribute("aria-label",`Resize ${card.querySelector("h3")?.textContent||"overview card"}`);
      resizeHandle.setAttribute("aria-keyshortcuts","ArrowLeft ArrowRight ArrowUp ArrowDown");
      resizeHandle.title = "Drag to resize; use arrow keys when focused";
      resizeHandle.tabIndex = 0;
      card.appendChild(resizeHandle);
      let resizeState = null;
      resizeHandle.addEventListener("pointerdown",event=>{
        if (event.button!==0 || resizeState || dragState) return;
        event.preventDefault();
        const metrics = getGridMetrics();
        const minWidth = Math.min(Number(card.dataset.overviewMinWidth)||260,metrics.width);
        resizeState = {pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,
          columns:getCardColumns(card),tracks:metrics.tracks,trackWidth:metrics.trackWidth,gridGap:metrics.gap,
          minWidth,
          initialColumns:Number(card.style.getPropertyValue("--overview-card-columns"))||1,
          initialWidth:card.style.getPropertyValue("--overview-card-width"),width:card.getBoundingClientRect().width,
          initialHeight:card.style.getPropertyValue("--overview-card-height"),height:card.getBoundingClientRect().height,gridWidth:metrics.width,changed:false};
        card.style.removeProperty("width");
        resizeHandle.setPointerCapture(event.pointerId);
      });
      resizeHandle.addEventListener("pointermove",event=>{
        if (!resizeState || resizeState.pointerId!==event.pointerId) return;
        event.preventDefault();
        const tracks = resizeState.tracks;
        const widthStep = resizeState.trackWidth+resizeState.gridGap;
        const width = clamp(resizeState.width+(event.clientX-resizeState.startX),resizeState.minWidth,resizeState.gridWidth);
        const columns = clamp(Math.ceil((width+resizeState.gridGap)/Math.max(widthStep,1)),1,tracks);
        const height = resizeState.height+(event.clientY-resizeState.startY);
        card.style.setProperty("--overview-card-width",`${width}px`);
        setCardColumns(card,columns);
        card.style.setProperty("--overview-card-height",`${Math.max(height,180)}px`);
        resizeState.changed = Math.abs(width-resizeState.width)>=1 || Math.abs(height-resizeState.height)>=1;
      });
      const finishResize = (event,cancelled=false)=>{
        if (!resizeState || (event && resizeState.pointerId!==event.pointerId)) return;
        const {changed,initialColumns,initialWidth,initialHeight} = resizeState;
        resizeState = null;
        if (cancelled){
          if (initialWidth) card.style.setProperty("--overview-card-width",initialWidth);
          else card.style.removeProperty("--overview-card-width");
          setCardColumns(card,initialColumns);
          if (initialHeight) card.style.setProperty("--overview-card-height",initialHeight);
          else card.style.removeProperty("--overview-card-height");
        }else if (changed){ saveCardLayout(card); }
        refreshOverviewLayout();
      };
      resizeHandle.addEventListener("pointerup",finishResize);
      resizeHandle.addEventListener("pointercancel",event=>finishResize(event,true));
      resizeHandle.addEventListener("lostpointercapture",event=>finishResize(event,true));
      resizeHandle.addEventListener("keydown",event=>{
        const step = {ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-40],ArrowDown:[0,40]}[event.key];
        if (!step) return;
        event.preventDefault();
        if (step[0]){
          const metrics = getGridMetrics();
          const minWidth = Math.min(Number(card.dataset.overviewMinWidth)||260,metrics.width);
          const width = clamp(card.getBoundingClientRect().width+step[0],minWidth,metrics.width);
          const nextColumns = clamp(Math.ceil((width+metrics.gap)/(metrics.trackWidth+metrics.gap)),1,metrics.tracks);
          card.style.setProperty("--overview-card-width",`${width}px`);
          setCardColumns(card,nextColumns);
        }
        const currentHeight = Number.parseFloat(card.style.getPropertyValue("--overview-card-height"))||card.getBoundingClientRect().height;
        card.style.setProperty("--overview-card-height",`${Math.max(currentHeight+step[1],180)}px`);
        saveCardLayout(card);
        refreshOverviewLayout();
      });
    });
    wrap.appendChild(view);
    wrap.querySelectorAll(".overviewRecentRow[data-iid]").forEach(el=>{
      el.onclick = () => {
        openItemModal(el.dataset.pid,el.dataset.gid,el.dataset.iid);
      };
    });
    wrap.querySelectorAll(".overviewTimelineItem[data-iid]").forEach(el=>{
      el.onclick = () => openItemModal(el.dataset.pid,el.dataset.gid,el.dataset.iid);
    });
    wrap.querySelectorAll(".overviewTimelineItem[data-calendar-id]").forEach(el=>{
      el.onclick = () => {
        const item = (state.calendarItems||[]).find(candidate=>candidate.id===el.dataset.calendarId);
        if (item) openStandaloneCalendarItemModal(item);
      };
    });
    wrap.querySelectorAll("[data-overview-project]").forEach(el=>{
      el.onclick = () => selectProject(el.dataset.overviewProject);
    });
    wrap.querySelectorAll("[data-overview-stat]").forEach(button=>{
      button.onclick=()=>openOverviewStatDetails(button.dataset.overviewStat);
    });
    wrap.querySelectorAll("[data-overview-action]").forEach(button=>{
      button.onclick = async () => {
        if (button.dataset.overviewAction==="project"){
          document.getElementById("addProjectBtn").click();
          return;
        }
        if (button.dataset.overviewAction==="calendar"){
          activeProjectId = CALENDAR; persistActiveLocation(); renderAll(); return;
        }
        if (button.dataset.overviewAction==="event"){
          openNewCalendarItemModal(null,today);
          return;
        }
        if (!state.projects.length){
          await showNotice("Create a project first","Tasks are organized inside project groups.");
          return;
        }
        const result = await showDialog({title:"New task",fields:[
          {label:"Task name",placeholder:"What needs to get done?"},
          {label:"Project",type:"select",options:state.projects.map(project=>({value:project.id,label:project.name})),value:state.projects[0].id}
        ],confirmLabel:"Create task"});
        if (!result) return;
        const [title,projectId] = result;
        const project = getProject(projectId);
        const group = project?.groups[0];
        if (!title.trim() || !project || !group) return;
        const item = addItem(project.id,group.id,title.trim());
        openItemModal(project.id,group.id,item.id);
      };
    });
    board.appendChild(wrap);
    requestAnimationFrame(refreshOverviewLayout);
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
    if (showDialog.finishActive) showDialog.finishActive(null);
    return new Promise(resolve=>{
      const overlay = document.createElement("div");
      overlay.className = "overlay";
      overlay.id = "dialogOverlay";
      const selectedIconValues = fields.map(field=>field.type==="iconPicker" ? (field.value || DEFAULT_PROJECT_ICON) : null);
      const fieldsHtml = fields.map((field,index)=>{
        const id = `dialogField${index}`;
        const labelFor = field.type === "tagColor" ? `${id}Color0` : id;
        const label = field.label ? `<label for="${labelFor}">${escapeHtml(field.label)}</label>` : "";
        if (field.type === "iconPicker"){
          return `<div class="modalRow">${label}
            <div class="projectIconResults" id="projectIconDefaults${index}" role="radiogroup" aria-label="Default project icons"></div>
            <button class="btn btn-sm projectIconMore" id="projectIconMore${index}" type="button" aria-expanded="false">More icons</button>
            <div class="projectIconSearchPanel" id="projectIconSearchPanel${index}" hidden>
              <input class="form-control projectIconSearch" id="${id}" type="search" placeholder="Search icons, e.g. folder or rocket" aria-label="Search Material Design icons">
              <div class="projectIconResults" id="projectIconSearchResults${index}" role="radiogroup" aria-label="Icon search results"></div>
              <p class="projectIconSearchStatus" id="projectIconStatus${index}" role="status">Search Material Design Icons to browse more.</p>
            </div>
          </div>`;
        }
        if (field.type === "tagColor"){
          const selectedIndex = TAG_COLOR_OPTIONS.findIndex(option=>option.value===field.value);
          const customValue = /^#[0-9a-f]{6}$/i.test(field.value||"") ? field.value : "#0969da";
          const swatches = TAG_COLOR_OPTIONS.map((option,optionIndex)=>`<label class="tagColorOption" title="${option.label}">
            <input id="${id}Color${optionIndex}" type="radio" name="${id}" value="${escapeHtml(option.value)}" ${selectedIndex===optionIndex?"checked":""}>
            <span class="tagColorSwatch" style="background:${escapeHtml(option.value)}"></span><span class="sr-only">${option.label}</span>
          </label>`).join("");
          return `<div class="modalRow">${label}<div class="tagColorGrid" role="radiogroup" aria-label="${escapeHtml(field.label||"Pill color")}">
            ${swatches}<div class="tagColorCustomOption" title="Custom color">
              <input id="${id}Custom" type="radio" name="${id}" value="__custom__" ${selectedIndex<0?"checked":""} aria-label="Custom color">
              <span class="tagColorCustomSwatch"><iconify-icon icon="mdi:eyedropper-variant" aria-hidden="true"></iconify-icon><span class="tagColorCustomCurrent${selectedIndex<0?" is-visible":""}" style="background:${customValue}"></span></span>
              <input class="tagColorPicker" id="dialogColor${index}" type="color" value="${customValue}" aria-label="Choose custom pill color">
            </div>
          </div></div>`;
        }
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
        <div class="uiDivider modalDivider" aria-hidden="true"></div>
        <div class="modalFooter">
          <button class="btn btn-invisible" data-dialog-cancel>${escapeHtml(cancelLabel)}</button>
          ${secondaryLabel ? `<button class="btn" data-dialog-secondary>${escapeHtml(secondaryLabel)}</button>` : ""}
          <button class="btn ${danger?"btn-danger":"btn-primary"} btn-sm" data-dialog-confirm>${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`;
      document.body.appendChild(overlay);
      const finish = value => {
        overlay.remove();
        if (showDialog.finishActive === finish) showDialog.finishActive = null;
        resolve(value);
      };
      showDialog.finishActive = finish;
      fields.forEach((field,index)=>{
        if (field.type === "iconPicker"){
          const defaults = overlay.querySelector(`#projectIconDefaults${index}`);
          const moreButton = overlay.querySelector(`#projectIconMore${index}`);
          const searchPanel = overlay.querySelector(`#projectIconSearchPanel${index}`);
          const search = overlay.querySelector(`#dialogField${index}`);
          const results = overlay.querySelector(`#projectIconSearchResults${index}`);
          const status = overlay.querySelector(`#projectIconStatus${index}`);
          let matches = [];
          let searchTimer = null;
          let searchSequence = 0;
          const renderOptions = (container,icons)=>{
            container.innerHTML = icons.map(iconName=>`<label class="projectIconOption" title="${escapeHtml(iconName)}">
              <input type="radio" name="dialogIcon${index}" value="${escapeHtml(iconName)}" ${selectedIconValues[index]===iconName?"checked":""}>
              <iconify-icon icon="${escapeHtml(iconName)}" aria-hidden="true"></iconify-icon><span>${escapeHtml(iconName.slice(4))}</span>
            </label>`).join("");
          };
          const renderIconChoices = ()=>{
            const defaultIcons = [...PROJECT_DEFAULT_ICONS];
            if (!defaultIcons.includes(selectedIconValues[index])) defaultIcons.unshift(selectedIconValues[index]);
            const defaultIconSet = new Set(defaultIcons);
            renderOptions(defaults,defaultIcons);
            renderOptions(results,matches.filter(iconName=>!defaultIconSet.has(iconName)));
          };
          const selectIcon = event=>{
            const radio = event.target.closest('input[type="radio"]');
            if (!radio) return;
            selectedIconValues[index] = radio.value;
            renderIconChoices();
          };
          renderIconChoices();
          defaults.addEventListener("change",selectIcon);
          results.addEventListener("change",selectIcon);
          moreButton.addEventListener("click",()=>{
            searchPanel.hidden = !searchPanel.hidden;
            moreButton.setAttribute("aria-expanded",String(!searchPanel.hidden));
            moreButton.textContent = searchPanel.hidden ? "More icons" : "Hide search";
            if (!searchPanel.hidden) search.focus();
          });
          search.addEventListener("input",()=>{
            clearTimeout(searchTimer);
            const query = search.value.trim();
            const sequence = ++searchSequence;
            if (query.length<2){
              matches = [];
              renderIconChoices();
              status.textContent = query ? "Type at least 2 characters to search." : "Search Material Design Icons to browse more.";
              return;
            }
            status.textContent = "Searching icons...";
            searchTimer = setTimeout(async()=>{
              try{
                const response = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(query)}&prefix=mdi&limit=48`);
                if (!response.ok) throw new Error("Icon search unavailable");
                const payload = await response.json();
                if (sequence!==searchSequence) return;
                matches = (Array.isArray(payload.icons) ? payload.icons : []).filter(iconName=>typeof iconName==="string" && /^mdi:[a-z0-9-]+$/i.test(iconName));
                renderIconChoices();
                status.textContent = matches.length ? `${matches.length} icons found.` : "No matching icons.";
              }catch(err){
                if (sequence!==searchSequence) return;
                matches = [];
                renderIconChoices();
                status.textContent = "Icon search unavailable. Your selected icon is unchanged.";
              }
            },250);
          });
          return;
        }
        if (field.type !== "tagColor") return;
        const customRadio = overlay.querySelector(`input[name="dialogField${index}"][value="__custom__"]`);
        const picker = overlay.querySelector(`#dialogColor${index}`);
        const currentColor = overlay.querySelector(`.tagColorCustomCurrent`);
        const selectCustom = () => { customRadio.checked = true; currentColor.classList.add("is-visible"); };
        picker.addEventListener("pointerdown",selectCustom);
        picker.addEventListener("input",()=>{
          selectCustom();
          currentColor.style.background = picker.value;
        });
        overlay.querySelectorAll(`input[name="dialogField${index}"]:not([value="__custom__"])`).forEach(radio=>{
          radio.addEventListener("change",()=>currentColor.classList.remove("is-visible"));
        });
      });
      overlay.querySelectorAll("[data-dialog-cancel]").forEach(button=>button.onclick=()=>finish(null));
      const secondary = overlay.querySelector("[data-dialog-secondary]");
      if (secondary) secondary.onclick = () => finish("__secondary__");
      overlay.querySelector("[data-dialog-confirm]").onclick = () => {
        const values = fields.map((field,index)=>{
          if (field.type === "iconPicker") return selectedIconValues[index];
          if (field.type !== "tagColor") return overlay.querySelector(`#dialogField${index}`).value;
          const selected = overlay.querySelector(`input[name="dialogField${index}"]:checked`);
          return selected?.value === "__custom__" ? overlay.querySelector(`#dialogColor${index}`).value : selected?.value;
        });
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
      ${!isNew ? `<div class="itemModalActions">
        <button class="btn btn-invisible btn-sm itemModalMenuButton" type="button" data-action="toggleItemMenu" aria-label="More item actions" aria-haspopup="menu" aria-expanded="false" aria-controls="itemModalActionMenu"><iconify-icon icon="mdi:dots-horizontal" aria-hidden="true"></iconify-icon></button>
        <div class="itemModalActionMenu" id="itemModalActionMenu" role="menu" hidden>
          <button type="button" role="menuitem" data-action="duplicateItem"><iconify-icon icon="mdi:content-copy" aria-hidden="true"></iconify-icon><span>Duplicate</span></button>
          <button type="button" role="menuitem" data-action="toggleArchive"><iconify-icon icon="mdi:archive-outline" aria-hidden="true"></iconify-icon><span>${item.archived ? "Unarchive" : "Archive"}</span></button>
          <div class="itemModalActionSeparator" role="separator"></div>
          <button type="button" role="menuitem" class="danger" data-action="deleteItem"><iconify-icon icon="mdi:trash-can-outline" aria-hidden="true"></iconify-icon><span>Delete item</span></button>
        </div>
      </div>` : ""}
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
      item.updatedAt = Date.now(); scheduleSave(); render(); renderItemModal();
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
        item.updatedAt = Date.now(); scheduleSave(); render(); renderItemModal();
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
        item.updatedAt = Date.now(); scheduleSave(); render(); renderItemModal();
      });
    });
    modal.querySelectorAll(".fieldInput").forEach(el=>{
      el.addEventListener("change", e=>{
        const field = project.fields.find(candidate=>candidate.id===el.dataset.fieldid);
        if (field?.type==="date" && item.values[el.dataset.fieldid] && !e.target.value) queueGoogleEventDeletes(item);
        item.values[el.dataset.fieldid] = e.target.value;
        if (isNew){ renderItemModal(); return; }
        item.updatedAt = Date.now(); scheduleSave(); render(); renderItemModal();
      });
    });
    modal.querySelector("#itemDescInput").addEventListener("change", e=>{
      item.description = e.target.value;
      if (isNew) return;
      item.updatedAt = Date.now(); scheduleSave(); render();
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
      const archiveBtn = modal.querySelector('[data-action="toggleArchive"]');
      if (archiveBtn) archiveBtn.onclick = () => { toggleArchiveItem(projectId, groupId, itemId); renderItemModal(); };
      const completeBtn = modal.querySelector('[data-action="completeItem"]');
      if (completeBtn) completeBtn.onclick = () => {
        item.completedAt = isItemCompleted(item) ? null : Date.now();
        item.updatedAt = Date.now();
        scheduleSave();
        render();
        renderItemModal();
      };
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
    const goToOverview = () => {
      activeProjectId = OVERVIEW; persistActiveLocation(); renderAll(); closeSidebarOnMobile();
    };
    document.getElementById("overviewNav").onclick = goToOverview;
    document.getElementById("brandHomeBtn").onclick = goToOverview;
    document.getElementById("calendarNav").onclick = () => {
      activeProjectId = CALENDAR; persistActiveLocation(); renderAll(); closeSidebarOnMobile();
    };
    document.getElementById("integrationsNav").onclick = () => {
      navigateToIntegrations();
    };
    document.getElementById("settingsNav").onclick = navigateToSettings;
    document.getElementById("supportNav").onclick = navigateToSupport;
    document.getElementById("feedbackNav").onclick = () => window.open(FEEDBACK_URL, "_blank", "noopener,noreferrer");
    document.getElementById("focusTimerNav").onclick = toggleFocusTimer;
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
    document.getElementById("globalSearch").addEventListener("input", e=> runGlobalSearch(e.target.value.trim()));
    document.addEventListener("click", (e)=>{
      if (!e.target.closest("#sidebarWrap")) document.getElementById("searchResults").style.display="none";
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
    document.getElementById("focusStartBtn").onclick = () => {
      if (focusInterval) pauseFocusTimer(); else startFocusTimer();
    };
    document.getElementById("focusResetBtn").onclick = resetFocusTimer;
    document.getElementById("focusDurationApplyBtn").onclick = applyCustomFocusDuration;
    document.getElementById("focusDurationInput").addEventListener("input", event=>event.target.setCustomValidity(""));
    document.getElementById("focusDurationInput").addEventListener("keydown", event=>{
      if (event.key==="Enter"){ event.preventDefault(); applyCustomFocusDuration(); }
    });
    document.querySelectorAll("[data-focus-mode]").forEach(button=>{
      button.onclick = () => setFocusMode(button.dataset.focusMode);
    });
    renderFocusQuickOptions();
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
    document.getElementById("sidebarCollapseHandle").onclick = toggleSidebarCollapsed;
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
  async function boot(){
    initTheme();
    initSidebarCollapse();
    wireStaticControls();
    wireConnectGate();
    if (NETLIFY_IDENTITY_ENABLED){
      try{
        await loadNetlifyIdentity();
        await initAuth();
      }catch(err){ /* Identity is optional; the workspace runs without it. */ }
    }
    try{
      const [settingsModule,overviewDetailsViewModule,overviewDetailsModelModule] = await Promise.all([
        import("./views/settings-view.js"),
        import("./views/overview-details-view.js"),
        import("./models/overview-details-model.js")
      ]);
      settingsView = createSettingsView(settingsModule.SettingsView);
      overviewDetailsView = new overviewDetailsViewModule.OverviewDetailsView({model:new overviewDetailsModelModule.OverviewDetailsModel()});
      await window.BeforeworkViewTemplates.loadAll();
    }catch(err){
      showNotice("Couldn't load views", err.message);
      return;
    }
    const reconnected = await tryReconnectFile();
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
