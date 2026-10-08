(function(global){
  "use strict";

  function create({documentRef=global.document}={}){
    const root=documentRef.getElementById("appOperationStatus");
    const label=root?.querySelector("[data-operation-label]");
    const progress=root?.querySelector("[data-operation-progress]");
    const hint=root?.querySelector(".appOperationStatusHint");
    const brand=root?.querySelector(".appOperationBrand");
    const spinner=root?.querySelector(".appOperationSpinner");
    const active=new Map();
    let nextId=0;
    let startup=true;

    if (!root||!label||!progress) throw new Error("The app operation status markup is missing.");

    function render(){
      const current=[...active.values()].filter(operation=>operation.visible).pop();
      root.hidden=!startup&&!current;
      root.classList.toggle("is-startup",startup);
      if (brand) brand.hidden=!startup;
      if (hint) hint.hidden=!startup;
      if (spinner) spinner.hidden=startup||!!current?.progress;
      if (startup){
        label.textContent=current?.label||"Preparing your workspace…";
        if (hint){
          hint.hidden=false;
          hint.textContent="Getting your workspace ready";
        }
        progress.hidden=false;
        if (current?.progress&&current.progress.total>0){
          progress.max=current.progress.total;
          progress.value=current.progress.completed;
        } else {
          progress.removeAttribute("value");
        }
        return;
      }
      if (!current) return;
      label.textContent=current.label;
      if (current.progress&&current.progress.total>0){
        progress.hidden=false;
        progress.max=current.progress.total;
        progress.value=current.progress.completed;
      } else {
        progress.hidden=true;
        progress.removeAttribute("value");
      }
    }

    function begin(text,{delay=0}={}){
      const id=++nextId;
      const operation={label:text,progress:null,visible:delay===0,timer:null};
      active.set(id,operation);
      if (delay>0){
        operation.timer=global.setTimeout(()=>{
          operation.visible=true;
          render();
        },delay);
      }
      render();
      return Object.freeze({
        update(nextText,nextProgress){
          if (!active.has(id)) return;
          if (nextText) operation.label=nextText;
          operation.progress=nextProgress||null;
          operation.visible=true;
          if (operation.timer){ global.clearTimeout(operation.timer); operation.timer=null; }
          render();
        },
        finish(){
          const current=active.get(id);
          if (!current) return;
          if (current.timer) global.clearTimeout(current.timer);
          active.delete(id);
          render();
        }
      });
    }

    function finishStartup(){
      startup=false;
      render();
    }

    render();
    return Object.freeze({begin,finishStartup});
  }

  global.BeforeworkOperationStatus=Object.freeze({create});
})(window);
