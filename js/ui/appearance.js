(function(global){
  "use strict";

  const THEME_KEY = "personal_dashboard_theme_v1";
  const SIDEBAR_KEY = "personal_dashboard_sidebar_collapsed_v1";

  function applyTheme(theme){
    global.document.documentElement.setAttribute("data-theme", theme);
    global.document.documentElement.setAttribute("data-color-mode", theme==="dark" ? "dark" : "light");
    const button = global.document.getElementById("themeToggle");
    if (button) button.textContent = theme==="dark" ? "☀️" : "🌙";
    try{ global.localStorage.setItem(THEME_KEY, theme); }catch(err){/* ignore */}
  }

  function toggleTheme(){
    const current = global.document.documentElement.getAttribute("data-theme")==="dark" ? "dark" : "light";
    applyTheme(current==="dark" ? "light" : "dark");
  }

  function initTheme(){
    let saved = null;
    try{ saved = global.localStorage.getItem(THEME_KEY); }catch(err){/* ignore */}
    const prefersDark = global.matchMedia && global.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(saved || (prefersDark ? "dark" : "light"));
  }

  function applySidebarCollapsed(collapsed){
    const sidebar = global.document.getElementById("sidebar");
    const handle = global.document.getElementById("sidebarCollapseHandle");
    sidebar.classList.toggle("collapsed", collapsed);
    handle.textContent = collapsed ? "›" : "‹";
    handle.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
    handle.setAttribute("aria-label", handle.title);
    try{ global.localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0"); }catch(err){/* ignore */}
  }

  function toggleSidebarCollapsed(){
    const sidebar = global.document.getElementById("sidebar");
    applySidebarCollapsed(!sidebar.classList.contains("collapsed"));
  }

  function initSidebarCollapse(){
    let saved = null;
    try{ saved = global.localStorage.getItem(SIDEBAR_KEY); }catch(err){/* ignore */}
    applySidebarCollapsed(saved === "1");
  }

  global.BeforeworkAppearance = Object.freeze({
    applySidebarCollapsed,
    initSidebarCollapse,
    initTheme,
    toggleSidebarCollapsed,
    toggleTheme
  });
})(window);
