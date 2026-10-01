const fs = require("node:fs");
const path = require("node:path");
const {minify: minifyHtml} = require("html-minifier-terser");
const {minify: minifyJavaScript} = require("terser");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist");
const mode = process.env.BEFOREWORK_MODE === "demo" ? "demo" : "clean";
const googleClientId = process.env.BEFOREWORK_GOOGLE_CLIENT_ID || "";
const publishPaths = ["index.html", "robots.txt", "sitemap.xml", "images", "js", "pages", "styles"];

fs.rmSync(output, {recursive:true, force:true});
fs.mkdirSync(output, {recursive:true});

for (const relativePath of publishPaths){
  const source = path.join(root, relativePath);
  if (fs.existsSync(source)){
    fs.cpSync(source, path.join(output, relativePath), {recursive:true});
  }
}

const siteConfig = `window.BEFOREWORK_CONFIG = Object.freeze({
  initialWorkspace: ${JSON.stringify(mode)},
  googleClientId: ${JSON.stringify(googleClientId)}
});\n`;

fs.writeFileSync(path.join(output, "js", "config", "site-config.js"), siteConfig);

function listFiles(directory){
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    const entryPath=path.join(directory,entry.name);
    return entry.isDirectory()?listFiles(entryPath):[entryPath];
  });
}

async function minifyJavaScriptFile(file){
  const source=fs.readFileSync(file,"utf8");
  const isModule=/^\s*(?:import|export)\s/m.test(source);
  const result=await minifyJavaScript(source,{
    module:isModule,
    compress:true,
    mangle:true,
    format:{comments:/@license|@preserve|^!/}
  });
  if (typeof result.code!=="string") throw new Error(`JavaScript minification produced no output for ${file}`);
  fs.writeFileSync(file,result.code);
}

async function build(){
  const files=[
    ...listFiles(path.join(output,"js")),
    ...listFiles(path.join(output,"pages")),
    path.join(output,"index.html")
  ];

  for (const file of files.filter(file=>file.endsWith(".js"))){
    await minifyJavaScriptFile(file);
  }

  for (const file of files.filter(file=>file.endsWith(".html"))){
    const source=fs.readFileSync(file,"utf8");
    const minified=await minifyHtml(source,{
      collapseWhitespace:true,
      removeComments:true,
      minifyJS:code=>minifyJavaScript(code,{compress:true,mangle:true}).then(result=>{
        if (typeof result.code!=="string") throw new Error(`Inline JavaScript minification produced no output for ${file}`);
        return result.code;
      })
    });
    fs.writeFileSync(file,minified);
  }

  console.log(`Built and minified Beforework with ${mode} initial workspace data.`);
}

build().catch(error=>{
  console.error("Couldn't build Beforework:",error);
  process.exitCode=1;
});
