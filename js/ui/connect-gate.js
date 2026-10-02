(function(global){
  "use strict";

  /* ---------- Connect gate ---------- */
  // Nothing in the app is usable until a workspace folder or legacy file is
  // connected - browser storage is only for recovery and reconnect metadata.
  
  function createConnectGate({
    documentRef=global.document,
    windowRef=global,
    getSyncStatusText,
    setSyncStatus,
    getPendingReconnectHandle,
    hasLegacyData,
    hasConnectedWorkspace,
    actions
  }){
    const element=id=>documentRef.getElementById(id);

    function show(){
      const gate=element("connectGate");
      const folderSupported="showDirectoryPicker" in windowRef;
      const fileSupported="showOpenFilePicker" in windowRef && "showSaveFilePicker" in windowRef;
      const supported=folderSupported || fileSupported;
      element("gateNewBtn").hidden=!folderSupported;
      element("gateOpenBtn").hidden=!folderSupported;
      element("gateLegacyFileBtn").hidden=!fileSupported;
      if (getSyncStatusText()==="No workspace connected."){
        setSyncStatus("No workspace folder connected. Create or open one, or choose an older JSON workspace.");
      }
      element("gateSupportedActions").style.display=supported ? "flex" : "none";
      element("gateUnsupported").style.display=supported ? "none" : "block";

      const reconnectHandle=getPendingReconnectHandle();
      const reconnectRow=element("gateReconnectRow");
      if (supported && reconnectHandle){
        reconnectRow.style.display="block";
        element("gateFileName").textContent=reconnectHandle.name;
      } else {
        reconnectRow.style.display="none";
      }

      element("gateLegacyRow").style.display=supported && hasLegacyData() ? "block" : "none";
      gate.classList.add("open");
    }

    function hide(){
      element("connectGate").classList.remove("open");
    }

    async function runFromGate(action){
      hide();
      await action();
      if (!hasConnectedWorkspace()) show();
    }

    function wire(){
      element("gateNewBtn").onclick=()=>runFromGate(actions.createWorkspace);
      element("gateOpenBtn").onclick=()=>runFromGate(actions.openWorkspace);
      element("gateLegacyFileBtn").onclick=()=>runFromGate(actions.openLegacyFile);
      element("gateReconnectBtn").onclick=actions.reconnect;
      element("gateLegacyBtn").onclick=actions.migrateLegacyData;
    }

    return Object.freeze({show,hide,wire});
  }

  global.BeforeworkConnectGate=Object.freeze({create:createConnectGate});
})(window);
