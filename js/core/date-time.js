(function(global){
  "use strict";

  const TIME_FORMAT_KEY="personal_dashboard_time_format_v1";

  function createDateTimeUtils({storage=global.localStorage,now=()=>new Date()}={}){
    function getTimeFormat(){
      try{ return storage.getItem(TIME_FORMAT_KEY)==="24" ? "24" : "12"; }
      catch(error){ return "12"; }
    }

    function setTimeFormat(value){
      try{ storage.setItem(TIME_FORMAT_KEY,value); }
      catch(error){ /* A display preference must not block app use. */ }
    }

    function formatTime(date){
      return date.toLocaleTimeString(undefined,{
        hour:"numeric",
        minute:"2-digit",
        hour12:getTimeFormat()==="12"
      });
    }

    function formatTimeValue(value){
      if (!value) return "";
      const [hours,minutes]=value.split(":").map(Number);
      if (!Number.isInteger(hours)||!Number.isInteger(minutes)) return value;
      return formatTime(new Date(2000,0,1,hours,minutes));
    }

    function formatDate(value){
      if (!value) return "";
      return new Date(value+"T00:00:00").toLocaleDateString(undefined,{
        month:"short",
        day:"numeric"
      });
    }

    function formatDateTime(timestamp){
      const date=new Date(timestamp);
      return date.toLocaleString(undefined,{
        dateStyle:"medium",
        timeStyle:"short",
        hour12:getTimeFormat()==="12"
      });
    }

    function formatUpdatedAt(timestamp){
      const date=new Date(timestamp);
      if (!Number.isFinite(date.getTime())) return "Unknown";
      const currentDate=now();
      const dayStamp=value=>Date.UTC(value.getFullYear(),value.getMonth(),value.getDate());
      const daysAgo=Math.round((dayStamp(currentDate)-dayStamp(date))/86400000);
      const time=formatTime(date);
      if (daysAgo===0) return `Today at ${time}`;
      if (daysAgo===1) return `Yesterday at ${time}`;
      if (daysAgo>1&&daysAgo<7) return `${daysAgo} days ago at ${time}`;
      const dateLabel=date.toLocaleDateString(undefined,{
        day:"numeric",
        month:"short",
        ...(date.getFullYear()===currentDate.getFullYear()?{}:{year:"numeric"})
      });
      return `${dateLabel} at ${time}`;
    }

    function todayStr(offsetDays){
      const date=now();
      date.setDate(date.getDate()+(offsetDays||0));
      const year=date.getFullYear();
      const month=String(date.getMonth()+1).padStart(2,"0");
      const day=String(date.getDate()).padStart(2,"0");
      return `${year}-${month}-${day}`;
    }

    function dateTimeLocalValue(value){
      if (!value) return "";
      const date=new Date(value);
      if (!Number.isFinite(date.getTime())) return "";
      const year=date.getFullYear();
      const month=String(date.getMonth()+1).padStart(2,"0");
      const day=String(date.getDate()).padStart(2,"0");
      const hours=String(date.getHours()).padStart(2,"0");
      const minutes=String(date.getMinutes()).padStart(2,"0");
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    return Object.freeze({
      getTimeFormat,
      setTimeFormat,
      formatTimeValue,
      formatDate,
      formatDateTime,
      formatUpdatedAt,
      todayStr,
      dateTimeLocalValue
    });
  }

  global.BeforeworkDateTime=Object.freeze({create:createDateTimeUtils});
})(window);
