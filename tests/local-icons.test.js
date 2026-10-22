"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");

const root=path.join(__dirname,"..");
const index=fs.readFileSync(path.join(root,"index.html"),"utf8");
const iconPicker=fs.readFileSync(path.join(root,"js/ui/dialogs.js"),"utf8");
const build=fs.readFileSync(path.join(root,"scripts/build-site.js"),"utf8");
const buildIconData=fs.readFileSync(path.join(root,"scripts/build-icon-data.js"),"utf8");
const packageScripts=require(path.join(root,"package.json")).scripts;

test("Iconify runtime and collections are loaded locally before the app markup",()=>{
  assert.match(index,/<script src="node_modules\/iconify-icon\/dist\/iconify-icon\.min\.js"><\/script>\s*<script src="js\/vendor\/icon-data\.js"><\/script>/);
  assert.doesNotMatch(index,/code\.iconify\.design|api\.iconify\.design|api\.simplesvg\.com|api\.unisvg\.com/);
  assert.match(index,/script-src 'self'[^;]*;[^>]*connect-src 'self'[^;]*;/);
  assert.match(index,/connect-src[^;]*https:\/\/tasks\.googleapis\.com/,"Google Tasks API requests are permitted by the Content Security Policy");
  assert.match(build,/require\("\.\/build-icon-data"\)/);
  assert.ok(build.indexOf('require("./build-icon-data")')<build.indexOf('fs.rmSync(output'));
  assert.match(build,/publishPaths = \[[^\]]*"licenses"/);
  assert.match(build,/node_modules\/iconify-icon\/dist\/iconify-icon\.min\.js/);
  assert.match(buildIconData,/@iconify-json\/mdi\/icons\.json/);
  assert.match(buildIconData,/@iconify-json\/logos\/icons\.json/);
  assert.match(buildIconData,/getIconData\(logos,"google-calendar"\)/);
  assert.match(buildIconData,/iconifyIcon\.addCollection/);
  assert.match(buildIconData,/iconifyIcon\.addIcon\("logos:google-calendar"/);
  assert.match(buildIconData,/setCustomIconLoader/);
  assert.match(buildIconData,/fetch\("js\/vendor\/mdi-icons\.json"\)/);
  assert.match(buildIconData,/writeFileSync\(path\.join\(iconDirectory,"mdi-icons\.json"\)/);
  assert.match(buildIconData,/writeFileSync\(path\.join\(iconDirectory,"mdi-index\.json"\)/);
  assert.match(buildIconData,/filter\(file=>!file\.startsWith/);
  assert.match(fs.readFileSync(path.join(root,".gitignore"),"utf8"),/js\/vendor\/mdi-icons\.json/);
  assert.ok(fs.existsSync(path.join(root,"licenses/iconify-icon.LICENSE")));
  assert.ok(fs.existsSync(path.join(root,"licenses/mdi.LICENSE")));
  assert.ok(fs.existsSync(path.join(root,"licenses/logos-google-calendar.NOTICE")));
  assert.match(build,/licenseTarget:"licenses\/primer\.LICENSE"/);
  assert.match(fs.readFileSync(path.join(root,"js/vendor/icon-data.js"),"utf8"),/"width":256,"height":275,"body":/);
});

test("development and preview use npm-managed local servers",()=>{
  assert.equal(packageScripts.dev,"node scripts/serve-site.js dev");
  assert.equal(packageScripts.preview,"node scripts/serve-site.js preview");
  const server=fs.readFileSync(path.join(root,"scripts/serve-site.js"),"utf8");
  assert.match(server,/if \(mode==="dev"\) require\("\.\/build-icon-data"\)/);
  assert.match(server,/const siteRoot=mode==="dev"\?root:path\.join\(root,"dist"\)/);
  assert.match(server,/PORT\|\|8000/);
});

test("project icon search uses the locally registered MDI collection",()=>{
  assert.match(iconPicker,/fetch\("js\/vendor\/mdi-index\.json"\)/);
  assert.match(iconPicker,/local icons found/);
  assert.doesNotMatch(iconPicker,/https:\/\/api\.iconify\.design\/search/);
});
