  "use strict";

  /* ---------- Constants ---------- */
  const uid = () => crypto.randomUUID();
  // Primer's own semantic fg tokens, not hand-picked hex - these track
  // light/dark theme automatically instead of needing a second palette.
  const fieldTypes=window.BeforeworkFieldTypes;
  const recurrenceFeature=window.BeforeworkRecurrence.create();
  const TAG_FIELD=fieldTypes.get("tags");
  const TAG_COLORS=TAG_FIELD.colors;
  const TAG_COLOR_OPTIONS=TAG_FIELD.colorOptions;
  const SELECT_COLORS=fieldTypes.get("select").colors;
  const projectTemplates=window.BeforeworkProjectTemplates.create({
    uid,tagColors:TAG_COLORS,selectColors:SELECT_COLORS
  });
  const OVERVIEW = "__overview__";
  const CALENDAR = "__calendar__";
  const ROADMAP = "__roadmap__";
  const INTEGRATIONS = "__integrations__";
  const SETTINGS = "__settings__";
  const SUPPORT = "__support__";
  const DEFAULT_PROJECT_ICON = "mdi:clipboard-text-outline";
  const escapeHtml=window.BeforeworkHtml.escapeHtml;
  const PROJECT_DEFAULT_ICONS = [
    "mdi:clipboard-text-outline","mdi:folder-outline","mdi:briefcase-outline","mdi:rocket-launch-outline",
    "mdi:code-tags","mdi:chart-box-outline","mdi:calendar-month-outline","mdi:lightbulb-outline",
    "mdi:palette-outline","mdi:book-open-variant","mdi:target","mdi:toolbox-outline",
    "mdi:account-group-outline","mdi:file-document-outline","mdi:flag-outline","mdi:puzzle-outline",
    "mdi:school-outline","mdi:bank-outline"
  ];
  const LOCATION_KEY = "personal_dashboard_location_v1";
  const FEEDBACK_URL = "https://github.com/shrestha-bishal/beforework/issues";
  const GITHUB_SPONSORS_URL = "https://github.com/sponsors/shrestha-bishal";
  const BUY_ME_A_COFFEE_URL = "https://www.buymeacoffee.com/shresthabishal";
  const GOOGLE_CLIENT_ID = window.BEFOREWORK_CONFIG.googleClientId || "";
  const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly";
  const selectControls=window.BeforeworkSelectControl.create();
  window.BeforeworkAppSelect=Object.freeze({
    enhance:selectControls.enhanceSelectControl,
    enhanceAll:selectControls.enhanceSelectControls
  });
  const dialogs = window.BeforeworkDialogs.create({
    tagColorOptions:TAG_COLOR_OPTIONS,
    defaultProjectIcon:DEFAULT_PROJECT_ICON,
    projectDefaultIcons:PROJECT_DEFAULT_ICONS,
    openFloatingSelectMenu:selectControls.openFloatingSelectMenu,
    closeFloatingSelectMenu:selectControls.closeFloatingSelectMenu,
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
    'import("./views/documents-view.js")',
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
        filterFeature.setGroups([group.id]);
        render();
      },
      async openProjectItem(project,group,item){
        await selectProject(project.id);
        openItemModal(project.id,group.id,item.id);
      },
      async openTag(project,tag){
        await selectProject(project.id);
        filterFeature.setTags([tag.id]);
        render();
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
    onTemplateError:error=>showNotice("Couldn't open command palette",window.BeforeworkErrorUtils.getMessage(error)),
    cloneTemplate:async()=>{
      await window.BeforeworkViewTemplates.load("commandPalette");
      return window.BeforeworkViewTemplates.clone("commandPalette").querySelector("#commandPalette").content.firstElementChild.cloneNode(true);
    },
  });
  window.BeforeworkCommandPaletteInstance=commandPalette;
  let settingsView = null;
  let overviewDetailsView = null;
  let milestonesView = null;
  let documentsView = null;
  let roadmapView = null;
  let overviewView = null;
  let listView = null;
  let tableView = null;
  let boardView = null;
  let calendarView = null;
  let activeProjectId = OVERVIEW;
  const filterFeature=window.BeforeworkFilters.create({
    storageKey:"personal_dashboard_filters_v1",
    fieldTypes,
    getProject,
    getActiveProjectId:()=>activeProjectId,
    getProjectGroups:project=>projectGroups(project),
    getProjectItemEntries:project=>projectItemEntries(project),
    getShowArchived:()=>false,
    isItemCompleted:item=>isItemCompleted(item),
    scheduleFieldValue,
    render:renderAll,
    escapeHtml,
    enhanceSelectControl:selectControls.enhanceSelectControl
  });
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
  let listSort = {field:"updated", dir:"desc"};
  let openItemRef = null;
  let fileHandle = null;
  let workspaceRootHandle = null;
  let saveTimer = null;
  let lastSavedState = null;
  const undoStack = [];
  const selectedItemIds = new Set();
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

  const dateTime=window.BeforeworkDateTime.create();
  const {
    getTimeFormat,
    formatTimeValue,
    formatDate,
    formatDateTime,
    formatUpdatedAt,
    todayStr,
    dateTimeLocalValue
  }=dateTime;
  const fmtDate=formatDate;

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
        filterFeature.clearPreferences();
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

  async function resetDemoWorkspace(){
    if (window.BEFOREWORK_CONFIG.initialWorkspace!=="demo") return;
    const confirmed=await showDialog({
      title:"Reset demo workspace",
      message:"This replaces the demo data saved in this browser with a fresh sample workspace. This cannot be undone.",
      confirmLabel:"Reset demo",
      danger:true
    });
    if (!confirmed) return;
    state=defaultState();
    activeProjectId=OVERVIEW;
    persistActiveLocation();
    filterFeature.clearPreferences();
    filterFeature.reset();
    selectedItemIds.clear();
    undoStack.length=0;
    lastSavedState=JSON.stringify(state);
    scheduleSave();
    renderAll();
    if (!await flushSave()){
      await showNotice("Couldn't save the reset demo","The sample data is open in this tab, but the browser couldn't save it. Check the browser's storage settings and try again.");
    }
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

  /* ---------- Model helpers ---------- */
  const itemFeature=window.BeforeworkItemFeature.create({
    uid,getProject,tagColorOptions:TAG_COLOR_OPTIONS,selectedItemIds,boardFilterTags:filterFeature.tags,
    hasTagsField,queueGoogleEventDeletes,showConfirm,showDialog,
    scheduleSave,render,renderAll,renderProjectList
  });
  const {
    UNGROUPED_GROUP_ID,recordItemActivity,projectGroups,projectItemEntries,appendProjectItem,
    getGroup,getItem,isItemCompleted,createItem,createDraft,addItem,setItemFieldValue,
    removeItemRelations,deleteItem,makeDuplicateItem,duplicateItem,toggleArchiveItem,
    addComment,deleteComment,bulkSetCompleted,bulkDelete,bulkMove,createTag,bulkTag,
    bulkDuplicate,moveItem
  }=itemFeature;
  function projectRecords(){ return state?.folderLazy ? state.projectSummaries : state?.projects||[]; }
  function activeProjectRecords(){ return projectRecords().filter(project=>!project.archived); }
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
          await showNotice("Couldn't update calendar task",window.BeforeworkErrorUtils.getMessage(error));
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
    activeProjectRecords().forEach(project=>{
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
    const tpl=projectTemplates.get(templateKey);
    const fields=projectTemplates.buildFields(templateKey);
    const groupByFieldId=fields.find(field=>field.label===tpl.boardGroupBy)?.id;
    const views = tpl.views.map(type=>({
      id:uid(),
      type,
      name:viewLabel(type),
      ...(type==="kanban"&&groupByFieldId?{groupByFieldId}:{})
    }));
    const p = {
      id:uid(), name, description, createdAt:Date.now(), folderId:null,
      documents:[],
      tags:projectTemplates.buildTags(templateKey),
      fields,
      groups: tpl.groups.map(gName=>({id:uid(), name:gName, items:[]})),
      items:[],
      views, activeViewId: views[0].id,
      itemDefaultType: tpl.itemDefaultType || "task",
      ...(tpl.columnOrders?{columnOrders:Object.fromEntries(
        Object.entries(tpl.columnOrders).map(([viewType,columnIds])=>[viewType,[...columnIds]])
      )}:{}),
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
      activeProjectId = activeProjectRecords()[0]?.id || OVERVIEW;
      persistActiveLocation();
    }
    scheduleSave(); renderAll();
  }
  async function duplicateProject(project){
    const proposedName = `${project.name} (copy)`;
    const name = await showDialog({
      title:"Duplicate project",
      message:"Groups, fields, tags, milestones, documents, views, and items will be copied. Comments and Google Calendar sync history won't be copied. Scheduled items may sync as new events.",
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
    const documentIds = new Map();
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
    (project.documents||[]).forEach(document=>documentIds.set(document.id,uid()));

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
      documents:(project.documents||[]).map(document=>({
        ...document,id:documentIds.get(document.id),createdAt:now,updatedAt:now
      })),
      activeDocumentId:documentIds.get(project.activeDocumentId)||documentIds.get(project.documents?.[0]?.id)||null,
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
    filterFeature.setGroups([...filterFeature.groups].filter(id=>id!==gid));
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
  function csvImportTargets(project,templateKey){
    const fields=project?project.fields:projectTemplates.buildFields(templateKey);
    const targets=[
      {key:"title",kind:"title",label:"Task title",required:true},
      {key:"description",kind:"description",label:"Description"},
      {key:"startDate",kind:"startDate",label:"Start date"},
      {key:"dueDate",kind:"dueDate",label:"Due date"},
      {key:"status",kind:"status",label:"Status / group"},
      ...(hasTagsField(project||{fields})?[{key:"tags",kind:"tags",label:"Tags"}]:[])
    ];
    const startField=fields.find(field=>field.type==="start-date")
      ||fields.find(field=>field.type==="date"&&/^(start|start date|starts on)$/.test(String(field.label||"").trim().toLowerCase()));
    const dueField=fields.find(field=>field.type==="due-date")
      ||fields.find(field=>field.type==="date"&&/^(due|due date|deadline)$/.test(String(field.label||"").trim().toLowerCase()));
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
  }
  function csvImportPreviewOptions({project,templateKey,priorityTarget}){
    const statusField=project?.fields.find(field=>field.type==="select"&&field.label.trim().toLowerCase()==="status");
    const template=projectTemplates.get(templateKey);
    const templateHasStatus=!project&&template.fields.includes("status");
    const fields=project?project.fields:projectTemplates.buildFields(templateKey);
    const priorityField=priorityTarget
      ? project
        ? project.fields.find(field=>field.id===priorityTarget.fieldId)
        : fields[priorityTarget.fieldIndex]
      : null;
    return {
      priorityChoices:priorityField
        ? fieldTypes.getInputChoices(priorityField,{project:project||undefined})
        : undefined,
      groupNames:project
        ? statusField
          ? (statusField.options||[]).map(option=>option.label)
          : project.groups.map(group=>group.name)
        : templateHasStatus
          ? projectTemplates.statusOptions(templateKey)
          : template.groups,
      mapsStatusToField:!!statusField||templateHasStatus
    };
  }
  async function importCsvTasks({destinationMode,targetProjectId,newProjectName,templateKey,project:previewProject,mapping,prepared}){
    let project=previewProject;
    if (destinationMode==="new"){
      project=await addProject(newProjectName,templateKey,null);
      if (!project) throw new Error("The project could not be created. Resolve any pending workspace save and try again.");
    }else{
      project=await ensureProjectLoaded(targetProjectId);
      if (!project) throw new Error("Couldn't load the selected project.");
    }
    let startField=destinationMode==="new"
      ? project.fields[mapping.startDateFieldIndex]
      : project.fields.find(field=>field.id===mapping.startDateFieldId);
    let dueField=destinationMode==="new"
      ? project.fields[mapping.dueDateFieldIndex]
      : project.fields.find(field=>field.id===mapping.dueDateFieldId);
    const priorityField=destinationMode==="new"
      ? project.fields[mapping.priorityFieldIndex]
      : project.fields.find(field=>field.id===mapping.priorityFieldId);
    if (mapping.startDateFieldId&&!startField) throw new Error("The selected start-date field is no longer available.");
    if (mapping.dueDateFieldId&&!dueField) throw new Error("The selected due-date field is no longer available.");
    if (mapping.priorityFieldId&&!priorityField) throw new Error("The selected priority field is no longer available.");
    if (mapping.mapping.startDate!==undefined&&!startField){
      startField={id:uid(),label:"Start date",type:"start-date",options:[]};
      project.fields.push(startField);
    }
    if (mapping.mapping.dueDate!==undefined&&!dueField){
      dueField={id:uid(),label:"Due date",type:"due-date",options:[]};
      project.fields.push(dueField);
    }
    const customDateFields=mapping.customDateFields.map(target=>{
      const field=destinationMode==="new"
        ? project.fields[target.fieldIndex]
        : project.fields.find(candidate=>candidate.id===target.fieldId);
      if (!field) throw new Error("A selected custom date column is no longer available.");
      return {...target,field};
    });
    const statusField=project.fields.find(field=>field.type==="select"&&field.label.trim().toLowerCase()==="status");
    const groups=new Map(project.groups.map(group=>[group.name.trim().toLowerCase(),group]));
    const statusOptions=statusField?ensureStatusOptions(statusField,prepared.groupsToCreate):new Map();
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
        : imported.status?groups.get(imported.status.trim().toLowerCase())
          : projectGroups(project).find(candidate=>candidate.id===UNGROUPED_GROUP_ID)||project.groups[0];
      if (statusField&&imported.status&&!statusOption) throw new Error(`Couldn't find a Status option for "${imported.status}".`);
      if (!statusField&&!group) throw new Error(`Couldn't find a group for status "${imported.status}".`);
      const item=createItem(project.id,imported.title);
      item.description=imported.description;
      if (statusField&&statusOption) item.values[statusField.id]=statusOption.id;
      if (startField&&imported.startDate) item.values[startField.id]=imported.startDate;
      if (dueField&&imported.dueDate) item.values[dueField.id]=imported.dueDate;
      customDateFields.forEach(({key,field})=>{
        if (imported.customDates[key]) item.values[field.id]=imported.customDates[key];
      });
      if (priorityField&&imported.priority) item.values[priorityField.id]=imported.priority;
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
    return {project};
  }
  const csvImportDialog=window.BeforeworkCsvImportDialog.create({
    loadTemplate:name=>window.BeforeworkViewTemplates.load(name),
    cloneTemplate:name=>window.BeforeworkViewTemplates.clone(name),
    makeTargets:csvImportTargets,
    getPreviewOptions:csvImportPreviewOptions,
    getProjects:activeProjectRecords,
    getActiveProjectId:()=>activeProjectId,
    resolveProject:ensureProjectLoaded,
    importTasks:importCsvTasks,
    showNotice,
    errorUtils:window.BeforeworkErrorUtils
  });
  async function openCsvImportDialog(destinationMode="existing",targetProjectId=activeProjectId){
    if (!fileHandle){
      await showNotice("Connect a workspace first","Open or create a workspace before importing tasks.");
      return;
    }
    await csvImportDialog.open({destinationMode,targetProjectId});
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
    }catch(err){ showNotice("Undo failed", "Could not undo that change: " + window.BeforeworkErrorUtils.getMessage(err)); }
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
        }catch(error){ errors.push(`${file.name}: ${window.BeforeworkErrorUtils.getMessage(error)}`); }
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
      }catch(error){ await showNotice("Couldn't download attachment",window.BeforeworkErrorUtils.getMessage(error)); }
    };
  }
  function fieldChipHtml(field, value, project){
    if (!value) return "";
    if (field.type==="priority"){
      const opt = fieldTypes.getFieldChoices(field,{project}).find(option=>option.id===value); if (!opt) return "";
      return `<span class="priorityDot" style="background:${opt.color}" title="${escapeHtml(opt.label)} ${escapeHtml(field.label)}"></span>`;
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
      const opt = fieldTypes.getFieldChoices(field,{project}).find(option=>option.id===value);
      return opt ? `${fieldChipHtml(field,value,project)}${escapeHtml(opt.label)}` : "-";
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
    const formattedValue=fieldTypes.formatValue(field,{value});
    return formattedValue?escapeHtml(formattedValue):"-";
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

  function itemMatchesFilter(project, item, group, ignoreColumnFilters=false){
    return filterFeature.matches(project,item,group,ignoreColumnFilters);
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
      await showNotice("Couldn't update Overview visibility",window.BeforeworkErrorUtils.getMessage(error));
    }
  }

  async function toggleProjectArchive(projectId){
    try{
      const project=await ensureProjectLoaded(projectId);
      if (!project) throw new Error("The project could not be found.");
      project.archived=!project.archived;
      if (state.folderLazy) registerProjectSummary(project);
      scheduleSave();
      renderAll();
    }catch(error){
      await showNotice("Couldn't update project archive status",window.BeforeworkErrorUtils.getMessage(error));
    }
  }

  const projectActionHandlers={
    edit:async project=>{
      const loaded=await ensureProjectLoaded(project.id);
      if (loaded) await editProject(loaded);
    },
    "overview-visibility":project=>toggleProjectOverviewVisibility(project.id),
    archive:project=>toggleProjectArchive(project.id),
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
      if (loaded) await fieldFeature.addFieldFlow(loaded);
    },
    documents:async project=>{
      await selectProject(project.id);
      if (activeProjectId!==project.id) return;
      const loaded=getProject(project.id);
      if (!loaded) return;
      const view=loaded.views.find(candidate=>candidate.type==="documents");
      if (view){
        loaded.activeViewId=view.id;
        scheduleSave();
        render();
      }else addView(loaded,"documents");
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
    const activeProjects=projects.filter(project=>!project.archived);
    const archivedProjects=projects.filter(project=>project.archived);
    const unfiled = activeProjects.filter(project=>!project.folderId || !state.folders.some(folder=>folder.id===project.folderId));
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
      const projectCount = activeProjects.filter(project=>project.folderId===folder.id).length;
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
      activeProjects.filter(project=>project.folderId===folder.id).forEach(project=>appendProject(project, true));
    });
    if (archivedProjects.length){
      const heading=document.createElement("li");
      heading.className="folderHeading archivedProjectsHeading";
      if (ul.children.length){
        const divider=document.createElement("div");
        divider.className="uiDivider folderHeadingDivider";
        divider.setAttribute("aria-hidden","true");
        heading.appendChild(divider);
      }
      const icon=document.createElement("iconify-icon");
      icon.setAttribute("icon","mdi:archive-outline");
      icon.setAttribute("aria-hidden","true");
      const name=document.createElement("span");
      name.className="folderName";
      name.textContent="Archived";
      const count=document.createElement("span");
      count.className="folderCount";
      count.textContent=String(archivedProjects.length);
      heading.append(icon,name,count);
      ul.appendChild(heading);
      archivedProjects.forEach(project=>appendProject(project));
    }
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
      catch(err){ await showNotice("Couldn't load project",window.BeforeworkErrorUtils.getMessage(err)); return; }
    }else if(state?.folderLazy && state.projects.length){
      if (!await flushSave()){
        await showNotice("Navigation paused","Resolve the pending save before unloading the open project.");
        return;
      }
      state.projects=[];
    }
    activeProjectId = pid;
    persistActiveLocation();
    filterFeature.restore(pid);
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
    if (activeProjectId !== OVERVIEW && activeProjectId !== CALENDAR && activeProjectId !== ROADMAP && activeProjectId !== SUPPORT) filterFeature.restore(activeProjectId);
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
        dateTime.setTimeFormat(value);
        dateTimePickers.refreshTimePickerLabels();
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
    if (completionTabs && filterBar && board.contains(completionTabs)){
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
      else if (activeProjectId===ROADMAP) roadmapView.render(board,window.BeforeworkRoadmapModel.rowsForWorkspace(activeProjectRecords()),{
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

    filterFeature.persistActive();

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

    filterFeature.renderBar(project);

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
    if (activeView.type==="documents"){
      filterBar.style.display="none";
      completionTabs.style.display="none";
      completionTabs.classList.remove("completionTabsInList");
      documentsView.render(project,board);
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
    const items = projectItemEntries(project).map(row=>row.item).filter(item=>!item.archived);
    const completedCount = items.filter(isItemCompleted).length;
    const openCount = items.length-completedCount;
    wrap.innerHTML = `<div class="completionTabList" role="group" aria-label="Filter items by completion">
      <button type="button" class="completionTab ${filterFeature.completion==="open"?"active":""}" aria-pressed="${filterFeature.completion==="open"}" data-completion-filter="open"><iconify-icon icon="mdi:circle-outline" aria-hidden="true"></iconify-icon><span>Open</span><span class="completionTabCount">${openCount}</span></button>
      <button type="button" class="completionTab ${filterFeature.completion==="completed"?"active":""}" aria-pressed="${filterFeature.completion==="completed"}" data-completion-filter="completed"><iconify-icon icon="mdi:check-circle-outline" aria-hidden="true"></iconify-icon><span>Completed</span><span class="completionTabCount">${completedCount}</span></button>
    </div>`;
    wrap.querySelectorAll("[data-completion-filter]").forEach(button=>{
      button.onclick = () => {
        const nextFilter = button.dataset.completionFilter;
        if (filterFeature.completion===nextFilter) return;
        filterFeature.setCompletion(nextFilter);
        render();
      };
    });
  }

  function calendarEntries(scopeProject){
    const entries = [];
    if (!scopeProject){
      (state.calendarItems||[]).forEach(item=>{
        const date = item.startDate || item.endDate;
        if (date){
          const repeatDates = recurrenceFeature.expandDates(date,item.endDate&&item.endDate>=date?item.endDate:date,recurrenceFeature.normalise(item.recurrence));
          repeatDates.forEach(({date:occurrenceDate, endDate})=>{
            entries.push({project:null, group:null, item, field:{id:"__standalone__", label:"Calendar", type:"date"}, date:occurrenceDate, endDate});
          });
        }
      });
    }
    const projects = scopeProject ? [scopeProject] : activeProjectRecords();
    projects.forEach(project=>{
      const projectItems=projectItemEntries(project);
      projectItems.forEach(({group,item})=>{
      const fields = calendarDateFields(project);
      const datedField = fields.find(field=>item.values[field.id]);
      const repeatDates = recurrenceFeature.expandDates(item.values[datedField?.id]||item.endDate||"",item.endDate||item.values[datedField?.id]||"",recurrenceFeature.normalise(item.recurrence));
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
    const summary=recurrenceFeature.summary(frequency==="none"?null:{frequency,interval:Math.max(1,isNaN(interval)?1:interval),unit,until,byDay});
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
          <div class="recurrenceRuleText" id="standaloneRepeatSummary" aria-live="polite">${escapeHtml(recurrenceFeature.summary(item.recurrence))}</div>
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
        recurrence: recurrenceFeature.normalise({
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
      item.recurrence = recurrenceFeature.normalise({
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
      ensureProjectLoaded(pid).then(()=>openItemModal(pid,gid,iid)).catch(err=>showNotice("Couldn't load project item",window.BeforeworkErrorUtils.getMessage(err)));
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
  const enhanceSelectControl=selectControls.enhanceSelectControl;
  const enhanceSelectControls=selectControls.enhanceSelectControls;
  const closeFloatingSelectMenu=selectControls.closeFloatingSelectMenu;
  const repositionFloatingSelectMenus=selectControls.repositionFloatingSelectMenus;
  const dateTimePickers=window.BeforeworkDateTimePickers.create({
    dateTime,
    cloneTemplate:()=>window.BeforeworkViewTemplates.clone("dateTimePickers")
  });
  function showDialog(options){ return dialogs.showDialog(options); }
  function showNotice(title, message){ return dialogs.showNotice(title, message); }
  function showConfirm(title, message, danger=false){ return dialogs.showConfirm(title, message, danger); }
  const fieldFeature=window.BeforeworkFieldFeature.create({
    uid,
    fieldTypes,
    projectItemEntries,
    queueGoogleEventDeletes,
    getBoardFilterFields:()=>filterFeature.fields,
    getBoardFilterColumns:()=>filterFeature.columns,
    getBoardFilterTags:()=>filterFeature.tags,
    getListSort:()=>listSort,
    setListSort:value=>{ listSort=value; },
    showDialog,
    showNotice,
    showConfirm,
    scheduleSave,
    renderAll,
    refreshOpenItemModal:()=>{ if (openItemRef) renderItemModal(); },
    closeAllActionMenus:()=>actionMenus.closeAll()
  });
  const itemFieldRenderer=window.BeforeworkItemFields.create({
    escapeHtml,
    tagPillHtml,
    projectItemEntries,
    fieldTypes,
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

    const projectOptions = isNew && openItemRef.globalNew ? `<div class="sideItem"><div class="sideItemLabel">Project</div><select class="form-control" id="itemProjectSelect">${activeProjectRecords().map(candidate=>`<option value="${candidate.id}" ${candidate.id===projectId?"selected":""}>${escapeHtml(candidate.name)}</option>`).join("")}</select></div>` : "";
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
    const recurrence=recurrenceFeature.normalise(item.recurrence);
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
            <div class="recurrenceRuleText" id="recurrenceSummary" aria-live="polite">${escapeHtml(recurrenceFeature.summary(recurrence))}</div>
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
    modal.querySelectorAll(".fieldDetailSettings").forEach(button=>{
      button.onclick=event=>{
        const field=project.fields.find(candidate=>candidate.id===button.dataset.fieldid);
        if (field) fieldFeature.editField(event,field,project);
      };
    });
    modal.querySelectorAll(".fieldDetailMenuTrigger").forEach(button=>{
      const menu=button.parentElement.querySelector("[data-field-menu]");
      actionMenus.register(button,menu);
      menu.querySelector("[data-field-menu-delete]").onclick=event=>{
        const field=project.fields.find(candidate=>candidate.id===button.dataset.fieldid);
        if (field) fieldFeature.deleteFieldFromMenu(event,field,project);
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
        if (field?.type==="tags"){
          item.tagIds=selectedOptions.map(option=>option.value);
          item.updatedAt=Date.now();
          if (!isNew) scheduleSave();
          render();
          renderItemModal();
          return;
        }
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
        await showNotice("Couldn't copy Markdown",window.BeforeworkErrorUtils.getMessage(error, "Clipboard access is unavailable."));
      }finally{
        actionMenus.close(modal.querySelector("#descriptionActionMenu"));
      }
    };
    wireAttachmentControls(modal,item,{prefix:"item",isNew});
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
          await showNotice("Couldn't add item",window.BeforeworkErrorUtils.getMessage(error));
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
    const templateOptions=projectTemplates.entries().map(([value,template])=>({value,label:template.label}));
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
     Regular mode silently resumes the last-connected file or shows the
     connect gate. Demo mode loads its isolated browser workspace instead.
     Auth (if a provider is available) is initialized independently. */
  async function boot({loadViewModules}){
    window.BeforeworkAppearance.initTheme();
    window.BeforeworkAppearance.initSidebarCollapse();
    try{
      await window.BeforeworkViewTemplates.load("dateTimePickers");
    }catch(error){
      await showNotice("Couldn't load date and time pickers",window.BeforeworkErrorUtils.getMessage(error));
      return;
    }
    const demoMode=window.BEFOREWORK_CONFIG.initialWorkspace==="demo";
    const tryBeforeworkLink=document.getElementById("tryBeforeworkLink");
    const resetDemoButton=document.getElementById("resetDemoBtn");
    if (demoMode){
      if (tryBeforeworkLink) tryBeforeworkLink.hidden=false;
      if (resetDemoButton) resetDemoButton.hidden=false;
      const workspaceSwitcherButton=document.getElementById("workspaceSwitcherBtn");
      if (workspaceSwitcherButton) workspaceSwitcherButton.disabled=true;
      document.getElementById("workspaceSwitchBtn").hidden=true;
      document.getElementById("workspaceNewBtn").hidden=true;
      document.querySelector(".workspaceSwitcherChevron").hidden=true;
    }
    if (resetDemoButton){
      resetDemoButton.onclick=resetDemoWorkspace;
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
    filterFeature.wire();
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
    dateTimePickers.enhanceDateInputs();
    dateTimePickers.enhanceTimeInputs();
    new MutationObserver(mutations=>mutations.forEach(mutation=>mutation.addedNodes.forEach(node=>{
      if (node.nodeType===Node.ELEMENT_NODE){
        enhanceSelectControls(node);
        dateTimePickers.enhanceDateInputs(node);
        dateTimePickers.enhanceTimeInputs(node);
      }
    }))).observe(document.body,{childList:true,subtree:true});
    window.addEventListener("resize",repositionFloatingSelectMenus);
    window.addEventListener("resize",dateTimePickers.repositionTimePickers);
    document.addEventListener("scroll",repositionFloatingSelectMenus,true);
    document.addEventListener("scroll",dateTimePickers.repositionTimePickers,true);
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
      const [settingsModule,overviewDetailsViewModule,overviewDetailsModelModule,milestonesViewModule,documentsViewModule,roadmapViewModule,overviewViewModule,listViewModule,tableViewModule,boardViewModule,calendarViewModule] = await loadViewModules();
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
      const documentsFeature=window.BeforeworkProjectDocuments.create({uid});
      documentsView=new documentsViewModule.DocumentsView({
        documentsFeature,
        showDialog,
        showConfirm,
        showNotice,
        scheduleSave,
        render,
        markdown:window.BeforeworkMarkdown,
        cloneTemplate:()=>window.BeforeworkViewTemplates.clone("documents")
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
        wireCustomColumnHeader:fieldFeature.wireCustomColumnHeader,
        wireColumnFilterHeader:filterFeature.wireColumnFilterHeader,
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
        applyColumnFilterVisibility:filterFeature.applyColumnFilterVisibility,
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
        wireCustomColumnHeader:fieldFeature.wireCustomColumnHeader,
        wireColumnFilterHeader:filterFeature.wireColumnFilterHeader,
        render,
        sortProjectRows,
        tagById,
        tagPillHtml,
        scheduleFieldValue,
        getItem,
        scheduleSave,
        renderProjectList,
        applyTableColumnOrder,
        applyTableColumnVisibility,
        applyColumnFilterVisibility:filterFeature.applyColumnFilterVisibility,
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
          priorityOptions:project=>fieldTypes.getInputChoices(priorityField(project),{project}),
          todayStr,
          projectRecords:activeProjectRecords,
          formatUpdatedAt,
          priorityColor:(project,value)=>{
            const field=priorityField(project);
            return fieldTypes.getFieldChoices(field,{project}).find(option=>option.id===value)?.color;
          }
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
      showNotice("Couldn't load views", window.BeforeworkErrorUtils.getMessage(err));
      return;
    }
    try{ await focusTimer.init(); }
    catch(err){
      showNotice("Couldn't load focus timer", window.BeforeworkErrorUtils.getMessage(err));
      return;
    }
    if (demoMode){
      fileHandle={kind:"demo",name:"Demo workspace"};
      let loadError=null;
      try{
        state=window.BeforeworkStorage.loadDemoWorkspace(defaultState());
      }catch(err){
        state=defaultState();
        loadError=err;
      }
      lastSavedState=JSON.stringify(state);
      lastWrittenState=lastSavedState;
      try{
        await window.BeforeworkDemoSeeder.writeAttachments(state,(id,file)=>window.BeforeworkStorage.writeAttachment(id,file));
      }catch(err){
        await showNotice("Couldn't prepare demo attachments",window.BeforeworkErrorUtils.getMessage(err));
      }
      if (loadError){
        setSyncStatus("Couldn't load saved demo data: " + window.BeforeworkErrorUtils.getMessage(loadError));
      }else{
        setSyncStatus("Demo changes are saved in this browser only.");
      }
      renderAll();
      if (loadError){
        await showNotice("Couldn't load saved demo data","The sample workspace is open. Use Reset demo to replace the saved demo data with a fresh sample. " + window.BeforeworkErrorUtils.getMessage(loadError));
      }
      return;
    }
    const reconnected = await tryReconnectFile();
    try{ await window.BeforeworkStorage.refreshRecoverySnapshots(); }
    catch(err){ setSyncStatus("Recovery snapshots are unavailable in this browser: " + window.BeforeworkErrorUtils.getMessage(err)); }
    if (reconnected){
      restoreActiveLocation();
      if (state.folderLazy && ![OVERVIEW,CALENDAR,ROADMAP,INTEGRATIONS,SETTINGS,SUPPORT].includes(activeProjectId)){
        try{ await ensureProjectLoaded(activeProjectId); }
        catch(err){ activeProjectId=OVERVIEW; setSyncStatus("Couldn't restore the last project: " + window.BeforeworkErrorUtils.getMessage(err)); }
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
