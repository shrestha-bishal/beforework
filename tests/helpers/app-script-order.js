"use strict";

const fs=require("node:fs");
const path=require("node:path");

const manifest=fs.readFileSync(path.join(__dirname,"../../js/manifest.js"),"utf8");
module.exports=[...manifest.matchAll(/^import\s+["']\.\/([^"']+)["'];\s*$/gm)].map(([,file])=>file);
