(function(global){
  "use strict";

  function create({getProjectId, onSessionComplete, onFinished, onOpen, loadTemplate, cloneTemplate, documentRef=global.document, now=Date.now, setIntervalFn=global.setInterval, clearIntervalFn=global.clearInterval}){
    let intervalId = null;
    let mode = "focus";
    let seconds = 25*60;
    let total = 25*60;
    let focusDuration = 25*60;
    let breakDuration = 5*60;
    let sessionStartedAt = null;
    let sessionProjectId = null;
    let sessionElapsedSeconds = 0;

    function render(){
      const display = documentRef.getElementById("focusTimerDisplay");
      if (!display) return;
      const minutes = Math.floor(seconds/60), remainder = seconds%60;
      display.textContent = `${String(minutes).padStart(2,"0")}:${String(remainder).padStart(2,"0")}`;
      documentRef.title = intervalId ? `${display.textContent} · Beforework` : "Beforework";
    }

    function clearSession(){
      sessionStartedAt = null;
      sessionProjectId = null;
      sessionElapsedSeconds = 0;
    }

    function completeSession(){
      if (sessionElapsedSeconds>0){
        const completedAt = now();
        onSessionComplete({
          projectId:sessionProjectId,
          startedAt:sessionStartedAt || completedAt,
          completedAt,
          durationSeconds:sessionElapsedSeconds
        });
      }
      clearSession();
    }

    function pause(){
      if (intervalId!==null){ clearIntervalFn(intervalId); intervalId=null; }
      const startButton = documentRef.getElementById("focusStartBtn");
      if (startButton) startButton.textContent = "Start";
      render();
    }

    function start(){
      if (intervalId!==null || seconds<=0) return;
      if (mode==="focus" && sessionStartedAt===null){
        sessionStartedAt = now();
        sessionProjectId = getProjectId();
        sessionElapsedSeconds = 0;
      }
      intervalId = setIntervalFn(()=>{
        seconds = Math.max(0,seconds-1);
        if (mode==="focus") sessionElapsedSeconds++;
        if (seconds<=0){
          clearIntervalFn(intervalId);
          intervalId=null;
          if (mode==="focus") completeSession();
          const startButton = documentRef.getElementById("focusStartBtn");
          if (startButton) startButton.textContent = "Start";
          render();
          onFinished(mode);
          return;
        }
        render();
      },1000);
      const startButton = documentRef.getElementById("focusStartBtn");
      if (startButton) startButton.textContent = "Pause";
      render();
    }

    function reset(){
      pause();
      clearSession();
      seconds=total;
      render();
    }

    function renderQuickOptions(){
      const container = documentRef.getElementById("focusTimerQuickOptions");
      if (!container) return;
      const options = mode==="focus" ? [25,50,90] : [5,10,15];
      const currentMinutes = total/60;
      container.innerHTML = options.map(minutes=>
        `<button class="btn btn-sm${minutes===currentMinutes?" selected":""}" type="button" data-focus-quick="${minutes}" aria-label="${minutes} minute ${mode}" aria-pressed="${minutes===currentMinutes}">${minutes}m</button>`
      ).join("");
      container.querySelectorAll("[data-focus-quick]").forEach(button=>{
        button.onclick = () => setDuration(Number(button.dataset.focusQuick));
      });
    }

    function setDuration(minutes){
      pause();
      clearSession();
      total = minutes*60;
      if (mode==="focus") focusDuration=total;
      else breakDuration=total;
      seconds=total;
      const input = documentRef.getElementById("focusDurationInput");
      input.setCustomValidity("");
      input.value="";
      input.placeholder=String(minutes);
      render();
      renderQuickOptions();
    }

    function setMode(nextMode){
      if (nextMode!=="focus" && nextMode!=="break") return;
      if (mode===nextMode) return;
      pause();
      clearSession();
      mode=nextMode;
      total=mode==="focus" ? focusDuration : breakDuration;
      seconds=total;
      const input = documentRef.getElementById("focusDurationInput");
      input.value="";
      input.placeholder=String(total/60);
      input.setCustomValidity("");
      documentRef.querySelectorAll("[data-focus-mode]").forEach(button=>{
        const selected = button.dataset.focusMode===mode;
        button.classList.toggle("selected",selected);
        button.setAttribute("aria-pressed",String(selected));
      });
      render();
      renderQuickOptions();
    }

    function applyCustomDuration(){
      const input = documentRef.getElementById("focusDurationInput");
      const minutes = input.valueAsNumber;
      if (!Number.isInteger(minutes) || minutes<1 || minutes>180){
        input.setCustomValidity("Enter a whole number from 1 to 180.");
        input.reportValidity();
        return;
      }
      input.setCustomValidity("");
      setDuration(minutes);
    }

    function setPanelOpen(open){
      const panel = documentRef.getElementById("focusTimerPanel");
      const nav = documentRef.getElementById("focusTimerNav");
      if (!panel || !nav) return;
      panel.classList.toggle("open",open);
      nav.classList.toggle("active",open);
      nav.setAttribute("aria-expanded",String(open));
      if (open) onOpen();
    }

    function togglePanel(){
      const panel = documentRef.getElementById("focusTimerPanel");
      if (panel) setPanelOpen(!panel.classList.contains("open"));
    }

    async function init(){
      await loadTemplate("focusTimer");
      const mount = documentRef.getElementById("focusTimerMount");
      mount.replaceWith(cloneTemplate("focusTimer"));
      documentRef.getElementById("focusTimerNav").onclick=togglePanel;
      documentRef.getElementById("focusTimerCloseBtn").onclick=()=>setPanelOpen(false);
      documentRef.getElementById("focusStartBtn").onclick=()=>{
        if (intervalId!==null) pause();
        else start();
      };
      documentRef.getElementById("focusResetBtn").onclick=reset;
      documentRef.getElementById("focusDurationApplyBtn").onclick=applyCustomDuration;
      documentRef.getElementById("focusDurationInput").addEventListener("input",event=>event.target.setCustomValidity(""));
      documentRef.getElementById("focusDurationInput").addEventListener("keydown",event=>{
        if (event.key==="Enter"){ event.preventDefault(); applyCustomDuration(); }
      });
      documentRef.querySelectorAll("[data-focus-mode]").forEach(button=>{
        button.onclick=()=>setMode(button.dataset.focusMode);
      });
      renderQuickOptions();
      render();
    }

    return Object.freeze({init,togglePanel});
  }

  global.BeforeworkFocusTimer=Object.freeze({create});
})(window);
