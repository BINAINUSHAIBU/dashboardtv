const API={
  channels:"https://iptv-org.github.io/api/channels.json",
  streams:"https://iptv-org.github.io/api/streams.json",
  logos:"https://iptv-org.github.io/api/logos.json",
  countries:"https://iptv-org.github.io/api/countries.json",
  languages:"https://iptv-org.github.io/api/languages.json",
  allPlaylist:"https://iptv-org.github.io/iptv/index.m3u"
};

const CACHE_KEY="btech-fast-catalog-v2";
const state={
  channels:[],filtered:[],page:1,pageSize:60,view:"all",
  favorites:new Set(JSON.parse(localStorage.getItem("btech-favorites")||"[]")),
  hls:null,current:null,cache:{countriesByCode:{},languagesByCode:{}}
};

const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove("show"),2200)}
function saveFav(){localStorage.setItem("btech-favorites",JSON.stringify([...state.favorites]));$("favStat").textContent=state.favorites.size}
function countryName(code){return state.cache.countriesByCode?.[code]?.name||code||"Unknown"}
function langName(code){return state.cache.languagesByCode?.[code]?.name||code||"Unknown"}

/* Fast network/cache layer:
   - browser Cache API keeps catalog between visits
   - cached data is used immediately when available
   - no-cache/no-store is deliberately avoided
*/
async function fetchJSON(url,{timeout=12000}={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const r=await fetch(url,{signal:controller.signal,cache:"force-cache"});
    if(!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return await r.json();
  }finally{clearTimeout(timer)}
}
async function getCachedJSON(url){
  if(!("caches" in window)) return null;
  try{
    const c=await caches.open("btech-api-v1"),r=await c.match(url);
    if(!r) return null;
    return r.json();
  }catch{return null}
}
async function cacheJSON(url,data){
  if(!("caches" in window)) return;
  try{
    const c=await caches.open("btech-api-v1");
    await c.put(url,new Response(JSON.stringify(data),{headers:{"Content-Type":"application/json"}}));
  }catch{}
}
async function fastJSON(url){
  const cached=await getCachedJSON(url);
  if(cached){
    // Refresh in background; cached result gives an instant UI.
    fetchJSON(url).then(data=>cacheJSON(url,data)).catch(()=>{});
    return cached;
  }
  const data=await fetchJSON(url);
  cacheJSON(url,data);
  return data;
}
function saveCatalogCache(){
  try{
    localStorage.setItem(CACHE_KEY,JSON.stringify({saved:Date.now(),channels:state.channels}));
  }catch{}
}
function loadCatalogCache(){
  try{
    const x=JSON.parse(localStorage.getItem(CACHE_KEY)||"null");
    if(x?.channels?.length){state.channels=x.channels;return true}
  }catch{}
  return false;
}

function mergeData(channels,streams,logos=[]){
  const logoMap=new Map();
  for(const l of logos||[]) if(l.channel&&l.url&&!logoMap.has(l.channel)) logoMap.set(l.channel,l.url);
  const streamMap=new Map();
  for(const s of streams||[]){
    if(!s.channel||!s.url) continue;
    if(!streamMap.has(s.channel))streamMap.set(s.channel,[]);
    streamMap.get(s.channel).push(s);
  }
  return channels.filter(c=>!c.closed).map(c=>{
    const ss=streamMap.get(c.id)||[],s=ss[0]||{};
    return {
      id:c.id,name:c.name,country:c.country||"",categories:c.categories||[],
      logo:logoMap.get(c.id)||"",quality:s.quality||"",stream:s.url||"",
      labels:s.labels||[],feed:s.feed||"",language:s.lang||c.language||""
    };
  }).filter(c=>c.stream);
}
function populateFilters(){
  const countries=[...new Set(state.channels.map(c=>c.country).filter(Boolean))].sort();
  const cats=[...new Set(state.channels.flatMap(c=>c.categories||[]).filter(Boolean))].sort();
  const langs=[...new Set(state.channels.map(c=>c.language).filter(Boolean))].sort();
  const add=(id,items,type)=>{
    const label=type==="country"?"countries":type==="category"?"categories":"languages";
    const el=$(id);
    el.innerHTML=`<option value="">All ${label}</option>`+items.map(x=>`<option value="${esc(x)}">${esc(type==="country"?countryName(x):type==="language"?langName(x):x)}</option>`).join("");
  };
  add("countryFilter",countries,"country");add("categoryFilter",cats,"category");add("languageFilter",langs,"language");
  $("countryList").innerHTML=countries.slice(0,35).map(x=>`<button data-country="${esc(x)}">${esc(countryName(x))}<span>${state.channels.filter(c=>c.country===x).length}</span></button>`).join("");
  $("categoryList").innerHTML=cats.slice(0,20).map(x=>`<button data-category="${esc(x)}">${esc(x)}<span>${state.channels.filter(c=>(c.categories||[]).includes(x)).length}</span></button>`).join("");
}
function qualityOK(q,target){
  if(!target)return true;const n=parseInt(q)||0;
  if(target==="4K")return /4k/i.test(q)||n>=2160;
  return n>=parseInt(target);
}
function applyFilters(){
  const q=$("search").value.trim().toLowerCase(),country=$("countryFilter").value,cat=$("categoryFilter").value,lang=$("languageFilter").value,quality=$("qualityFilter").value;
  state.filtered=state.channels.filter(c=>
    (!q||`${c.name} ${c.id} ${countryName(c.country)} ${(c.categories||[]).join(" ")} ${langName(c.language)}`.toLowerCase().includes(q))&&
    (!country||c.country===country)&&(!cat||(c.categories||[]).includes(cat))&&(!lang||c.language===lang)&&qualityOK(c.quality,quality)
  );
  if(state.view==="favorites")state.filtered=state.filtered.filter(c=>state.favorites.has(c.id));
  state.page=1;render();
}
function render(){
  const end=state.page*state.pageSize,items=state.filtered.slice(0,end);
  $("grid").innerHTML=items.map(card).join("");
  $("visibleStat").textContent=state.filtered.length.toLocaleString();
  $("resultText").textContent=`${state.filtered.length.toLocaleString()} channels`;
  $("empty").hidden=items.length!==0;
  $("loadMore").hidden=end>=state.filtered.length||items.length===0;
}
function card(c){
  const fav=state.favorites.has(c.id);
  const logo=c.logo?`<img loading="lazy" decoding="async" src="${esc(c.logo)}" alt="" onerror="this.remove()">`:"";
  const meta=[countryName(c.country),c.categories?.[0]||"General",c.quality||"Live"].filter(Boolean).join(" • ");
  return `<article class="channel" data-id="${esc(c.id)}">
    <div class="thumb">${logo}<span class="quality">${esc(c.quality||"LIVE")}</span><button class="star ${fav?"on":""}" data-fav="${esc(c.id)}" title="Favorite">${fav?"★":"☆"}</button></div>
    <div class="card-body"><div class="name" title="${esc(c.name)}">${esc(c.name)}</div><div class="meta">${esc(meta)}</div><span class="badge">${c.labels?.length?esc(c.labels[0]):"PUBLIC STREAM"}</span></div>
  </article>`;
}

async function loadExtraMeta(){
  // Non-critical metadata is intentionally deferred so channels appear first.
  try{
    const [countries,languages]=await Promise.all([fastJSON(API.countries),fastJSON(API.languages)]);
    state.cache.countriesByCode=Object.fromEntries(countries.map(x=>[x.code,x]));
    state.cache.languagesByCode=Object.fromEntries(languages.map(x=>[x.code,x]));
    populateFilters();applyFilters();
  }catch{}
  // Logos are the heaviest visual request. Load them after the first paint.
  try{
    const logos=await fastJSON(API.logos);
    const map=new Map();
    for(const l of logos||[])if(l.channel&&l.url&&!map.has(l.channel))map.set(l.channel,l.url);
    let changed=false;
    for(const c of state.channels)if(!c.logo&&map.has(c.id)){c.logo=map.get(c.id);changed=true}
    if(changed){saveCatalogCache();render()}
  }catch{}
}
async function loadCatalog(){
  $("statusText").textContent="Loading fast catalog…";
  const cached=loadCatalogCache();
  if(cached){
    $("totalStat").textContent=state.channels.length.toLocaleString();
    $("countryStat").textContent=new Set(state.channels.map(c=>c.country)).size.toLocaleString();
    populateFilters();applyFilters();
    $("statusText").textContent=`${state.channels.length.toLocaleString()} streams ready`;
    // Update the cache without blocking the interface.
    Promise.all([fastJSON(API.channels),fastJSON(API.streams)]).then(([channels,streams])=>{
      const fresh=mergeData(channels,streams,state.channels.map(c=>c.logo?{channel:c.id,url:c.logo}:null).filter(Boolean));
      if(fresh.length){state.channels=fresh;saveCatalogCache();$("totalStat").textContent=fresh.length.toLocaleString();applyFilters()}
    }).catch(()=>{});
    loadExtraMeta();
    return;
  }
  try{
    // Only the two critical datasets block first render.
    const [channels,streams]=await Promise.all([fastJSON(API.channels),fastJSON(API.streams)]);
    state.channels=mergeData(channels,streams);
    saveCatalogCache();
    $("totalStat").textContent=state.channels.length.toLocaleString();
    $("countryStat").textContent=new Set(state.channels.map(c=>c.country)).size.toLocaleString();
    populateFilters();applyFilters();
    $("statusText").textContent=`${state.channels.length.toLocaleString()} streams ready`;
    loadExtraMeta();
  }catch(e){
    $("statusText").textContent="Catalog failed to load";
    toast("Catalog could not load. Check your internet connection or use the cached catalog.");
    console.error(e);
  }
}
function play(c){
  if(!c.stream)return toast("This channel has no stream URL.");
  state.current=c;$("nowTitle").textContent=c.name;$("nowMeta").textContent=`${countryName(c.country)} • ${c.categories?.join(", ")||"General"} • ${c.quality||"Live"}`;
  $("copyStream").disabled=false;$("playerEmpty").style.display="none";
  const video=$("video");
  if(state.hls){state.hls.destroy();state.hls=null}
  video.pause();video.removeAttribute("src");video.load();
  if(video.canPlayType("application/vnd.apple.mpegurl")){video.src=c.stream;video.play().catch(()=>{})}
  else if(window.Hls&&Hls.isSupported()){
    state.hls=new Hls({
      enableWorker:true,
      lowLatencyMode:true,
      backBufferLength:30,
      maxBufferLength:15,
      maxMaxBufferLength:30,
      capLevelToPlayerSize:true,
      startLevel:-1,
      manifestLoadingTimeOut:8000,
      levelLoadingTimeOut:8000,
      fragLoadingTimeOut:8000
    });
    state.hls.loadSource(c.stream);
    state.hls.attachMedia(video);
    state.hls.on(Hls.Events.MANIFEST_PARSED,()=>video.play().catch(()=>{}));
  }else toast("This browser does not support HLS playback.");
}
function clearPlayer(){
  if(state.hls){state.hls.destroy();state.hls=null}
  $("video").pause();$("video").removeAttribute("src");$("video").load();
  $("playerEmpty").style.display="grid";$("nowTitle").textContent="Select a channel";
  $("nowMeta").textContent="No channel selected";$("copyStream").disabled=true;state.current=null;
}
function downloadText(name,text){
  const blob=new Blob([text],{type:"application/x-mpegURL"}),a=document.createElement("a");
  a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
async function downloadAll(){
  try{const r=await fetch(API.allPlaylist);if(!r.ok)throw new Error();downloadText("btech-tv-all-public-channels.m3u",await r.text());toast("All public IPTV playlist downloaded.")}
  catch(e){window.open(API.allPlaylist,"_blank");toast("Opened the official all-channel playlist instead.")}
}
document.addEventListener("click",e=>{
  const fav=e.target.closest("[data-fav]");
  if(fav){e.stopPropagation();const id=fav.dataset.fav;state.favorites.has(id)?state.favorites.delete(id):state.favorites.add(id);saveFav();render();return}
  const cardEl=e.target.closest(".channel");
  if(cardEl){const c=state.channels.find(x=>x.id===cardEl.dataset.id);if(c)play(c)}
  const country=e.target.closest("[data-country]");if(country){$("countryFilter").value=country.dataset.country;applyFilters()}
  const cat=e.target.closest("[data-category]");if(cat){$("categoryFilter").value=cat.dataset.category;applyFilters()}
  const nav=e.target.closest(".nav");
  if(nav){document.querySelectorAll(".nav").forEach(x=>x.classList.remove("active"));nav.classList.add("active");state.view=nav.dataset.view;applyFilters()}
});
["search","countryFilter","categoryFilter","languageFilter","qualityFilter"].forEach(id=>$(id).addEventListener(id==="search"?"input":"change",applyFilters));
$("loadMore").onclick=()=>{state.page++;render()};
$("reloadBtn").onclick=async()=>{localStorage.removeItem(CACHE_KEY);try{if("caches"in window)await caches.delete("btech-api-v1")}catch{}location.reload()};
$("closePlayer").onclick=clearPlayer;
$("downloadBtn").onclick=downloadAll;
$("fullscreenBtn").onclick=()=>document.documentElement.requestFullscreen?.();
$("copyStream").onclick=async()=>{if(state.current){await navigator.clipboard.writeText(state.current.stream);toast("Stream URL copied.")}};
saveFav();

/* BTECH 5-minute demo + paid package access */
const ACCESS_KEY="btech-access-v1";
const TRIAL_MS=5*60*1000;
const PACKAGE_SIZES=[500,1000,1500,2000,2500,3000,3500,4000,4500,5000,6000,7000,8000,9000,10000,10051];
let accessTimer=null;
function getAccess(){try{return JSON.parse(localStorage.getItem(ACCESS_KEY)||"null")}catch{return null}}
function saveAccess(x){localStorage.setItem(ACCESS_KEY,JSON.stringify(x))}
function packageOptions(){
  const el=$("packageSize");
  el.innerHTML=PACKAGE_SIZES.map(n=>`<option value="${n}">${n.toLocaleString()} channels — 30 days</option>`).join("");
}
function activeAccess(){
  const a=getAccess();
  if(!a)return false;
  if(a.type==="paid")return Date.now()<a.expiresAt;
  if(a.type==="trial")return Date.now()<a.expiresAt;
  return false;
}
function allowedChannelCount(){
  const a=getAccess();
  if(a?.type==="paid" && Date.now()<a.expiresAt)return a.channels;
  if(a?.type==="trial" && Date.now()<a.expiresAt)return 500;
  return 0;
}
function applyPackageLimit(){
  const limit=allowedChannelCount();
  if(!limit){state.filtered=[];render();return}
  // Trial and paid plans both limit what is displayed in the dashboard.
  const base=state.channels;
  if(state.filtered.length>limit)state.filtered=state.filtered.slice(0,limit);
  else if(state.filtered.length===0 && base.length)state.filtered=base.slice(0,limit);
  render();
}
const originalRender=render;
render=function(){
  const a=getAccess(),limit=allowedChannelCount();
  if(!limit){$("grid").innerHTML="";$('visibleStat').textContent="0";$('resultText').textContent="Package required";$('loadMore').hidden=true;$('empty').hidden=false;return}
  const end=Math.min(state.page*state.pageSize,limit),items=state.filtered.slice(0,end);
  $("grid").innerHTML=items.map(card).join("");
  $("visibleStat").textContent=Math.min(state.filtered.length,limit).toLocaleString();
  $("resultText").textContent=`${Math.min(state.filtered.length,limit).toLocaleString()} channels`;
  $("empty").hidden=items.length!==0;
  $("loadMore").hidden=end>=Math.min(state.filtered.length,limit)||items.length===0;
};
const originalApplyFilters=applyFilters;
applyFilters=function(){
  const q=$("search").value.trim().toLowerCase(),country=$("countryFilter").value,cat=$("categoryFilter").value,lang=$("languageFilter").value,quality=$("qualityFilter").value;
  state.filtered=state.channels.filter(c=>(!q||`${c.name} ${c.id} ${countryName(c.country)} ${(c.categories||[]).join(" ")} ${langName(c.language)}`.toLowerCase().includes(q))&&(!country||c.country===country)&&(!cat||(c.categories||[]).includes(cat))&&(!lang||c.language===lang)&&qualityOK(c.quality,quality));
  if(state.view==="favorites")state.filtered=state.filtered.filter(c=>state.favorites.has(c.id));
  const limit=allowedChannelCount(); if(limit)state.filtered=state.filtered.slice(0,limit);
  state.page=1;render();
};
function showGate(mode){
  const gate=$("accessGate"),form=$("packageForm"),timer=$("trialTimer"),actions=$("accessActions"),title=$("accessTitle"),msg=$("accessMessage");
  gate.classList.add("show");
  if(mode==="trial"){
    title.textContent="5-Minute Demo Trial";msg.textContent="Start your free demo. You can browse up to 500 channels during the 5-minute trial.";form.hidden=true;timer.hidden=false;
    actions.innerHTML='<button id="startTrialBtn" class="access-btn">Start 5-Minute Trial</button>';
    $("startTrialBtn").onclick=startTrial;
  }else{
    title.textContent="Choose Your BTECH-TV Package";msg.textContent="Select a package from 500 to 10,051 channels, choose the demo payment gateway, then proceed to activate 30-day access.";form.hidden=false;timer.hidden=true;
    actions.innerHTML='<button id="proceedPaymentBtn" class="access-btn">Proceed to Demo Payment</button>';
    $("proceedPaymentBtn").onclick=proceedPayment;
    packageOptions();
  }
}
function hideGate(){ $("accessGate").classList.remove("show") }
function startTrial(){
  const a={type:"trial",startedAt:Date.now(),expiresAt:Date.now()+TRIAL_MS,channels:500};saveAccess(a);hideGate();startAccessClock();applyFilters();toast("5-minute BTECH-TV demo trial started.");
}
function proceedPayment(){
  const channels=Number($("packageSize").value),gateway=$("gateway").value;
  const now=Date.now(),a={type:"paid",channels,gateway,startedAt:now,expiresAt:now+30*24*60*60*1000};
  // Demo payment flow: replace this activation step with real gateway checkout keys on production.
  saveAccess(a);hideGate();startAccessClock();applyFilters();toast(`${channels.toLocaleString()} channels activated for 30 days via ${gateway}.`);
}
function startAccessClock(){
  clearInterval(accessTimer);const tick=()=>{
    const a=getAccess();if(!a)return;
    const remaining=Math.max(0,a.expiresAt-Date.now());
    if(a.type==="trial"){
      const sec=Math.ceil(remaining/1000),m=String(Math.floor(sec/60)).padStart(2,"0"),s=String(sec%60).padStart(2,"0");
      $("planStatus").textContent=`TRIAL ${m}:${s}`;
      if(remaining<=0){clearInterval(accessTimer);localStorage.removeItem(ACCESS_KEY);$("planStatus").textContent="PACKAGE REQUIRED";showGate("package");applyFilters();toast("Demo trial ended. Select a package to continue.");}
    }else{
      const days=Math.ceil(remaining/86400000);$("planStatus").textContent=`${a.channels.toLocaleString()} CH • ${days}D LEFT`;
      if(remaining<=0){clearInterval(accessTimer);localStorage.removeItem(ACCESS_KEY);$("planStatus").textContent="PACKAGE EXPIRED";showGate("package");applyFilters();}
    }
  };tick();accessTimer=setInterval(tick,1000);
}
function initAccess(){
  const a=getAccess();
  if(a && activeAccess()){startAccessClock();applyFilters();return true}
  if(a) localStorage.removeItem(ACCESS_KEY);
  showGate("trial");return false;
}

// Re-run access after catalog is available.
const _loadCatalog=loadCatalog;
loadCatalog=async function(){await _loadCatalog();initAccess()};

loadCatalog();
