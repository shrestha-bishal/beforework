window.BeforeworkViewTemplates = (()=>{
  const startupPaths = {
    overview:"pages/overview.html",
    calendar:"pages/calendar.html",
    integrations:"pages/integrations.html",
    milestones:"pages/milestones.html",
    settings:"pages/settings.html",
    support:"pages/support.html"
  };
  const onDemandPaths = {
    dialogs:"pages/dialogs.html",
    overviewDetails:"pages/overview-details.html",
    commandPalette:"pages/command-palette.html",
    csvImport:"pages/csv-import.html"
  };
  const paths = {...startupPaths,...onDemandPaths};
  const templates = {};
  const templateLoads = {};
  let loadAllPromise = null;

  function isSafePath(path){
    return /^pages\/[a-zA-Z0-9_-]+\.html$/.test(path) && !path.includes("..");
  }

  function load(name){
    const path=paths[name];
    if (!path) return Promise.reject(new Error(`Unknown view template: ${name}`));
    if (templates[name]) return Promise.resolve();
    if (templateLoads[name]) return templateLoads[name];
    templateLoads[name]=(async()=>{
      if (!isSafePath(path)) throw new Error(`Refusing to load unsafe path: ${path}`);
      const response = await fetch(path);
      if (!response.ok) throw new Error(`Couldn't load ${path} (${response.status})`);
      const template = document.createElement("template");
      template.innerHTML = await response.text();
      templates[name] = template;
    })().catch(error=>{
      delete templateLoads[name];
      throw error;
    });
    return templateLoads[name];
  }

  function loadAll(){
    if (loadAllPromise) return loadAllPromise;
    loadAllPromise=Promise.all(Object.keys(startupPaths).map(load)).catch(error=>{
      loadAllPromise=null;
      throw error;
    });
    return loadAllPromise;
  }

  function clone(name){
    const template = templates[name];
    if (!template) throw new Error(`View template "${name}" hasn't loaded`);
    return template.content.cloneNode(true);
  }

  return {load,loadAll,clone};
})();
