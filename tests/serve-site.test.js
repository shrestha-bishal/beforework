"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const test=require("node:test");
const {createStaticServer,listenWithFallback}=require("../scripts/serve-site");

test("static server serves files with content types, HEAD, and directory indexes",async context=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"beforework-site-"));
  fs.mkdirSync(path.join(root,"nested"));
  fs.writeFileSync(path.join(root,"index.html"),"home");
  fs.writeFileSync(path.join(root,"nested","index.html"),"nested");
  fs.writeFileSync(path.join(root,"data.json"),"[]");
  const server=createStaticServer(root);
  context.after(async()=>{
    await new Promise(resolve=>server.close(resolve));
    fs.rmSync(root,{recursive:true,force:true});
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const base=`http://127.0.0.1:${server.address().port}`;

  const home=await fetch(base);
  assert.equal(home.status,200);
  assert.equal(await home.text(),"home");
  assert.equal(home.headers.get("content-type"),"text/html; charset=utf-8");

  const nested=await fetch(`${base}/nested/`);
  assert.equal(nested.status,200);
  assert.equal(await nested.text(),"nested");

  const json=await fetch(`${base}/data.json`,{method:"HEAD"});
  assert.equal(json.status,200);
  assert.equal(json.headers.get("content-type"),"application/json; charset=utf-8");
  assert.equal(await json.text(),"");

  const missing=await fetch(`${base}/missing.js`);
  assert.equal(missing.status,404);

  const unsupported=await fetch(base,{method:"POST"});
  assert.equal(unsupported.status,405);
});

test("static server does not serve paths outside its root",async context=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"beforework-site-"));
  const outside=path.join(path.dirname(root),`${path.basename(root)}-secret`);
  fs.writeFileSync(outside,"secret");
  const server=createStaticServer(root);
  context.after(async()=>{
    await new Promise(resolve=>server.close(resolve));
    fs.rmSync(root,{recursive:true,force:true});
    fs.rmSync(outside,{force:true});
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));

  const response=await fetch(`http://127.0.0.1:${server.address().port}/%2e%2e%2f${path.basename(outside)}`);
  assert.notEqual(response.status,200);
  assert.notEqual(await response.text(),"secret");
});

test("server selects the next available port when the requested port is occupied",async context=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"beforework-site-"));
  const blocker=createStaticServer(root);
  await new Promise(resolve=>blocker.listen(0,"127.0.0.1",resolve));
  const occupiedPort=blocker.address().port;
  const server=createStaticServer(root);
  context.after(async()=>{
    await Promise.all([
      new Promise(resolve=>blocker.close(resolve)),
      new Promise(resolve=>server.close(resolve))
    ]);
    fs.rmSync(root,{recursive:true,force:true});
  });

  const selectedPort=await listenWithFallback(server,occupiedPort,"127.0.0.1");
  assert.ok(selectedPort>occupiedPort);
  assert.equal(server.address().port,selectedPort);
});
