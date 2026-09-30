window.BeforeworkViewTemplates = (()=>{
  const paths = {
    overview:"pages/overview.html",
    calendar:"pages/calendar.html",
    integrations:"pages/integrations.html",
    settings:"pages/settings.html",
    support:"pages/support.html"
  };
  const templates = {};
  let loadPromise = null;

  function isSafePath(path){
    return /^pages\/[a-zA-Z0-9_-]+\.html$/.test(path) && !path.includes("..");
  }

  function loadAll(){
    if (loadPromise) return loadPromise;
    loadPromise = Promise.all(Object.entries(paths).map(async([name,path])=>{
      if (!isSafePath(path)) throw new Error(`Refusing to load unsafe path: ${path}`);
      const response = await fetch(path);
      if (!response.ok) throw new Error(`Couldn't load ${path} (${response.status})`);
      const template = document.createElement("template");
      template.innerHTML = await response.text();
      templates[name] = template;
    }));
    return loadPromise;
  }

  function clone(name){
    const template = templates[name];
    if (!template) throw new Error(`View template "${name}" hasn't loaded`);
    return template.content.cloneNode(true);
  }

  return {loadAll,clone};
})();
