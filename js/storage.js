/* ---------- Persistence ---------- */
  // LEGACY_LS_KEY is only read once, to offer moving old browser-only data
  // into a real file. It's never written to again - the connected file is
  // the single source of truth from here on.
  const LEGACY_LS_KEY = "personal_dashboard_state_v2";
  const FILTER_KEY = "personal_dashboard_filters_v1";
  const DB_NAME = "dashboard_meta", DB_STORE = "kv", BACKUP_STORE = "recovery";
  const MAX_RECOVERY_SNAPSHOTS = 8;
  const MAX_RECOVERY_BYTES = 64 * 1024 * 1024;
  const AUTO_BACKUP_INTERVAL_MS = 30 * 60 * 1000;
  let pendingReconnectHandle = null; // a previously-used handle waiting on a user gesture to re-grant permission
  let fileWriteQueue = Promise.resolve();
  let syncStatusText = "No workspace file connected.";
  let latestRecoverySnapshot = null;
  let availableRecoverySnapshots = [];
  let lastAutomaticBackupAt = 0;
  let recoverySnapshotsLoaded = false;
  let fileRevision = null;
  let lastWrittenState = null;

  function getSyncStatusText(){ return syncStatusText; }
  window.BeforeworkStorage=Object.freeze({
    refreshRecoverySnapshots,
    getLatestRecoverySnapshot,
    getRecoverySnapshots,
    saveRecoverySnapshot
  });

  function idbOpen(){
    return new Promise((resolve,reject)=>{
      const req = indexedDB.open(DB_NAME, 2);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE);
        if (!req.result.objectStoreNames.contains(BACKUP_STORE)) req.result.createObjectStore(BACKUP_STORE,{keyPath:"id"});
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbGet(key){
    const db = await idbOpen();
    return new Promise((resolve,reject)=>{
      const tx = db.transaction(DB_STORE,"readonly");
      const r = tx.objectStore(DB_STORE).get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function idbSet(key,val){
    const db = await idbOpen();
    return new Promise((resolve,reject)=>{
      const tx = db.transaction(DB_STORE,"readwrite");
      tx.objectStore(DB_STORE).put(val,key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function readRecoverySnapshots(){
    const db = await idbOpen();
    return new Promise((resolve,reject)=>{
      const tx = db.transaction(BACKUP_STORE,"readonly");
      const request = tx.objectStore(BACKUP_STORE).getAll();
      request.onsuccess = () => resolve(request.result||[]);
      request.onerror = () => reject(request.error);
    });
  }

  async function refreshRecoverySnapshots(){
    const snapshots = (await readRecoverySnapshots()).sort((a,b)=>b.savedAt-a.savedAt);
    const fileSnapshots=fileHandle
      ? (await Promise.all(snapshots.map(async snapshot=>({snapshot,matches:await snapshotMatchesFile(snapshot,fileHandle)}))))
        .filter(entry=>entry.matches).map(entry=>entry.snapshot)
      : [];
    latestRecoverySnapshot = fileSnapshots[0]||null;
    availableRecoverySnapshots=fileSnapshots;
    lastAutomaticBackupAt = fileSnapshots[0]?.savedAt||0;
    recoverySnapshotsLoaded = true;
    return latestRecoverySnapshot;
  }

  function getLatestRecoverySnapshot(){ return latestRecoverySnapshot; }
  function getRecoverySnapshots(){ return availableRecoverySnapshots.slice(); }

  async function snapshotMatchesFile(snapshot,handle){
    if (!handle) return false;
    if (snapshot.fileHandle && typeof handle.isSameEntry==="function"){
      try{ return await handle.isSameEntry(snapshot.fileHandle); }catch(err){/* Fall back to the filename. */}
    }
    return snapshot.fileName===handle.name;
  }

  async function saveRecoverySnapshot(data,reason,fileName=fileHandle?.name||"",sourceHandle=fileHandle){
    const serialized = typeof data==="string" ? data : JSON.stringify(data);
    if (!serialized) throw new Error("There is no data to back up.");
    const byteLength=new TextEncoder().encode(serialized).byteLength;
    if (byteLength>MAX_RECOVERY_BYTES) throw new Error("This workspace is larger than the 64 MB recovery snapshot limit.");
    const snapshot = {
      id:`${Date.now()}-${Math.random().toString(36).slice(2)}`,
      savedAt:Date.now(),
      reason,
      fileName,
      fileHandle:sourceHandle||null,
      byteLength,
      data:serialized
    };
    const db = await idbOpen();
    await new Promise((resolve,reject)=>{
      const tx = db.transaction(BACKUP_STORE,"readwrite");
      const store = tx.objectStore(BACKUP_STORE);
      store.put(snapshot);
      const request = store.getAll();
      request.onsuccess = ()=>{
        let retainedCount=0;
        let retainedBytes=0;
        request.result.sort((a,b)=>b.savedAt-a.savedAt).forEach(entry=>{
          const size=entry.byteLength||new TextEncoder().encode(entry.data||"").byteLength;
          if (retainedCount>=MAX_RECOVERY_SNAPSHOTS || retainedBytes+size>MAX_RECOVERY_BYTES){
            store.delete(entry.id);
            return;
          }
          retainedCount++;
          retainedBytes+=size;
        });
      };
      tx.oncomplete = ()=>resolve();
      tx.onerror = ()=>reject(tx.error);
      tx.onabort = ()=>reject(tx.error||new Error("Recovery snapshot could not be saved."));
    });
    if (await snapshotMatchesFile(snapshot,fileHandle)){
      availableRecoverySnapshots=[snapshot,...availableRecoverySnapshots.filter(entry=>entry.id!==snapshot.id)]
        .sort((a,b)=>b.savedAt-a.savedAt).slice(0,MAX_RECOVERY_SNAPSHOTS);
      latestRecoverySnapshot=availableRecoverySnapshots[0]||null;
    }
    recoverySnapshotsLoaded=true;
    if (await snapshotMatchesFile(snapshot,fileHandle)) lastAutomaticBackupAt=snapshot.savedAt;
    if (fileHandle) await refreshRecoverySnapshots();
    return snapshot;
  }

  async function maybeCreateAutomaticBackup(fileText,fileName){
    if (!fileText.trim()) return null;
    if (!recoverySnapshotsLoaded) await refreshRecoverySnapshots();
    if (Date.now()-lastAutomaticBackupAt<AUTO_BACKUP_INTERVAL_MS) return null;
    return saveRecoverySnapshot(fileText,"automatic",fileName);
  }

  function workspaceContentRevision(text){
    if (!text.trim()) return "";
    const parsed = JSON.parse(text);
    const result = window.BeforeworkWorkspaceValidation.validate(parsed,SCHEMA_VERSION);
    if (!result.valid) throw new Error(result.errors.join(" "));
    return JSON.stringify(parsed);
  }

  function setSyncStatus(text){
    syncStatusText = text;
    const globalStatus=document.getElementById("globalSaveStatus");
    if (globalStatus){
      globalStatus.textContent=text;
      globalStatus.title=text;
      globalStatus.classList.toggle("is-saving",/^Saving/.test(text));
      globalStatus.classList.toggle("is-error",/couldn't|conflict|unavailable|reconnect|unsaved/i.test(text));
    }
    const settingsStatus = document.getElementById("settingsStorageStatus");
    if (settingsStatus) settingsStatus.textContent = text;
    const recoveryStatus = document.getElementById("settingsRecoveryStatus");
    if (recoveryStatus && latestRecoverySnapshot){
      const when=new Date(latestRecoverySnapshot.savedAt).toLocaleString();
      recoveryStatus.textContent=`Latest snapshot: ${when} (${latestRecoverySnapshot.reason.replaceAll("-"," ")}). Stored in this browser.`;
    }
    const gateStatus = document.getElementById("gateRecoveryStatus");
    if (gateStatus) gateStatus.textContent = text;
  }

  // The connected file is the only place data lives. If it isn't connected
  // yet (or the write fails), we deliberately do NOT fall back to writing a
  // copy into localStorage - that would create a second source of truth
  // that could silently drift from the file.
  function scheduleSave(){
    if (!fileHandle) return;
    setSyncStatus("Saving changes to " + fileHandle.name + "...");
    const serialized = JSON.stringify(state);
    if (lastSavedState && lastSavedState !== serialized){
      undoStack.push(lastSavedState);
      if (undoStack.length > 30) undoStack.shift();
    }
    lastSavedState = serialized;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeToFile, 400);
    if (googleAccessToken && state && linkedGoogleCalendarIds().length && !googleSyncApplying){
      if (googleSyncInFlight || googleImportInFlight){
        googleSyncQueued = true;
      } else {
        clearTimeout(googleAutoSyncTimer);
        googleAutoSyncTimer = setTimeout(()=>syncGoogleCalendar(null), 1200);
      }
    }
  }

  function writeToFile(){
    if (!fileHandle) return Promise.resolve();
    fileWriteQueue = fileWriteQueue.then(async()=>{
      const handle = fileHandle;
      if (!handle) return;
      try{
        const currentFile = await handle.getFile();
        const currentText = await currentFile.text();
        let diskRevision = null;
        try{ diskRevision = workspaceContentRevision(currentText); }catch(err){/* An invalid external edit is still a conflict. */}
        if (fileRevision!==null && diskRevision!==fileRevision){
          const choice = typeof chooseWorkspaceConflict==="function"
            ? await chooseWorkspaceConflict(handle.name,diskRevision!==null)
            : null;
          if (choice==="reload"){
            await saveRecoverySnapshot(JSON.stringify(state),"conflict-local");
            state = await loadFromHandle(handle);
            lastSavedState = JSON.stringify(state);
            lastWrittenState = JSON.stringify(state);
            undoStack.length = 0;
            setSyncStatus("Loaded the newer version from " + handle.name + ". Your previous tab state is available in recovery snapshots.");
            renderAll();
            return;
          }
          if (choice!=="overwrite"){
            setSyncStatus("Conflict not resolved. Your changes remain in this tab; nothing was overwritten.");
            return;
          }
          await saveRecoverySnapshot(JSON.stringify(state),"conflict-local");
          if (currentText.trim()) await saveRecoverySnapshot(currentText,"conflict-external",handle.name);
          fileRevision=diskRevision;
        }
        let recoveryPoint=null;
        let recoveryError=null;
        try{ recoveryPoint=await maybeCreateAutomaticBackup(currentText,handle.name); }
        catch(err){ recoveryError=err; }
        const writable = await handle.createWritable();
        const canonicalState = JSON.stringify(state);
        const serializedState = JSON.stringify(state, null, 2);
        await writable.write(serializedState);
        await writable.close();
        fileRevision=canonicalState;
        lastWrittenState=canonicalState;
        setSyncStatus("Saved to " + handle.name + " at " + new Date().toLocaleTimeString() + (recoveryPoint ? ". Recovery snapshot saved." : recoveryError ? ". Recovery snapshot unavailable: " + recoveryError.message : "."));
      }catch(err){
        let recoveryMessage="";
        try{
          await saveRecoverySnapshot(JSON.stringify(state),"write-failed");
          recoveryMessage=" A recovery snapshot was saved in this browser.";
        }catch(snapshotError){
          recoveryMessage=" A recovery snapshot could not be saved: " + snapshotError.message;
        }
        setSyncStatus("Couldn't save to file (" + err.message + ") - changes remain in this tab." + recoveryMessage + " Retry the save or export the recovery snapshot.");
      }
    }).catch(()=>{});
    return fileWriteQueue;
  }

  async function flushSave(){
    if (!fileHandle) return false;
    clearTimeout(saveTimer);
    saveTimer = null;
    await writeToFile();
    return lastWrittenState===JSON.stringify(state);
  }

  async function loadFromHandle(handle){
    const file = await handle.getFile();
    const text = await file.text();
    if (!text.trim()){
      fileRevision="";
      return defaultState();
    }
    const parsed = JSON.parse(text);
    const result = window.BeforeworkWorkspaceValidation.validate(parsed,SCHEMA_VERSION);
    if (!result.valid) throw new Error(result.errors.join(" "));
    fileRevision=JSON.stringify(parsed);
    return migrateState(parsed);
  }

  // Called once at boot. Tries to silently resume the last-connected file
  // using the handle stashed in IndexedDB (the handle itself, not the
  // data - see idbGet/idbSet). If permission needs to be re-granted, that
  // requires a user gesture, so we just flag it for the connect gate.
  async function tryReconnectFile(){
    if (!("showOpenFilePicker" in window)) return false;
    let handle=null;
    try{
      handle = await idbGet("fileHandle");
      if (!handle) return false;
      const perm = await handle.queryPermission({mode:"readwrite"});
      if (perm === "granted"){
        const loaded = await loadFromHandle(handle);
        fileHandle = handle;
        state = loaded;
        lastSavedState = JSON.stringify(state);
        lastWrittenState = JSON.stringify(state);
        setSyncStatus("Saved to " + handle.name);
        return true;
      }
      pendingReconnectHandle = handle;
      setSyncStatus("Reconnect to " + handle.name + " to resume saving.");
      return false;
    }catch(err){
      fileHandle=null;
      if (handle) pendingReconnectHandle=handle;
      setSyncStatus("Couldn't reconnect to " + (handle?.name||"the previous workspace") + ": " + err.message);
      return false;
    }
  }

  async function reconnectPendingFile(){
    if (!pendingReconnectHandle) return;
    try{
      const perm = await pendingReconnectHandle.requestPermission({mode:"readwrite"});
      if (perm !== "granted"){ showNotice("Permission needed", "Access to that file wasn't granted, so it couldn't be reconnected."); return; }
      const handle=pendingReconnectHandle;
      const loaded=await loadFromHandle(handle);
      fileHandle=handle;
      state=loaded;
      lastSavedState = JSON.stringify(state);
      lastWrittenState = JSON.stringify(state);
      setSyncStatus("Saved to " + fileHandle.name);
      await refreshRecoverySnapshots().catch(err=>setSyncStatus("Recovery snapshots are unavailable: " + err.message));
      hideConnectGate();
      renderAll();
      await maybeShowMigrationNotice();
      resumeGoogleCalendarSync();
    }catch(err){
      setSyncStatus("Couldn't reconnect to " + pendingReconnectHandle.name + ": " + err.message);
      showNotice("Couldn't reconnect", err.message);
    }
  }

  async function createNewFile(){
    if (!("showSaveFilePicker" in window)) return;
    try{
      const opts = {types:[{description:"Beforework data", accept:{"application/json":[".json"]}}], suggestedName:"beforework-data.json"};
      const handle = await window.showSaveFilePicker(opts);
      const perm = await handle.requestPermission({mode:"readwrite"});
      if (perm !== "granted") return;
      const currentFile=await handle.getFile();
      const existingText=await currentFile.text();
      const targetRevision=workspaceContentRevision(existingText);
      if (existingText.trim()) await saveRecoverySnapshot(existingText,"pre-create",handle.name,handle);
      await idbSet("fileHandle", handle);
      fileHandle = handle;
      fileRevision=targetRevision;
      lastWrittenState=null;
      await refreshRecoverySnapshots().catch(err=>setSyncStatus("Recovery snapshots are unavailable: " + err.message));
      state = defaultState();
      lastSavedState = null;
      await writeToFile();
      lastSavedState = JSON.stringify(state);
      await refreshRecoverySnapshots().catch(err=>setSyncStatus("Recovery snapshots are unavailable: " + err.message));
      hideConnectGate();
      renderAll();
    }catch(err){
      if (err.name!=="AbortError"){
        setSyncStatus("Couldn't create workspace: " + err.message);
        showNotice("Couldn't create workspace",err.message);
      }
    }
  }

  async function openExistingFile(){
    if (!("showOpenFilePicker" in window)) return;
    try{
      const [handle] = await window.showOpenFilePicker({types:[{description:"Beforework data", accept:{"application/json":[".json"]}}]});
      const perm = await handle.requestPermission({mode:"readwrite"});
      if (perm !== "granted"){ showNotice("Permission needed", "Read-write access is required so changes can be saved back to this file."); return; }
      const previousRevision=fileRevision;
      let loaded;
      try{ loaded = await loadFromHandle(handle); }
      catch(err){
        fileRevision=previousRevision;
        setSyncStatus("Couldn't validate " + handle.name + ": " + err.message);
        showNotice("Couldn't read that file", "This doesn't look like an Beforework JSON file: " + err.message);
        return;
      }
      try{ await idbSet("fileHandle", handle); }
      catch(err){ fileRevision=previousRevision; throw err; }
      fileHandle = handle;
      state = loaded;
      lastSavedState = JSON.stringify(state);
      lastWrittenState = JSON.stringify(state);
      await refreshRecoverySnapshots().catch(err=>setSyncStatus("Recovery snapshots are unavailable: " + err.message));
      hideConnectGate();
      renderAll();
      await maybeShowMigrationNotice();
      resumeGoogleCalendarSync();
    }catch(err){
      if (err.name!=="AbortError"){
        setSyncStatus("Couldn't open workspace: " + err.message);
        showNotice("Couldn't open workspace",err.message);
      }
    }
  }

  async function switchFile(){
    if (!await showConfirm("Open a different file", "This switches the whole workspace to another file. Your current file keeps whatever was last saved to it.")) return;
    if (!await flushBeforeLeavingFile()) return;
    await openExistingFile();
  }
  async function startNewFileFromMenu(){
    if (!await showConfirm("Create a new file", "This starts a brand-new, empty workspace in a new file. Your current file is left untouched.")) return;
    if (!await flushBeforeLeavingFile()) return;
    await createNewFile();
  }

  async function flushBeforeLeavingFile(){
    if (await flushSave()) return true;
    try{
      const currentState=JSON.stringify(state);
      if (getLatestRecoverySnapshot()?.data!==currentState) await saveRecoverySnapshot(currentState,"unsaved-before-switch");
    }
    catch(err){ await showNotice("Couldn't protect unsaved changes",err.message); return false; }
    return showConfirm("Changes are not saved to the file", "A recovery snapshot of this tab's current workspace was saved in this browser. Continue switching files?");
  }

  // One-time offer to move data that was saved under the old browser-only
  // storage model (before this version) into a real file, so nobody loses
  // their board when upgrading.
  async function migrateLegacyBrowserData(){
    if (!("showSaveFilePicker" in window)) return;
    const raw = localStorage.getItem(LEGACY_LS_KEY);
    if (!raw) return;
    let parsed;
    try{
      const legacyData=JSON.parse(raw);
      const validation=window.BeforeworkWorkspaceValidation.validate(legacyData,SCHEMA_VERSION);
      if (!validation.valid) throw new Error(validation.errors.join(" "));
      parsed = migrateState(legacyData);
    }
    catch(err){ showNotice("Couldn't read old data", "The data previously saved in this browser looks corrupted: " + err.message); return; }
    try{
      const opts = {types:[{description:"Beforework data", accept:{"application/json":[".json"]}}], suggestedName:"beforework-data.json"};
      const handle = await window.showSaveFilePicker(opts);
      const perm = await handle.requestPermission({mode:"readwrite"});
      if (perm !== "granted") return;
      const currentText=await (await handle.getFile()).text();
      const targetRevision=workspaceContentRevision(currentText);
      if (currentText.trim()) await saveRecoverySnapshot(currentText,"pre-legacy-migration",handle.name,handle);
      await idbSet("fileHandle", handle);
      fileHandle = handle;
      fileRevision=targetRevision;
      lastWrittenState=null;
      await refreshRecoverySnapshots().catch(err=>setSyncStatus("Recovery snapshots are unavailable: " + err.message));
      state = parsed;
      lastSavedState = null;
      await writeToFile();
      lastSavedState = JSON.stringify(state);
      localStorage.removeItem(LEGACY_LS_KEY);
      hideConnectGate();
      renderAll();
      await maybeShowMigrationNotice();
    }catch(err){
      if (err.name!=="AbortError"){
        setSyncStatus("Couldn't migrate browser data: " + err.message);
        showNotice("Couldn't migrate browser data",err.message);
      }
    }
  }

  