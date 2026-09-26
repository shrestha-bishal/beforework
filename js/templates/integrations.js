window.ProjectifyTemplates = window.ProjectifyTemplates || {};
window.ProjectifyTemplates.calendarLink = ({id,name,isPrimary}) =>
  `<div class="linkedCalendarRow"><iconify-icon icon="mdi:calendar-check-outline"></iconify-icon><span title="${name}">${name}${isPrimary ? " (primary)" : ""}</span><button class="btn btn-sm btn-invisible" data-unlink-calendar="${id}">Unlink</button></div>`;
window.ProjectifyTemplates.integrations = ({connected,lastSync,linkedCalendars}) => `
  <div class="integrationWrap">
    <div class="integrationHeader"><iconify-icon icon="mdi:hub-outline"></iconify-icon><div><h3>Integrations</h3><p>Connect external services while keeping Beforework as your local workspace.</p></div></div>
    <div class="integrationCard">
      <div class="integrationCardHead"><iconify-icon icon="logos:google-calendar"></iconify-icon><strong>Google Calendar</strong><span class="integrationStatus">${connected ? "Connected" : "Not connected"}</span></div>
      <p class="dialogMessage">Sync standalone calendar items and scheduled project items to one or more Google calendars.</p>
      <div class="linkedCalendarList">${linkedCalendars || `<div class="integrationEmpty">No Google calendars linked yet.</div>`}</div>
      <div class="integrationActions"><button class="btn btn-primary btn-sm" data-integration-link><iconify-icon icon="mdi:link-variant" style="vertical-align:-2px;margin-right:4px;"></iconify-icon>Link calendars</button>${connected?`<button class="btn btn-sm" data-integration-sync>Sync now</button>`:`<button class="btn btn-sm" data-integration-connect>Connect Google</button>`}<span class="integrationStatus">${lastSync}</span></div>
    </div>
  </div>`;
