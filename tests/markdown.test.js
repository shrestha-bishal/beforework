"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");
const MarkdownIt=require("markdown-it");
const appScripts=require("./helpers/app-script-order");

const root=path.join(__dirname,"..");
const source=fs.readFileSync(path.join(root,"js/ui/markdown.js"),"utf8");
const appSource=fs.readFileSync(path.join(root,"js/app.js"),"utf8");
const calendarSource=fs.readFileSync(path.join(root,"js/views/calendar-view.js"),"utf8");
const roadmapSource=fs.readFileSync(path.join(root,"js/views/roadmap-view.js"),"utf8");

function createRenderer(){
  const options=[];
  const sanitizeCalls=[];
  const window={
    markdownit:settings=>{
      options.push(settings);
      return new MarkdownIt(settings);
    },
    DOMPurify:{
      sanitize:(html,settings)=>{
        sanitizeCalls.push({html,settings});
        return html;
      }
    }
  };
  vm.runInNewContext(source,{window},{filename:"markdown.js"});
  return {renderer:window.BeforeworkMarkdown,options,sanitizeCalls};
}

test("Markdown renderer supports common formatting and sanitizes generated HTML",()=>{
  const {renderer,options,sanitizeCalls}=createRenderer();
  const html=renderer.render("# Release notes\n\n**Ready** with `code`.\n\n- First\n- Second");

  assert.match(html,/<h1>Release notes<\/h1>/);
  assert.match(html,/<strong>Ready<\/strong>/);
  assert.match(html,/<code>code<\/code>/);
  assert.match(html,/<ul>/);
  assert.equal(options[0].html,false);
  assert.equal(options[0].linkify,true);
  assert.equal(sanitizeCalls.length,1);
  assert.ok(sanitizeCalls[0].settings.ALLOWED_TAGS.includes("a"));
  assert.ok(sanitizeCalls[0].settings.ALLOWED_TAGS.includes("input"));
  assert.ok(sanitizeCalls[0].settings.ALLOWED_ATTR.includes("checked"));
  assert.ok(sanitizeCalls[0].settings.ALLOWED_ATTR.includes("disabled"));
  assert.ok(!sanitizeCalls[0].settings.ALLOWED_TAGS.includes("img"));
  assert.ok(!sanitizeCalls[0].settings.ALLOWED_ATTR.includes("onerror"));
});

test("task list Markdown renders disabled checked and unchecked checkboxes",()=>{
  const {renderer}=createRenderer();
  const html=renderer.render("- [ ] Not done\n- [x] Done\n- Regular item");

  assert.match(html,/<input class="markdownTaskCheckbox" type="checkbox" disabled> /);
  assert.match(html,/<input class="markdownTaskCheckbox" type="checkbox" disabled checked> /);
  assert.match(html,/<ul class="contains-task-list">/);
  assert.match(html,/<li class="task-list-item">/);
  assert.match(html,/<li>Regular item<\/li>/);
  assert.doesNotMatch(html,/\[ \]|\[x\]/);
});

test("raw HTML and unsafe link protocols are not emitted as active markup",()=>{
  const {renderer,sanitizeCalls}=createRenderer();
  const html=renderer.render('<img src=x onerror="alert(1)">\n\n[unsafe](javascript:alert(1))');

  assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
  assert.doesNotMatch(html,/<img\b/i);
  assert.doesNotMatch(html,/href="javascript:/i);
  assert.equal(sanitizeCalls.length,1);
});

test("Markdown libraries are loaded locally in source and copied into production output",()=>{
  const index=fs.readFileSync(path.join(root,"index.html"),"utf8");
  const build=fs.readFileSync(path.join(root,"scripts/build-site.js"),"utf8");

  assert.match(index,/node_modules\/markdown-it\/dist\/browser\/markdown-it\.umd\.min\.js/);
  assert.match(index,/node_modules\/dompurify\/dist\/purify\.min\.js/);
  assert.ok(index.indexOf("purify.min.js")<index.indexOf('src="js/dev-loader.js"'));
  assert.ok(appScripts.indexOf("ui/markdown.js")>=0);
  assert.match(build,/vendor\/markdown-it\.min\.js/);
  assert.match(build,/vendor\/purify\.min\.js/);
});

test("item descriptions, comments, Calendar, and Roadmap use the shared Markdown renderer",()=>{
  assert.match(appSource,/body:window\.BeforeworkMarkdown\.render\(comment\.text\)/);
  assert.match(appSource,/BeforeworkMarkdown\.render\(descriptionInput\.value\)/);
  assert.match(appSource,/e\.key==="Enter"&&\(e\.ctrlKey\|\|e\.metaKey\)/);
  assert.match(calendarSource,/BeforeworkMarkdown\.render\(details\.description\)/);
  assert.match(roadmapSource,/BeforeworkMarkdown\.render\(row\.description\)/);
});
