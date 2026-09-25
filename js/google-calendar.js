/* Google Calendar integration */
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
    googleTokenClient = google.accounts.oauth2.initTokenClient({
      client_id:GOOGLE_CLIENT_ID,
      scope:GOOGLE_CALENDAR_SCOPE,
      callback:response=>{
        if (response.error){
          handleGoogleAuthFailure();
          if (googleTokenPurpose==="sync") showNotice("Google Calendar", "Google authentication was not completed.");
          return;
        }
        googleAccessToken = response.access_token;
        updateGoogleCalendarButtons();
        if (googleTokenPurpose==="sync") syncGoogleCalendar(googleSyncScopeProject).then(startGoogleCalendarPolling);
        if (googleTokenPurpose==="manage") { openGoogleCalendarManager(); startGoogleCalendarPolling(); }
      }
    });
    return true;
  }
  function updateGoogleCalendarButtons(){
    document.querySelectorAll('[data-calendar-action="google"]').forEach(button=>{
      if (!googleSyncInFlight) button.textContent = "Sync now";
    });
    updateGoogleCalendarStatus();
  }
  function updateGoogleCalendarStatus(text){
    const status = text || (googleAccessToken ? (linkedGoogleCalendarIds().length ? "Ready to sync" : "No calendars linked") : "Connect Google Calendar in Integrations");
    document.querySelectorAll("[data-calendar-sync-status]").forEach(element=>{ element.textContent = status; });
  }
  function handleGoogleAuthFailure(){
    googleAccessToken = null;
    clearTimeout(googleAutoSyncTimer);
    if (googlePollTimer){ clearInterval(googlePollTimer); googlePollTimer = null; }
    updateGoogleCalendarButtons();
    updateGoogleCalendarStatus("Google connection expired - reconnect in Integrations");
    setSyncStatus("err", "Google Calendar needs reconnecting");
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
      scheduleSave();
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
          if (fileHandle){ clearTimeout(saveTimer); saveTimer = null; await writeToFile(); }
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
  async function googleCalendarEvents(calendarId){
    const events = [];
    let pageToken = "";
    do{
      // Calendar API requires a non-empty query range for expanded event
      // listings. This does not require individual events to have times.
      const query = new URLSearchParams({singleEvents:"true",showDeleted:"true",maxResults:"2500",timeMin:"2000-01-01T00:00:00Z",timeMax:"2100-01-01T00:00:00Z"});
      if (pageToken) query.set("pageToken", pageToken);
      const result = await googleCalendarRequest(`/calendars/${encodeURIComponent(calendarId)}/events?${query.toString()}`);
      events.push(...(result.items||[]));
      pageToken = result.nextPageToken || "";
    }while(pageToken);
    return events;
  }
  async function importGoogleCalendarEvents(){
    if (!googleAccessToken || googleImportInFlight) return;
    const calendarIds = linkedGoogleCalendarIds();
    if (!calendarIds.length) return;
    googleImportInFlight = true;
    let imported = false;
    try{
      for (const calendarId of calendarIds){
        const events = await googleCalendarEvents(calendarId);
        for (const event of events){
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
              imported = true;
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
              imported = true;
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
          imported = true;
        }
      }
      if (imported){ scheduleSave(); renderAll(); }
    }catch(error){
      if (error.status===401) handleGoogleAuthFailure();
    }finally{
      googleImportInFlight = false;
    }
  }
  function startGoogleCalendarPolling(){
    if (googlePollTimer) return;
    googlePollTimer = setInterval(importGoogleCalendarEvents, 60000);
    importGoogleCalendarEvents();
  }
  async function syncGoogleCalendar(scopeProject){
    if (!googleAccessToken || googleSyncInFlight) return;
    clearTimeout(googleAutoSyncTimer);
    googleSyncInFlight = true;
    const button = document.querySelector('[data-calendar-action="google"]');
    if (button){ button.disabled = true; button.textContent = "Syncing..."; }
    try{
      const entries = calendarEntries(scopeProject);
      if (!entries.length){
        if (button) button.textContent = "No dated items";
        await showNotice("Nothing to sync", "Add a project date or a Schedule end date to an item first. A time without a date is not enough to create a Google Calendar event.");
        return;
      }
      const calendarIds = linkedGoogleCalendarIds();
      if (!calendarIds.length){
        if (button) button.textContent = "Link a calendar";
        await showNotice("No Google calendars linked", "Choose Link calendars first, then select one or more writable Google calendars.");
        return;
      }
      for (const calendarId of calendarIds){
        for (const entry of entries){
          entry.item.googleEventIds = entry.item.googleEventIds || {};
          entry.item.googleSyncMeta = entry.item.googleSyncMeta || {};
          const ownerId = entry.project ? entry.project.id : "__calendar__";
          const key = `${calendarId}:${ownerId}:${entry.field.id}`;
          const legacyKey = `${ownerId}:${entry.field.id}`;
          const eventId = entry.item.googleEventIds[key] || (calendarId==="primary" ? entry.item.googleEventIds[legacyKey] : "");
          const previous = entry.item.googleSyncMeta[key] || null;
          if (previous?.remoteDeletedAt && Number(entry.item.updatedAt||0) <= Number(previous.remoteDeletedAt)) continue;
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
        }
      }
      await processGoogleDeletions();
      state.googleLastSyncAt = Date.now();
      scheduleSave();
      const syncLabel = `Synced ${entries.length} item${entries.length===1?"":"s"} to ${calendarIds.length} calendar${calendarIds.length===1?"":"s"}`;
      if (button) button.textContent = "Sync now";
      updateGoogleCalendarStatus(syncLabel);
    }catch(error){
      if (error.status===401) handleGoogleAuthFailure();
      if (button) button.textContent = "Connect Google Calendar";
      updateGoogleCalendarStatus("Sync failed - see details");
      let detail = "Google rejected the sync request.";
      try{
        const payload = JSON.parse(error.detail || "{}");
        detail = payload.error?.message || payload.error?.errors?.[0]?.reason || detail;
      }catch(parseError){ }
      await showNotice("Google Calendar sync failed", `${detail} Connect again and make sure Calendar access was approved.`);
    }finally{
      googleSyncInFlight = false;
      if (button) button.disabled = false;
    }
  }
  function connectGoogleCalendar(scopeProject){
    googleSyncScopeProject = scopeProject || null;
    if (!googleTokenClient && !initGoogleCalendarAuth()){
      showNotice("Google Calendar unavailable", "The Google authentication library has not loaded yet. Refresh the page and try again.");
      return;
    }
    if (googleAccessToken){ syncGoogleCalendar(scopeProject); return; }
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
    const connectionLabel = googleAccessToken ? "Connected" : "Not connected";
    const lastSync = state.googleLastSyncAt ? `Last synced ${new Date(state.googleLastSyncAt).toLocaleString()}` : "Not synced yet";
    const linkedHtml = links.length ? links.map(id=>{
      const calendar = catalog.get(id);
      return `<div class="linkedCalendarRow"><iconify-icon icon="mdi:calendar-check-outline"></iconify-icon><span title="${escapeHtml(calendar?.summary||id)}">${escapeHtml(calendar?.summary||id)}${calendar?.primary?" (primary)":""}</span><button class="btn btn-sm btn-invisible" data-unlink-calendar="${escapeHtml(id)}">Unlink</button></div>`;
    }).join("") : `<div class="integrationEmpty">No Google calendars linked yet.</div>`;
    board.innerHTML = `<div class="integrationWrap">
      <div class="integrationHeader"><iconify-icon icon="mdi:hub-outline"></iconify-icon><div><h3>Integrations</h3><p>Connect external services while keeping Beforework as your local workspace.</p></div></div>
      <div class="integrationCard">
        <div class="integrationCardHead"><iconify-icon icon="logos:google-calendar"></iconify-icon><strong>Google Calendar</strong><span class="integrationStatus">${connectionLabel}</span></div>
        <p class="dialogMessage">Sync standalone calendar items and scheduled project items to one or more Google calendars.</p>
        <div class="linkedCalendarList">${linkedHtml}</div>
        <div class="integrationActions"><button class="btn btn-primary btn-sm" data-integration-link><iconify-icon icon="mdi:link-variant" style="vertical-align:-2px;margin-right:4px;"></iconify-icon>Link calendars</button>${googleAccessToken?"":`<button class="btn btn-sm" data-integration-connect>Connect Google</button>`}<span class="integrationStatus">${escapeHtml(lastSync)}</span></div>
      </div>
    </div>`;
    board.querySelector("[data-integration-link]").onclick = manageGoogleCalendars;
    const connectButton = board.querySelector("[data-integration-connect]");
    if (connectButton) connectButton.onclick = () => connectGoogleCalendar(null);
    board.querySelectorAll("[data-unlink-calendar]").forEach(button=>{
      button.onclick = () => {
        state.googleCalendarLinks = linkedGoogleCalendarIds().filter(id=>id!==button.dataset.unlinkCalendar);
        scheduleSave();
        if (fileHandle){ clearTimeout(saveTimer); saveTimer = null; writeToFile(); }
        renderMain();
      };
    });
  }

