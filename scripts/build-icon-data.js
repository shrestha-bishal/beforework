"use strict";

const fs=require("node:fs");
const path=require("node:path");
const {getIconData}=require("@iconify/utils");

const root=path.resolve(__dirname,"..");
const mdi=require("@iconify-json/mdi/icons.json");
const logos=require("@iconify-json/logos/icons.json");
const googleCalendar=getIconData(logos,"google-calendar");
if (!googleCalendar) throw new Error("The local SVG Logos collection is missing google-calendar.");

function listFiles(directory){
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    const entryPath=path.join(directory,entry.name);
    return entry.isDirectory()?listFiles(entryPath):[entryPath];
  });
}

const staticIconNames=new Set();
const sourceFiles=[...listFiles(path.join(root,"js")),...listFiles(path.join(root,"pages"))]
  .filter(file=>/\.(?:js|html)$/i.test(file))
  .filter(file=>!file.startsWith(`${path.join(root,"js","vendor")}${path.sep}`));
for (const file of sourceFiles){
  for (const [,name] of fs.readFileSync(file,"utf8").matchAll(/\bmdi:([a-z0-9-]+)/g)){
    staticIconNames.add(name);
  }
}

const coreIcons={};
for (const name of [...staticIconNames].sort()){
  const icon=getIconData(mdi,name);
  if (!icon) throw new Error(`The local Material Design Icons collection is missing mdi:${name}.`);
  coreIcons[name]=icon;
}

const iconDirectory=path.join(root,"js","vendor");
const licenseDirectory=path.join(root,"licenses");
fs.mkdirSync(iconDirectory,{recursive:true});
fs.mkdirSync(licenseDirectory,{recursive:true});
const iconNames=[...new Set([...Object.keys(mdi.icons),...Object.keys(mdi.aliases||{})])]
  .sort()
  .map(name=>`mdi:${name}`);
fs.writeFileSync(path.join(iconDirectory,"mdi-icons.json"),`${JSON.stringify(mdi)}\n`);
fs.writeFileSync(path.join(iconDirectory,"mdi-index.json"),`${JSON.stringify(iconNames)}\n`);

const output=[
  '"use strict";',
  'const iconifyIcon=customElements.get("iconify-icon");',
  'if (!iconifyIcon) throw new Error("Iconify web component must load before local icon data.");',
  `if (!iconifyIcon.addCollection(${JSON.stringify({prefix:"mdi",width:mdi.width,height:mdi.height,icons:coreIcons})})) throw new Error("Could not register the local Material Design Icons collection.");`,
  `if (!iconifyIcon.addIcon("logos:google-calendar",${JSON.stringify(googleCalendar)})) throw new Error("Could not register the local Google Calendar logo.");`,
  'let mdiCollectionPromise=null;',
  'iconifyIcon.setCustomIconLoader(async name=>{',
  '  if (!mdiCollectionPromise){',
  '    mdiCollectionPromise=fetch("js/vendor/mdi-icons.json").then(response=>{',
  '      if (!response.ok) throw new Error("Could not load local Material Design Icons.");',
  '      return response.json();',
  '    }).then(collection=>{',
  '      if (!iconifyIcon.addCollection(collection)) throw new Error("Could not register the local Material Design Icons collection.");',
  '    }).catch(error=>{mdiCollectionPromise=null;throw error;});',
  '  }',
  '  await mdiCollectionPromise;',
  '  return iconifyIcon.getIcon(`mdi:${name}`)||null;',
  '},"mdi");'
].join("\n");

fs.writeFileSync(path.join(iconDirectory,"icon-data.js"),`${output}\n`);
fs.copyFileSync(
  path.join(root,"node_modules","iconify-icon","license.txt"),
  path.join(licenseDirectory,"iconify-icon.LICENSE")
);
