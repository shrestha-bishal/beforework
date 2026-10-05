(function(global){
  "use strict";

  function createRecurrenceFeature(){
    function parseCalendarDate(dateKey){
      if (!dateKey) return null;
      const [year,month,day]=String(dateKey).split("-").map(Number);
      return new Date(year,month-1,day);
    }

    function formatCalendarDate(date){
      const year=date.getFullYear();
      const month=String(date.getMonth()+1).padStart(2,"0");
      const day=String(date.getDate()).padStart(2,"0");
      return `${year}-${month}-${day}`;
    }

    function addDaysToDate(date,days){
      const next=new Date(date);
      next.setDate(next.getDate()+days);
      return next;
    }

    function addMonthsToDate(date,months){
      const next=new Date(date);
      const day=next.getDate();
      next.setDate(1);
      next.setMonth(next.getMonth()+months);
      next.setDate(Math.min(day,new Date(next.getFullYear(),next.getMonth()+1,0).getDate()));
      return next;
    }

    function normaliseRecurrence(recurrence){
      if (!recurrence||recurrence.frequency==="none") return null;
      const allowed=["daily","weekly","monthly","custom"];
      const weekdays=["sun","mon","tue","wed","thu","fri","sat"];
      const frequency=allowed.includes(recurrence.frequency)?recurrence.frequency:"custom";
      const interval=Number.isFinite(Number(recurrence.interval))?Math.max(1,Number(recurrence.interval)):1;
      const byDay=Array.isArray(recurrence.byDay)?recurrence.byDay.filter(day=>day&&weekdays.includes(day)):[];
      return {
        frequency,
        interval,
        unit:["day","week","month"].includes(recurrence.unit)?recurrence.unit:"week",
        byDay,
        until:recurrence.until||null,
        customText:recurrence.customText||""
      };
    }

    function recurrenceSummary(recurrence){
      const normalized=normaliseRecurrence(recurrence);
      if (!normalized) return "Does not repeat";

      const weekdayMap={sun:"Sun",mon:"Mon",tue:"Tue",wed:"Wed",thu:"Thu",fri:"Fri",sat:"Sat"};
      const dayText=normalized.byDay.length?normalized.byDay.map(day=>weekdayMap[day]||day).join(", "):"";
      let summary;
      if (normalized.frequency==="daily") summary=normalized.interval===1?"Every day":`Every ${normalized.interval} days`;
      else if (normalized.frequency==="weekly"){
        if (!dayText) summary=normalized.interval===1?"Every week":`Every ${normalized.interval} weeks`;
        else summary=normalized.interval===1?`Every week on ${dayText}`:`Every ${normalized.interval} weeks on ${dayText}`;
      }else if (normalized.frequency==="monthly") summary=normalized.interval===1?"Every month":`Every ${normalized.interval} months`;
      else{
        const unit=normalized.unit||"week";
        const unitLabel=normalized.interval===1?unit:`${unit}s`;
        summary=`Every ${normalized.interval} ${unitLabel}${unit==="week"&&dayText?` on ${dayText}`:""}`;
      }
      return normalized.until?`${summary} · through ${normalized.until}`:summary;
    }

    function expandRecurringDates(startDate,endDate,recurrence,limit=320){
      if (!startDate||!recurrence||recurrence.frequency==="none") return [{date:startDate,endDate:endDate||startDate}];
      const normalized=normaliseRecurrence(recurrence);
      if (!normalized) return [{date:startDate,endDate:endDate||startDate}];
      const start=parseCalendarDate(startDate);
      const initialEnd=parseCalendarDate(endDate||startDate);
      const durationDays=Math.max(0,Math.round((initialEnd-start)/86400000));
      const until=normalized.until?parseCalendarDate(normalized.until):null;
      const results=[];
      const weekdayMap={sun:0,mon:1,tue:2,wed:3,thu:4,fri:5,sat:6};
      const selectedDays=normalized.byDay.map(day=>weekdayMap[day]).filter(day=>day!==undefined).sort((a,b)=>a-b);
      const addOccurrence=occurrenceStart=>{
        results.push({
          date:formatCalendarDate(occurrenceStart),
          endDate:formatCalendarDate(addDaysToDate(occurrenceStart,durationDays))
        });
      };

      if ((normalized.frequency==="weekly"||(normalized.frequency==="custom"&&normalized.unit==="week"))&&selectedDays.length){
        const firstWeek=addDaysToDate(start,-start.getDay());
        for (let weekOffset=0;results.length<limit;weekOffset+=normalized.interval){
          let hasFutureDate=false;
          for (const weekday of selectedDays){
            const occurrenceStart=addDaysToDate(firstWeek,weekOffset*7+weekday);
            if (occurrenceStart<start) continue;
            if (until&&occurrenceStart>until) continue;
            hasFutureDate=true;
            addOccurrence(occurrenceStart);
            if (results.length>=limit) break;
          }
          const nextWeekStart=addDaysToDate(firstWeek,(weekOffset+normalized.interval)*7);
          if (!hasFutureDate&&until&&nextWeekStart>until) break;
          if (until&&nextWeekStart>until&&results.length===0) break;
        }
      }else{
        let currentStart=new Date(start);
        for (let index=0;index<limit;index++){
          if (until&&currentStart>until) break;
          addOccurrence(currentStart);
          if (normalized.frequency==="daily"||(normalized.frequency==="custom"&&normalized.unit==="day")){
            currentStart=addDaysToDate(currentStart,normalized.interval);
          }else if (normalized.frequency==="monthly"||(normalized.frequency==="custom"&&normalized.unit==="month")){
            currentStart=addMonthsToDate(start,(index+1)*normalized.interval);
          }else{
            currentStart=addDaysToDate(currentStart,7*normalized.interval);
          }
        }
      }
      return results;
    }

    return Object.freeze({
      normalise:normaliseRecurrence,
      summary:recurrenceSummary,
      expandDates:expandRecurringDates
    });
  }

  global.BeforeworkRecurrence=Object.freeze({create:createRecurrenceFeature});
})(window);
