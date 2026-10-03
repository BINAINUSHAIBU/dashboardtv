const CACHE="btech-shell-v1";
const API_CACHE="btech-api-v1";
const SHELL=["./","./index.html","./css/style.css","./js/app.js"];
self.addEventListener("install",e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",e=>{
  e.waitUntil(self.clients.claim());
});
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(u.origin==="https://iptv-org.github.io" && u.pathname.startsWith("/api/")){
    e.respondWith((async()=>{
      const c=await caches.open(API_CACHE);
      const hit=await c.match(e.request);
      const network=fetch(e.request).then(r=>{if(r.ok)c.put(e.request,r.clone());return r}).catch(()=>null);
      return hit || await network || new Response("[]",{headers:{"Content-Type":"application/json"}});
    })());
    return;
  }
  if(e.request.method==="GET" && u.origin===location.origin){
    e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{
      const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r;
    })));
  }
});
