"use strict";

const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

function createFieldTypes(){
  const root=path.join(__dirname,"../../js/core/fields");
  const sandbox={window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(root,"registry.js"),"utf8"),sandbox);
  const typeDirectory=path.join(root,"types");
  fs.readdirSync(typeDirectory).filter(file=>file.endsWith(".js")).sort().forEach(file=>{
    vm.runInNewContext(fs.readFileSync(path.join(typeDirectory,file),"utf8"),sandbox);
  });
  return sandbox.window.BeforeworkFieldTypes;
}

module.exports={createFieldTypes};
