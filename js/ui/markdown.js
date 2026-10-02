(function(global){
  "use strict";

  const renderer=global.markdownit({
    html:false,
    linkify:true,
    breaks:true
  });
  const allowedTags=[
    "a","blockquote","br","code","del","em","h1","h2","h3","h4","hr",
    "li","ol","p","pre","s","strong","ul"
  ];

  function render(value){
    const html=renderer.render(String(value??""));
    return global.DOMPurify.sanitize(html,{
      ALLOWED_TAGS:allowedTags,
      ALLOWED_ATTR:["href","title","class"]
    });
  }

  global.BeforeworkMarkdown=Object.freeze({render});
})(window);
