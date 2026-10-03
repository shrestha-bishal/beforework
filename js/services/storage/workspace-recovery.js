(function(global){
  "use strict";

  function create({
    getState,setState,isConnected,getSchemaVersion,migrateState,schemaMigration,
    storage,validation,showNotice,showConfirm,onWorkspaceReplaced
  }){
    async function maybeShowMigrationNotice(){
      const info=schemaMigration.takeMigrationInfo();
      if (!info) return;
      await showNotice("Beforework data upgraded",
        "This file was saved by an older version of Beforework (format v" + info.fromVersion + ") and has been upgraded to the current format (v" + info.toVersion + "). " +
        "A copy of the pre-upgrade data was saved automatically. Use 'Restore pre-upgrade backup' in the storage menu at the bottom if anything looks off.");
    }

    function hasMigrationBackup(){
      return schemaMigration.hasBackup();
    }

    function exportJSON(){
      const blob=new global.Blob([JSON.stringify(getState(),null,2)],{type:"application/json"});
      const link=global.document.createElement("a");
      link.href=global.URL.createObjectURL(blob);
      link.download="beforework-data.json";
      link.click();
      global.URL.revokeObjectURL(link.href);
    }

    function exportRecoverySnapshot(snapshotId){
      const snapshot=storage.getRecoverySnapshots().find(entry=>entry.id===snapshotId);
      if (!snapshot) return;
      const blob=new global.Blob([snapshot.data],{type:"application/json"});
      const url=global.URL.createObjectURL(blob);
      const link=global.document.createElement("a");
      link.href=url;
      link.download=`beforework-recovery-${new Date(snapshot.savedAt).toISOString().replace(/[:.]/g,"-")}.json`;
      link.click();
      global.setTimeout(()=>global.URL.revokeObjectURL(url),1000);
    }

    async function restoreMigrationBackup(){
      const saved=schemaMigration.readBackup();
      if (!saved){
        await showNotice("No backup found","There is no pre-migration backup saved in this browser.");
        return;
      }
      const when=new Date(saved.savedAt).toLocaleString();
      if (!await showConfirm("Restore pre-migration data","This replaces your current data with the version saved automatically on " + when + ", just before it was last upgraded (from schema v" + saved.fromVersion + "). This cannot be undone with Ctrl+Z.")) return;
      const result=validation.validate(saved.data,getSchemaVersion());
      if (!result.valid){
        await showNotice("Couldn't restore pre-migration data",result.errors.join(" "));
        return;
      }
      try{
        await storage.saveRecoverySnapshot(JSON.stringify(getState()),"pre-migration-restore");
      }catch(error){
        await showNotice("Couldn't protect current workspace",error.message);
        return;
      }
      setState({...saved.data,schemaVersion:saved.fromVersion});
      onWorkspaceReplaced("migration-restore");
    }

    async function restoreRecoverySnapshot(snapshotId){
      const snapshot=storage.getRecoverySnapshots().find(entry=>entry.id===snapshotId);
      if (!snapshot){
        await showNotice("No recovery snapshot","Beforework has not saved a recovery snapshot for this workspace yet.");
        return;
      }
      const when=new Date(snapshot.savedAt).toLocaleString();
      if (!await showConfirm("Restore recovery snapshot",`This replaces the connected workspace with the snapshot from ${when}. A snapshot of the current workspace will be saved first.`)) return;
      try{
        const parsed=JSON.parse(snapshot.data);
        const result=validation.validate(parsed,getSchemaVersion());
        if (!result.valid) throw new Error(result.errors.join(" "));
        await storage.saveRecoverySnapshot(JSON.stringify(getState()),"pre-restore");
        setState(migrateState(parsed));
        onWorkspaceReplaced("recovery-restore");
      }catch(error){
        await showNotice("Couldn't restore recovery snapshot",error.message);
      }
    }

    async function importJSON(file){
      if (!isConnected()){
        await showNotice("Connect a file first","Import replaces the data in your connected file - connect or create one first.");
        return;
      }
      try{
        const parsed=JSON.parse(await file.text());
        const result=validation.validate(parsed,getSchemaVersion());
        if (!result.valid) throw new Error(result.errors.join(" "));
        if (!await showConfirm("Replace workspace data","The imported file will replace the current workspace. A recovery snapshot of the current workspace will be saved first.")) return;
        await storage.saveRecoverySnapshot(JSON.stringify(getState()),"pre-import");
        setState(migrateState(parsed));
        onWorkspaceReplaced("import");
        await maybeShowMigrationNotice();
      }catch(error){
        await showNotice("Import failed","Could not read that file: " + error.message);
      }
    }

    return Object.freeze({
      maybeShowMigrationNotice,hasMigrationBackup,exportJSON,exportRecoverySnapshot,
      restoreMigrationBackup,restoreRecoverySnapshot,importJSON
    });
  }

  global.BeforeworkWorkspaceRecovery=Object.freeze({create});
})(window);
