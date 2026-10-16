(function(){
  "use strict";

  const VIEW_MODULE_SPECS = [
    "./views/settings-view.js",
    "./views/overview-details-view.js",
    "./models/overview-details-model.js",
    "./views/milestones-view.js",
    "./views/documents-view.js",
    "./views/workspace-documents-view.js",
    "./views/roadmap-view.js",
    "./views/overview-view.js",
    "./views/list-view.js",
    "./views/table-view.js",
    "./views/board-view.js",
    "./views/calendar-view.js",
    "./views/collection-view.js"
  ];

  let viewModulesPromise = null;
  let navigationViewPromise = null;
  let startPromise = null;

  function loadViewModules(){
    if (!viewModulesPromise){
      viewModulesPromise = Promise.all(VIEW_MODULE_SPECS.map(spec => import(spec)));
    }
    return viewModulesPromise;
  }

  function loadNavigationView(){
    if (!navigationViewPromise){
      navigationViewPromise=import("./views/navigation-view.js");
    }
    return navigationViewPromise;
  }

  function start(){
    if (!window.BeforeworkApp || typeof window.BeforeworkApp.start !== "function"){
      throw new Error("The application must be loaded before bootstrap starts.");
    }
    if (!startPromise){
      startPromise = window.BeforeworkApp.start({loadViewModules,loadNavigationView});
    }
    return startPromise;
  }

  window.BeforeworkBootstrap = {start};
  start();
})();
