(function(global){
  "use strict";

  const ENABLED_KEY = "beforework_reminders_enabled_v1";
  const SENT_KEY = "beforework_reminders_sent_v1";
  const DUE_ALERT_HOUR = 9;
  const CHECK_INTERVAL_MS = 30000;

  function createReminderService({getItems, onOpenItem, NotificationApi=global.Notification, storage=global.localStorage, documentRef=global.document, now=Date.now, setIntervalFn=global.setInterval, clearIntervalFn=global.clearInterval}){
    let intervalId = null;

    function isEnabled(){
      if (!NotificationApi || NotificationApi.permission !== "granted") return false;
      try{ return storage?.getItem(ENABLED_KEY)==="1"; }catch(err){ return false; }
    }
    function getStatus(){
      const permission = NotificationApi?.permission || "unavailable";
      const enabled = isEnabled();
      const label = permission === "unavailable" ? "Notifications are not available in this browser"
        : permission === "denied" ? "Notifications are blocked in browser settings"
        : enabled ? "Reminders are enabled on this device" : "Reminders are off";
      return {enabled, permission, label, actionLabel:enabled ? "Disable reminders" : "Enable reminders", canEnable:permission !== "unavailable" && permission !== "denied"};
    }
    function readSent(){
      try{
        const stored = JSON.parse(storage?.getItem(SENT_KEY) || "{}");
        return stored && typeof stored==="object" && !Array.isArray(stored) ? stored : {};
      }catch(err){ return {}; }
    }
    function writeSent(sent){
      try{
        const recent = Object.entries(sent).sort((a,b)=>b[1]-a[1]).slice(0,500);
        storage?.setItem(SENT_KEY, JSON.stringify(Object.fromEntries(recent)));
      }catch(err){ /* Notifications can still be shown if browser storage is unavailable. */ }
    }
    function dateKey(date){
      return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
    }
    function dueAlertTime(dateValue){
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateValue||""))) return null;
      const [year,month,day] = dateValue.split("-").map(Number);
      const date = new Date(year,month-1,day,DUE_ALERT_HOUR,0,0,0);
      return date.getFullYear()===year && date.getMonth()===month-1 && date.getDate()===day ? date.getTime() : null;
    }
    function displayNotification(title, body, tag, item){
      try{
        const notification = new NotificationApi(title,{body,tag});
        notification.onclick = () => {
          global.focus?.();
          if (item && onOpenItem) onOpenItem(item);
          notification.close();
        };
        return true;
      }catch(err){ return false; }
    }
    function check(){
      if (!isEnabled()) return 0;
      const currentTime = now();
      const today = dateKey(new Date(currentTime));
      const sent = readSent();
      let delivered = 0;
      const markSent = key=>{ sent[key]=currentTime; delivered++; };

      for (const item of (getItems?.() || [])){
        if (!item || !item.id || !item.title) continue;
        if (item.reminderAt){
          const reminderTime = new Date(item.reminderAt).getTime();
          const key = `reminder:${item.id}:${item.reminderAt}`;
          if (Number.isFinite(reminderTime) && reminderTime<=currentTime && !sent[key] && displayNotification(item.title,"Your scheduled reminder is due.",key,item)) markSent(key);
        }
        if (item.isTask && !item.completed && !item.archived && item.dueDate===today){
          const alertTime = dueAlertTime(item.dueDate);
          const key = `due:${item.id}:${item.dueDate}`;
          const body = `Due today${item.projectName ? ` · ${item.projectName}` : ""}`;
          if (alertTime!==null && alertTime<=currentTime && !sent[key] && displayNotification(item.title,body,key,item)) markSent(key);
        }
      }
      if (delivered) writeSent(sent);
      return delivered;
    }
    async function enable(){
      if (!NotificationApi) return getStatus();
      let permission = NotificationApi.permission;
      if (permission==="default") permission = await NotificationApi.requestPermission();
      if (permission==="granted"){
        try{ storage?.setItem(ENABLED_KEY,"1"); }catch(err){ /* Keep the current page session usable. */ }
        check();
      }
      return getStatus();
    }
    function disable(){
      try{ storage?.removeItem(ENABLED_KEY); }catch(err){ /* Notifications are disabled for this session. */ }
      return getStatus();
    }
    function start(){
      if (intervalId!==null) return;
      intervalId = setIntervalFn(check,CHECK_INTERVAL_MS);
      documentRef?.addEventListener("visibilitychange",check);
      check();
    }
    function stop(){
      if (intervalId!==null){ clearIntervalFn(intervalId); intervalId = null; }
      documentRef?.removeEventListener("visibilitychange",check);
    }

    return Object.freeze({check, disable, enable, getStatus, start, stop});
  }

  global.BeforeworkReminders = Object.freeze({create:createReminderService});
})(window);
