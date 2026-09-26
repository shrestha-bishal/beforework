window.ProjectifyTemplates = window.ProjectifyTemplates || {};
window.ProjectifyTemplates.overview = ({stats, main, aside}) => `
  <div class="overviewStats">
    ${stats.map(({value,label})=>`<div class="overviewStat"><div class="h2">${value}</div><div class="color-fg-muted text-small">${label}</div></div>`).join("")}
  </div>
  <div class="overviewColumns">
    <div class="overviewMain">${main}</div>
    <aside class="overviewAside">${aside}</aside>
  </div>
`;
