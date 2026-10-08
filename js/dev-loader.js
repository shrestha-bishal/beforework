(function(global){
  "use strict";

  const manifestUrl=new URL("./manifest.js",document.currentScript.src);
  let loadPromise=null;

  function load(){
    if (loadPromise) return loadPromise;
    loadPromise=fetch(manifestUrl).then(response=>{
      if (!response.ok) throw new Error(`Application manifest request failed (${response.status}).`);
      return response.text();
    }).then(source=>{
      const imports=[...source.matchAll(/^import\s+["']\.\/([^"']+)["'];\s*$/gm)].map(([,file])=>file);
      if (!imports.length || source.replace(/^import\s+["']\.\/[^"']+["'];\s*$/gm,"").trim()){
        throw new Error("The application manifest must contain only ordered relative imports.");
      }
      if (new Set(imports).size!==imports.length) throw new Error("The application manifest contains duplicate scripts.");
      return imports.reduce((queue,file)=>queue.then(()=>new Promise((resolve,reject)=>{
        if (!/^[a-zA-Z0-9_/-]+\.js$/.test(file)||file.includes("..")){
          reject(new Error(`Application manifest contains an unsafe path: ${file}`));
          return;
        }
        const script=document.createElement("script");
        script.src=new URL(file,manifestUrl).href;
        script.async=false;
        script.onload=resolve;
        script.onerror=()=>reject(new Error(`Application script failed to load: ${file}`));
        document.head.appendChild(script);
      })),Promise.resolve());
    });
    return loadPromise;
  }

  global.BeforeworkDevLoader=Object.freeze({load});
  load().catch(error=>console.error("Application source loading failed.",error));
})(window);
