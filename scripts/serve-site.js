"use strict";

const fs=require("node:fs");
const http=require("node:http");
const path=require("node:path");

const contentTypes={
  ".css":"text/css; charset=utf-8",
  ".html":"text/html; charset=utf-8",
  ".ico":"image/x-icon",
  ".jpeg":"image/jpeg",
  ".jpg":"image/jpeg",
  ".js":"text/javascript; charset=utf-8",
  ".json":"application/json; charset=utf-8",
  ".png":"image/png",
  ".svg":"image/svg+xml",
  ".ttf":"font/ttf",
  ".webp":"image/webp",
  ".woff":"font/woff",
  ".woff2":"font/woff2",
  ".xml":"application/xml; charset=utf-8"
};

function createStaticServer(rootDirectory){
  const siteRoot=path.resolve(rootDirectory);
  return http.createServer(async(request,response)=>{
    if (request.method!=="GET"&&request.method!=="HEAD"){
      response.writeHead(405,{Allow:"GET, HEAD"});
      response.end("Method not allowed");
      return;
    }

    let pathname;
    try{
      pathname=decodeURIComponent(new URL(request.url,"http://localhost").pathname);
    }catch{
      response.writeHead(400);
      response.end("Invalid URL");
      return;
    }

    let filePath=path.resolve(siteRoot,`.${pathname}`);
    const relativePath=path.relative(siteRoot,filePath);
    if (relativePath===".."||relativePath.startsWith(`..${path.sep}`)||path.isAbsolute(relativePath)){
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    try{
      let fileInfo=await fs.promises.stat(filePath);
      if (fileInfo.isDirectory()){
        filePath=path.join(filePath,"index.html");
        fileInfo=await fs.promises.stat(filePath);
      }
      if (!fileInfo.isFile()) throw Object.assign(new Error("Not a file"),{code:"ENOENT"});
      response.writeHead(200,{
        "Cache-Control":"no-store",
        "Content-Length":fileInfo.size,
        "Content-Type":contentTypes[path.extname(filePath).toLowerCase()]||"application/octet-stream"
      });
      if (request.method==="HEAD"){
        response.end();
        return;
      }
      const stream=fs.createReadStream(filePath);
      stream.on("error",error=>{
        console.error(`Could not read ${pathname}:`,error);
        if (!response.headersSent){
          response.writeHead(500);
          response.end("Internal server error");
        }else{
          response.destroy(error);
        }
      });
      stream.pipe(response);
    }catch(error){
      if (error.code==="ENOENT"||error.code==="ENOTDIR"){
        response.writeHead(404);
        response.end("Not found");
        return;
      }
      console.error(`Could not serve ${pathname}:`,error);
      response.writeHead(500);
      response.end("Internal server error");
    }
  });
}

function listenWithFallback(server,initialPort,host){
  return new Promise((resolve,reject)=>{
    let port=initialPort;
    const listen=()=>{
      const cleanup=()=>{
        server.removeListener("listening",onListening);
        server.removeListener("error",onError);
      };
      const onListening=()=>{
        cleanup();
        resolve(server.address().port);
      };
      const onError=error=>{
        cleanup();
        if (error.code==="EADDRINUSE"&&port<65535){
          port++;
          listen();
          return;
        }
        reject(error);
      };
      server.once("listening",onListening);
      server.once("error",onError);
      try{
        server.listen(port,host);
      }catch(error){
        cleanup();
        reject(error);
      }
    };
    listen();
  });
}

if (require.main===module){
  const root=path.resolve(__dirname,"..");
  const mode=process.argv[2];
  if (mode!=="dev"&&mode!=="preview") throw new Error("Choose a server mode: dev or preview.");
  const siteRoot=mode==="dev"?root:path.join(root,"dist");
  if (!fs.existsSync(siteRoot)) throw new Error("Production output is missing. Run npm run build before npm run preview.");
  if (mode==="dev") require("./build-icon-data");

  const port=Number(process.env.PORT||8000);
  if (!Number.isInteger(port)||port<1||port>65535) throw new Error("PORT must be an integer between 1 and 65535.");
  const server=createStaticServer(siteRoot);
  listenWithFallback(server,port,"127.0.0.1").then(availablePort=>{
    console.log(`${mode==="dev"?"Development":"Production preview"} server: http://localhost:${availablePort}/`);
  }).catch(error=>{
    console.error(`Could not start the ${mode} server:`,error.message);
    process.exitCode=1;
  });
}

module.exports={createStaticServer,listenWithFallback};
