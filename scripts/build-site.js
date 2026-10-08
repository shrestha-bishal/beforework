const fs = require("node:fs");
const path = require("node:path");
const CleanCSS = require("clean-css");
const {minify: minifyHtml} = require("html-minifier-terser");
const {minify: minifyJavaScript} = require("terser");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist");
const mode = process.env.BEFOREWORK_MODE === "demo" ? "demo" : "clean";
const googleClientId = process.env.BEFOREWORK_GOOGLE_CLIENT_ID || "";
const publishPaths = ["index.html", "robots.txt", "sitemap.xml", "images", "js", "pages", "styles"];
const browserLibraries = [
  {source:"node_modules/markdown-it/dist/browser/markdown-it.umd.min.js",target:"vendor/markdown-it.min.js"},
  {source:"node_modules/dompurify/dist/purify.min.js",target:"vendor/purify.min.js"}
];
const primerStylesheet = {
  source:"node_modules/@primer/css/dist/primer.css",
  license:"node_modules/@primer/css/LICENSE",
  target:"styles/vendor/primer.css",
  licenseTarget:"styles/vendor/primer.LICENSE"
};

fs.rmSync(output, {recursive:true, force:true});
fs.mkdirSync(output, {recursive:true});

for (const relativePath of publishPaths){
  const source = path.join(root, relativePath);
  if (fs.existsSync(source)){
    fs.cpSync(source, path.join(output, relativePath), {recursive:true});
  }
}

for (const library of browserLibraries){
  const source=path.join(root,library.source);
  if (!fs.existsSync(source)) throw new Error(`Required browser library is missing: ${library.source}`);
  const target=path.join(output,library.target);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(source,target);
}

for (const file of [
  {source:primerStylesheet.source,target:primerStylesheet.target},
  {source:primerStylesheet.license,target:primerStylesheet.licenseTarget}
]){
  const source=path.join(root,file.source);
  if (!fs.existsSync(source)) throw new Error(`Required Primer CSS file is missing: ${file.source}`);
  const target=path.join(output,file.target);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(source,target);
}

const siteConfig = `window.BEFOREWORK_CONFIG = Object.freeze({
  initialWorkspace: ${JSON.stringify(mode)},
  googleClientId: ${JSON.stringify(googleClientId)}
});\n`;

fs.writeFileSync(path.join(output, "js", "config", "site-config.js"), siteConfig);

function createAppBundle(){
  const manifestPath=path.join(root,"js","manifest.js");
  const manifest=fs.readFileSync(manifestPath,"utf8");
  const imports=[...manifest.matchAll(/^import\s+["']\.\/([^"']+)["'];\s*$/gm)].map(([,file])=>file);
  const withoutImports=manifest.replace(/^import\s+["']\.\/[^"']+["'];\s*$/gm,"").trim();
  if (!imports.length || withoutImports){
    throw new Error("The application manifest must contain only ordered relative imports.");
  }
  if (new Set(imports).size!==imports.length){
    throw new Error("The application manifest contains duplicate scripts.");
  }
  const source=imports.map(file=>{
    if (!/^[a-zA-Z0-9_/-]+\.js$/.test(file) || file.includes("..")){
      throw new Error(`Application manifest contains an unsafe path: ${file}`);
    }
    const scriptPath=path.resolve(root,"js",file);
    const relative=path.relative(path.join(root,"js"),scriptPath);
    if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(scriptPath)){
      throw new Error(`Application script is missing or outside js/: ${file}`);
    }
    return fs.readFileSync(scriptPath,"utf8");
  }).join("\n;\n");
  fs.writeFileSync(path.join(output,"js","app.min.js"),source);
}

function listFiles(directory){
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    const entryPath=path.join(directory,entry.name);
    return entry.isDirectory()?listFiles(entryPath):[entryPath];
  });
}

function expandStylesheetManifest(file, source){
  const stylesDirectory=path.dirname(file);
  const expanded=source.replace(/@import\s+url\(["']([^"']+)["']\)\s*;/g,(_match,relativePath)=>{
    const importedFile=path.resolve(stylesDirectory,relativePath);
    const relativeImport=path.relative(stylesDirectory,importedFile);
    if (relativeImport.startsWith("..") || path.isAbsolute(relativeImport)){
      throw new Error(`Stylesheet manifest import escapes its directory: ${relativePath}`);
    }
    if (!fs.existsSync(importedFile) || !fs.statSync(importedFile).isFile()){
      throw new Error(`Stylesheet manifest import is missing: ${relativePath}`);
    }
    return fs.readFileSync(importedFile,"utf8");
  });
  if (/@import\b/.test(expanded)) throw new Error(`Unsupported @import syntax in stylesheet manifest: ${file}`);
  return expanded;
}

async function minifyJavaScriptFile(file){
  const source=fs.readFileSync(file,"utf8");
  const hasModuleSyntax=/^\s*(?:import|export)\s/m.test(source);
  const result=await minifyJavaScript(source,{
    module:hasModuleSyntax,
    compress:true,
    mangle:true,
    format:{comments:/@license|@preserve|^!/}
  });
  if (typeof result.code!=="string") throw new Error(`JavaScript minification produced no output for ${file}`);
  fs.writeFileSync(file,result.code);
}

async function build(){
  createAppBundle();
  const files=[
    ...listFiles(path.join(output,"js")),
    ...listFiles(path.join(output,"pages")),
    ...listFiles(path.join(output,"styles")),
    path.join(output,"index.html")
  ];

  for (const file of files.filter(file=>file.endsWith(".js"))){
    await minifyJavaScriptFile(file);
  }

  const cssFiles=files.filter(file=>file.endsWith(".css")).sort((a,b)=>
    Number(path.basename(a)==="manifest.css")-Number(path.basename(b)==="manifest.css")
  );
  for (const file of cssFiles){
    let source=fs.readFileSync(file,"utf8");
    if (path.basename(file)==="manifest.css") source=expandStylesheetManifest(file,source);
    const result=new CleanCSS().minify(source);
    if (result.errors.length) throw new Error(`CSS minification failed for ${file}: ${result.errors.join("; ")}`);
    fs.writeFileSync(file,result.styles);
  }

  for (const file of files.filter(file=>file.endsWith(".html"))){
    let source=fs.readFileSync(file,"utf8");
    if (file===path.join(output,"index.html")){
      for (const library of browserLibraries){
        source=source.replaceAll(`src="${library.source}"`,`src="${library.target}"`);
      }
      source=source.replaceAll(
        `href="${primerStylesheet.source}"`,
        `href="${primerStylesheet.target}"`
      );
      source=source.replace(
        '<script src="js/dev-loader.js"></script>',
        '<script type="module" src="js/app.min.js"></script>'
      );
    }
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

  const manifest=fs.readFileSync(path.join(root,"js","manifest.js"),"utf8");
  const sourceFiles=[...manifest.matchAll(/^import\s+["']\.\/([^"']+)["'];\s*$/gm)].map(([,file])=>file);
  for (const file of sourceFiles){
    fs.rmSync(path.join(output,"js",file),{force:true});
  }
  fs.rmSync(path.join(output,"js","manifest.js"),{force:true});
  fs.rmSync(path.join(output,"js","dev-loader.js"),{force:true});

  console.log(`Built and minified Beforework with ${mode} initial workspace data.`);
}

build().catch(error=>{
  console.error("Couldn't build Beforework:",error);
  process.exitCode=1;
});
