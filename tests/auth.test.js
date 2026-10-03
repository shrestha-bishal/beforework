"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const authSource=fs.readFileSync(path.join(__dirname,"../js/services/auth/auth.js"),"utf8");
const netlifySource=fs.readFileSync(path.join(__dirname,"../js/services/auth/netlify-identity.js"),"utf8");

function loadModule(source,window={},document={createElement(){throw new Error("Unexpected script creation");},head:{appendChild(){}}},setTimeoutFn=()=>{}){
  window.setTimeout=setTimeoutFn;
  const sandbox={window,document,setTimeout:setTimeoutFn};
  vm.runInNewContext(source,sandbox,{filename:"auth-module.js"});
  return sandbox.window;
}

test("generic auth manager stays available without configured providers",async()=>{
  const events=[];
  const auth=loadModule(authSource).BeforeworkAuth.create({
    onUserChange:user=>events.push(["user",user]),
    onUnavailable:error=>events.push(["unavailable",error])
  });

  await auth.init();

  assert.equal(auth.getAccountName(),"");
  assert.deepEqual(events,[]);
});

test("generic auth manager selects an available provider and delegates logout",async()=>{
  const calls=[];
  const users=[];
  const providers=[
    {async isAvailable(){return false;}},
    {
      async isAvailable(){return true;},
      init(onChange){onChange({name:"Person"});},
      label(user){return user.name;},
      logout(){calls.push("logout");}
    }
  ];
  const auth=loadModule(authSource).BeforeworkAuth.create({
    providers,
    onUserChange:user=>users.push(user)
  });

  await auth.init();

  assert.equal(auth.getAccountName(),"Person");
  assert.equal(users.length,1);
  auth.logout();
  assert.deepEqual(calls,["logout"]);
});

test("Netlify provider owns its SDK loading and auth lifecycle",async()=>{
  const listeners={};
  const calls=[];
  const identity={
    on(event,callback){listeners[event]=callback;},
    init(options){calls.push(["init",options]);},
    close(){calls.push(["close"]);},
    open(mode){calls.push(["open",mode]);},
    logout(){calls.push(["logout"]);},
  };
  const users=[];
  const timers=[];
  const window={netlifyIdentity:identity};
  const modules=loadModule(netlifySource,window,undefined,callback=>timers.push(callback));
  const provider=modules.BeforeworkNetlifyIdentityProvider.create({enabled:true});
  const auth=loadModule(authSource).BeforeworkAuth.create({
    providers:[provider],
    onUserChange:user=>users.push(user)
  });

  await auth.init();
  listeners.init({email:"person@example.com"});
  listeners.login({user_metadata:{full_name:"Person"}});

  assert.equal(auth.getAccountName(),"Person");
  assert.equal(JSON.stringify(calls),JSON.stringify([["init",{logo:false}],["close"]]));
  assert.equal(users.length,2);
  assert.equal(timers.length,1);

  auth.logout();
  assert.equal(JSON.stringify(calls.at(-1)),JSON.stringify(["logout"]));
  listeners.logout();
  assert.equal(auth.getAccountName(),"");
});

test("disabled Netlify provider does not load its SDK",async()=>{
  let scriptCreated=false;
  const modules=loadModule(netlifySource,{},{
    createElement(){scriptCreated=true;return {};},
    head:{appendChild(){}}
  });
  const provider=modules.BeforeworkNetlifyIdentityProvider.create();

  assert.equal(await provider.isAvailable(),false);
  assert.equal(scriptCreated,false);
});

test("application composes the generic manager with the Netlify provider",()=>{
  const app=fs.readFileSync(path.join(__dirname,"../js/app.js"),"utf8");
  const index=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");

  assert.match(app,/providers:\[window\.BeforeworkNetlifyIdentityProvider\.create\(\)\]/);
  assert.match(app,/accountName:authService\.getAccountName\(\)/);
  assert.match(app,/logout\(\)\{ authService\.logout\(\); \}/);
  assert.ok(index.indexOf('src="js/services/auth/netlify-identity.js"')<index.indexOf('src="js/services/auth/auth.js"'));
  assert.ok(index.indexOf('src="js/services/auth/auth.js"')<index.indexOf('src="js/app.js"'));
  assert.doesNotMatch(app,/function loadNetlifyIdentity|NETLIFY_IDENTITY_ENABLED/);
});
