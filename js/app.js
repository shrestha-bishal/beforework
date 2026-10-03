  "use strict";

  /* ---------- Constants ---------- */
  const uid = () => crypto.randomUUID();
  // Primer's own semantic fg tokens, not hand-picked hex - these track
  // light/dark theme automatically instead of needing a second palette.
  const fieldTypes=window.BeforeworkFieldTypes;
  const TAG_FIELD=fieldTypes.get("tags");
  const TAG_COLORS=TAG_FIELD.colors;
  const TAG_COLOR_OPTIONS=TAG_FIELD.colorOptions;
  const SELECT_COLORS=fieldTypes.get("select").colors;
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
  const PRIORITY_OPTIONS=fieldTypes.get("priority").options;
  const FIELD_TYPE_OPTIONS=fieldTypes.list();
  const FIELD_TYPES=FIELD_TYPE_OPTIONS.map(option=>option.value);
  function fieldTypeLabel(type){ return fieldTypes.get(type)?.label||"Text"; }
  function fieldTypeDescription(type){ return fieldTypes.get(type)?.description||""; }
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
  const modal = window.BeforeworkModal.create();
  const actionMenus = window.BeforeworkActionMenu.create();
  const itemModalView = window.BeforeworkItemModal.create();
  const shortcutsModal = window.BeforeworkShortcutsModal.create({
    modal,
    cloneTemplate:()=>window.BeforeworkViewTemplates.clone("shortcutsModal")
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
  let connectGate = null;
  let navigation = null;
  let projectActionsMenu = null;
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
  const VIEW_DEFS=window.BeforeworkViewRegistry.list();
  function viewLabel(type){ return window.BeforeworkViewRegistry.label(type); }
  const PROJECT_TEMPLATES = {
    simple:   {label:"Simple list",               views:["list"],               fields:[],               groups:[]},
    table:    {label:"Table (spreadsheet-style)",  views:["table"],              fields:[],               groups:[]},
    taskboard:{label:"Project / task management",  views:["kanban","list","calendar","roadmap"], fields:["priority","due","status"], groups:[], boardGroupBy:"Status"},
    calendarTpl:{label:"Calendar / events",        views:["calendar","list"],    fields:["due"],          groups:[], itemDefaultType:"event"},
    blank:    {label:"Blank",                      views:["list"],              fields:[],               groups:[]},
  };
  const DEFAULT_STATUS_OPTIONS=["To do","In progress","Review"];
  function buildFieldsForTemplate(keys){
    return (keys||[]).map(k=>{
      if (k==="priority") return {id:uid(), label:"Priority", type:"priority", options:[]};
      if (k==="due") return {id:uid(), label:"Due date", type:"due-date", options:[]};
      if (k==="status") return {id:uid(), label:"Status", type:"select", options:DEFAULT_STATUS_OPTIONS.map((label,index)=>({id:uid(),label,color:SELECT_COLORS[index%SELECT_COLORS.length]}))};
      return null;
    }).filter(Boolean);
  }
  function ensureStatusOptions(field,names){
    if (!Array.isArray(field.options)) field.options=[];
    const options=new Map(field.options.map(option=>[option.label.trim().toLowerCase(),option]));
    names.forEach(name=>{
      const key=name.trim().toLowerCase();
      if (options.has(key)) return;
      const option={id:uid(),label:name,color:SELECT_COLORS[field.options.length%SELECT_COLORS.length]};
      field.options.push(option);
      options.set(key,option);
    });
    return options;
  }
  let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let boardFilterText = "";
  let boardFilterGroups = new Set();
  let boardFilterTags = new Set();
  let boardFilterFields = new Map(); // fieldId -> "__all__" | "__none__" | optionId
  let boardFilterColumns = new Map(); // columnId -> selected option values
  const COLUMN_FILTER_NONE="__none__";
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

  function renderAuthUI(){
    if (activeProjectId===SETTINGS) render();
  }
  const authService=window.BeforeworkAuth.create({
    providers:[window.BeforeworkNetlifyIdentityProvider.create()],
    onUserChange:renderAuthUI,
    onUnavailable:renderAuthUI
  });

  /* ---------- Keyboard shortcuts modal ---------- */
  function showShortcutsModal(){
    shortcutsModal.open();
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
  const workspaceRecovery=window.BeforeworkWorkspaceRecovery.create({
    getState:()=>state,
    setState:nextState=>{ state=nextState; },
    isConnected:()=>!!fileHandle,
    getSchemaVersion:()=>SCHEMA_VERSION,
    migrateState,
    schemaMigration,
    storage:window.BeforeworkStorage,
    validation:window.BeforeworkWorkspaceValidation,
    showNotice,
    showConfirm,
    onWorkspaceReplaced(kind){
      lastSavedState=null;
      undoStack.length=0;
      if (kind!=="migration-restore") selectedItemIds.clear();
      if (kind==="import"){
        filterPrefs={};
        boardFilterColumns.clear();
        saveFilterPrefs();
        activeProjectId=OVERVIEW;
        persistActiveLocation();
      }
      scheduleSave();
      renderAll();
    }
  });

  function showConnectGate(){
    connectGate.show();
  }
  function hideConnectGate(){
    connectGate.hide();
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

  function saveFilterPrefs(){
    localStorage.setItem(FILTER_KEY, JSON.stringify(filterPrefs));
  }
  function pruneColumnFilters(project){
    const validColumns=new Set(["title","group","progress","updated",...project.fields.filter(field=>field.type!=="tags").map(field=>`field:${field.id}`)]);
    if (project.fields.some(field=>field.type==="tags")) validColumns.add("tags");
    for (const columnId of boardFilterColumns.keys()) if (!validColumns.has(columnId)) boardFilterColumns.delete(columnId);
  }
  function persistActiveFilters(){
    if (activeProjectId===OVERVIEW) return;
    const project=getProject(activeProjectId);
    if (project) pruneColumnFilters(project);
    filterPrefs[activeProjectId] = {
      text: boardFilterText,
      groups: [...boardFilterGroups],
      tags: [...boardFilterTags],
      fields: Object.fromEntries(boardFilterFields),
      columns: Object.fromEntries([...boardFilterColumns].map(([id,values])=>[id,[...values]])),
      completion: completionFilter
    };
    saveFilterPrefs();
  }
  function sharedColumnField(project,columnId){
    if (!columnId.startsWith("field:")) return null;
    const field=project?.fields?.find(candidate=>candidate.id===columnId.slice(6));
    return ["checkbox","priority","select","multi-select","relation"].includes(field?.type)?field:null;
  }
  function migrateColumnFiltersToMain(project){
    if (!project) return;
    for (const [columnId,values] of [...boardFilterColumns]){
      if (columnId==="group"){
        boardFilterGroups=new Set([...boardFilterGroups,...values]);
        boardFilterColumns.delete(columnId);
      } else if (columnId==="tags"){
        boardFilterTags=new Set([...boardFilterTags,...values]);
        boardFilterColumns.delete(columnId);
      } else {
        const field=sharedColumnField(project,columnId);
        if (!field) continue;
        const current=boardFilterFields.get(field.id);
        const selected=new Set(Array.isArray(current)?current:current&&current!=="__all__"?[current]:[]);
        values.forEach(value=>selected.add(value));
        boardFilterFields.set(field.id,[...selected]);
        boardFilterColumns.delete(columnId);
      }
    }
  }
  function restoreProjectFilters(pid){
    const saved = filterPrefs[pid] || {};
    boardFilterText = saved.text || "";
    boardFilterGroups = new Set(Array.isArray(saved.groups) ? saved.groups : []);
    boardFilterTags = new Set(Array.isArray(saved.tags) ? saved.tags : []);
    boardFilterFields = new Map(Object.entries(saved.fields || {}));
    boardFilterColumns = new Map(Object.entries(saved.columns||{}).map(([id,values])=>[id,new Set(Array.isArray(values)?values:[])]));
    migrateColumnFiltersToMain(getProject(pid));
    completionFilter = saved.completion==="completed" ? "completed" : "open";
  }

  /* ---------- Model helpers ---------- */
  const itemFeature=window.BeforeworkItemFeature.create({
    uid,getProject,tagColorOptions:TAG_COLOR_OPTIONS,selectedItemIds,boardFilterTags,
    hasTagsField,queueGoogleEventDeletes,showConfirm,showDialog,
    scheduleSave,render,renderAll,renderProjectList
  });
  const {
    UNGROUPED_GROUP_ID,recordItemActivity,projectGroups,projectItemEntries,appendProjectItem,
    getGroup,getItem,isItemCompleted,createItem,createDraft,addItem,setItemFieldValue,
    removeItemRelations,deleteItem,makeDuplicateItem,duplicateItem,toggleArchiveItem,
    addComment,deleteComment,bulkSetCompleted,bulkDelete,bulkMove,createTag,bulkTag,
    bulkDuplicate,moveItem,deleteTag
  }=itemFeature;
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
    if (!Array.isArray(project.items)) project.items=[];
    let migratedProject=false;
    const items=projectItemEntries(project).map(row=>row.item);
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
      const group=project?.groups.find(candidate=>candidate.id===details.groupId)
        || (details.groupId==="__project_items__" ? {items:project?.items||[]} : null);
      item=group?.items.find(candidate=>candidate.id===details.itemId);
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
  function hasTagsField(project){ return !!project?.fields?.some(field=>field?.type==="tags"); }
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
      const groups=projectGroups(project);
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
        const group=projectGroups(project).find(candidate=>candidate.id===item.groupId)||{id:item.groupId,name:item.groupName};
        out.push({project,group,item});
      }));
      return out;
    }
    state.projects.forEach(project=>projectItemEntries(project).forEach(({group,item})=>
      out.push({project,group,item})));
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
    const fields=buildFieldsForTemplate(tpl.fields);
    const groupByFieldId=fields.find(field=>field.label===tpl.boardGroupBy)?.id;
    const views = tpl.views.map(type=>({
      id:uid(),
      type,
      name:viewLabel(type),
      ...(type==="kanban"&&groupByFieldId?{groupByFieldId}:{})
    }));
    const p = {
      id:uid(), name, description, createdAt:Date.now(), folderId:null,
      tags:[],
      fields,
      groups: tpl.groups.map(gName=>({id:uid(), name:gName, items:[]})),
      items:[],
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
    projectGroups(project).forEach(group=>group.items.forEach(item=>{
      if (item.milestoneId===milestone.id) item.milestoneId=null;
    }));
    project.milestones=project.milestones.filter(candidate=>candidate.id!==milestone.id);
    scheduleSave();
    render();
  }
  async function deleteProject(pid){
    const project = await ensureProjectLoaded(pid);
    if (project) projectGroups(project).forEach(group=>group.items.forEach(queueGoogleEventDeletes));
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
    const itemIds = new Map();
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
    [...groups.flatMap(group=>group.items||[]),...(project.items||[])].forEach(item=>itemIds.set(item.id,uid()));
    views.forEach(view=>viewIds.set(view.id, uid()));
    (project.milestones||[]).forEach(milestone=>milestoneIds.set(milestone.id,uid()));

    const copyItem = item=>{
      const values = {};
      Object.entries(item.values||{}).forEach(([fieldId,value])=>{
        const sourceField=(project.fields||[]).find(field=>field.id===fieldId);
        values[fieldIds.get(fieldId)||fieldId] = sourceField?.type==="relation"
          ? (Array.isArray(value)?value.map(id=>itemIds.get(id)).filter(Boolean):[])
          : optionIds.get(value)||value;
      });
      const copy = {
        ...item,
        id:itemIds.get(item.id),
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
      items:(project.items||[]).map(copyItem),
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
    if (!p || !Array.isArray(p.groups)) return;
    const group = p.groups.find(candidate=>candidate.id===gid);
    if (!group) return;
    if (group.items.length){
      const target = targetGroupId===UNGROUPED_GROUP_ID
        ? {id:UNGROUPED_GROUP_ID,items:(p.items||(p.items=[]))}
        : p.groups.find(candidate=>candidate.id===targetGroupId && candidate.id!==gid);
      if (!target) return;
      const now = Date.now();
      group.items.forEach(item=>{ item.updatedAt = now; target.items.push(item); });
    }
    p.groups = p.groups.filter(g=>g.id!==gid);
    boardFilterGroups.delete(gid);
    scheduleSave(); render(); renderProjectList();
  }
  async function editGroupName(project, group){
    const name = await showDialog({title:"Edit", fields:[{label:"Group name", value:group.name}], confirmLabel:"Save"});
    if (!name || !name.trim()) return;
    group.name = name.trim();
    scheduleSave(); renderAll();
  }
  async function confirmDeleteGroup(project, group){
    if (!project.groups.includes(group)) return;
    let targetGroupId = null;
    if (group.items.length){
      const destinations=[
        ...project.groups.filter(candidate=>candidate.id!==group.id).map(candidate=>({value:candidate.id,label:candidate.name})),
        {value:UNGROUPED_GROUP_ID,label:"Unassigned"}
      ];
      targetGroupId = await showDialog({
        title:`Delete group ${group.name}`,
        message:`Choose where to move its ${group.items.length} item(s). The items and their calendar links will be preserved.`,
        fields:[{label:"Move items to", type:"select", options:destinations, value:destinations[0]?.value}],
        confirmLabel:"Move items and delete",
        danger:true
      });
      if (!targetGroupId) return;
    } else if (!await showConfirm(`Delete group ${group.name}`, "This group is empty. Delete it?", true)){
      return;
    }
    deleteGroup(project.id, group.id, targetGroupId);
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
    const mappingFieldTemplate=templateFragment.querySelector("#csvImportMappingFieldTemplate");
    const dateFormatTemplate=templateFragment.querySelector("#csvImportDateFormatTemplate");
    const previewSummary=overlay.querySelector("[data-csv-preview-summary]");
    const previewHead=overlay.querySelector("[data-csv-preview-head]");
    const previewBody=overlay.querySelector("[data-csv-preview-body]");
    const confirmButton=overlay.querySelector("[data-csv-confirm]");
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
        ...(hasTagsField(project||{fields})?[{key:"tags",kind:"tags",label:"Tags"}]:[])
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
      if (mappingRenderer.dateFormatControl){
        mappingRenderer.dateFormatControl.hidden=![...mappingRenderer.dateFormatTargetKeys].some(key=>selectedTargets.has(key));
      }
      const hasTitle=Object.hasOwn(mapping,"title");
      const nameValid=destination.value!=="new" || !!newName.value.trim();
      const selectedProject=project;
      const statusField=selectedProject?.fields.find(field=>field.type==="select"&&field.label.trim().toLowerCase()==="status");
      const template=PROJECT_TEMPLATES[templateSelect.value]||PROJECT_TEMPLATES.blank;
      const templateHasStatus=destination.value==="new"&&template.fields.includes("status");
      const groupNames=selectedProject
        ? statusField
          ? (statusField.options||[]).map(option=>option.label)
          : selectedProject.groups.map(group=>group.name)
        : templateHasStatus ? DEFAULT_STATUS_OPTIONS : template.groups;
      const mapsStatusToField=!!statusField||templateHasStatus;
      const prepared=context.parsed && hasTitle
        ? window.BeforeworkCsvImport.prepareImport(context.parsed,mapping,groupNames,mappingRenderer.dateFormatSelect?.value||"DMY")
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
        const additions=prepared.groupsToCreate.length
          ? `${mapsStatusToField?" New status options will be created":" New groups will be created"}: ${prepared.groupsToCreate.join(", ")}.`
          : "";
        previewSummary.textContent=`${prepared.tasks.length} task(s) ready to import.${additions}`;
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

    const mappingRenderer=window.BeforeworkCsvImportDialog.createMappingRenderer({
      documentRef:document,
      mappingFields,
      mappingFieldTemplate,
      dateFormatTemplate,
      makeTargets,
      guessTarget,
      onChange:refreshPreview
    });
    function renderMapping(){
      mappingRenderer.render(context);
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
        const statusField=project.fields.find(field=>field.type==="select"&&field.label.trim().toLowerCase()==="status");
        const groups=new Map(project.groups.map(group=>[group.name.trim().toLowerCase(),group]));
        const statusOptions=statusField
          ? ensureStatusOptions(statusField,prepared.groupsToCreate)
          : new Map();
        if (!statusField){
          prepared.groupsToCreate.forEach(name=>{
            const key=name.trim().toLowerCase();
            const group={id:uid(),name,items:[]};
            project.groups.push(group);
            groups.set(key,group);
          });
        }
        const tags=new Map(project.tags.map(tag=>[tag.name.trim().toLowerCase(),tag]));

        for (const imported of prepared.tasks){
          const statusOption=imported.status?statusOptions.get(imported.status.trim().toLowerCase()):null;
          const group=statusField
            ? null
            : imported.status ? groups.get(imported.status.trim().toLowerCase())
              : projectGroups(project).find(candidate=>candidate.id===UNGROUPED_GROUP_ID)||project.groups[0];
          if (statusField&&imported.status&&!statusOption) throw new Error(`Couldn't find a Status option for "${imported.status}".`);
          if (!statusField&&!group) throw new Error(`Couldn't find a group for status "${imported.status}".`);
          const item=createItem(project.id,imported.title);
          item.description=imported.description;
          if (statusField&&statusOption) item.values[statusField.id]=statusOption.id;
          if (startField && imported.startDate) item.values[startField.id]=imported.startDate;
          if (dueField && imported.dueDate) item.values[dueField.id]=imported.dueDate;
          customDateFields.forEach(({key,field})=>{
            if (imported.customDates[key]) item.values[field.id]=imported.customDates[key];
          });
          if (priorityField && imported.priority) item.values[priorityField.id]=imported.priority;
          if (hasTagsField(project)) imported.tags.forEach(name=>{
            const key=name.trim().toLowerCase();
            let tag=tags.get(key);
            if (!tag){ tag=createTag(project,name); tags.set(key,tag); }
            if (!item.tagIds.includes(tag.id)) item.tagIds.push(tag.id);
          });
          if (statusField) appendProjectItem(project,UNGROUPED_GROUP_ID,item);
          else group.items.push(item);
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
  function openNewItemModal(project, group, milestoneId=null, fieldAssignment=null){
    if (!project || !group) return;
    openItemRef = {projectId:project.id, groupId:group.id, itemId:null, isNew:true, globalNew:false,
      draft:createDraft(project,milestoneId,fieldAssignment)};
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
  async function quickAddViaShortcut(){
    const project = getProject(activeProjectId);
    if (!project){ showNotice("Pick a project", "Open a project from the sidebar first, then press n to quickly add an item."); return; }
    const group = project.groups[0]||{id:"__project_items__",name:"Unassigned",items:project.items||(project.items=[])};
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
  async function addField(project, label, type){
    if (type==="date"&&/^(start|start date|starts on|due|due date|deadline)$/.test(label.trim().toLowerCase())){
      await showNotice("Choose a date-specific field type",`Use Start date or Due date for "${label}". Choose Date for a different kind of date.`);
      return;
    }
    if (!fieldTypes.canAddToProject(type,project.fields)){
      await showNotice(`${fieldTypeLabel(type)} field already exists`,`Each project can have only one ${fieldTypeLabel(type)} field.`);
      return;
    }
    const definition=fieldTypes.get(type);
    if (!definition) throw new Error(`Unknown field type: ${type}`);
    const storageType=definition.storageType||type;
    const field = {
      id:uid(),label,type:storageType,options:[],
      ...(storageType!==type?{offeringType:type}:{})
    };
    if (storageType==="select" || storageType==="multi-select"){
      const opts = await showDialog({title:"Field options", message:`Add options for "${label}" separated by commas.`, fields:[{label:"Options", placeholder:"Backlog, In progress, Blocked"}], confirmLabel:"Create field"});
      if (opts === null) return;
      field.options = (opts||"").split(",").map(s=>s.trim()).filter(Boolean)
        .map((l,i)=>({id:uid(), label:l, color:SELECT_COLORS[i % SELECT_COLORS.length]}));
    }
    project.fields.push(field);
    scheduleSave(); renderAll();
  }
  function deleteField(project, fid){
    const field=project.fields.find(candidate=>candidate.id===fid);
    project.fields = project.fields.filter(f=>f.id!==fid);
    projectItemEntries(project).forEach(({item})=>{
      delete item.values[fid];
      if (field?.type==="location") item.location="";
      if (field?.type==="schedule"){
        queueGoogleEventDeletes(item);
        item.startTime="";
        item.endTime="";
        item.endDate="";
        item.recurrence=null;
        item.reminderAt=null;
      }
    });
    project.views?.forEach(view=>{ if (view.groupByFieldId===fid) delete view.groupByFieldId; });
    boardFilterFields.delete(fid);
    if (field?.type==="tags") boardFilterColumns.delete("tags");
    if (listSort.field===fid) listSort = {field:"updated", dir:"desc"};
    scheduleSave(); renderAll();
  }
  async function addFieldFlow(project){
    const availableFieldTypes=FIELD_TYPE_OPTIONS.filter(option=>
      fieldTypes.canAddToProject(option.value,project.fields));
    const details = await showDialog({title:"Add field", fields:[
      {label:"Field type", type:"select", options:availableFieldTypes.map(({value,label,description})=>({value,label,description})), value:"select"},
      {label:"Field name", placeholder:"e.g. Status, Type, Effort"}
    ], confirmLabel:"Add field"});
    if (!details) return;
    const [type,label] = details;
    const fieldType=FIELD_TYPES.includes(type)?type:"select";
    const fieldName=label?.trim()||(type==="group"?"Group":({
      tags:"Tags",
      location:"Location",
      schedule:"Schedule",
      "start-date":"Start date",
      "due-date":"Due date"
    }[type]||""));
    if (!fieldName) return;
    await addField(project,fieldName,type);
  }
  function orderedTableColumns(project,viewType,columnIds){
    const saved=project.columnOrders?.[viewType]||[];
    const available=new Set(columnIds);
    const order=saved.filter(id=>available.has(id));
    columnIds.forEach(id=>{ if (!order.includes(id)) order.push(id); });
    return order;
  }
  function hiddenTableColumns(project,viewType,columnIds){
    const hidden=project.columnVisibility?.[viewType];
    return new Set(Array.isArray(hidden)?hidden.filter(id=>columnIds.includes(id)):[]);
  }
  function setTableColumnHidden(project,viewType,columnId,hidden){
    if (!project.columnVisibility || typeof project.columnVisibility!=="object") project.columnVisibility={};
    const current=new Set(Array.isArray(project.columnVisibility[viewType])?project.columnVisibility[viewType]:[]);
    if (hidden) current.add(columnId);
    else current.delete(columnId);
    project.columnVisibility[viewType]=[...current];
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
  function applyTableColumnVisibility(table,project,viewType){
    const headers=[...table.tHead.rows[0].cells].filter(cell=>cell.dataset.columnId);
    const columnIds=headers.map(header=>header.dataset.columnId);
    const hidden=hiddenTableColumns(project,viewType,columnIds);
    headers.forEach(header=>{ header.hidden=hidden.has(header.dataset.columnId); });
    [...table.tBodies].forEach(body=>[...body.rows].forEach(row=>{
      [...row.cells].filter(cell=>cell.dataset.columnId).forEach(cell=>{
        cell.hidden=hidden.has(cell.dataset.columnId);
      });
    }));
    table.querySelectorAll("[data-table-empty-cell],[data-list-empty-cell]").forEach(cell=>{
      const utilityCells=[...table.tHead.rows[0].cells].filter(header=>!header.dataset.columnId&&!header.hidden).length;
      cell.colSpan=columnIds.length-hidden.size+utilityCells;
    });
  }
  function wireTableColumnReordering(table,project,viewType){
    const getColumnIds=()=>[...table.tHead.rows[0].cells].filter(cell=>cell.dataset.columnId).map(cell=>cell.dataset.columnId);
    const toolbar=table.closest(".listWrap")?.querySelector(".listViewToolbarActions");
    const viewMenuButton=toolbar?.querySelector(".listViewMenuBtn");
    const viewMenu=toolbar?.querySelector(".listViewMenu");
    const globalRearrangeAction=viewMenu?.querySelector(".fieldColumnRearrangeAction");
    let rearrangeMode=null;
    let rearrangeSource=null;
    const setRearrangeMode=(mode,source=null)=>{
      rearrangeMode=mode;
      rearrangeSource=source;
      table.classList.toggle("rearrangingColumns",mode==="all");
      table.classList.toggle("rearrangingSingleColumn",mode==="single");
      table.querySelectorAll("th[data-column-id]").forEach(header=>{
        header.classList.toggle("columnRearrangeSource",mode==="single"&&header===source);
        const handle=header.querySelector(".fieldColumnDragHandle");
        if (handle) handle.draggable=mode==="all"||(mode==="single"&&header===source);
      });
      if (globalRearrangeAction) globalRearrangeAction.querySelector("span").textContent=mode?"Done":"Rearrange";
      table.querySelectorAll(".columnRearrangeAction").forEach(action=>{
        action.textContent=mode==="single"&&action.closest("th")===source?"Done":"Rearrange";
      });
      table.querySelectorAll(".columnHideAction").forEach(action=>{
        action.disabled=mode==="all"||(mode==="single"&&action.closest("th")===source);
      });
    };
    const toggleColumnRearrange=(header,menu)=>{
      actionMenus.close(menu);
      if (rearrangeMode==="single"&&rearrangeSource===header) setRearrangeMode(null);
      else setRearrangeMode("single",header);
    };
    table.querySelectorAll("th[data-column-id]").forEach(th=>{
      let menuButton=th.querySelector(".fieldColumnMenuBtn:not(.columnFilterToggle)");
      let menu=th.querySelector(".fieldColumnMenu");
      const label=th.querySelector(".fieldColumnLabel")?.textContent||"column";
      if (!menuButton){
        menuButton=document.createElement("button");
        menuButton.type="button";
        menuButton.className="fieldColumnMenuBtn";
        menuButton.setAttribute("aria-label",`Actions for ${label}`);
        menuButton.title="Column actions";
        menuButton.textContent="⋮";
        th.appendChild(menuButton);
      }
      if (!menu){
        menu=document.createElement("div");
        menu.className="menu action-menu action-menu--project fieldColumnMenu";
        th.appendChild(menu);
      }
      menu.classList.remove("action-menu--field");
      menu.classList.add("action-menu--project");
      const columnActionMenu=actionMenus.register(menuButton,menu);
      th.classList.add("hasColumnMenu");
      let columnAction=menu.querySelector(".columnRearrangeAction");
      if (!columnAction){
        columnAction=document.createElement("button");
        columnAction.type="button";
        columnAction.className="menu-item fieldColumnRearrangeAction columnRearrangeAction";
        columnAction.setAttribute("role","menuitem");
        columnAction.textContent="Rearrange";
        menu.insertBefore(columnAction,menu.firstChild);
      }
      let hideAction=menu.querySelector(".columnHideAction");
      if (!hideAction){
        hideAction=document.createElement("button");
        hideAction.type="button";
        hideAction.className="menu-item columnHideAction";
        hideAction.setAttribute("role","menuitem");
        hideAction.textContent="Hide";
        columnAction.after(hideAction);
      }
      columnAction.onclick=event=>{
        event.stopPropagation();
        toggleColumnRearrange(th,menu);
      };
      if (hideAction) hideAction.onclick=event=>{
          event.stopPropagation();
          columnActionMenu.close();
          if (rearrangeMode==="single"&&rearrangeSource===th) setRearrangeMode(null);
          setTableColumnHidden(project,viewType,th.dataset.columnId,true);
          applyTableColumnVisibility(table,project,viewType);
          refreshManageColumns();
          scheduleSave();
        };
      const dragHandle=th.querySelector(".fieldColumnDragHandle");
      if (!dragHandle) return;
      dragHandle.draggable=false;
      dragHandle.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 15v-2h2v2zm0-4V9h2v2zm4 4v-2h2v2zm0-4V9h2v2zm4 4v-2h2v2zm0-4V9h2v2zm4 4v-2h2v2zm0-4V9h2v2zm4 4v-2h2v2zm0-4V9h2v2z"></path></svg>';
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
          applyTableColumnOrder(table,project,viewType);
        }
      });
    });
    const manageColumnsToggle=viewMenu?.querySelector(".manageColumnsToggle");
    const manageColumnsPanel=viewMenu?.querySelector(".manageColumnsPanel");
    const manageColumnsSearch=viewMenu?.querySelector(".manageColumnsSearch");
    const manageColumnsOptions=viewMenu?.querySelector(".manageColumnsOptions");
    const manageColumnsEmpty=viewMenu?.querySelector(".manageColumnsEmpty");
    const refreshManageColumns=()=>{
      if (!manageColumnsOptions) return;
      const headers=[...table.tHead.rows[0].cells].filter(header=>header.dataset.columnId);
      const hidden=hiddenTableColumns(project,viewType,headers.map(header=>header.dataset.columnId));
      manageColumnsOptions.replaceChildren();
      headers.forEach(header=>{
        const option=document.createElement("label");
        option.className="manageColumnsOption";
        const checkbox=document.createElement("input");
        checkbox.type="checkbox";
        checkbox.checked=!hidden.has(header.dataset.columnId);
        checkbox.dataset.columnId=header.dataset.columnId;
        const name=document.createElement("span");
        name.textContent=header.querySelector(".fieldColumnLabel")?.textContent||header.dataset.columnId;
        option.append(checkbox,name);
        manageColumnsOptions.appendChild(option);
        checkbox.addEventListener("change",()=>{
          setTableColumnHidden(project,viewType,header.dataset.columnId,!checkbox.checked);
          applyTableColumnVisibility(table,project,viewType);
          scheduleSave();
        });
      });
      filterManageColumns();
    };
    const filterManageColumns=()=>{
      if (!manageColumnsOptions||!manageColumnsSearch||!manageColumnsEmpty) return;
      const query=manageColumnsSearch.value.trim().toLocaleLowerCase();
      let visibleCount=0;
      manageColumnsOptions.querySelectorAll(".manageColumnsOption").forEach(option=>{
        option.hidden=!option.textContent.toLocaleLowerCase().includes(query);
        if (!option.hidden) visibleCount++;
      });
      manageColumnsEmpty.hidden=visibleCount>0;
    };
    if (manageColumnsToggle&&manageColumnsPanel){
      manageColumnsToggle.onclick=event=>{
        event.stopPropagation();
        manageColumnsPanel.hidden=!manageColumnsPanel.hidden;
        manageColumnsToggle.setAttribute("aria-expanded",String(!manageColumnsPanel.hidden));
        if (!manageColumnsPanel.hidden){
          refreshManageColumns();
          manageColumnsSearch.value="";
          filterManageColumns();
          manageColumnsSearch.focus();
        }
      };
      manageColumnsSearch.addEventListener("input",filterManageColumns);
    }
    table.closest(".listWrap")?.addEventListener("click",event=>{
      if (!rearrangeMode || event.target.closest("th[data-column-id],.fieldColumnRearrangeAction")) return;
      setRearrangeMode(null);
    });
    if (viewMenuButton&&viewMenu&&globalRearrangeAction){
      viewMenu.classList.add("action-menu--view");
      const viewMenuController=actionMenus.register(viewMenuButton,viewMenu);
      globalRearrangeAction.onclick=event=>{
        event.stopPropagation();
        viewMenuController.close();
        setRearrangeMode(rearrangeMode==="all"?null:"all");
      };
      table.closest(".listWrap")?.addEventListener("keydown",event=>{
        if (event.key!=="Escape") return;
        viewMenuController.close();
        table.querySelectorAll(".fieldColumnMenu.open").forEach(menu=>actionMenus.close(menu));
        if (rearrangeMode) setRearrangeMode(null);
      });
    }
    refreshManageColumns();
  }
  function wireCustomColumnHeader(th, field, project){
    const menu = th.querySelector(".fieldColumnMenu");
    menu.querySelector('[data-column-action="edit"]').onclick=event=>editFieldFromMenu(event,field,project);
    menu.querySelector('[data-column-action="delete"]').onclick=event=>deleteFieldFromMenu(event,field,project);
  }
  async function editFieldFromMenu(event,field,project){
    event.stopPropagation();
    actionMenus.closeAll();
    const label=await showDialog({title:"Edit field",fields:[{label:"Field name",value:field.label}],confirmLabel:"Save"});
    if (!label||!label.trim()) return;
    field.label=label.trim();
    scheduleSave(); renderAll();
  }
  async function deleteFieldFromMenu(event,field,project){
    event.stopPropagation();
    actionMenus.closeAll();
    const message=field.type==="tags"
      ? "Tags and their assignments will stay saved but hidden. Add the Tags field again to restore them."
      : "This removes its values from every item in this project.";
    if (await showConfirm(`Delete column ${field.label}`,message,true)) deleteField(project,field.id);
  }
  function wireGroupColumnHeader(th, project){
    const menu = th.querySelector(".fieldColumnMenu");
    menu.querySelectorAll("[data-group-action]").forEach(button=>{
      button.onclick = async event=>{
        event.stopPropagation();
        actionMenus.close(menu);
        const action = button.dataset.groupAction;
        const groupId = await showDialog({
          title:action==="edit" ? "Choose group to edit" : "Choose group to delete",
          fields:[{label:"Group", type:"select", options:projectGroups(project).map(group=>({value:group.id,label:group.name})), value:projectGroups(project)[0]?.id}],
          confirmLabel:"Continue"
        });
        if (!groupId) return;
        const group = projectGroups(project).find(candidate=>candidate.id===groupId);
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
  function fieldChipHtml(field, value, project){
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
    if (field.type==="relation"){
      return relatedItemTitles(project,value)
        .map(title=>`<span class="Label Label--secondary relationPill"><iconify-icon icon="mdi:link-variant" aria-hidden="true"></iconify-icon>${escapeHtml(title)}</span>`).join("");
    }
    if (field.type==="checkbox") return value ? `<span class="Label Label--secondary">✓</span>` : "";
    return `<span class="Label Label--secondary">${escapeHtml(String(value))}</span>`;
  }
  function relatedItemTitles(project,value){
    if (!project || !Array.isArray(value)) return [];
    const titles=new Map(projectItemEntries(project).map(({item})=>[item.id,item.title]));
    return value.map(id=>titles.get(id)).filter(Boolean);
  }
  function fieldCellHtml(field, value, project, item){
    if (field.type==="schedule") return item?escapeHtml(scheduleFieldValue(project,item))||"-":"-";
    if (field.type==="location") return value ? escapeHtml(String(value)) : "-";
    if (field.type==="priority"){
      const opt = PRIORITY_OPTIONS.find(o=>o.id===value);
      return opt ? `${fieldChipHtml(field,value)}${opt.label}` : "-";
    }
    if (["date","start-date","due-date"].includes(field.type)) return value ? duePillHtml(value) : "-";
    if (field.type==="select"){
      const opt = (field.options||[]).find(o=>o.id===value);
      if (opt&&field.label.trim().toLowerCase()==="group") return escapeHtml(opt.label);
      return opt ? fieldChipHtml(field,value) : "-";
    }
    if (field.type==="multi-select") return fieldChipHtml(field,value) || "-";
    if (field.type==="relation"){
      const titles=relatedItemTitles(project,value);
      return titles.length ? titles.map(title=>`<span class="Label Label--secondary relationPill"><iconify-icon icon="mdi:link-variant" aria-hidden="true"></iconify-icon>${escapeHtml(title)}</span>`).join("") : "-";
    }
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
  function scheduleFieldValue(project,item){
    const startField=startDateField(project);
    const dueField=dueDateField(project);
    const startDate=startField?item.values?.[startField.id]||"":item.startDate||"";
    const endDate=(dueField?item.values?.[dueField.id]:"")||item.endDate||startDate;
    const dates=startDate&&endDate&&startDate!==endDate
      ? `${fmtDate(startDate)} – ${fmtDate(endDate)}`
      : fmtDate(endDate||startDate);
    const times=item.startTime&&item.endTime
      ? `${formatTimeValue(item.startTime)}–${formatTimeValue(item.endTime)}`
      : formatTimeValue(item.startTime||item.endTime||"");
    return [dates,times].filter(Boolean).join(" · ");
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

  function fieldSortValue(field,value,context={}){
    return fieldTypes.sortValue(field,{...context,value});
  }

  function columnDateKey(value){
    if (value==null || value==="") return COLUMN_FILTER_NONE;
    const date=new Date(value);
    return Number.isNaN(date.getTime()) ? COLUMN_FILTER_NONE : date.toISOString().slice(0,10);
  }
  function columnFilterValuesForItem(project,item,group,columnId){
    if (columnId==="title") return item.title ? [String(item.title)] : [COLUMN_FILTER_NONE];
    if (columnId==="group") return group?.id ? [String(group.id)] : [COLUMN_FILTER_NONE];
    if (columnId==="tags"){
      const tagsField=project?.fields?.find(field=>field.type==="tags");
      return fieldTypes.getFilterValues(tagsField,{
        item,project,group,noneValue:COLUMN_FILTER_NONE,dateKey:columnDateKey,scheduleFieldValue
      });
    }
    if (columnId==="progress"){
      const subitems=Array.isArray(item.subitems)?item.subitems:[];
      return subitems.length ? [`${subitems.filter(subitem=>subitem.done).length}/${subitems.length}`] : [COLUMN_FILTER_NONE];
    }
    if (columnId==="updated") return [columnDateKey(item.updatedAt)];
    if (!columnId.startsWith("field:")) return [COLUMN_FILTER_NONE];
    const fieldId=columnId.slice("field:".length);
    const field=project?.fields?.find(candidate=>candidate.id===fieldId);
    const value=field?.type==="location"
      ?(item.values||{})[fieldId]??item.location??""
      :(item.values||{})[fieldId];
    return fieldTypes.getFilterValues(field,{
      value,item,project,group,noneValue:COLUMN_FILTER_NONE,dateKey:columnDateKey,
      scheduleFieldValue
    });
  }
  function itemMatchesFilter(project, item, group, ignoreColumnFilters=false){
    if (item.archived && !showArchived) return false;
    if (project && project.id===activeProjectId && isItemCompleted(item)!==(completionFilter==="completed")) return false;
    if (boardFilterGroups.size && (!group || !boardFilterGroups.has(group.id))) return false;
    const tagsField=project?.fields?.find(field=>field.type==="tags");
    if (tagsField&&boardFilterTags.size&&!fieldTypes.matchesFilter(tagsField,{
      item,project,mode:[...boardFilterTags],noneValue:COLUMN_FILTER_NONE
    })) return false;
    for (const [fid, mode] of boardFilterFields){
      const field = project?.fields?.find(candidate=>candidate.id===fid);
      const val = field?.type==="schedule" ? scheduleFieldValue(project,item) : (item.values||{})[fid] ?? "";
      if (!fieldTypes.matchesFilter(field,{
        value:val,mode,item,project,group,noneValue:COLUMN_FILTER_NONE,
        scheduleFieldValue,dateKey:columnDateKey
      })) return false;
    }
    if (!ignoreColumnFilters){
      for (const [columnId,selected] of boardFilterColumns){
        if (selected.size && !columnFilterValuesForItem(project,item,group,columnId).some(value=>selected.has(value))) return false;
      }
    }
    if (boardFilterText){
      const q = boardFilterText.toLowerCase();
      const standardValues=[item.title,item.description,...(item.subitems||[]).map(subitem=>subitem.title)];
      const matchesStandardValue=standardValues.some(value=>String(value??"").toLowerCase().includes(q));
      const matchesFieldValue=(project?.fields||[]).some(field=>{
        const value=field.type==="location"
          ?(item.values||{})[field.id]??item.location??""
          :(item.values||{})[field.id];
        return fieldTypes.matchesQuery(field,{
          value,item,project,query:q,scheduleFieldValue
        });
      });
      if (!matchesStandardValue&&!matchesFieldValue) return false;
    }
    return true;
  }
  function rowsForSelection(project,ignoreColumnFilters=false){
    const rows = [];
    projectGroups(project).forEach(group=> group.items
      .filter(item=>itemMatchesFilter(project, item, group, ignoreColumnFilters))
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
      } else if (field){
        const firstValueContext={project,item:first.item,scheduleFieldValue};
        const secondValueContext={project,item:second.item,scheduleFieldValue};
        firstValue=fieldSortValue(field,first.item.values[field.id],firstValueContext);
        secondValue=fieldSortValue(field,second.item.values[field.id],secondValueContext);
      } else {
        firstValue=first.item.updatedAt; secondValue=second.item.updatedAt;
      }
      if (firstValue<secondValue) return listSort.dir==="asc" ? -1 : 1;
      if (firstValue>secondValue) return listSort.dir==="asc" ? 1 : -1;
      return 0;
    });
  }

  function csvFieldValue(field,value,project){
    return fieldTypes.formatValue(field,{
      value,project,relatedItemTitles:values=>relatedItemTitles(project,values)
    });
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
    const showGroupColumn=(project.groups||[]).length+((project.items||[]).length?1:0)>1;
    const columns=[
      {id:"title",label:"Title",value:row=>row.item.title},
      ...(showGroupColumn?[{id:"group",label:"Group",value:row=>row.group.name}]:[]),
      ...project.fields.filter(field=>field.type!=="tags").map(field=>({id:`field:${field.id}`,label:field.label,value:row=>field.type==="schedule"
        ? scheduleFieldValue(project,row.item)
        : csvFieldValue(field,row.item.values[field.id],project)})),
      ...(project.fields.some(field=>field.type==="tags")?[{id:"tags",label:project.fields.find(field=>field.type==="tags").label,value:row=>
        fieldTypes.formatValue(project.fields.find(field=>field.type==="tags"),{item:row.item,project})}]:[]),
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

  async function toggleProjectOverviewVisibility(projectId){
    try{
      const project=await ensureProjectLoaded(projectId);
      if (!project) throw new Error("The project could not be found.");
      project.hiddenFromOverview=!project.hiddenFromOverview;
      if (state.folderLazy) registerProjectSummary(project);
      scheduleSave();
      renderAll();
    }catch(error){
      await showNotice("Couldn't update Overview visibility",error.message);
    }
  }

  const projectActionHandlers={
    edit:async project=>{
      const loaded=await ensureProjectLoaded(project.id);
      if (loaded) await editProject(loaded);
    },
    "overview-visibility":project=>toggleProjectOverviewVisibility(project.id),
    move:async project=>{
      const loaded=await ensureProjectLoaded(project.id);
      if (loaded) await moveProjectToFolder(loaded);
    },
    duplicate:async project=>{
      const loaded=await ensureProjectLoaded(project.id);
      if (loaded) await duplicateProject(loaded);
    },
    "add-field":async project=>{
      const loaded=await ensureProjectLoaded(project.id);
      if (loaded) await addFieldFlow(loaded);
    },
    "import-csv":project=>openCsvImportDialog("existing",project.id),
    undo:()=>undoLastChange(),
    print:()=>window.print(),
    delete:async project=>{
      if (await showConfirm(`Delete project ${project.name}`,"This will delete everything in the project.",true)){
        await deleteProject(project.id);
      }
    }
  };

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
      const count = Number.isFinite(p.itemCount) ? p.itemCount
        : (p.groups||[]).reduce((n,g)=>n+(g.items||[]).length,0)+(p.items||[]).length;
      const li = document.createElement("li");
      li.className = "SideNav-item" + (p.id===activeProjectId ? " active" : "") + (inFolder ? " inFolder" : "");
      li.title = p.name;
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
      window.BeforeworkProjectActionsMenu.create({
        documentRef:document,
        container:wrap,
        variant:"sidebar",
        project:p,
        actions:projectActionHandlers
      });
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
      menuBtn.className = "folderMenuBtn action-menu__trigger action-menu__trigger--sidebar";
      menuBtn.title = "Folder actions";
      menuBtn.setAttribute("aria-label", `Folder actions for ${folder.name}`);
      menuBtn.textContent = "⋯";
      const menu = document.createElement("div");
      menu.className = "menu action-menu action-menu--folder folderQuickMenu";
      menu.setAttribute("role","menu");
      menu.hidden=true;
      menu.innerHTML = `
        <button type="button" data-folder-action="rename">Rename</button>
        <button type="button" data-folder-action="delete" class="danger menu-item menu-item--danger" role="menuitem">Delete</button>
      `;
      const folderActionMenu=actionMenus.register(menuBtn,menu);
      menu.querySelectorAll("[data-folder-action]").forEach(button => {
        button.onclick = async event => {
          event.stopPropagation();
          folderActionMenu.close();
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
    if (activeProjectId===OVERVIEW || activeProjectId===CALENDAR || activeProjectId===ROADMAP || activeProjectId===INTEGRATIONS || activeProjectId===SETTINGS || !project || !hasTagsField(project)){ section.style.display = "none"; return; }
    section.style.display = "block";
    label.textContent = project.fields.find(field=>field.type==="tags").label + " in " + project.name;
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
    settingsView.render(board, {
      theme:document.documentElement.getAttribute("data-theme")==="dark" ? "Dark" : "Light",
      timeFormat:getTimeFormat(),
      sidebarCollapsed:document.getElementById("sidebar").classList.contains("collapsed"),
      storageStatus:getSyncStatusText(),
      hasBackup:workspaceRecovery.hasMigrationBackup(),
      isLegacyFile:window.BeforeworkStorage.isLegacyFile(),
      recoverySnapshots:window.BeforeworkStorage.getRecoverySnapshots(),
      reminderStatus:reminderService.getStatus(),
      accountName:authService.getAccountName()
    });
  }

  function createSettingsView(SettingsView){
    return new SettingsView({
      cloneTemplate:()=>window.BeforeworkViewTemplates.clone("settings"),
      actions:{
      toggleTheme(board){ window.BeforeworkAppearance.toggleTheme(); renderSettings(board); },
      setTimeFormat(value){
        try{ localStorage.setItem(TIME_FORMAT_KEY, value); }catch(err){/* ignore */}
        refreshTimePickerLabels();
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
      exportJSON:workspaceRecovery.exportJSON,
      importJSON(){ document.getElementById("fileImportInput").click(); },
      exportRecovery:workspaceRecovery.exportRecoverySnapshot,
      restoreRecovery:workspaceRecovery.restoreRecoverySnapshot,
      restoreBackup:workspaceRecovery.restoreMigrationBackup,
      logout(){ authService.logout(); }
      }
    });
  }

  function render(){
    const filterBar = document.getElementById("boardFilterBar");
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
      projectMenuWrap.style.display = "none";
      projectActionsMenu.close();
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
    projectMenuWrap.style.display = "inline-flex";
    projectActionsMenu.setProject(project);
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

    const activeView = project.views.find(v=>v.id===project.activeViewId) || project.views[0];
    if (activeView.type==="milestones"){
      filterBar.style.display="none";
      completionTabs.style.display="none";
      milestonesView.render(project,board,{
        projectGroups,
        projectItemEntries,
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
    else boardView.render(project, board, activeView);
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
    const items = projectItemEntries(project).map(row=>row.item).filter(item=>showArchived || !item.archived);
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
      ...(projectGroups(project).length>1 ? [{id:"groupFilters", label:"Groups"}] : []),
      ...(hasTagsField(project)?[{id:"boardTagFilters", label:project.fields.find(field=>field.type==="tags").label}]:[]),
      ...project.fields.filter(field=>field.type!=="tags").map(field=>({id:`field:${field.id}`, label:field.label}))
    ];
    if (!categories.some(category=>category.id===activeFilterCategory)) activeFilterCategory = categories[0]?.id||"";
    wrap.innerHTML = categories.map(category=>`<button class="filterCategory" type="button" data-filter-category="${escapeHtml(category.id)}">${escapeHtml(category.label)}</button>`).join("");
  }

  function renderFilterCategoryState(project){
    document.querySelectorAll("[data-filter-category]").forEach(button=>button.classList.toggle("active", button.dataset.filterCategory===activeFilterCategory));
    document.querySelectorAll("#filterOptions > div").forEach(section=>section.classList.toggle("active", section.id===activeFilterCategory || ((activeFilterCategory||"").startsWith("field:") && section.id==="fieldFilters")));
  }

  function renderBoardTagFilters(project){
    const wrap = document.getElementById("boardTagFilters");
    if (!hasTagsField(project)){ wrap.replaceChildren(); return; }
    const options=fieldTypes.getFilterOptions(project.fields.find(field=>field.type==="tags"),{project});
    wrap.innerHTML = `<div class="filterControlBody filterOptionList">${options.length ? options.map(tag=>`<label class="filterOptionCheck"><input type="checkbox" data-tag-filter="${escapeHtml(tag.value)}" ${boardFilterTags.has(tag.value)?"checked":""}><span class="filterValuePill tagPill" style="--pill-color:${escapeHtml(tag.color||TAG_COLORS[0])}"><span class="dot" style="background:${escapeHtml(tag.color||TAG_COLORS[0])}"></span>${escapeHtml(tag.label)}</span></label>`).join("") : `<span class="filterEmpty">No tags in this project</span>`}</div>`;
    wrap.querySelectorAll("[data-tag-filter]").forEach(input=>{
      input.onchange = () => {
        if (input.checked) boardFilterTags.add(input.dataset.tagFilter); else boardFilterTags.delete(input.dataset.tagFilter);
        render();
      };
    });
  }

  function renderGroupFilters(project){
    const wrap = document.getElementById("groupFilters");
    wrap.innerHTML = `<div class="filterControlBody filterOptionList">${projectGroups(project).map(group=>`<label class="filterOptionCheck"><input type="checkbox" data-group-filter="${group.id}" ${boardFilterGroups.has(group.id)?"checked":""}><span class="filterValuePill groupPill">${escapeHtml(group.name)}</span></label>`).join("")}</div>`;
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
      const filter=fieldTypes.getFilter(f)||{};
      const opts=fieldTypes.getFilterOptions(f,{project,items:projectItemEntries(project)});
      const current = boardFilterFields.get(f.id);
      let control;
      if (filter.kind==="date") control = `<input class="form-control" type="date" data-fieldfilter="${f.id}" value="${typeof current==="string"?escapeHtml(current):""}" aria-label="Filter ${escapeHtml(f.label)}">`;
      else if (filter.kind==="text") control = `<input class="form-control" type="${filter.inputType||"text"}" data-fieldfilter="${f.id}" value="${typeof current==="string"?escapeHtml(current):""}" placeholder="${escapeHtml(filter.placeholder||"Enter text")}" aria-label="Filter ${escapeHtml(f.label)}">`;
      else if (filter.kind==="number") control = `<input class="form-control" type="number" step="any" data-fieldfilter="${f.id}" value="${typeof current==="string"?escapeHtml(current):typeof current==="number"?current:""}" placeholder="Exact value" aria-label="Filter ${escapeHtml(f.label)}">`;
      else {
        const selected = Array.isArray(current) ? current : (current && current!=="__all__" ? [current] : []);
        const options=opts.map(option=>({value:String(option.value),label:option.label}));
        if (!options.some(option=>option.value==="__none__")) options.push({value:"__none__",label:`No ${f.label}`});
        control = `<div class="filterOptionList fieldOptionList">${options.map(option=>`<label class="filterOptionCheck"><input type="checkbox" data-field-option="${f.id}" value="${escapeHtml(option.value)}" ${selected.includes(option.value)?"checked":""}><span>${escapeHtml(option.label)}</span></label>`).join("")}</div>`;
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
    const count = fieldCount + boardFilterGroups.size + (hasTagsField(getProject(activeProjectId))?boardFilterTags.size:0) + boardFilterColumns.size + (boardFilterText ? 1 : 0);
    summary.innerHTML = count ? `<strong>${count}</strong> filter${count===1?"":"s"} applied` : "All items";
  }

  function columnFilterLabel(project,columnId,value){
    const field=columnId.startsWith("field:")
      ?project.fields.find(candidate=>candidate.id===columnId.slice(6)):null;
    if (field){
      const option=fieldTypes.getFilterOptions(field,{project,items:projectItemEntries(project)})
        .find(candidate=>String(candidate.value)===value);
      if (option) return option.label;
    }
    if (value===COLUMN_FILTER_NONE){
      const labels={title:"title",group:"group",tags:"tags",progress:"progress",updated:"date"};
      return `No ${field?.label.toLowerCase()||labels[columnId]||"value"}`;
    }
    if (columnId==="group") return projectGroups(project).find(group=>group.id===value)?.name||value;
    if (columnId==="tags"){
      const tagsField=project.fields.find(field=>field.type==="tags");
      return fieldTypes.getFilterOptions(tagsField,{project}).find(option=>String(option.value)===value)?.label||value;
    }
    if (columnId==="updated"){
      const date=new Date(`${value}T12:00:00`);
      return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat(undefined,{dateStyle:"medium"}).format(date);
    }
    if (columnId==="progress") return value;
    return value;
  }
  function columnFilterOptions(project,columnId){
    const values=new Set();
    const items=projectItemEntries(project);
    if (columnId==="group") projectGroups(project).forEach(group=>values.add(String(group.id)));
    else if (columnId==="tags"){
      const tagsField=project.fields.find(field=>field.type==="tags");
      fieldTypes.getFilterOptions(tagsField,{project}).forEach(option=>values.add(String(option.value)));
    }
    else if (columnId.startsWith("field:")){
      const field=project.fields.find(candidate=>candidate.id===columnId.slice(6));
      fieldTypes.getFilterOptions(field,{project,items}).forEach(option=>values.add(String(option.value)));
    }
    items.forEach(({item,group})=>columnFilterValuesForItem(project,item,group,columnId).forEach(value=>values.add(value)));
    if (!values.size) values.add(COLUMN_FILTER_NONE);
    return [...values].map(value=>({value,label:columnFilterLabel(project,columnId,value)}))
      .sort((first,second)=>first.label.localeCompare(second.label));
  }
  function applyColumnFilterVisibility(table,project){
    const tbody=table?.tBodies?.[0];
    if (!tbody) return;
    const rows=[...tbody.querySelectorAll("tr[data-iid]")];
    let visibleCount=0;
    rows.forEach(row=>{
      const group=projectGroups(project).find(candidate=>candidate.id===row.dataset.gid);
      const item=group?.items.find(candidate=>candidate.id===row.dataset.iid);
      row.hidden=!item || !itemMatchesFilter(project,item,group);
      if (!row.hidden) visibleCount++;
    });
    let emptyRow=tbody.querySelector("[data-column-filter-empty]");
    if (rows.length && !visibleCount){
      if (!emptyRow){
        emptyRow=document.createElement("tr");
        emptyRow.dataset.columnFilterEmpty="true";
        const cell=document.createElement("td");
        cell.colSpan=table.tHead.rows[0].cells.length;
        cell.textContent="No rows match the current filters.";
        emptyRow.appendChild(cell);
        tbody.appendChild(emptyRow);
      }
    } else emptyRow?.remove();
  }
  function columnFilterSelection(project,columnId){
    if (columnId==="group") return new Set(boardFilterGroups);
    if (columnId==="tags") return new Set(boardFilterTags);
    const field=sharedColumnField(project,columnId);
    if (field){
      const current=boardFilterFields.get(field.id);
      if (Array.isArray(current)) return new Set(current.map(String));
      return current&&current!=="__all__"?new Set([String(current)]):new Set();
    }
    return boardFilterColumns.get(columnId)||new Set();
  }
  function setColumnFilterSelection(project,columnId,values){
    const selected=new Set(values);
    if (columnId==="group") boardFilterGroups=selected;
    else if (columnId==="tags") boardFilterTags=selected;
    else {
      const field=sharedColumnField(project,columnId);
      if (field){
        if (selected.size) boardFilterFields.set(field.id,[...selected]);
        else boardFilterFields.delete(field.id);
      } else if (selected.size) boardFilterColumns.set(columnId,selected);
      else boardFilterColumns.delete(columnId);
    }
  }
  function syncMainFilterSelection(project,columnId,values){
    if (columnId==="group"){
      document.querySelectorAll("[data-group-filter]").forEach(input=>input.checked=values.includes(input.dataset.groupFilter));
    } else if (columnId==="tags"){
      document.querySelectorAll("[data-tag-filter]").forEach(input=>input.checked=values.includes(input.dataset.tagFilter));
    } else {
      const field=sharedColumnField(project,columnId);
      if (!field) return;
      document.querySelectorAll("[data-field-option]").forEach(input=>{
        if (input.dataset.fieldOption===field.id) input.checked=values.includes(input.value);
      });
    }
  }
  function wireColumnFilterHeader(th,project){
    if (!th || th.querySelector(".columnFilterSelectWrap")) return;
    const columnId=th.dataset.columnId;
    const label=th.querySelector(".fieldColumnLabel")?.textContent.trim()||columnId;
    const select=document.createElement("select");
    select.multiple=true;
    select.dataset.appSelectPlaceholder=`Filter by ${label}`;
    select.dataset.appSelectButtonClass="fieldColumnMenuBtn columnFilterToggle";
    select.dataset.appSelectWrapClass="columnFilterSelectWrap";
    select.dataset.appSelectIcon="mdi:filter-outline";
    select.dataset.appSelectMenuWidth="320";
    select.dataset.appSelectMenuTitle=`Filter by ${label.toLowerCase()}`;
    select.dataset.appSelectSearchPlaceholder=`Filter ${label.toLowerCase()}`;
    select.setAttribute("aria-label",`Filter by ${label}`);
    const selected=columnFilterSelection(project,columnId);
    columnFilterOptions(project,columnId).forEach(option=>{
      const element=document.createElement("option");
      element.value=option.value;
      element.textContent=option.label;
      element.selected=selected.has(option.value);
      select.appendChild(element);
    });
    th.classList.add("hasColumnFilter");
    if (th.querySelector(".fieldColumnMenuBtn")) th.classList.add("hasColumnMenu");
    th.appendChild(select);
    enhanceSelectControl(select);
    const button=select.parentElement.querySelector(".columnFilterToggle");
    select.addEventListener("change",()=>{
      const values=[...select.selectedOptions].map(option=>option.value);
      setColumnFilterSelection(project,columnId,values);
      syncMainFilterSelection(project,columnId,values);
      const buttonLabel=values.length?`Filter by ${label}, ${values.length} selected`:`Filter by ${label}`;
      button?.setAttribute("aria-label",buttonLabel);
      button?.setAttribute("title",buttonLabel);
      persistActiveFilters();
      updateFilterSummary();
      applyColumnFilterVisibility(document.querySelector("#board .listTable"),project);
    });
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
      const projectItems=projectItemEntries(project);
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
    const group = project.groups[0]||{id:"__project_items__",name:"Unassigned",items:project.items||(project.items=[])};
    openItemRef = {projectId:project.id, groupId:group.id, itemId:null, isNew:true, globalNew:!scopeProject, draft:{
      id:uid(), title:"", description:"", attachments:[], calendarType:"task", startTime:"", endTime:"", location:"", endDate:"",
      tagIds:[], values:{[dateField.id]:date}, subitems:[], comments:[], activity:[], archived:false, createdAt:Date.now(), updatedAt:Date.now()
    }};
    createItemModalShell();
    renderItemModal();
  }
  /* ---------- Item modal ---------- */
  function openItemModal(pid, gid, iid){
    if (state.folderLazy && !getLoadedProject(pid)){
      ensureProjectLoaded(pid).then(()=>openItemModal(pid,gid,iid)).catch(err=>showNotice("Couldn't load project item",err.message));
      return;
    }
    openItemRef = {projectId:pid, groupId:gid, itemId:iid};
    createItemModalShell();
    renderItemModal();
  }
  function createItemModalShell(){
    const content=document.createElement("div");
    content.className="Overlay Overlay--size-medium position-relative";
    content.setAttribute("data-modal","");
    content.id="itemModal";
    modal.open({id:"itemOverlay",content,onBackdrop:closeItemModal});
  }
  function closeItemModal(){
    modal.close("itemOverlay");
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
    const requestedWidth=Number(menu.dataset.selectWidth)||rect.width;
    const width=Math.min(requestedWidth,window.innerWidth-16);
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
    const isMultiple=select.multiple;
    select.dataset.appSelectEnhanced="true";
    const wrapper=document.createElement("div");
    wrapper.className=`appSelectWrap ${select.dataset.appSelectWrapClass||""}`.trim();
    const isTableSelect=!!select.closest(".listTable");
    const width=select.getBoundingClientRect().width;
    if (isTableSelect) wrapper.style.width="100%";
    else if (width>0) wrapper.style.width=`${width}px`;
    select.parentNode.insertBefore(wrapper,select);
    wrapper.appendChild(select);
    select.classList.add("appSelectNative");
    const button=document.createElement("button");
    button.type="button";
    button.className=select.dataset.appSelectButtonClass||"appSelectButton";
    button.setAttribute("aria-haspopup","listbox");
    button.setAttribute("aria-expanded","false");
    const buttonLabel=select.getAttribute("aria-label");
    if (buttonLabel) button.setAttribute("aria-label",buttonLabel);
    button.title=select.dataset.appSelectPlaceholder||"";
    const search=document.createElement("input");
    search.type="search";
    search.className="appSelectSearch";
    search.placeholder=select.dataset.appSelectSearchPlaceholder||"Search options";
    search.setAttribute("aria-label",select.dataset.appSelectSearchPlaceholder||"Search options");
    const label=document.createElement("span");
    const chevron=document.createElement("iconify-icon");
    chevron.setAttribute("icon",select.dataset.appSelectIcon||"mdi:chevron-down");
    chevron.setAttribute("aria-hidden","true");
    button.append(label,chevron);
    const menu=document.createElement("div");
    menu.className="appSelectMenu";
    menu.hidden=true;
    if (select.dataset.appSelectMenuWidth) menu.dataset.selectWidth=select.dataset.appSelectMenuWidth;
    const menuTitle=select.dataset.appSelectMenuTitle?document.createElement("strong"):null;
    if (menuTitle){
      menuTitle.className="appSelectMenuTitle";
      menuTitle.textContent=select.dataset.appSelectMenuTitle;
    }
    const optionList=document.createElement("div");
    optionList.className="appSelectOptions";
    optionList.setAttribute("role","listbox");
    if (isMultiple) optionList.setAttribute("aria-multiselectable","true");
    const emptyState=document.createElement("div");
    emptyState.className="appSelectEmpty";
    emptyState.textContent="No options found";
    emptyState.hidden=true;
    const nativeOptions=[...select.options];
    const options=nativeOptions.map((option,index)=>{
      const item=document.createElement("button");
      item.type="button";
      item.className="appSelectOption";
      item.setAttribute("role","option");
      item.dataset.value=option.value;
      item.dataset.index=String(index);
      item.dataset.order=String(index);
      item.textContent=option.textContent;
      optionList.appendChild(item);
      return item;
    });
    menu.append(...(menuTitle?[menuTitle]:[]),search,optionList,emptyState);
    wrapper.append(button,menu);
    const filterOptions=()=>{
      const query=search.value.trim().toLocaleLowerCase();
      let visibleCount=0;
      options.forEach(option=>{
        const matches=option.textContent.toLocaleLowerCase().includes(query);
        option.hidden=!matches;
        if (matches) visibleCount++;
      });
      emptyState.hidden=visibleCount>0;
      optionList.hidden=visibleCount===0;
    };
    const sync=()=>{
      if (isMultiple){
        const selected=nativeOptions.filter(option=>option.selected);
        label.textContent=selected.map(option=>option.textContent).join(", ")||select.dataset.appSelectPlaceholder||"Select options";
      }else{
        const selected=nativeOptions[select.selectedIndex]||nativeOptions[0];
        label.textContent=selected.textContent;
      }
      options.forEach((option,index)=>{
        const nativeOption=nativeOptions[Number(option.dataset.index)];
        const active=isMultiple ? nativeOption.selected : nativeOption===nativeOptions[select.selectedIndex];
        option.classList.toggle("selected",active);
        option.setAttribute("aria-selected",String(active));
      });
    };
    const close=()=>closeFloatingSelectMenu(menu);
    const open=()=>{
      search.value="";
      filterOptions();
      openFloatingSelectMenu(button,menu);
      search.focus();
    };
    button.onclick=event=>{ event.stopPropagation(); menu.hidden ? open() : close(); };
    button.onkeydown=event=>{
      if (event.key==="ArrowDown" || event.key==="Enter" || event.key===" "){ event.preventDefault(); open(); }
    };
    search.addEventListener("input",filterOptions);
    options.forEach(option=>option.onclick=()=>{
      const nativeOption=nativeOptions[Number(option.dataset.index)];
      if (isMultiple) nativeOption.selected=!nativeOption.selected;
      else select.value=option.dataset.value;
      select.dispatchEvent(new Event("change",{bubbles:true}));
      sync();
      if (!isMultiple){ close(); button.focus(); }
    });
    menu.onkeydown=event=>{
      const visibleOptions=options.filter(option=>!option.hidden);
      const current=visibleOptions.indexOf(document.activeElement);
      if (event.key==="ArrowDown"){
        event.preventDefault();
        visibleOptions[current<0?0:Math.min(visibleOptions.length-1,current+1)]?.focus();
      }
      if (event.key==="ArrowUp"){
        event.preventDefault();
        visibleOptions[current<0?visibleOptions.length-1:Math.max(0,current-1)]?.focus();
      }
      if (event.key==="Escape"){ event.preventDefault(); close(); button.focus(); }
    };
    select.addEventListener("change",sync);
    sync();
  }
  function enhanceSelectControls(root=document){
    if (root.matches?.("select:not([data-app-select-enhanced])")) enhanceSelectControl(root);
    root.querySelectorAll("select:not([data-app-select-enhanced])").forEach(enhanceSelectControl);
  }
  window.BeforeworkAppSelect={
    enhance:enhanceSelectControl,
    enhanceAll:enhanceSelectControls
  };
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
    popover._popoverClose=close;
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
  function enhanceTimeInput(input){
    if (input.dataset.timePickerEnhanced) return;
    input.dataset.timePickerEnhanced="true";
    const wrapper=document.createElement("div");
    wrapper.className="timePickerWrap";
    const width=input.getBoundingClientRect().width;
    if (width>0) wrapper.style.width=`${width}px`;
    input.parentNode.insertBefore(wrapper,input);
    wrapper.appendChild(input);
    input.classList.add("datePickerNative");
    const button=document.createElement("button");
    button.type="button";
    button.className="datePickerButton timePickerButton";
    button.setAttribute("aria-haspopup","dialog");
    button.setAttribute("aria-expanded","false");
    if (input.getAttribute("aria-label")) button.setAttribute("aria-label",input.getAttribute("aria-label"));
    const label=document.createElement("span");
    const icon=document.createElement("iconify-icon");
    icon.setAttribute("icon","mdi:clock-outline");
    icon.setAttribute("aria-hidden","true");
    button.append(label,icon);
    const updateLabel=()=>{
      label.textContent=input.value ? formatTimeValue(input.value) : "Choose time";
      button.classList.toggle("is-placeholder",!input.value);
    };
    const popover=document.createElement("div");
    popover.className="timePickerPopover";
    popover.hidden=true;
    popover.setAttribute("role","dialog");
    popover.setAttribute("aria-label",input.getAttribute("aria-label")||"Choose time");
    wrapper.appendChild(button);
    document.body.appendChild(popover);
    let hour=0;
    let minute=0;
    let uses12Hour=false;
    const parseTime=()=>{
      const match=/^(\d{2}):(\d{2})/.exec(input.value);
      return match ? {hour:Number(match[1]),minute:Number(match[2])} : null;
    };
    const formatTime=()=>input.value ? formatTimeValue(input.value) : "Choose time";
    const emitChange=()=>{
      input.dispatchEvent(new Event("input",{bubbles:true}));
      input.dispatchEvent(new Event("change",{bubbles:true}));
    };
    const hourIndex=()=>uses12Hour?(hour%12||12)-1:hour;
    const scrollSelected=()=>{
      popover.querySelectorAll(".timePickerOptions").forEach(list=>{
        list.scrollTop=Number(list.dataset.selectedIndex||0)*36;
      });
    };
    const syncWheel=(list,index)=>{
      const max=Number(list.dataset.optionCount)-1;
      index=Math.max(0,Math.min(max,index));
      const selectedScrollTop=index*36;
      if (Math.abs(list.scrollTop-selectedScrollTop)>0.5) list.scrollTop=selectedScrollTop;
      list.dataset.selectedIndex=String(index);
      list.querySelectorAll(".timePickerOption").forEach((option,optionIndex)=>{
        const selected=optionIndex===index;
        option.classList.toggle("is-selected",selected);
        option.setAttribute("aria-selected",String(selected));
      });
      const wheel=list.dataset.timeWheel;
      if (wheel==="hour") hour=uses12Hour ? (index+1)%12+(hour>=12?12:0) : index;
      if (wheel==="minute") minute=index;
      if (wheel==="period") hour=hour%12+(index===1?12:0);
    };
    const render=()=>{
      uses12Hour=getTimeFormat()==="12";
      const displayHour=uses12Hour ? hour%12||12 : hour;
      const hours=Array.from({length:uses12Hour?12:24},(_,index)=>{
        const value=uses12Hour?index+1:index;
        return `<button type="button" class="timePickerOption${value===displayHour?" is-selected":""}" role="option" aria-selected="${value===displayHour}" data-time-hour="${value}">${String(value).padStart(2,"0")}</button>`;
      }).join("");
      const minutes=Array.from({length:60},(_,value)=>`<button type="button" class="timePickerOption${value===minute?" is-selected":""}" role="option" aria-selected="${value===minute}" data-time-minute="${value}">${String(value).padStart(2,"0")}</button>`).join("");
      const period=hour<12?"AM":"PM";
      const periods=uses12Hour?`<div class="timePickerWheel"><div class="timePickerOptions" role="listbox" aria-label="AM or PM" data-time-wheel="period" data-option-count="2" data-selected-index="${period==="AM"?0:1}"><button type="button" class="timePickerOption${period==="AM"?" is-selected":""}" role="option" aria-selected="${period==="AM"}" data-time-period="AM">AM</button><button type="button" class="timePickerOption${period==="PM"?" is-selected":""}" role="option" aria-selected="${period==="PM"}" data-time-period="PM">PM</button></div></div>`:"";
      popover.innerHTML=`<div class="timePickerHeader">Select time</div><div class="timePickerWheels"><div class="timePickerWheel"><div class="timePickerOptions" role="listbox" aria-label="Hour" data-time-wheel="hour" data-option-count="${uses12Hour?12:24}" data-selected-index="${hourIndex()}">${hours}</div></div><span class="timePickerSeparator" aria-hidden="true">:</span><div class="timePickerWheel"><div class="timePickerOptions" role="listbox" aria-label="Minute" data-time-wheel="minute" data-option-count="60" data-selected-index="${minute}">${minutes}</div></div>${periods}<div class="timePickerSelection" aria-hidden="true"></div></div><div class="timePickerFooter"><button type="button" class="timePickerCancel" data-time-action="cancel">Cancel</button><button type="button" class="timePickerSave" data-time-action="save">Save</button></div>`;
      if (!popover.hidden) scrollSelected();
    };
    const positionPopover=()=>{
      const rect=wrapper.getBoundingClientRect();
      const width=Math.min(278,window.innerWidth-24);
      popover.style.width=`${Math.max(1,width)}px`;
      popover.style.left=`${Math.max(12,Math.min(rect.left,window.innerWidth-width-12))}px`;
      popover.style.top=`${rect.bottom+6}px`;
      const popoverRect=popover.getBoundingClientRect();
      if (popoverRect.bottom>window.innerHeight-12) popover.style.top=`${Math.max(12,rect.top-popoverRect.height-6)}px`;
    };
    popover._timePosition=positionPopover;
    const close=()=>{ popover.hidden=true; button.setAttribute("aria-expanded","false"); };
    popover._popoverClose=close;
    popover.addEventListener("click",event=>{
      const action=event.target.closest("[data-time-action]")?.dataset.timeAction;
      if (action==="cancel"){
        close();
        button.focus();
      }else if (action==="save"){
        input.value=`${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`;
        updateLabel();
        emitChange();
        close();
        button.focus();
      }else{
        const selectedHour=event.target.closest("[data-time-hour]");
        const selectedMinute=event.target.closest("[data-time-minute]");
        const selectedPeriod=event.target.closest("[data-time-period]");
        if (selectedHour) syncWheel(popover.querySelector('[data-time-wheel="hour"]'),Number(selectedHour.dataset.timeHour)-(uses12Hour?1:0));
        if (selectedMinute) syncWheel(popover.querySelector('[data-time-wheel="minute"]'),Number(selectedMinute.dataset.timeMinute));
        if (selectedPeriod) syncWheel(popover.querySelector('[data-time-wheel="period"]'),selectedPeriod.dataset.timePeriod==="PM"?1:0);
      }
    });
    popover.addEventListener("scroll",event=>{
      const list=event.target.closest?.(".timePickerOptions");
      if (list){
        clearTimeout(list._scrollTimer);
        list._scrollTimer=setTimeout(()=>syncWheel(list,Math.round(list.scrollTop/36)),80);
      }
    },true);
    popover.addEventListener("keydown",event=>{
      if (event.key==="Escape"){ event.preventDefault(); close(); button.focus(); }
    });
    button.onclick=event=>{
      event.stopPropagation();
      if (!popover.hidden){ close(); return; }
      const selected=parseTime();
      if (selected){ hour=selected.hour; minute=selected.minute; }
      else { const now=new Date(); hour=now.getHours(); minute=now.getMinutes(); }
      uses12Hour=getTimeFormat()==="12";
      render();
      popover.hidden=false;
      button.setAttribute("aria-expanded","true");
      positionPopover();
      scrollSelected();
    };
    button.onkeydown=event=>{ if (event.key==="Enter" || event.key===" "){ event.preventDefault(); button.click(); } };
    input.addEventListener("change",updateLabel);
    updateLabel();
  }
  function enhanceTimeInputs(root=document){
    const selector='input[type="time"]:not([data-time-picker-enhanced])';
    if (root.matches?.(selector)) enhanceTimeInput(root);
    root.querySelectorAll(selector).forEach(enhanceTimeInput);
  }
  function repositionTimePickers(){
    document.querySelectorAll(".timePickerPopover:not([hidden])").forEach(popover=>popover._timePosition?.());
  }
  function refreshTimePickerLabels(){
    document.querySelectorAll(".timePickerWrap input[type=time]").forEach(input=>{
      const label=input.parentNode.querySelector(".timePickerButton span");
      if (label){
        label.textContent=input.value ? formatTimeValue(input.value) : "Choose time";
        label.parentNode.classList.toggle("is-placeholder",!input.value);
      }
    });
  }
  function showDialog(options){ return dialogs.showDialog(options); }
  function showNotice(title, message){ return dialogs.showNotice(title, message); }
  function showConfirm(title, message, danger=false){ return dialogs.showConfirm(title, message, danger); }
  const itemFieldRenderer=window.BeforeworkItemFields.create({
    escapeHtml,
    tagDotHtml,
    projectItemEntries,
    priorityOptions:PRIORITY_OPTIONS,
    renderPartial:(name,values)=>window.BeforeworkViewTemplates.renderPartial("itemFields",name,values)
  });
  function renderItemModal(){
    if (!openItemRef) return;
    const {projectId,groupId,itemId} = openItemRef;
    const isNew = !!openItemRef.isNew;
    const project = getProject(projectId);
    const group = projectGroups(project).find(candidate=>candidate.id===groupId);
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
    const groups=projectGroups(project);
    const groupOptions = groups.map(g=>
      `<option value="${g.id}" ${g.id===groupId?"selected":""}>${escapeHtml(g.name)}</option>`).join("");
    const groupSelector = groups.length>1 ? `<div class="sideItem">
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

    const fieldsHtml=fieldsWithStartBeforeDue(project.fields).filter(field=>field.type!=="schedule"&&field.type!=="location").map(field=>itemFieldRenderer.render(field,item,project)).join("");
    const locationField=project.fields.find(field=>field.type==="location");
    const locationHtml=locationField?itemFieldRenderer.renderLocation(locationField,item):"";
    const scheduleField=project.fields.find(field=>field.type==="schedule");
    const hasSchedule = !!(item.startTime || item.endTime || item.endDate || item.recurrence || item.reminderAt);
    const recurrence = normaliseRecurrence(item.recurrence);
    const recurrenceUnit = item.recurrence?.unit || (item.recurrence?.frequency === "custom" ? "week" : "day");
    const scheduleHtml = scheduleField ? (hasSchedule || openItemRef.scheduleOpen ? `
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
      </div>` : `<button class="btn btn-invisible btn-sm scheduleAddBtn" type="button" data-action="addSchedule">+ Add date and time</button>`) : "";
    const scheduleSectionHtml=scheduleField?itemFieldRenderer.renderSchedule(scheduleField,scheduleHtml):"";
    const comments = item.comments || [];
    const commentsHtml = comments.length
      ? [...comments].sort((a,b)=>b.createdAt-a.createdAt).map(c=>`
        <div class="commentRow" data-cid="${c.id}">
          <div class="commentBody">
            <div class="commentMeta">${escapeHtml(formatDateTime(c.createdAt))}</div>
            <div class="commentText markdownBody">${window.BeforeworkMarkdown.render(c.text)}</div>
          </div>
          <button class="btn btn-invisible btn-sm" data-action="delComment" data-cid="${c.id}" title="Delete comment">✕</button>
        </div>`).join("")
      : `<div class="commentEmpty">No comments yet.</div>`;
    const descriptionEditing=isNew||!!openItemRef.descriptionEditing;
    const descriptionPreview=window.BeforeworkMarkdown.render(item.description||"")
      || `<p class="markdownEmpty">No description yet.</p>`;
    const activityEvents = [...(item.activity||[])].sort((a,b)=>b.at-a.at);
    const activityHtml = activityEvents.length
      ? activityEvents.map(event=>{
          const label = event.type==="created" ? "Created" : event.type==="commented" ? "Commented" : event.type==="completed" ? "Marked complete" : event.type==="reopened" ? "Reopened" : event.type==="moved" ? `Moved${event.from?` from ${event.from}`:""}${event.to?` to ${event.to}`:""}` : "Updated";
          return `<div class="activityRow"><div class="activityBadge">${escapeHtml(label)}</div><div class="activityMeta">${escapeHtml(formatUpdatedAt(event.at))}</div></div>`;
        }).join("")
      : `<div class="commentEmpty">No activity yet.</div>`;
    const descriptionActions = !isNew ? `<div class="itemDescriptionActions">
      <button class="btn btn-invisible btn-sm action-menu__trigger" type="button" data-action="toggleDescriptionMenu" aria-label="Description actions" aria-haspopup="menu" aria-expanded="false" aria-controls="descriptionActionMenu"><iconify-icon icon="mdi:dots-horizontal" aria-hidden="true"></iconify-icon></button>
      <div class="menu action-menu action-menu--description" id="descriptionActionMenu" role="menu" hidden>
        ${descriptionEditing?"":`<button type="button" role="menuitem" data-action="toggleDescriptionEdit"><iconify-icon icon="mdi:pencil-outline" aria-hidden="true"></iconify-icon><span>Edit description</span></button>`}
        <button type="button" role="menuitem" data-action="copyDescriptionMarkdown"><iconify-icon icon="mdi:content-copy" aria-hidden="true"></iconify-icon><span>Copy Markdown</span></button>
      </div>
    </div>` : "";
    const descriptionEditControls=!isNew ? `<div class="itemDescriptionEditControls" hidden>
      <button class="btn btn-sm" type="button" data-action="cancelDescriptionEdit">Cancel</button>
      <button class="btn btn-primary btn-sm" type="button" data-action="saveDescriptionEdit">Save</button>
    </div>` : "";
    const itemActions = !isNew ? `<div class="itemModalActions">
      <button class="btn btn-invisible btn-sm action-menu__trigger" type="button" data-action="toggleItemMenu" aria-label="More item actions" aria-haspopup="menu" aria-expanded="false" aria-controls="itemActionMenu"><iconify-icon icon="mdi:dots-horizontal" aria-hidden="true"></iconify-icon></button>
      <div class="menu action-menu action-menu--item" id="itemActionMenu" role="menu" hidden>
        <button type="button" role="menuitem" data-action="duplicateItem"><iconify-icon icon="mdi:content-copy" aria-hidden="true"></iconify-icon><span>Duplicate</span></button>
        <button type="button" role="menuitem" data-action="toggleArchive"><iconify-icon icon="mdi:archive-outline" aria-hidden="true"></iconify-icon><span>${item.archived ? "Unarchive" : "Archive"}</span></button>
        <div class="action-menu__separator" role="separator"></div>
        <button type="button" role="menuitem" class="danger menu-item menu-item--danger" data-action="deleteItem"><iconify-icon icon="mdi:trash-can-outline" aria-hidden="true"></iconify-icon><span>Delete item</span></button>
      </div>
    </div>` : "";
    const subitemCount = item.subitems.length
      ? `<div class="subitemsProgressSummary">
          <span class="subitemsProgressRing" role="progressbar" aria-label="Subitem completion" aria-valuemin="0" aria-valuemax="${item.subitems.length}" aria-valuenow="${doneSubCount}">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <circle class="subitemsProgressTrack" cx="10" cy="10" r="8"></circle>
              <circle class="subitemsProgressValue" cx="10" cy="10" r="8" style="--subitems-progress-offset:${(1-subPct/100)*50.265}"></circle>
            </svg>
          </span>
          <span class="subitemsProgressCount">${doneSubCount}/${item.subitems.length} complete</span>
        </div>`
      : `<span class="subitemsProgressCount">0 items</span>`;
    const existingItemDetails = !isNew ? `
      <div class="mainSection">
        <div class="itemDetailTabs" role="tablist" aria-label="Item details tabs">
          <button type="button" class="itemDetailTab active" data-item-tab="comments" role="tab" aria-selected="true">Comments</button>
          <button type="button" class="itemDetailTab" data-item-tab="attachments" role="tab" aria-selected="false">Attachments <span class="itemAttachmentCount">${(item.attachments||[]).length}</span></button>
          <button type="button" class="itemDetailTab" data-item-tab="activity" role="tab" aria-selected="false">Activity</button>
        </div>
        <div class="itemDetailPanel active" data-item-panel="comments">
          <div id="commentsList">${commentsHtml}</div>
          <div class="commentComposer">
            <textarea class="form-control" id="newCommentInput" rows="2" placeholder="Write a comment..."></textarea>
            <div class="commentComposerFooter">
              <span class="itemMarkdownHint">Markdown supported · Ctrl+Enter to add</span>
              <button class="btn btn-sm" data-action="addComment">Add comment</button>
            </div>
          </div>
        </div>
        <div class="itemDetailPanel" data-item-panel="attachments">
          <div class="itemAttachmentList" data-attachment-list>${attachmentListHtml(item.attachments||[])}</div>
        </div>
        <div class="itemDetailPanel" data-item-panel="activity">${activityHtml}</div>
      </div>` : "";
    const newItemAttachments = isNew ? `<div class="mainSection itemAttachmentsSection">
      <div class="mainSectionHead"><div class="mainSectionLabel">Attachments</div><span class="itemAttachmentCount">${(item.attachments||[]).length}</span></div>
      <div class="itemAttachmentList" data-attachment-list>${attachmentListHtml(item.attachments||[])}</div>
    </div>` : "";
    const footerActions = isNew
      ? `<button class="btn btn-primary btn-sm" data-action="saveItem">Add item</button>`
      : item.calendarType!=="event"
        ? `<button class="btn ${isCompleted?"btn-invisible":"btn-primary"} btn-sm" data-action="completeItem">${isCompleted?"Reopen":"Mark complete"}</button>`
        : "";

    modal.innerHTML = window.BeforeworkViewTemplates.render("itemModal",{
      breadcrumb:`${escapeHtml(project.name)} <span aria-hidden="true">/</span> ${escapeHtml(group?.name||"")}`,
      title:escapeHtml(item.title),
      itemActions,
      descriptionAttachments:attachmentSectionHtml(item,"item"),
      descriptionActions,
      descriptionEditControls,
      description:escapeHtml(item.description),
      descriptionPreview,
      subitemCount,
      subitems:subitemsHtml,
      existingItemDetails,
      newItemAttachments,
      projectOptions,
      groupSelector,
      taskTabClass:item.calendarType!=="event" ? "active" : "",
      eventTabClass:item.calendarType==="event" ? "active" : "",
      milestoneSelector,
      fields:fieldsHtml,
      location:locationHtml,
      schedule:scheduleSectionHtml,
      footerNote:isNew ? "New item" : `Updated ${escapeHtml(formatDateTime(item.updatedAt))}`,
      footerActions
    });

    itemModalView.wire(modal,{onClose:closeItemModal});
    enhanceSelectControls(modal);
    modal.querySelectorAll(".fieldDetailMenuWrap").forEach(wrapper=>{
      const button=wrapper.querySelector("[data-action-menu-trigger]");
      const menu=wrapper.querySelector(".fieldDetailMenu");
      actionMenus.register(button,menu);
      menu.querySelector('[data-field-menu-action="edit"]').onclick=event=>{
        const field=project.fields.find(candidate=>candidate.id===button.dataset.fieldid);
        if (field) editFieldFromMenu(event,field,project);
      };
      menu.querySelector('[data-field-menu-action="delete"]').onclick=event=>{
        const field=project.fields.find(candidate=>candidate.id===button.dataset.fieldid);
        if (field) deleteFieldFromMenu(event,field,project);
      };
    });
    const descriptionInput=modal.querySelector("#itemDescInput");
    const descriptionPreviewElement=modal.querySelector("#itemDescPreview");
    const descriptionToolbar=modal.querySelector(".itemMarkdownToolbar");
    const descriptionEditControlsElement=modal.querySelector(".itemDescriptionEditControls");
    function setDescriptionMode(mode){
      const editing=mode==="edit";
      const editSession=isNew||!!openItemRef.descriptionEditing;
      openItemRef.descriptionMode=mode;
      descriptionInput.hidden=!editing;
      descriptionPreviewElement.hidden=editing;
      descriptionToolbar.hidden=!editSession;
      if (descriptionEditControlsElement){
        descriptionEditControlsElement.hidden=!editSession;
      }
      if (!editing){
        descriptionPreviewElement.innerHTML=window.BeforeworkMarkdown.render(descriptionInput.value)
          || `<p class="markdownEmpty">No description yet.</p>`;
      }
      modal.querySelectorAll("[data-description-tab]").forEach(tab=>{
        const selected=tab.dataset.descriptionTab===mode;
        tab.classList.toggle("active",selected);
        tab.setAttribute("aria-selected",String(selected));
      });
    }
    setDescriptionMode(descriptionEditing?(openItemRef.descriptionMode||"edit"):"preview");
    modal.querySelectorAll("[data-description-tab]").forEach(tab=>{
      tab.onmousedown=event=>event.preventDefault();
      tab.onclick=()=>setDescriptionMode(tab.dataset.descriptionTab);
    });
    modal.querySelectorAll("[data-md-action]").forEach(button=>{
      button.onmousedown=event=>event.preventDefault();
      button.onclick=()=>{
        const action=button.dataset.mdAction;
        const value=descriptionInput.value;
        const start=descriptionInput.selectionStart;
        const end=descriptionInput.selectionEnd;
        const inline={
          bold:["**","**","bold text"],
          italic:["*","*","italic text"],
          strike:["~~","~~","strikethrough text"],
          code:["`","`","code"],
          link:["[","](url)","link text"]
        }[action];
        if (inline){
          const selected=value.slice(start,end)||inline[2];
          const replacement=`${inline[0]}${selected}${inline[1]}`;
          descriptionInput.setRangeText(replacement,start,end,"select");
          descriptionInput.setSelectionRange(start+inline[0].length,start+inline[0].length+selected.length);
        }else{
          const prefix={
            heading:"## ",
            quote:"> ",
            "unordered-list":"- ",
            "ordered-list":"1. ",
            "task-list":"- [ ] "
          }[action];
          if (!prefix) return;
          const lineStart=value.lastIndexOf("\n",Math.max(0,start-1))+1;
          const nextLineBreak=value.indexOf("\n",end);
          const lineEnd=nextLineBreak<0 ? value.length : nextLineBreak;
          const selectedLines=value.slice(lineStart,lineEnd);
          const replacement=selectedLines.split("\n").map(line=>`${prefix}${line}`).join("\n");
          descriptionInput.setRangeText(replacement,lineStart,lineEnd,"select");
          descriptionInput.setSelectionRange(lineStart,lineStart+replacement.length);
        }
        descriptionInput.focus();
      };
    });
    if (isNew && openItemRef.globalNew){
      modal.querySelector("#itemProjectSelect").addEventListener("change", e=>{
        const nextProject = getProject(e.target.value);
        const nextGroup = projectGroups(nextProject)[0];
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
      const nextGroup = projectGroups(project).find(candidate=>candidate.id===newGid);
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
    ["itemStartTimeInput","itemEndTimeInput","itemEndDateInput","itemReminderAt","itemRepeatFrequency","itemRepeatInterval","itemRepeatUnit","itemRepeatUntil"].forEach(id=>{
      const input = modal.querySelector("#"+id);
      if (!input) return;
      if (id==="itemRepeatInterval" || id==="itemRepeatUntil"){
        input.addEventListener("input", ()=>updateRecurrenceSummary(modal));
      }
      input.addEventListener("change", e=>{
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
        const selectedOptions=e.target.selectedOptions?[...e.target.selectedOptions]:[];
        const nextValue=fieldTypes.normalizeInput(field,{
          input:e.target,value:e.target.value,selectedOptions,item,project
        });
        item.values[el.dataset.fieldid] = nextValue;
        if (field?.type==="location") item.location=String(nextValue||"").trim();
        if (isNew){
          if (field?.type!=="relation") renderItemModal();
          return;
        }
        item.updatedAt = Date.now(); scheduleSave(); render();
        if (field?.type!=="relation") renderItemModal();
      });
    });
    modal.querySelector("#itemDescInput").addEventListener("change", e=>{
      if (isNew) item.description=e.target.value;
    });
    const descriptionEditButton=modal.querySelector('[data-action="toggleDescriptionEdit"]');
    if (descriptionEditButton) descriptionEditButton.onclick=()=>{
      openItemRef.descriptionEditing=true;
      setDescriptionMode("edit");
      renderItemModal();
      modal.querySelector("#itemDescInput").focus();
    };
    const cancelDescriptionEditButton=modal.querySelector('[data-action="cancelDescriptionEdit"]');
    if (cancelDescriptionEditButton) cancelDescriptionEditButton.onclick=()=>{
      descriptionInput.value=item.description||"";
      openItemRef.descriptionEditing=false;
      setDescriptionMode("preview");
      renderItemModal();
    };
    const saveDescriptionEditButton=modal.querySelector('[data-action="saveDescriptionEdit"]');
    if (saveDescriptionEditButton) saveDescriptionEditButton.onclick=()=>{
      const nextDescription=descriptionInput.value;
      if (item.description!==nextDescription){
        item.description=nextDescription;
        item.updatedAt=Date.now();
        scheduleSave();
        render();
      }
      openItemRef.descriptionEditing=false;
      setDescriptionMode("preview");
      renderItemModal();
    };
    const copyDescriptionButton=modal.querySelector('[data-action="copyDescriptionMarkdown"]');
    if (copyDescriptionButton) copyDescriptionButton.onclick=async()=>{
      try{
        await navigator.clipboard.writeText(descriptionInput.value);
        modal.querySelector("#descriptionCopyStatus").textContent="Description Markdown copied.";
      }catch(error){
        await showNotice("Couldn't copy Markdown",error.message||"Clipboard access is unavailable.");
      }finally{
        actionMenus.close(modal.querySelector("#descriptionActionMenu"));
      }
    };
    wireAttachmentControls(modal,item,{prefix:"item",isNew});
    modal.querySelectorAll('#itemTagChips [data-tagfilter]').forEach(chip=>{
      chip.onclick = () => {
        const tid = chip.dataset.tagfilter;
        if (item.tagIds.includes(tid)) item.tagIds = item.tagIds.filter(id=>id!==tid);
        else item.tagIds.push(tid);
        item.updatedAt = Date.now(); scheduleSave(); render(); renderItemModal();
      };
    });
    const addItemTagButton=modal.querySelector('[data-action="newTagFromItem"]');
    if (addItemTagButton) addItemTagButton.onclick = async () => {
      const result = await showDialog({title:"New tag", fields:[
        {label:"Tag name", placeholder:"e.g. urgent"},
        {label:"Pill color", type:"tagColor", value:TAG_COLOR_OPTIONS[project.tags.length % TAG_COLOR_OPTIONS.length].value}
      ], confirmLabel:"Create tag"});
      if (result && result[0] && result[0].trim()){
        const t = createTag(project, result[0].trim(), result[1]);
        if (!item.tagIds.includes(t.id)) item.tagIds.push(t.id);
        item.updatedAt=Date.now();
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
            modal.querySelector("#newCommentInput")?.focus();
          }
        };
        addCommentBtn.onclick = submitComment;
        commentInput.addEventListener("keydown", e=>{
          if (e.key==="Enter"&&(e.ctrlKey||e.metaKey)){ e.preventDefault(); submitComment(); }
        });
      }
      modal.querySelectorAll('[data-action="delComment"]').forEach(btn=>{
        btn.onclick = () => { deleteComment(projectId, groupId, itemId, btn.dataset.cid); renderItemModal(); };
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
      modal.querySelector('[data-action="saveItem"]').onclick = async () => {
        const title = modal.querySelector("#itemTitleInput").value.trim();
        if (!title) return;
        try{
          const targetProject=await ensureProjectLoaded(openItemRef.projectId);
          if (!targetProject) throw new Error("The destination project could not be found.");
          item.title = title;
          item.description=modal.querySelector("#itemDescInput").value;
          item.updatedAt = Date.now();
          recordItemActivity(item, "created");
          appendProjectItem(targetProject,openItemRef.groupId,item);
          scheduleSave();
          closeItemModal();
          renderAll();
        }catch(error){
          await showNotice("Couldn't add item",error.message);
        }
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
    navigation.toggleSidebar();
  }
  function closeSidebarOnMobile(){
    navigation.closeSidebarOnMobile();
  }

  /* ---------- Wiring ---------- */
  function wireStaticControls(){
    document.getElementById("feedbackNav").onclick = () => window.open(FEEDBACK_URL, "_blank", "noopener,noreferrer");
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
    document.getElementById("showArchivedToggle").addEventListener("change", e=>{
      showArchived = e.target.checked;
      render();
    });
    document.getElementById("sidebarCollapseHandle").onclick = window.BeforeworkAppearance.toggleSidebarCollapsed;
    document.getElementById("fileImportInput").addEventListener("change", e=>{
      if (e.target.files[0]) workspaceRecovery.importJSON(e.target.files[0]);
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

  async function createProjectFromMenu(){
    const templateOptions = Object.entries(PROJECT_TEMPLATES).map(([value,tpl])=>({value,label:tpl.label}));
    const result = await showDialog({title:"New project", fields:[
      {label:"Project name", placeholder:"e.g. Marketing launch"},
      {label:"Description", type:"textarea", placeholder:"What is this project about?"},
      {label:"Template", type:"select", options:templateOptions, value:"taskboard"}
    ], confirmLabel:"Create project"});
    if (!result) return;
    const [name, description, templateKey] = result;
    if (name && name.trim()) await addProject(name.trim(), templateKey, description.trim()||null);
  }

  function wireProjectCreateMenu(){
    const projectCreateMenu=window.BeforeworkProjectCreateMenu.create({
      actions:{
        createProject:createProjectFromMenu,
        importProject:()=>openCsvImportDialog("new"),
        createFolder
      }
    });
    projectCreateMenu.wire();
  }

  function wireProjectActionsMenu(){
    const container=document.getElementById("projectMenuWrap");
    projectActionsMenu=window.BeforeworkProjectActionsMenu.create({
      documentRef:document,
      container,
      variant:"header",
      actions:projectActionHandlers
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
    const tryBeforeworkLink=document.getElementById("tryBeforeworkLink");
    if (tryBeforeworkLink && window.BEFOREWORK_CONFIG.initialWorkspace==="demo"){
      tryBeforeworkLink.hidden=false;
    }
    navigation=window.BeforeworkNavigation.create({
      onOverview:()=>{
        activeProjectId=OVERVIEW;
        persistActiveLocation();
        renderAll();
        closeSidebarOnMobile();
      },
      onCalendar:()=>{
        activeProjectId=CALENDAR;
        persistActiveLocation();
        renderAll();
        closeSidebarOnMobile();
      },
      onRoadmap:()=>selectProject(ROADMAP),
      onIntegrations:navigateToIntegrations,
      onSettings:navigateToSettings,
      onSupport:navigateToSupport,
      switchWorkspace:switchFile,
      createWorkspace:startNewFileFromMenu
    });
    navigation.wire();
    wireProjectCreateMenu();
    wireProjectActionsMenu();
    window.BeforeworkBoardFilters.create({
      onSearchChange:value=>{
        boardFilterText=value.trim();
        render();
      },
      onClear:()=>{
        boardFilterText="";
        boardFilterGroups.clear();
        boardFilterTags.clear();
        boardFilterFields.clear();
        boardFilterColumns.clear();
        render();
      },
      onSelectCategory:category=>{
        activeFilterCategory=category;
        const project=getProject(activeProjectId);
        if (project) renderFieldFilters(project);
      }
    }).wire();
    wireStaticControls();
    connectGate = window.BeforeworkConnectGate.create({
      getSyncStatusText,
      setSyncStatus,
      getPendingReconnectHandle:()=>pendingReconnectHandle,
      hasLegacyData:()=>!!localStorage.getItem(LEGACY_LS_KEY),
      hasConnectedWorkspace:()=>!!fileHandle,
      actions:{
        createWorkspace:createNewWorkspaceFolder,
        openWorkspace:openExistingWorkspaceFolder,
        openLegacyFile:openExistingFile,
        reconnect:reconnectPendingFile,
        migrateLegacyData:migrateLegacyBrowserData
      }
    });
    connectGate.wire();
    enhanceSelectControls();
    enhanceDateInputs();
    enhanceTimeInputs();
    new MutationObserver(mutations=>mutations.forEach(mutation=>mutation.addedNodes.forEach(node=>{
      if (node.nodeType===Node.ELEMENT_NODE){
        enhanceSelectControls(node);
        enhanceDateInputs(node);
        enhanceTimeInputs(node);
      }
    }))).observe(document.body,{childList:true,subtree:true});
    window.addEventListener("resize",repositionFloatingSelectMenus);
    window.addEventListener("resize",repositionTimePickers);
    document.addEventListener("scroll",repositionFloatingSelectMenus,true);
    document.addEventListener("scroll",repositionTimePickers,true);
    document.addEventListener("click",event=>{
      if (event.target.closest(".appSelectWrap,.dialogSelectWrap,.appSelectMenu,.dialogSelectMenu,.datePickerWrap,.datePickerPopover,.timePickerWrap,.timePickerPopover")) return;
      document.querySelectorAll(".appSelectMenu:not([hidden]),.dialogSelectMenu:not([hidden]),.datePickerPopover:not([hidden]),.timePickerPopover:not([hidden])").forEach(menu=>{
        if (menu.matches(".appSelectMenu,.dialogSelectMenu")) closeFloatingSelectMenu(menu);
        else menu._popoverClose?.();
      });
    });
    reminderService.start();
    await authService.init();
    try{
      const [settingsModule,overviewDetailsViewModule,overviewDetailsModelModule,milestonesViewModule,roadmapViewModule,overviewViewModule,listViewModule,tableViewModule,boardViewModule,calendarViewModule] = await loadViewModules();
      settingsView = createSettingsView(settingsModule.SettingsView);
      const overviewDetailsModel=new overviewDetailsModelModule.OverviewDetailsModel();
      overviewDetailsView = new overviewDetailsViewModule.OverviewDetailsView({
        model:overviewDetailsModel,
        cloneTemplate:async()=>{
          await window.BeforeworkViewTemplates.load("overviewDetails");
          return window.BeforeworkViewTemplates.clone("overviewDetails");
        }
      });
      milestonesView = new milestonesViewModule.MilestonesView({
        projectGroups,
        projectItemEntries,
        cloneTemplate:()=>window.BeforeworkViewTemplates.clone("milestones")
      });
      roadmapView = new roadmapViewModule.RoadmapView();
      listView = new listViewModule.ListView({
        projectGroups,
        projectItemEntries,
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
        wireColumnFilterHeader,
        render,
        sortProjectRows,
        tagById,
        tagPillHtml,
        fieldCellHtml,
        formatUpdatedAt,
        openItemModal,
        scheduleSave,
        applyTableColumnOrder,
        applyTableColumnVisibility,
        applyColumnFilterVisibility,
        cloneTemplate:()=>window.BeforeworkViewTemplates.clone("listView")
      });
      tableView = new tableViewModule.TableView({
        projectGroups,
        projectItemEntries,
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
        wireColumnFilterHeader,
        render,
        sortProjectRows,
        tagById,
        tagPillHtml,
        priorityOptions:PRIORITY_OPTIONS,
        scheduleFieldValue,
        getItem,
        scheduleSave,
        renderProjectList,
        applyTableColumnOrder,
        applyTableColumnVisibility,
        applyColumnFilterVisibility,
        cloneTemplate:()=>window.BeforeworkViewTemplates.clone("tableView")
      });
      boardView = new boardViewModule.BoardView({
        projectGroups,
        projectItemEntries,
        itemMatchesFilter,
        scheduleSave,
        renderProjectList,
        editGroupName,
        confirmDeleteGroup,
        openNewItemModal,
        moveItem,
        setItemFieldValue,
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
          projectGroups,
          visibleProjects:projects=>overviewDetailsModel.visibleProjects(projects),
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
      await workspaceRecovery.maybeShowMigrationNotice();
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
