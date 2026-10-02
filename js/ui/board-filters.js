(function(global){
  "use strict";

  function createBoardFilters({
    documentRef=global.document,
    onSearchChange,
    onClear,
    onSelectCategory
  }){
    const element=id=>documentRef.getElementById(id);

    function closePanel(){
      element("filterPanel").classList.remove("open");
      element("toggleFilters").classList.remove("active");
    }

    function clearFilters(){
      onClear();
    }

    function wire(){
      element("boardSearch").addEventListener("input",event=>{
        onSearchChange(event.target.value);
      });
      element("clearBoardFilters").onclick=clearFilters;
      element("filterPanelClear").onclick=clearFilters;

      element("toggleFilters").onclick=()=>{
        const isOpen=element("filterPanel").classList.toggle("open");
        element("toggleFilters").classList.toggle("active",isOpen);
      };
      element("closeFilters").onclick=closePanel;
      element("filterPanelDone").onclick=closePanel;

      element("filterCategoryList").addEventListener("click",event=>{
        const button=event.target.closest("[data-filter-category]");
        if (!button || !element("filterCategoryList").contains(button)) return;

        onSelectCategory(button.dataset.filterCategory);
        documentRef.querySelectorAll("[data-filter-category]").forEach(item=>{
          item.classList.toggle("active",item===button);
        });
        documentRef.querySelectorAll("#filterOptions > div").forEach(section=>{
          section.classList.toggle(
            "active",
            section.id===button.dataset.filterCategory ||
              (button.dataset.filterCategory.startsWith("field:") && section.id==="fieldFilters")
          );
        });
      });

      documentRef.addEventListener("click",event=>{
        const panel=element("filterPanel");
        if (
          panel.classList.contains("open") &&
          !event.target.closest("#filterPanel") &&
          !event.target.closest("#toggleFilters")
        ){
          closePanel();
        }
      });
    }

    return Object.freeze({wire});
  }

  global.BeforeworkBoardFilters=Object.freeze({create:createBoardFilters});
})(window);
