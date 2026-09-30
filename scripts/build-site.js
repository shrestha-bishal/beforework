const fs = require("node:fs");
const path = require("node:path");

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
console.log(`Built Beforework with ${mode} initial workspace data.`);
