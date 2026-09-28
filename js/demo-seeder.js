(function(global){
  "use strict";

  function createDemoWorkspace({schemaVersion, uid, viewLabel, tagColors, todayStr}){
    const SCHEMA_VERSION = schemaVersion;
    const TAG_COLORS = tagColors;
    const now = Date.now();
    const productFolder = {id:uid(), name:"Product"};
    const operationsFolder = {id:uid(), name:"Operations"};
    const personalFolder = {id:uid(), name:"Personal"};
    const makeField = (label, type, options=[]) => ({id:uid(), label, type, options});
    const makeTag = (name, colour) => ({id:uid(), name, color:colour});
    const makeItem = (title, description, values={}, options={}) => ({
      id:uid(), title, description, calendarType:options.calendarType || "task",
      startTime:options.startTime || "", endTime:options.endTime || "", location:options.location || "",
      endDate:options.endDate || "", recurrence:options.recurrence || null, completedAt:options.completedAt || null, tagIds:options.tagIds || [], values,
      subitems:options.subitems || [], comments:options.comments || [], activity:[{id:uid(), type:"created", at:now}], archived:!!options.archived,
      createdAt:now, updatedAt:now - (options.ageDays || 0) * 86400000
    });
    const views = types => types.map(type=>({id:uid(), type, name:viewLabel(type)}));

    const priorityField = makeField("Priority", "priority");
    const dueDateField = makeField("Due date", "date");
    const launchStatus = makeField("Status", "select", [
      {id:uid(), label:"Backlog", color:TAG_COLORS[7]},
      {id:uid(), label:"In progress", color:TAG_COLORS[5]},
      {id:uid(), label:"In review", color:TAG_COLORS[0]},
      {id:uid(), label:"Ready", color:TAG_COLORS[6]}
    ]);
    const launchTag = makeTag("launch", TAG_COLORS[0]);
    const featureTag = makeTag("feature", TAG_COLORS[3]);
    const designTag = makeTag("design", TAG_COLORS[2]);
    const customerTag = makeTag("customer", TAG_COLORS[5]);
    const qualityTag = makeTag("quality", TAG_COLORS[6]);
    const launchViews = views(["list", "kanban", "calendar"]);
    const launchGroups = [
      {id:uid(), name:"Backlog", items:[]},
      {id:uid(), name:"In progress", items:[]},
      {id:uid(), name:"In review", items:[]},
      {id:uid(), name:"Ready", items:[]}
    ];
    const launch = {
      id:uid(), name:"Product launch", icon:"mdi:rocket-launch-outline", folderId:productFolder.id, createdAt:now,
      tags:[launchTag, featureTag, designTag, customerTag, qualityTag], fields:[priorityField, dueDateField, launchStatus],
      views:launchViews, activeViewId:launchViews[0].id, itemDefaultType:"task", groups:launchGroups
    };
    launchGroups[0].items.push(
      makeItem("Publish the release overview", "Summarise what is changing, who it helps, and where to find the updated workflows.", {[priorityField.id]:"medium", [dueDateField.id]:todayStr(5), [launchStatus.id]:launchStatus.options[0].id}, {tagIds:[launchTag.id, customerTag.id], subitems:[{id:uid(), title:"Confirm the release scope", done:true}, {id:uid(), title:"Review copy with support", done:false}]}),
      makeItem("Prepare the onboarding guide", "Create a concise guide that helps new teams set up projects, groups, and their first workspace file.", {[priorityField.id]:"low", [dueDateField.id]:todayStr(8), [launchStatus.id]:launchStatus.options[0].id}, {tagIds:[customerTag.id, designTag.id]})
    );
    launchGroups[1].items.push(
      makeItem("Finish recurring schedules", "Complete repeat rules for daily, weekly, and custom calendar entries.", {[priorityField.id]:"high", [dueDateField.id]:todayStr(1), [launchStatus.id]:launchStatus.options[1].id}, {tagIds:[featureTag.id, qualityTag.id], subitems:[{id:uid(), title:"Cover weekly weekday selection", done:true}, {id:uid(), title:"Verify custom month-end dates", done:false}], comments:[{id:uid(), text:"The interval and end-date cases are covered. I am checking the month-end behavior before review.", createdAt:now - 3600000}]}),
      makeItem("Refine first-run setup", "Make the first connection flow clear for people creating a workspace from scratch.", {[priorityField.id]:"medium", [dueDateField.id]:todayStr(4), [launchStatus.id]:launchStatus.options[1].id}, {tagIds:[designTag.id], ageDays:1})
    );
    launchGroups[2].items.push(
      makeItem("Check the calendar on narrow screens", "Review month and week views at phone widths and confirm event details remain readable.", {[priorityField.id]:"medium", [dueDateField.id]:todayStr(2), [launchStatus.id]:launchStatus.options[2].id}, {tagIds:[qualityTag.id, designTag.id], ageDays:2})
    );
    launchGroups[3].items.push(
      makeItem("Add workspace recovery guidance", "Document how to reconnect a file and recover from a browser permission prompt.", {[priorityField.id]:"low", [dueDateField.id]:todayStr(0), [launchStatus.id]:launchStatus.options[3].id}, {tagIds:[launchTag.id], ageDays:3}),
      makeItem("Verify keyboard navigation", "Confirm the main project and item actions can be reached and used with a keyboard.", {[priorityField.id]:"medium", [dueDateField.id]:todayStr(1), [launchStatus.id]:launchStatus.options[3].id}, {tagIds:[qualityTag.id], ageDays:4})
    );

    const onboardingStatus = makeField("Stage", "select", [
      {id:uid(), label:"New", color:TAG_COLORS[7]},
      {id:uid(), label:"Onboarding", color:TAG_COLORS[5]},
      {id:uid(), label:"Follow-up", color:TAG_COLORS[0]}
    ]);
    const onboardingDate = makeField("Next date", "date");
    const onboardingPriority = makeField("Priority", "priority");
    const onboardingViews = views(["table", "list"]);
    const onboardingGroup = {id:uid(), name:"Customer success", items:[]};
    const onboarding = {
      id:uid(), name:"Customer onboarding", icon:"mdi:account-group-outline", folderId:operationsFolder.id, createdAt:now,
      tags:[makeTag("customer", TAG_COLORS[5]), makeTag("research", TAG_COLORS[2])], fields:[onboardingStatus, onboardingDate, onboardingPriority],
      views:onboardingViews, activeViewId:onboardingViews[0].id, itemDefaultType:"task", groups:[onboardingGroup]
    };
    onboardingGroup.items.push(
      makeItem("Review the first-week setup path", "Walk through account setup as a new customer and note any unclear steps.", {[onboardingStatus.id]:onboardingStatus.options[0].id, [onboardingDate.id]:todayStr(3), [onboardingPriority.id]:"high"}, {tagIds:[onboarding.tags[0].id, onboarding.tags[1].id], subitems:[{id:uid(), title:"Create a sample workspace", done:true}, {id:uid(), title:"Check the first project flow", done:false}]}),
      makeItem("Schedule onboarding check-ins", "Set a short check-in after setup and another after the first week of use.", {[onboardingStatus.id]:onboardingStatus.options[1].id, [onboardingDate.id]:todayStr(1), [onboardingPriority.id]:"medium"}, {tagIds:[onboarding.tags[0].id], ageDays:2}),
      makeItem("Summarise activation feedback", "Group feedback by setup, navigation, and recurring work so the product team can prioritise follow-up.", {[onboardingStatus.id]:onboardingStatus.options[2].id, [onboardingDate.id]:todayStr(7), [onboardingPriority.id]:"low"}, {tagIds:[onboarding.tags[1].id]})
    );

    const personalStatus = makeField("Status", "select", [
      {id:uid(), label:"Next up", color:TAG_COLORS[7]},
      {id:uid(), label:"In progress", color:TAG_COLORS[5]},
      {id:uid(), label:"Done", color:TAG_COLORS[6]}
    ]);
    const personalPriority = makeField("Priority", "priority");
    const personalDate = makeField("Target date", "date");
    const homeTag = makeTag("home", TAG_COLORS[1]);
    const learningTag = makeTag("learning", TAG_COLORS[2]);
    const wellbeingTag = makeTag("wellbeing", TAG_COLORS[6]);
    const personalViews = views(["list", "table", "calendar"]);
    const personalGroups = [
      {id:uid(), name:"Next up", items:[]},
      {id:uid(), name:"In progress", items:[]},
      {id:uid(), name:"Done", items:[]}
    ];
    const personalPlanning = {
      id:uid(), name:"Personal planning", icon:"mdi:home-heart-outline", folderId:personalFolder.id, createdAt:now,
      tags:[homeTag, learningTag, wellbeingTag], fields:[personalStatus, personalPriority, personalDate],
      views:personalViews, activeViewId:personalViews[0].id, itemDefaultType:"task", groups:personalGroups
    };
    personalGroups[0].items.push(
      makeItem("Book annual home maintenance", "Compare available dates and confirm the yearly service appointment.", {[personalStatus.id]:personalStatus.options[0].id, [personalPriority.id]:"medium", [personalDate.id]:todayStr(10)}, {tagIds:[homeTag.id], subitems:[{id:uid(), title:"Check service options", done:true}, {id:uid(), title:"Confirm the booking", done:false}]}),
      makeItem("Choose a course for the next quarter", "Set aside time for a practical course that supports a personal learning goal.", {[personalStatus.id]:personalStatus.options[0].id, [personalPriority.id]:"low", [personalDate.id]:todayStr(12)}, {tagIds:[learningTag.id]})
    );
    personalGroups[1].items.push(
      makeItem("Plan the week ahead", "Review upcoming commitments and choose a few realistic priorities.", {[personalStatus.id]:personalStatus.options[1].id, [personalPriority.id]:"medium", [personalDate.id]:todayStr(1)}, {tagIds:[wellbeingTag.id], recurrence:{frequency:"weekly", interval:1, byDay:[], until:todayStr(57)}}),
      makeItem("Organise household documents", "Move current warranties, service records, and key receipts into one place.", {[personalStatus.id]:personalStatus.options[1].id, [personalPriority.id]:"low", [personalDate.id]:todayStr(5)}, {tagIds:[homeTag.id], ageDays:2})
    );
    personalGroups[2].items.push(
      makeItem("Complete the first-aid refresher", "Finish the annual refresher and save the updated completion record.", {[personalStatus.id]:personalStatus.options[2].id, [personalPriority.id]:"high", [personalDate.id]:todayStr(-2)}, {tagIds:[learningTag.id], completedAt:now - 86400000, ageDays:3})
    );

    const calendarDate = makeField("Date", "date");
    const calendarViews = views(["calendar", "list"]);
    const calendarGroup = {id:uid(), name:"Team schedule", items:[]};
    const teamCalendar = {
      id:uid(), name:"Team calendar", icon:"mdi:calendar-month-outline", folderId:operationsFolder.id, createdAt:now,
      tags:[makeTag("meeting", TAG_COLORS[5]), makeTag("milestone", TAG_COLORS[1])], fields:[calendarDate],
      views:calendarViews, activeViewId:calendarViews[0].id, itemDefaultType:"event", groups:[calendarGroup]
    };
    calendarGroup.items.push(
      makeItem("Weekly product sync", "Review delivery progress, customer feedback, and current risks.", {[calendarDate.id]:todayStr(1)}, {calendarType:"event", startTime:"10:00", endTime:"10:30", location:"Video call", endDate:todayStr(1), recurrence:{frequency:"weekly", interval:1, byDay:[], until:todayStr(57)}, tagIds:[teamCalendar.tags[0].id]}),
      makeItem("Product planning", "Confirm this week's priorities and owners.", {[calendarDate.id]:todayStr(0)}, {calendarType:"event", startTime:"09:30", endTime:"10:15", location:"Planning room", endDate:todayStr(0), tagIds:[teamCalendar.tags[0].id]}),
      makeItem("Design review", "Review the first-run setup and calendar changes.", {[calendarDate.id]:todayStr(2)}, {calendarType:"event", startTime:"14:00", endTime:"14:45", location:"Video call", endDate:todayStr(2), tagIds:[teamCalendar.tags[0].id]}),
      makeItem("Release readiness", "Check release notes, support guidance, and outstanding quality checks.", {[calendarDate.id]:todayStr(5)}, {calendarType:"event", startTime:"10:00", endTime:"10:30", location:"Planning room", endDate:todayStr(5), tagIds:[teamCalendar.tags[1].id]}),
      makeItem("Customer feedback review", "Share onboarding observations and agree on follow-up actions.", {[calendarDate.id]:todayStr(8)}, {calendarType:"event", startTime:"13:00", endTime:"13:45", location:"Video call", endDate:todayStr(8), tagIds:[teamCalendar.tags[0].id]})
    );

    const calendarItems = [
      {...makeItem("Partner kickoff", "Align on goals, responsibilities, and the first delivery milestone.", {}, {calendarType:"event", startTime:"15:00", endTime:"15:45", location:"Video call", endDate:todayStr(3)}), standalone:true},
      {...makeItem("Release window", "Target window for publishing the product update.", {}, {calendarType:"event", startTime:"11:00", endTime:"11:30", location:"Remote", endDate:todayStr(10)}), standalone:true},
      {...makeItem("Language class", "Weekly evening class.", {}, {calendarType:"event", startTime:"18:30", endTime:"19:30", location:"Community learning centre", endDate:todayStr(3)}), standalone:true},
      {...makeItem("Weekend trail walk", "A relaxed morning walk with time set aside to unplug.", {}, {calendarType:"event", startTime:"09:00", endTime:"10:30", location:"Local trail", endDate:todayStr(6)}), standalone:true}
    ];
    return {schemaVersion:SCHEMA_VERSION, projects:[launch, onboarding, teamCalendar, personalPlanning], folders:[productFolder, operationsFolder, personalFolder], calendarItems, focusSessions:[], googleDeletedEventIds:[], googleCalendarLinks:[], googleCalendarCatalog:[], googleCalendarSyncTokens:{}, googleLastSyncAt:0};
  }

  global.BeforeworkDemoSeeder = Object.freeze({create:createDemoWorkspace});
})(window);

