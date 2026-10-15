(function(global){
  "use strict";

  const THEME_KEY = "personal_dashboard_theme_v1";

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

  global.BeforeworkAppearance = Object.freeze({
    initTheme,
    toggleTheme
  });
})(window);
