(function(global){
  "use strict";

/* ---------- Schema migrations ----------
    Every saved file carries a schemaVersion. On load we walk it forward
    one step at a time through MIGRATIONS until it reaches SCHEMA_VERSION.
    Each step assumes its input is exactly the previous version's shape -
    rules:
    1. Never delete a property here. If a field is retired, just stop
        reading it in the app; leave it sitting in the JSON so an
        incorrect migration can still be recovered from.
    2. Keep steps small and defensive (Array.isArray / ?? guards) so a
        hand-edited or partially-corrupt import doesn't throw.
    3. Once shipped, a step's body doesn't change - add a new step
        instead of editing an old one. */
  function createSchemaMigration({uid}){
    const migrations = {
      1: state=>{
        const globalTags = state.tags || [];
        state.projects.forEach(project=>{
          if (!Array.isArray(project.tags)) project.tags = globalTags.map(tag=>({id:tag.id, name:tag.name, color:tag.color}));
          if (!Array.isArray(project.fields)){
            const priority = {id:uid(), label:"Priority", type:"priority", options:[]};
            const dueDate = {id:uid(), label:"Due date", type:"date", options:[]};
            project.fields = [priority, dueDate];
            project.groups.forEach(group=>group.items.forEach(item=>{
              item.values = item.values || {};
              if (item.priority) item.values[priority.id] = item.priority;
              if (item.dueDate) item.values[dueDate.id] = item.dueDate;
              delete item.priority;
              delete item.dueDate;
            }));
          }
        });
        delete state.tags;
        return state;
      },
      2: state=>{
        state.projects.forEach(project=>project.groups.forEach(group=>group.items.forEach(item=>{
          item.values = item.values || {};
          item.subitems = Array.isArray(item.subitems) ? item.subitems : [];
          item.tagIds = Array.isArray(item.tagIds) ? item.tagIds : [];
          item.calendarType = item.calendarType === "event" ? "event" : "task";
          item.startTime = item.startTime || "";
          item.endTime = item.endTime || "";
          item.location = item.location || "";
          item.endDate = item.endDate || "";
        })));
        return state;
      },
      3: state=>{
        state.projects.forEach(project=>project.groups.forEach(group=>group.items.forEach(item=>{
          item.comments = Array.isArray(item.comments) ? item.comments : [];
          item.archived = !!item.archived;
        })));
        return state;
      },
      4: state=>{
        state.projects.forEach(project=>{
          if (!Array.isArray(project.views) || !project.views.length){
            project.views = [
              {id:uid(), type:"list", name:"List"},
              {id:uid(), type:"kanban", name:"Board"},
              {id:uid(), type:"calendar", name:"Calendar"}
            ];
          }
          if (!project.activeViewId || !project.views.some(view=>view.id===project.activeViewId)) project.activeViewId = project.views[0].id;
          if (project.itemDefaultType !== "event") project.itemDefaultType = "task";
        });
        return state;
      },
      5: state=>{
        if (!Array.isArray(state.folders)) state.folders = [];
        state.projects.forEach(project=>{
          if (!Object.prototype.hasOwnProperty.call(project, "folderId")) project.folderId = null;
        });
        return state;
      },
      6: state=>{
        if (!Array.isArray(state.focusSessions)) state.focusSessions = [];
        return state;
      },
      7: state=>{
        state.projects.forEach(project=>project.groups.forEach(group=>group.items.forEach(item=>{
          if (Object.prototype.hasOwnProperty.call(item,"completedAt")) return;
          const wasInDoneGroup = item.calendarType!=="event" && String(group.name||"").trim().toLowerCase()==="done";
          item.completedAt = wasInDoneGroup
            ? (Number.isFinite(item.updatedAt) ? item.updatedAt : Date.now())
            : null;
        })));
        return state;
      },
      8: state=>{
        state.projects.forEach(project=>{
          if (!Array.isArray(project.fields)) project.fields=[];
          project.fields.forEach(field=>{
            if (field.type!=="date") return;
            const label=String(field.label||"").trim().toLowerCase();
            if (/^(start|start date|starts on)$/.test(label)) field.type="start-date";
            else if (/^(due|due date|deadline)$/.test(label)) field.type="due-date";
          });
          const groups=Array.isArray(project.groups)?project.groups:[];
          const items=groups.flatMap(group=>Array.isArray(group.items)?group.items:[]);
          const startField=project.fields.find(field=>field.type==="start-date");
          const itemsWithLegacyStart=items.filter(item=>item.calendarType!=="event"&&typeof item.startDate==="string"&&item.startDate);
          if (!startField&&itemsWithLegacyStart.length){
            const field={id:uid(),label:"Start date",type:"start-date",options:[]};
            project.fields.push(field);
            itemsWithLegacyStart.forEach(item=>{
              if (!item.values||typeof item.values!=="object"||Array.isArray(item.values)) item.values={};
              item.values[field.id]=item.startDate;
            });
          }else if (startField){
            itemsWithLegacyStart.forEach(item=>{
              if (!item.values||typeof item.values!=="object"||Array.isArray(item.values)) item.values={};
              if (!item.values[startField.id]) item.values[startField.id]=item.startDate;
            });
          }
        });
        return state;
      }
    };
    const schemaVersion = Math.max(...Object.keys(migrations).map(Number));
    const backupKey = "personal_dashboard_pre_migration_backup_v1";
    let lastMigrationInfo = null;

    function migrate(raw, createDefaultState){
      if (!raw || !Array.isArray(raw.projects)) return createDefaultState();
      let version = Number.isInteger(raw.schemaVersion) ? raw.schemaVersion : 0;
      const fromVersion = version;
      if (version < schemaVersion){
        try{ global.localStorage.setItem(backupKey, JSON.stringify({savedAt:Date.now(), fromVersion:version, data:raw})); }catch(err){/* storage full - proceed anyway */}
      }
      let state = raw;
      state.projects = state.projects.filter(Boolean).map(project=>({
        ...project,
        groups:(Array.isArray(project.groups) ? project.groups : [{id:uid(), name:"Items", items:[]}])
          .filter(Boolean)
          .map(group=>({...group, items:Array.isArray(group.items) ? group.items.filter(Boolean) : []}))
      }));
      while (version < schemaVersion){
        version += 1;
        const migrateStep = migrations[version];
        if (!migrateStep) break;
        state = migrateStep(state);
      }
      if (!Array.isArray(state.folders)) state.folders = [];
      if (!Array.isArray(state.calendarItems)) state.calendarItems = [];
      if (!Array.isArray(state.focusSessions)) state.focusSessions = [];
      if (!Array.isArray(state.googleDeletedEventIds)) state.googleDeletedEventIds = [];
      if (!Array.isArray(state.googleCalendarLinks)) state.googleCalendarLinks = [];
      if (!Array.isArray(state.googleCalendarCatalog)) state.googleCalendarCatalog = [];
      if (!state.googleCalendarSyncTokens || typeof state.googleCalendarSyncTokens!=="object" || Array.isArray(state.googleCalendarSyncTokens)) state.googleCalendarSyncTokens = {};
      if (!Number.isFinite(state.googleLastSyncAt)) state.googleLastSyncAt = 0;
      state.projects.forEach(project=>project.groups.forEach(group=>group.items.forEach(item=>{
        if (!Number.isFinite(item.completedAt) || item.completedAt<=0) item.completedAt = null;
        if (!Array.isArray(item.activity)) item.activity = [{id:uid(), type:"created", at:Number.isFinite(item.createdAt) ? item.createdAt : Date.now()}];
      })));
      state.calendarItems.forEach(item=>{
        if (!Array.isArray(item.activity)) item.activity = [{id:uid(), type:"created", at:Number.isFinite(item.createdAt) ? item.createdAt : Date.now()}];
      });
      state.schemaVersion = schemaVersion;
      if (fromVersion < schemaVersion) lastMigrationInfo = {fromVersion, toVersion:schemaVersion};
      return state;
    }

    function takeMigrationInfo(){
      const info = lastMigrationInfo;
      lastMigrationInfo = null;
      return info;
    }
    function hasBackup(){
      try{ return !!global.localStorage.getItem(backupKey); }catch(err){ return false; }
    }
    function readBackup(){
      try{ return JSON.parse(global.localStorage.getItem(backupKey) || "null"); }catch(err){ return null; }
    }

    return Object.freeze({version:schemaVersion, migrate, takeMigrationInfo, hasBackup, readBackup});
  }

  global.BeforeworkSchemaMigration = Object.freeze({create:createSchemaMigration});
})(window);
