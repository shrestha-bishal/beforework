window.ProjectifyTemplates = window.ProjectifyTemplates || {};
window.ProjectifyTemplates.calendarEvent = ({className,pid,gid,iid,fid,start,end,title,startTime,projectName,url}) => `
  <div class="calendarEvent ${className}" draggable="true" data-pid="${pid}" data-gid="${gid}" data-iid="${iid}" data-fid="${fid}" data-start="${start}" data-end="${end}">
    <span class="eventDot"></span><span class="eventTitle">${startTime}${title}</span>
    ${projectName ? `<span class="eventProject">${projectName}</span>` : ""}
    <a class="gcalLink" href="${url}" target="_blank" rel="noopener" title="Add to Google Calendar">GCal</a>
  </div>`;
window.ProjectifyTemplates.calendarDay = ({className,date,number,events}) =>
  `<div class="calendarDay${className}" data-date="${date}"><div class="calendarDayNumber">${number}</div>${events}</div>`;
window.ProjectifyTemplates.calendar = ({monthLabel,scopeLabel,isGlobal,googleConnected,lastSync,cells}) => `
  <div class="calendarToolbar">
    <button class="btn btn-sm" data-calendar-action="prev" aria-label="Previous month">‹</button>
    <button class="btn btn-sm" data-calendar-action="today">Today</button>
    <button class="btn btn-sm" data-calendar-action="next" aria-label="Next month">›</button>
    <h3>${monthLabel}</h3>
    <span class="filterSummary">${scopeLabel}</span>
    <button class="btn btn-sm" data-calendar-action="new">+ New</button>
    <button class="btn btn-sm" data-calendar-action="ics">Export .ics</button>
    ${isGlobal ? `<button class="btn btn-sm" data-calendar-action="integrations"><iconify-icon icon="mdi:link-variant" style="vertical-align:-2px;margin-right:4px;"></iconify-icon>Link calendars</button><button class="btn btn-sm btn-primary" data-calendar-action="google"><iconify-icon icon="mdi:sync" style="vertical-align:-2px;margin-right:4px;"></iconify-icon>Sync now</button><span class="calendarSyncStatus" data-calendar-sync-status>${googleConnected ? "Connected" : "Not connected"} · ${lastSync}</span>` : ""}
  </div>
  <div class="calendarGrid">
    <div class="calendarWeekday">Sun</div><div class="calendarWeekday">Mon</div><div class="calendarWeekday">Tue</div><div class="calendarWeekday">Wed</div><div class="calendarWeekday">Thu</div><div class="calendarWeekday">Fri</div><div class="calendarWeekday">Sat</div>
    ${cells}
  </div>`;
