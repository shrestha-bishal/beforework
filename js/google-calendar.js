/* Google Calendar integration */
  let googleSyncFeedbackMessage = "";
  let googleSyncProgress = null;
  let googleResumeRetryCount = 0;
  let googleResumeRetryTimer = null;
  function googleCalendarUrl(entry){
    const title = entry.item.title;
    const details = [entry.item.description, entry.project ? `Project: ${entry.project.name}` : "Beforework Calendar", entry.group ? `Group: ${entry.group.name}` : ""].filter(Boolean).join("\n");
    const dates = entry.item.startTime && entry.item.endTime
      ? `${calendarDateCode(entry.date)}T${entry.item.startTime.replace(":","")}00/${calendarDateCode(entry.endDate)}T${entry.item.endTime.replace(":","")}00`
      : `${calendarDateCode(entry.date)}/${calendarDateCode(entry.endDate,1)}`;
    const params = new URLSearchParams({action:"TEMPLATE",text:title,dates,details,location:entry.item.location||""});
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }
  function initGoogleCalendarAuth(){
    if (!window.google?.accounts?.oauth2) return false;
    clearTimeout(googleResumeRetryTimer);
    googleResumeRetryCount = 0;
    googleTokenClient = google.accounts.oauth2.initTokenClient({
      client_id:GOOGLE_CLIENT_ID,
      scope:GOOGLE_CALENDAR_SCOPE,
      callback:response=>{
        if (response.error){
          handleGoogleAuthFailure();
          if (googleTokenPurpose==="sync" && !googleSilentAuth) showNotice("Google Calendar", "Google authentication was not completed.");
          googleSilentAuth = false;
          return;
        }
        const resumedSilently = googleSilentAuth;
        googleSilentAuth = false;
        googleAccessToken = response.access_token;
        clearTimeout(googleTokenRefreshTimer);
        const expiresInMs = (Number(response.expires_in)||3300) * 1000;
        const refreshDelay = Math.max(30000, expiresInMs - 5*60*1000); // refresh 5 min before it expires
        googleTokenRefreshTimer = setTimeout(()=>{
          if (!linkedGoogleCalendarIds().length || !googleTokenClient) return;
          googleSilentAuth = true;
          googleTokenPurpose = "sync";
          googleSyncScopeProject = null;
          try{ googleTokenClient.requestAccessToken({prompt:"none"}); }
          catch(err){ googleSilentAuth = false; }
        }, refreshDelay);
        updateGoogleCalendarButtons();
        if (resumedSilently) renderMain();
        if (googleTokenPurpose==="sync") syncGoogleCalendar(googleSyncScopeProject).then(startGoogleCalendarPolling);
        if (googleTokenPurpose==="manage") { openGoogleCalendarManager(); startGoogleCalendarPolling(); }
      }
    });
    return true;
  }
  function updateGoogleCalendarButtons(){
    document.querySelectorAll('[data-calendar-action="google"]').forEach(button=>{
      button.textContent = googleSyncInFlight ? "Syncing..." : "Sync now";
      button.disabled = googleSyncInFlight;
    });
    document.querySelectorAll("[data-integration-sync]").forEach(button=>{
      button.textContent = googleSyncInFlight ? "Syncing..." : "Sync now";
      button.disabled = googleSyncInFlight;
    });
    updateGoogleCalendarStatus();
  }
  function updateGoogleCalendarStatus(text, progress){
    if (text!==undefined) googleSyncFeedbackMessage = text;
    if (progress!==undefined) googleSyncProgress = progress;
    const readyStatus = googleAccessToken ? (linkedGoogleCalendarIds().length ? "Ready to sync" : "No calendars linked") : "Connect Google Calendar in Integrations";
    const status = googleSyncFeedbackMessage || readyStatus;
    document.querySelectorAll("[data-calendar-sync-status], [data-google-sync-status]").forEach(element=>{ element.textContent = status; });
    document.querySelectorAll("[data-google-sync-feedback]").forEach(element=>{ element.hidden = !googleSyncFeedbackMessage; });
    document.querySelectorAll("[data-google-sync-progress]").forEach(element=>{
      element.hidden = !googleSyncProgress;
      if (googleSyncProgress){
        element.max = googleSyncProgress.total;
        element.value = googleSyncProgress.completed;
      }
    });
  }
  function handleGoogleAuthFailure(){
    googleAccessToken = null;
    clearTimeout(googleAutoSyncTimer);
    clearTimeout(googleTokenRefreshTimer);
    if (googlePollTimer){ clearInterval(googlePollTimer); googlePollTimer = null; }
    updateGoogleCalendarButtons();
    updateGoogleCalendarStatus("Google connection expired - reconnect in Integrations");
    setSyncStatus("err", "Google Calendar needs reconnecting");
    if (activeProjectId===INTEGRATIONS || activeProjectId===CALENDAR) renderMain();
  }
  async function googleCalendarRequest(path, options={}){
    const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
      ...options,
      headers:{"Content-Type":"application/json",Authorization:`Bearer ${googleAccessToken}`,...(options.headers||{})}
    });
    if (!response.ok){
      const detail = await response.text();
      const error = new Error(`Google Calendar request failed (${response.status})`);
      error.status = response.status;
      error.detail = detail;
      throw error;
    }
    return response.status===204 ? null : response.json();
  }
  function linkedGoogleCalendarIds(){
    if (!Array.isArray(state.googleCalendarLinks)) state.googleCalendarLinks = [];
    return state.googleCalendarLinks;
  }
  function saveGoogleState(){
    googleSyncApplying = true;
    try{ scheduleSave(); }finally{ googleSyncApplying = false; }
  }
  let googleDeleteInFlight = false;
  function queueGoogleEventDeletes(item){
    if (!item?.googleEventIds) return;
    if (!Array.isArray(state.googleDeletedEventIds)) state.googleDeletedEventIds = [];
    Object.entries(item.googleEventIds).forEach(([key,eventId])=>{
      const parts = key.split(":");
      const calendarId = parts.length>=3 ? parts[0] : "primary";
      if (!state.googleDeletedEventIds.some(entry=>entry.calendarId===calendarId && entry.eventId===eventId)){
        state.googleDeletedEventIds.push({calendarId,eventId});
      }
    });
    if (googleAccessToken) processGoogleDeletions();
  }
  async function processGoogleDeletions(){
    if (!googleAccessToken || googleDeleteInFlight || !state.googleDeletedEventIds?.length) return;
    googleDeleteInFlight = true;
    try{
      const remaining = [];
      for (const deletion of state.googleDeletedEventIds){
        try{
          await googleCalendarRequest(`/calendars/${encodeURIComponent(deletion.calendarId)}/events/${encodeURIComponent(deletion.eventId)}`, {method:"DELETE"});
        }catch(error){
          if (error.status===404) continue;
          if (error.status===401){ handleGoogleAuthFailure(); remaining.push(deletion); break; }
          remaining.push(deletion);
        }
      }
      state.googleDeletedEventIds = remaining;
      saveGoogleState();
    }finally{
      googleDeleteInFlight = false;
    }
  }
  async function googleCalendarList(){
    const calendars = [];
    let pageToken = "";
    do{
      const query = new URLSearchParams({minAccessRole:"writer",maxResults:"250"});
      if (pageToken) query.set("pageToken", pageToken);
      const result = await googleCalendarRequest(`/users/me/calendarList?${query.toString()}`);
      calendars.push(...(result.items||[]));
      pageToken = result.nextPageToken || "";
    }while(pageToken);
    return calendars;
  }
  async function openGoogleCalendarManager(){
    try{
      const calendars = await googleCalendarList();
      state.googleCalendarCatalog = calendars.map(calendar=>({id:calendar.id, summary:calendar.summary||calendar.id, primary:!!calendar.primary}));
      const linked = new Set(linkedGoogleCalendarIds());
      const overlay = document.createElement("div");
      overlay.className = "overlay";
      overlay.id = "googleCalendarOverlay";
      overlay.innerHTML = `<div class="Overlay Overlay--size-medium position-relative" data-modal role="dialog" aria-modal="true">
        <button class="btn btn-invisible closeX" data-google-cancel aria-label="Close">✕</button>
        <h3>Link Google calendars</h3>
        <p class="dialogMessage">Choose one or more calendars for Beforework to sync. Unlinking stops future syncs but does not delete Google events.</p>
        <div class="googleCalendarChoices">${calendars.length ? calendars.map(calendar=>`
          <label class="googleCalendarChoice"><input type="checkbox" value="${escapeHtml(calendar.id)}" ${linked.has(calendar.id)?"checked":""}>
            <span><strong>${escapeHtml(calendar.summary||calendar.id)}</strong>${calendar.primary?" <span class=\"color-fg-muted\">(primary)</span>":""}</span>
          </label>`).join("") : `<div class="commentEmpty">No writable Google calendars found.</div>`}</div>
        <div class="modalFooter"><button class="btn btn-invisible" data-google-cancel>Cancel</button><button class="btn btn-primary btn-sm" data-google-save>Save links</button></div>
      </div>`;
      document.body.appendChild(overlay);
      const finish = async save => {
        let shouldSync = false;
        if (save){
          state.googleCalendarLinks = [...overlay.querySelectorAll("input[type=checkbox]:checked")].map(input=>input.value);
          shouldSync = state.googleCalendarLinks.length > 0;
          scheduleSave();
          await flushSave();
          renderMain();
        }
        overlay.remove();
        if (shouldSync) syncGoogleCalendar(null);
      };
      overlay.querySelectorAll("[data-google-cancel]").forEach(button=>button.onclick=()=>finish(false));
      overlay.querySelector("[data-google-save]").onclick = () => finish(true);
      overlay.addEventListener("click", event=>{ if (event.target===overlay) finish(false); });
    }catch(error){
      let detail = "Could not load your writable calendars.";
      try{
        const payload = JSON.parse(error.detail || "{}");
        detail = payload.error?.message || payload.error?.errors?.[0]?.reason || detail;
      }catch(parseError){ /* keep the generic message when Google returns non-JSON text */ }
      await showNotice("Google Calendar", `${detail} Connect Google Calendar again and approve calendar access.`);
    }
  }
  function googleEventBody(entry){
    const details = [entry.item.description, entry.project ? `Project: ${entry.project.name}` : "Beforework Calendar", entry.group ? `Group: ${entry.group.name}` : ""].filter(Boolean).join("\n");
    if (entry.item.startTime && entry.item.endTime){
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return {summary:entry.item.title||"Untitled item", description:details, location:entry.item.location||"",
        start:{dateTime:`${entry.date}T${entry.item.startTime}:00`,timeZone},
        end:{dateTime:`${entry.endDate}T${entry.item.endTime}:00`,timeZone}};
    }
    const nextDate = calendarDateCode(entry.endDate,1);
    const endDate = `${nextDate.slice(0,4)}-${nextDate.slice(4,6)}-${nextDate.slice(6)}`;
    return {summary:entry.item.title||"Untitled item", description:details, location:entry.item.location||"",
      start:{date:entry.date}, end:{date:endDate}};
  }
  function googleEventDate(event, key){
    const value = event[key]?.date || event[key]?.dateTime || "";
    return value.slice(0,10);
  }
  function googleEventTime(event, key){
    const value = event[key]?.dateTime || "";
    return value.slice(11,16);
  }
  function applyGoogleEventToItem(entry, event){
    const startDate = googleEventDate(event, "start");
    const eventEnd = googleEventDate(event, "end");
    let endDate = eventEnd;
    if (event.end?.date && eventEnd){
      const exclusiveEnd = new Date(`${eventEnd}T00:00:00`);
      exclusiveEnd.setDate(exclusiveEnd.getDate()-1);
      endDate = calendarDateKey(exclusiveEnd);
    }
    if (event.summary) entry.item.title = event.summary;
    entry.item.description = String(event.description||"").split("\n")
      .filter(line=>!line.startsWith("Project: ") && !line.startsWith("Group: ")).join("\n").trim();
    entry.item.location = event.location || "";
    entry.item.startTime = googleEventTime(event, "start");
    entry.item.endTime = googleEventTime(event, "end");
    if (entry.field.id === "__schedule__" || entry.field.id === "__standalone__") entry.item.endDate = endDate || startDate;
    else entry.item.values[entry.field.id] = startDate;
    entry.item.endDate = endDate || startDate;
    entry.item.updatedAt = Date.now();
  }
  function findLinkedGoogleEntry(calendarId, eventId){
    return calendarEntries(null).find(entry=>{
      const ownerId = entry.project ? entry.project.id : "__calendar__";
      const key = `${calendarId}:${ownerId}:${entry.field.id}`;
      const legacyKey = `${ownerId}:${entry.field.id}`;
      return entry.item.googleEventIds?.[key]===eventId || (calendarId==="primary" && entry.item.googleEventIds?.[legacyKey]===eventId);
    });
  }
  async function googleCalendarEvents(calendarId, syncToken=state.googleCalendarSyncTokens?.[calendarId]){
    const events = [];
    let pageToken = "";
    let nextSyncToken = "";
    do{
      const query = new URLSearchParams({singleEvents:"true",showDeleted:"true",maxResults:"2500"});
      if (syncToken) query.set("syncToken", syncToken);
      if (pageToken) query.set("pageToken", pageToken);
      const result = await googleCalendarRequest(`/calendars/${encodeURIComponent(calendarId)}/events?${query.toString()}`);
      events.push(...(result.items||[]));
      pageToken = result.nextPageToken || "";
      if (!pageToken) nextSyncToken = result.nextSyncToken || "";
    }while(pageToken);
    return {events,nextSyncToken};
  }
  async function importGoogleCalendarEvents(){
    if (!googleAccessToken || googleImportInFlight || googleSyncInFlight) return;
    const calendarIds = linkedGoogleCalendarIds();
    if (!calendarIds.length) return;
    googleImportInFlight = true;
    let importedCount = 0;
    let tokenChanged = false;
    const nextTokens = {...(state.googleCalendarSyncTokens||{})};
    try{
      updateGoogleCalendarStatus("Checking linked Google calendars...", null);
      for (const [calendarIndex,calendarId] of calendarIds.entries()){
        const calendar = (state.googleCalendarCatalog||[]).find(item=>item.id===calendarId);
        const calendarName = calendar?.summary || (calendarId==="primary" ? "Primary calendar" : calendarId);
        updateGoogleCalendarStatus(`Checking ${calendarName} (${calendarIndex+1} of ${calendarIds.length})...`, null);
        let result;
        try{
          result = await googleCalendarEvents(calendarId, nextTokens[calendarId]||"");
        }catch(error){
          if (error.status!==410 || !nextTokens[calendarId]) throw error;
          delete nextTokens[calendarId];
          tokenChanged = true;
          updateGoogleCalendarStatus(`Refreshing ${calendarName} after its sync cursor expired...`, null);
          result = await googleCalendarEvents(calendarId, "");
        }
        for (const event of result.events){
          if (!event.id) continue;
          const entry = findLinkedGoogleEntry(calendarId, event.id);
          if (event.status==="cancelled"){
            if (entry){
              const ownerId = entry.project ? entry.project.id : "__calendar__";
              const key = `${calendarId}:${ownerId}:${entry.field.id}`;
              if (!entry.project){
                state.calendarItems = state.calendarItems.filter(item=>item.id!==entry.item.id);
              } else {
                entry.item.googleEventIds = entry.item.googleEventIds || {};
                entry.item.googleSyncMeta = entry.item.googleSyncMeta || {};
                delete entry.item.googleEventIds[key];
                entry.item.googleSyncMeta[key] = {remoteDeletedAt:Date.now(), localUpdatedAt:entry.item.updatedAt};
              }
              importedCount++;
            }
            continue;
          }
          if (entry){
            const ownerId = entry.project ? entry.project.id : "__calendar__";
            const key = `${calendarId}:${ownerId}:${entry.field.id}`;
            const previous = entry.item.googleSyncMeta?.[key];
            if (!previous || Date.parse(event.updated||"") > Date.parse(previous.googleUpdatedAt||"")){
              applyGoogleEventToItem(entry, event);
              entry.item.googleSyncMeta = entry.item.googleSyncMeta || {};
              entry.item.googleSyncMeta[key] = {googleUpdatedAt:event.updated||new Date().toISOString(), localUpdatedAt:entry.item.updatedAt};
              importedCount++;
            }
            continue;
          }
          const startDate = googleEventDate(event, "start");
          if (!startDate) continue;
          const eventEnd = googleEventDate(event, "end");
          let endDate = eventEnd || startDate;
          if (event.end?.date && eventEnd){
            const exclusiveEnd = new Date(`${eventEnd}T00:00:00`);
            exclusiveEnd.setDate(exclusiveEnd.getDate()-1);
            endDate = calendarDateKey(exclusiveEnd);
          }
          const item = {id:uid(), title:event.summary||"Google Calendar event", description:String(event.description||"").split("\n").filter(line=>!line.startsWith("Project: ")&&!line.startsWith("Group: ")).join("\n").trim(), calendarType:"event", startTime:googleEventTime(event,"start"), endTime:googleEventTime(event,"end"), location:event.location||"", endDate, tagIds:[], values:{}, subitems:[], comments:[], archived:false, standalone:true, createdAt:Date.now(), updatedAt:Date.now(), googleEventIds:{}, googleSyncMeta:{}};
          item.googleEventIds[`${calendarId}:__calendar__:__standalone__`] = event.id;
          item.googleSyncMeta[`${calendarId}:__calendar__:__standalone__`] = {googleUpdatedAt:event.updated||new Date().toISOString(), localUpdatedAt:item.updatedAt};
          state.calendarItems.push(item);
          importedCount++;
        }
        if (result.nextSyncToken && result.nextSyncToken!==nextTokens[calendarId]){
          nextTokens[calendarId] = result.nextSyncToken;
          tokenChanged = true;
        }
      }
      if (tokenChanged || importedCount){
        state.googleCalendarSyncTokens = nextTokens;
        if (importedCount) state.googleLastSyncAt = Date.now();
        saveGoogleState();
        await flushSave();
      }
      if (importedCount){
        renderAll();
        updateGoogleCalendarStatus(`Imported ${importedCount} change${importedCount===1?"":"s"} from ${calendarIds.length} linked calendar${calendarIds.length===1?"":"s"}`, null);
      } else {
        updateGoogleCalendarStatus(`Google calendars up to date · checked ${new Date().toLocaleTimeString()}`, null);
      }
    }catch(error){
      if (tokenChanged || importedCount){
        state.googleCalendarSyncTokens = nextTokens;
        if (importedCount) state.googleLastSyncAt = Date.now();
        saveGoogleState();
        await flushSave();
        if (importedCount) renderAll();
      }
      if (error.status===401) handleGoogleAuthFailure();
      let detail = "Google Calendar could not be checked.";
      try{
        const payload = JSON.parse(error.detail || "{}");
        detail = payload.error?.message || payload.error?.errors?.[0]?.reason || detail;
      }catch(parseError){ }
      updateGoogleCalendarStatus(error.status===401 ? "Google connection expired - reconnect in Integrations" : `Google Calendar check failed: ${detail}`, null);
    }finally{
      googleImportInFlight = false;
      if (googleSyncQueued && googleAccessToken && linkedGoogleCalendarIds().length && !googleSyncInFlight){
        googleSyncQueued = false;
        clearTimeout(googleAutoSyncTimer);
        googleAutoSyncTimer = setTimeout(()=>syncGoogleCalendar(null), 0);
      }
    }
  }
  function startGoogleCalendarPolling(){
    if (googlePollTimer) return;
    googlePollTimer = setInterval(importGoogleCalendarEvents, 30000);
    importGoogleCalendarEvents();
  }
  function resumeGoogleCalendarSync(){
    if (!state || !linkedGoogleCalendarIds().length) return;
    if (googleAccessToken){ startGoogleCalendarPolling(); return; }
    if (!googleTokenClient && !initGoogleCalendarAuth()){
      if (googleResumeRetryCount===0 && document.readyState!=="complete"){
        window.addEventListener("load", resumeGoogleCalendarSync, {once:true});
      } else if (googleResumeRetryCount<12){
        googleResumeRetryCount++;
        updateGoogleCalendarStatus("Waiting for Google Calendar to load...");
        googleResumeRetryTimer = setTimeout(resumeGoogleCalendarSync, 1000);
      } else {
        updateGoogleCalendarStatus("Google Calendar did not load; refresh to retry");
      }
      return;
    }
    googleResumeRetryCount = 0;
    googleTokenPurpose = "sync";
    googleSyncScopeProject = null;
    googleSilentAuth = true;
    try{ googleTokenClient.requestAccessToken({prompt:"none"}); }catch(error){ googleSilentAuth = false; }
  }
  async function syncGoogleCalendar(scopeProject){
    if (!googleAccessToken) return;
    if (googleSyncInFlight || googleImportInFlight){
      googleSyncQueued = true;
      return;
    }
    clearTimeout(googleAutoSyncTimer);
    googleSyncInFlight = true;
    updateGoogleCalendarStatus("Starting Google Calendar sync...", null);
    updateGoogleCalendarButtons();
    try{
      const entries = calendarEntries(scopeProject);
      if (!entries.length){
        updateGoogleCalendarStatus("No dated items to sync");
        await showNotice("Nothing to sync", "Add a project date or a Schedule end date to an item first. A time without a date is not enough to create a Google Calendar event.");
        return;
      }
      const calendarIds = linkedGoogleCalendarIds();
      if (!calendarIds.length){
        updateGoogleCalendarStatus("Link a calendar first");
        await showNotice("No Google calendars linked", "Choose Link calendars first, then select one or more writable Google calendars.");
        return;
      }
      const total = entries.length * calendarIds.length;
      let completed = 0;
      updateGoogleCalendarStatus("Preparing calendar items...", {completed,total});
      for (const calendarId of calendarIds){
        for (const entry of entries){
          const calendar = (state.googleCalendarCatalog||[]).find(item=>item.id===calendarId);
          const calendarName = calendar?.summary || (calendarId==="primary" ? "Primary calendar" : calendarId);
          const itemName = entry.item.title || "Untitled item";
          updateGoogleCalendarStatus(`Syncing ${completed+1} of ${total}: ${itemName} · ${calendarName}`, {completed,total});
          entry.item.googleEventIds = entry.item.googleEventIds || {};
          entry.item.googleSyncMeta = entry.item.googleSyncMeta || {};
          const ownerId = entry.project ? entry.project.id : "__calendar__";
          const key = `${calendarId}:${ownerId}:${entry.field.id}`;
          const legacyKey = `${ownerId}:${entry.field.id}`;
          const eventId = entry.item.googleEventIds[key] || (calendarId==="primary" ? entry.item.googleEventIds[legacyKey] : "");
          const previous = entry.item.googleSyncMeta[key] || null;
          if (previous?.remoteDeletedAt && Number(entry.item.updatedAt||0) <= Number(previous.remoteDeletedAt)){
            completed++;
            updateGoogleCalendarStatus(`Synced ${completed} of ${total} calendar operations`, {completed,total});
            continue;
          }
          if (previous?.remoteDeletedAt) delete entry.item.googleSyncMeta[key].remoteDeletedAt;
          let remote = null;
          if (eventId){
            try{
              remote = await googleCalendarRequest(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`);
            }catch(error){
              if (error.status!==404) throw error;
              delete entry.item.googleEventIds[key];
            }
          }
          let saved = remote;
          let pushLocal = !remote;
          if (remote){
            const remoteTime = Date.parse(remote.updated||"") || 0;
            const previousRemoteTime = Date.parse(previous?.googleUpdatedAt||"") || 0;
            const localChanged = !previous || Number(entry.item.updatedAt||0) > Number(previous.localUpdatedAt||0);
            const remoteChanged = !!previous && remoteTime > previousRemoteTime;
            if (remoteChanged && (!localChanged || remoteTime >= Number(entry.item.updatedAt||0))){
              applyGoogleEventToItem(entry, remote);
              pushLocal = false;
            } else {
              pushLocal = localChanged;
            }
            if (pushLocal){
              const body = googleEventBody(entry);
              saved = await googleCalendarRequest(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(remote.id)}`, {method:"PATCH",body:JSON.stringify(body)});
            }
          } else {
            const body = googleEventBody(entry);
            saved = await googleCalendarRequest(`/calendars/${encodeURIComponent(calendarId)}/events`, {method:"POST",body:JSON.stringify(body)});
          }
          entry.item.googleEventIds[key] = saved.id;
          entry.item.googleSyncMeta[key] = {googleUpdatedAt:saved.updated||remote?.updated||new Date().toISOString(), localUpdatedAt:entry.item.updatedAt||Date.now()};
          completed++;
          updateGoogleCalendarStatus(`Synced ${completed} of ${total} calendar operations`, {completed,total});
        }
      }
      updateGoogleCalendarStatus("Finalising Google Calendar sync...", {completed:total,total});
      await processGoogleDeletions();
      state.googleLastSyncAt = Date.now();
      saveGoogleState();
      await flushSave();
      const syncLabel = `Synced ${entries.length} item${entries.length===1?"":"s"} to ${calendarIds.length} calendar${calendarIds.length===1?"":"s"}`;
      const lastSync = `Last synced ${new Date(state.googleLastSyncAt).toLocaleString()}`;
      document.querySelectorAll("[data-integration-last-sync]").forEach(element=>{ element.textContent = lastSync; });
      updateGoogleCalendarStatus(syncLabel, null);
    }catch(error){
      if (error.status===401){
        handleGoogleAuthFailure();
      }
      let detail = "Google rejected the sync request.";
      try{
        const payload = JSON.parse(error.detail || "{}");
        detail = payload.error?.message || payload.error?.errors?.[0]?.reason || detail;
      }catch(parseError){ }
      updateGoogleCalendarStatus(error.status===401 ? "Google connection expired - reconnect in Integrations" : `Sync failed: ${detail}`, null);
      await showNotice("Google Calendar sync failed", `${detail} Connect again and make sure Calendar access was approved.`);
    }finally{
      googleSyncInFlight = false;
      updateGoogleCalendarButtons();
      if (googleAccessToken && linkedGoogleCalendarIds().length) startGoogleCalendarPolling();
      if (googleSyncQueued && googleAccessToken && linkedGoogleCalendarIds().length){
        googleSyncQueued = false;
        clearTimeout(googleAutoSyncTimer);
        googleAutoSyncTimer = setTimeout(()=>syncGoogleCalendar(null), 0);
      }
    }
  }
  function connectGoogleCalendar(scopeProject){
    googleSyncScopeProject = scopeProject || null;
    if (!googleTokenClient && !initGoogleCalendarAuth()){
      showNotice("Google Calendar unavailable", "The Google authentication library has not loaded yet. Refresh the page and try again.");
      return;
    }
    if (googleAccessToken){ syncGoogleCalendar(scopeProject); return; }
    updateGoogleCalendarStatus("Connecting to Google Calendar...", null);
    googleTokenPurpose = "sync";
    googleTokenClient.requestAccessToken({prompt:"consent"});
  }
  function manageGoogleCalendars(){
    if (!googleTokenClient && !initGoogleCalendarAuth()){
      showNotice("Google Calendar unavailable", "The Google authentication library has not loaded yet. Refresh the page and try again.");
      return;
    }
    if (googleAccessToken){ openGoogleCalendarManager(); return; }
    googleTokenPurpose = "manage";
    googleTokenClient.requestAccessToken({prompt:"consent"});
  }
  function calendarDateKey(date){
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  }
  function icsEscape(value){
    return String(value||"").replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\r?\n/g,"\\n");
  }
  function exportCalendarIcs(scopeProject){
    const events = calendarEntries(scopeProject);
    const lines = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Beforework//Calendar//EN"];
    events.forEach(entry=>{
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${entry.item.id}-${entry.field.id}@beforework.local`);
      lines.push(`DTSTAMP:${calendarDateCode(todayStr(0))}T000000Z`);
      if (entry.item.startTime && entry.item.endTime){
        lines.push(`DTSTART:${calendarDateCode(entry.date)}T${entry.item.startTime.replace(":","")}00`);
        lines.push(`DTEND:${calendarDateCode(entry.endDate)}T${entry.item.endTime.replace(":","")}00`);
      } else {
        lines.push(`DTSTART;VALUE=DATE:${calendarDateCode(entry.date)}`);
        lines.push(`DTEND;VALUE=DATE:${calendarDateCode(entry.endDate,1)}`);
      }
      lines.push(`SUMMARY:${icsEscape(entry.item.title)}`);
      lines.push(`DESCRIPTION:${icsEscape([entry.item.description,entry.project ? `Project: ${entry.project.name}` : "Beforework Calendar",entry.group ? `Group: ${entry.group.name}` : ""].filter(Boolean).join("\n"))}`);
      lines.push("END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    const blob = new Blob([lines.join("\r\n")], {type:"text/calendar;charset=utf-8"});
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${scopeProject ? scopeProject.name : "all-projects"}-calendar.ics`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function renderIntegrations(board){
    const links = linkedGoogleCalendarIds();
    const catalog = new Map((state.googleCalendarCatalog||[]).map(calendar=>[calendar.id, calendar]));
    const lastSync = state.googleLastSyncAt ? `Last synced ${new Date(state.googleLastSyncAt).toLocaleString()}` : "Not synced yet";
    const view = window.ProjectifyViewTemplates.clone("integrations");
    const list = view.querySelector("[data-linked-calendar-list]");
    const rowTemplate = view.querySelector("#linkedCalendarRowTemplate");
    list.querySelector("[data-no-linked-calendars]").hidden = links.length>0;
    links.forEach(id=>{
      const calendar = catalog.get(id);
      const row = rowTemplate.content.firstElementChild.cloneNode(true);
      const name = calendar?.summary||id;
      const label = row.querySelector("span");
      label.textContent = `${name}${calendar?.primary ? " (primary)" : ""}`;
      label.title = name;
      row.querySelector("[data-unlink-calendar]").setAttribute("data-unlink-calendar", id);
      list.appendChild(row);
    });
    const connected = !!googleAccessToken;
    view.querySelector("[data-integration-connection]").textContent = connected ? "Connected" : "Not connected";
    view.querySelector("[data-integration-last-sync]").textContent = lastSync;
    view.querySelector("[data-integration-sync]").hidden = !connected;
    view.querySelector("[data-integration-connect]").hidden = connected;
    board.replaceChildren(view);
    board.querySelector("[data-integration-link]").onclick = manageGoogleCalendars;
    const syncButton = board.querySelector("[data-integration-sync]");
    if (syncButton) syncButton.onclick = () => syncGoogleCalendar(null);
    const connectButton = board.querySelector("[data-integration-connect]");
    if (connectButton) connectButton.onclick = () => connectGoogleCalendar(null);
    updateGoogleCalendarButtons();
    board.querySelectorAll("[data-unlink-calendar]").forEach(button=>{
      button.onclick = () => {
        state.googleCalendarLinks = linkedGoogleCalendarIds().filter(id=>id!==button.dataset.unlinkCalendar);
        scheduleSave();
        if (fileHandle){ clearTimeout(saveTimer); saveTimer = null; writeToFile(); }
        renderMain();
      };
    });
  }

