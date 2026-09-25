/* ---------- Persistence ---------- */
  // LEGACY_LS_KEY is only read once, to offer moving old browser-only data
  // into a real file. It's never written to again - the connected file is
  // the single source of truth from here on.
  const LEGACY_LS_KEY = "personal_dashboard_state_v2";
  const FILTER_KEY = "personal_dashboard_filters_v1";
  const DB_NAME = "dashboard_meta", DB_STORE = "kv";
  let pendingReconnectHandle = null; // a previously-used handle waiting on a user gesture to re-grant permission
  let fileWriteQueue = Promise.resolve();

  function idbOpen(){
    return new Promise((resolve,reject)=>{
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
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

  function setSyncStatus(kind, text){
    const dot = document.getElementById("syncDot");
    dot.className = "dot" + (kind==="ok" ? " ok" : kind==="err" ? " err" : "");
    document.getElementById("syncLabel").textContent = text;
  }

  // The connected file is the only place data lives. If it isn't connected
  // yet (or the write fails), we deliberately do NOT fall back to writing a
  // copy into localStorage - that would create a second source of truth
  // that could silently drift from the file.
  function scheduleSave(){
    if (!fileHandle) return;
    const serialized = JSON.stringify(state);
    if (lastSavedState && lastSavedState !== serialized){
      undoStack.push(lastSavedState);
      if (undoStack.length > 30) undoStack.shift();
    }
    lastSavedState = serialized;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeToFile, 400);
    if (googleAccessToken && state && linkedGoogleCalendarIds().length && !googleSyncInFlight && !googleImportInFlight){
      clearTimeout(googleAutoSyncTimer);
      googleAutoSyncTimer = setTimeout(()=>syncGoogleCalendar(null), 1200);
    }
  }

  function writeToFile(){
    if (!fileHandle) return Promise.resolve();
    fileWriteQueue = fileWriteQueue.then(async()=>{
      const handle = fileHandle;
      if (!handle) return;
      try{
        const writable = await handle.createWritable();
        await writable.write(JSON.stringify(state, null, 2));
        await writable.close();
        setSyncStatus("ok", "Saved to " + handle.name);
      }catch(err){
        setSyncStatus("err", "Couldn't save to file (" + err.message + ") - your changes are still in memory, try reconnecting the file");
      }
    }).catch(()=>{});
    return fileWriteQueue;
  }

  async function loadFromHandle(handle){
    const file = await handle.getFile();
    const text = await file.text();
    return text.trim() ? migrateState(JSON.parse(text)) : defaultState();
  }

  // Called once at boot. Tries to silently resume the last-connected file
  // using the handle stashed in IndexedDB (the handle itself, not the
  // data - see idbGet/idbSet). If permission needs to be re-granted, that
  // requires a user gesture, so we just flag it for the connect gate.
  async function tryReconnectFile(){
    if (!("showOpenFilePicker" in window)) return false;
    try{
      const handle = await idbGet("fileHandle");
      if (!handle) return false;
      const perm = await handle.queryPermission({mode:"readwrite"});
      if (perm === "granted"){
        fileHandle = handle;
        state = await loadFromHandle(handle);
        lastSavedState = JSON.stringify(state);
        setSyncStatus("ok", "Saved to " + handle.name);
        return true;
      }
      pendingReconnectHandle = handle;
      return false;
    }catch(err){ return false; }
  }

  async function reconnectPendingFile(){
    if (!pendingReconnectHandle) return;
    try{
      const perm = await pendingReconnectHandle.requestPermission({mode:"readwrite"});
      if (perm !== "granted"){ showNotice("Permission needed", "Access to that file wasn't granted, so it couldn't be reconnected."); return; }
      fileHandle = pendingReconnectHandle;
      state = await loadFromHandle(fileHandle);
      lastSavedState = JSON.stringify(state);
      setSyncStatus("ok", "Saved to " + fileHandle.name);
      hideConnectGate();
      renderAll();
      await maybeShowMigrationNotice();
    }catch(err){ showNotice("Couldn't reconnect", err.message); }
  }

  async function createNewFile(){
    if (!("showSaveFilePicker" in window)) return;
    try{
      const opts = {types:[{description:"Beforework data", accept:{"application/json":[".json"]}}], suggestedName:"beforework-data.json"};
      const handle = await window.showSaveFilePicker(opts);
      const perm = await handle.requestPermission({mode:"readwrite"});
      if (perm !== "granted") return;
      fileHandle = handle;
      await idbSet("fileHandle", handle);
      state = defaultState();
      lastSavedState = null;
      await writeToFile();
      lastSavedState = JSON.stringify(state);
      hideConnectGate();
      renderAll();
    }catch(err){ /* user cancelled the picker */ }
  }

  async function openExistingFile(){
    if (!("showOpenFilePicker" in window)) return;
    try{
      const [handle] = await window.showOpenFilePicker({types:[{description:"Beforework data", accept:{"application/json":[".json"]}}]});
      const perm = await handle.requestPermission({mode:"readwrite"});
      if (perm !== "granted"){ showNotice("Permission needed", "Read-write access is required so changes can be saved back to this file."); return; }
      let loaded;
      try{ loaded = await loadFromHandle(handle); }
      catch(err){ showNotice("Couldn't read that file", "This doesn't look like an Beforework JSON file: " + err.message); return; }
      fileHandle = handle;
      await idbSet("fileHandle", handle);
      state = loaded;
      lastSavedState = JSON.stringify(state);
      hideConnectGate();
      renderAll();
      await maybeShowMigrationNotice();
    }catch(err){ /* user cancelled the picker */ }
  }

  async function switchFile(){
    if (!await showConfirm("Open a different file", "This switches the whole workspace to another file. Your current file keeps whatever was last saved to it.")) return;
    await openExistingFile();
  }
  async function startNewFileFromMenu(){
    if (!await showConfirm("Create a new file", "This starts a brand-new, empty workspace in a new file. Your current file is left untouched.")) return;
    await createNewFile();
  }

  // One-time offer to move data that was saved under the old browser-only
  // storage model (before this version) into a real file, so nobody loses
  // their board when upgrading.
  async function migrateLegacyBrowserData(){
    if (!("showSaveFilePicker" in window)) return;
    const raw = localStorage.getItem(LEGACY_LS_KEY);
    if (!raw) return;
    let parsed;
    try{ parsed = migrateState(JSON.parse(raw)); }
    catch(err){ showNotice("Couldn't read old data", "The data previously saved in this browser looks corrupted: " + err.message); return; }
    try{
      const opts = {types:[{description:"Beforework data", accept:{"application/json":[".json"]}}], suggestedName:"beforework-data.json"};
      const handle = await window.showSaveFilePicker(opts);
      const perm = await handle.requestPermission({mode:"readwrite"});
      if (perm !== "granted") return;
      fileHandle = handle;
      await idbSet("fileHandle", handle);
      state = parsed;
      lastSavedState = null;
      await writeToFile();
      lastSavedState = JSON.stringify(state);
      localStorage.removeItem(LEGACY_LS_KEY);
      hideConnectGate();
      renderAll();
      await maybeShowMigrationNotice();
    }catch(err){ /* user cancelled the picker */ }
  }

  