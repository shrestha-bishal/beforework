(function(global){
  "use strict";

  const renderer=global.markdownit({
    html:false,
    linkify:true,
    breaks:true
  });
  renderer.core.ruler.push("taskLists",state=>{
    const listStack=[];
    const itemStack=[];
    for (const token of state.tokens){
      if (token.type==="bullet_list_open"||token.type==="ordered_list_open"){
        listStack.push(token);
      }else if (token.type==="bullet_list_close"||token.type==="ordered_list_close"){
        listStack.pop();
      }else if (token.type==="list_item_open"){
        itemStack.push(token);
      }else if (token.type==="list_item_close"){
        itemStack.pop();
      }else if (token.type==="inline"&&itemStack.length&&listStack.length&&token.children?.length){
        const first=token.children[0];
        if (first.type!=="text") continue;
        const taskMarker=first.content.match(/^\[([ xX])\](?:\s+|$)/);
        if (!taskMarker) continue;
        const checked=taskMarker[1].toLowerCase()==="x";
        const list=listStack[listStack.length-1];
        const item=itemStack[itemStack.length-1];
        if (!(list.attrGet("class")||"").split(/\s+/).includes("contains-task-list")){
          list.attrJoin("class","contains-task-list");
        }
        if (!(item.attrGet("class")||"").split(/\s+/).includes("task-list-item")){
          item.attrJoin("class","task-list-item");
        }
        first.content=first.content.slice(taskMarker[0].length);
        token.children.unshift({
          type:"html_inline",
          content:`<input class="markdownTaskCheckbox" type="checkbox" disabled${checked?" checked":""}> `
        });
      }
    }
  });
  const allowedTags=[
    "a","blockquote","br","code","del","em","h1","h2","h3","h4","hr",
    "input","li","ol","p","pre","s","strong","ul"
  ];

  function render(value){
    const html=renderer.render(String(value??""));
    return global.DOMPurify.sanitize(html,{
      ALLOWED_TAGS:allowedTags,
      ALLOWED_ATTR:["checked","disabled","href","title","type","class"]
    });
  }

  global.BeforeworkMarkdown=Object.freeze({render});
})(window);
