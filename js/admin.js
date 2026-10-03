const A={channels:"https://iptv-org.github.io/api/channels.json",streams:"https://iptv-org.github.io/api/streams.json",logos:"https://iptv-org.github.io/api/logos.json",countries:"https://iptv-org.github.io/api/countries.json"};
const S={channels:[],countries:{},locks:{},ptv:{},users:[],settings:{},page:1,pageSize:80,filtered:[],selected:new Set(),activity:[],monitorId:null,hls:null,health:{},healthTimer:null};
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
function toast(x){$("toast").textContent=x;$("toast").classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>$("toast").classList.remove("show"),2200)}
function get(k,d){try{return JSON.parse(localStorage.getItem(k)||"null")??d}catch{return d}}
function put(k,v){localStorage.setItem(k,JSON.stringify(v))}
function log(action){S.activity.unshift({action,time:new Date().toLocaleString()});S.activity=S.activity.slice(0,12);put("btech-admin-activity",S.activity);renderActivity()}
function country(c){return S.countries[c]?.name||c||"Unknown"}
function status(c){if(S.locks[c.id]?.disabled)return"disabled";if(S.ptv[c.id]?.enabled)return"ptv";if(S.locks[c.id]?.locked)return"locked";return"public"}
function label(x){return x==="ptv"?"PAY-TO-VIEW":x.toUpperCase()}
function monitorChannel(id){const c=S.channels.find(x=>x.id===id);if(!c)return;S.monitorId=id;const v=$("monitorVideo");if(S.hls){try{S.hls.destroy()}catch{}S.hls=null}v.pause();v.removeAttribute("src");v.load();$("monitorEmpty").style.display="none";$("monitorTitle").textContent=c.name;$("monitorMeta").textContent=`${country(c.country)} • ${(c.categories||[]).join(" / ")||"General"}`;$("monitorCountry").textContent=country(c.country);$("monitorQuality").textContent=c.quality||"LIVE STREAM";$("monitorId").textContent=c.id;$("monitorAccess").textContent=label(status(c));$("monitorStream").textContent=c.stream?"ONLINE":"OFFLINE";$("monitorStatus").textContent="LOADING";$("monitorLogo").src=c.logo||"";$("monitorLogo").style.display=c.logo?"block":"none";const isHls=/\.m3u8(?:$|\?)/i.test(c.stream);if(isHls&&window.Hls&&Hls.isSupported()){S.hls=new Hls({enableWorker:true,lowLatencyMode:true});S.hls.loadSource(c.stream);S.hls.attachMedia(v);S.hls.on(Hls.Events.MANIFEST_PARSED,()=>{v.play().catch(()=>{});$("monitorStatus").textContent="LIVE"});S.hls.on(Hls.Events.ERROR,(e,d)=>{if(d.fatal)$("monitorStatus").textContent="STREAM ERROR"})}else{v.src=c.stream;v.play().then(()=>$("monitorStatus").textContent="LIVE").catch(()=>$("monitorStatus").textContent="READY")};log(`Monitoring channel: ${c.id}`)}
function monitorMove(dir){if(!S.channels.length)return;let i=S.channels.findIndex(c=>c.id===S.monitorId);i=i<0?(dir>0?0:S.channels.length-1):(i+dir+S.channels.length)%S.channels.length;monitorChannel(S.channels[i].id)}
function stopMonitor(){$("monitorVideo").pause();$("monitorStatus").textContent="STOPPED"}
function syncMonitorClock(){const v=$("monitorVideo");const t=Number(v.currentTime||0);$("monitorClock").textContent=`${String(Math.floor(t/60)).padStart(2,"0")}:${String(Math.floor(t%60)).padStart(2,"0")}`}
async function json(url){const r=await fetch(url);if(!r.ok)throw Error(r.status);return r.json()}
async function load(){
  try{
    const [ch,st,lg,co]=await Promise.all([json(A.channels),json(A.streams),json(A.logos),json(A.countries)]);
    const logo=new Map((lg||[]).filter(x=>x.channel&&x.url).map(x=>[x.channel,x.url]));
    const sm=new Map();(st||[]).forEach(x=>{if(x.channel&&x.url&&!sm.has(x.channel))sm.set(x.channel,x)});
    S.countries=Object.fromEntries((co||[]).map(x=>[x.code,x]));
    S.channels=(ch||[]).filter(x=>!x.closed).map(x=>{const s=sm.get(x.id)||{};return{id:x.id,name:x.name,country:x.country||"",categories:x.categories||[],quality:s.quality||"",stream:s.url||"",logo:logo.get(x.id)||""}}).filter(x=>x.stream);
    const oldLocks=get("btech-admin-locks",{});
    const oldPtv=get("btech-admin-ptv",{});
    S.locks=oldLocks;S.ptv=oldPtv;
    S.users=get("btech-admin-users",[
      {id:"USR-001",name:"Demo User",email:"demo@btech-tv.local",package:"5,000 Channels",expires:"2026-11-02",status:"Active"},
      {id:"USR-002",name:"Premium Viewer",email:"premium@btech-tv.local",package:"10,000 Channels",expires:"2026-11-20",status:"Active"},
      {id:"USR-003",name:"Test Account",email:"test@btech-tv.local",package:"Trial",expires:"2026-10-03",status:"Suspended"}
    ]);
    S.settings=get("btech-admin-settings",{name:"BTECH-TV WORLD",trial:5,package:500,adminPin:"1234",public:true,ptv:true,lock:true,watermark:true,paystack:true,flutter:true,monnify:true,stripe:true});
    S.activity=get("btech-admin-activity",[]);
    S.health=get("btech-admin-health",{});
    $("navChannelCount").textContent=S.channels.length.toLocaleString();refresh();
    log("Super Admin dashboard loaded");
  }catch(e){toast("Channel catalog could not be loaded.");console.error(e)}
}
function refresh(){renderOverview();populateCountries();filterChannels();renderLocked();renderUsers();renderPtv();loadSettings();renderHealth()}

function healthState(c){
  if(!c.stream)return "offline";
  if(S.locks[c.id]?.disabled||S.locks[c.id]?.locked||S.ptv[c.id]?.enabled)return "restricted";
  return "online";
}
function renderHealth(){
  const q=($("healthSearch")?.value||"").toLowerCase();
  const f=$("healthFilter")?.value||"all";
  const list=S.channels.filter(c=>{const st=healthState(c);const hay=`${c.name} ${country(c.country)} ${c.id}`.toLowerCase();return(!q||hay.includes(q))&&(f==="all"||st===f)});
  const online=S.channels.filter(c=>healthState(c)==="online").length;
  const offline=S.channels.filter(c=>healthState(c)==="offline").length;
  const restricted=S.channels.filter(c=>healthState(c)==="restricted").length;
  $("healthOnline").textContent=online.toLocaleString();$("healthOffline").textContent=offline.toLocaleString();$("healthLocked").textContent=restricted.toLocaleString();$("healthShown").textContent=list.length.toLocaleString();$("navHealthCount").textContent=offline.toLocaleString();
  $("healthRows").innerHTML=list.slice(0,300).map(c=>{const st=healthState(c);return `<tr><td><div class="channel-name">${c.logo?`<img class="channel-logo" src="${esc(c.logo)}">`:''}<b>${esc(c.name)}</b></div></td><td>${esc(country(c.country))}</td><td><span class="badge ${status(c)}">${label(status(c))}</span></td><td><span class="health-dot ${st}"></span>${st.toUpperCase()}</td><td>${esc(S.health[c.id]||"Not checked")}</td><td><button class="icon-btn" data-health-play="${esc(c.id)}">▶ Monitor</button><button class="icon-btn" data-health-check="${esc(c.id)}">↻ Check</button></td></tr>`}).join("")||'<tr><td colspan="6">No channels match the health filter.</td></tr>';
}
function checkHealth(id){const c=S.channels.find(x=>x.id===id);if(!c)return;S.health[id]=new Date().toLocaleTimeString();put("btech-admin-health",S.health);toast(`${c.name}: ${healthState(c).toUpperCase()}`);renderHealth()}
function checkAllHealth(){const now=new Date().toLocaleTimeString();S.channels.forEach(c=>S.health[c.id]=now);put("btech-admin-health",S.health);log("Channel health check completed");renderHealth()}

function renderOverview(){
 const total=S.channels.length,locked=S.channels.filter(c=>S.locks[c.id]?.locked).length,disabled=S.channels.filter(c=>S.locks[c.id]?.disabled).length,ptv=S.channels.filter(c=>S.ptv[c.id]?.enabled).length;
 $("kTotal").textContent=total.toLocaleString();$("kLive").textContent=total.toLocaleString();$("kLocked").textContent=locked.toLocaleString();$("kUsers").textContent=S.users.length;$("kPtv").textContent=ptv;$("kRevenue").textContent="₦"+demoRevenue().toLocaleString();
 $("publicCount").textContent=total-locked-ptv-disabledCount(disabled);$("lockedCount").textContent=locked;$("ptvCount").textContent=ptv;$("disabledCount").textContent=disabled;
 $("navLockedCount").textContent=locked;$("navUserCount").textContent=S.users.length;$("ptvChannels").textContent=ptv;$("ptvOrders").textContent=Object.values(S.ptv).filter(x=>x.enabled).reduce((n,x)=>n+(x.orders||0),0);$("ptvRevenue").textContent="₦"+demoRevenue().toLocaleString();renderActivity()
}
function disabledCount(n){return n}
function demoRevenue(){return Object.values(S.ptv).reduce((n,x)=>n+(x.enabled?(x.orders||0)*(x.price||0):0),0)}
function populateCountries(){const vals=[...new Set(S.channels.map(x=>x.country).filter(Boolean))].sort();$("channelCountry").innerHTML='<option value="">All countries</option>'+vals.map(x=>`<option value="${esc(x)}">${esc(country(x))}</option>`).join("")}
function filterChannels(){const q=$("channelSearch").value.toLowerCase(),co=$("channelCountry").value,st=$("channelStatus").value;S.filtered=S.channels.filter(c=>(!q||`${c.name} ${c.id} ${country(c.country)} ${(c.categories||[]).join(" ")}`.toLowerCase().includes(q))&&(!co||c.country===co)&&(!st||status(c)===st));S.page=1;renderChannelRows()}
function renderChannelRows(){const max=S.page*S.pageSize,items=S.filtered.slice(0,max);$("channelRows").innerHTML=items.map(c=>{const st=status(c);return `<tr><td><input type="checkbox" class="rowSelect" data-id="${esc(c.id)}" ${S.selected.has(c.id)?"checked":""}></td><td><div class="channel-name">${c.logo?`<img class="channel-logo" src="${esc(c.logo)}">`:""}<b>${esc(c.name)}</b></div></td><td>${esc(country(c.country))}</td><td>${esc(c.categories?.[0]||"General")}</td><td>${esc(c.quality||"LIVE")}</td><td><span class="badge ${st}">${label(st)}</span></td><td>${c.stream?"Online":"Offline"}</td><td><div class="row-actions"><button class="icon-btn" data-action="play" data-id="${esc(c.id)}">▶</button><button class="icon-btn" data-action="${st==="locked"?"unlock":"lock"}" data-id="${esc(c.id)}">${st==="locked"?"🔓":"🔒"}</button><button class="icon-btn" data-action="ptv" data-id="${esc(c.id)}">💳</button><button class="icon-btn" data-action="disable" data-id="${esc(c.id)}">⛔</button></div></td></tr>`}).join("")||'<tr><td colspan="8">No channels found.</td></tr>';$("channelResult").textContent=`Showing ${Math.min(max,S.filtered.length).toLocaleString()} of ${S.filtered.length.toLocaleString()} channels`;$("selectAll").checked=items.length>0&&items.every(c=>S.selected.has(c.id));}
function toggleLock(id,on=true){S.locks[id]={...(S.locks[id]||{}),locked:on,disabled:false};put("btech-admin-locks",S.locks);log(`${on?"Locked":"Unlocked"} channel: ${id}`);refresh()}
function toggleDisable(id){S.locks[id]={...(S.locks[id]||{}),disabled:!S.locks[id]?.disabled,locked:false};put("btech-admin-locks",S.locks);log(`${S.locks[id].disabled?"Disabled":"Enabled"} channel: ${id}`);refresh()}
function setPtv(id){const c=S.channels.find(x=>x.id===id),old=S.ptv[id]||{};showModal(`<h2>Pay-To-View Setup</h2><div class="modal-form"><label>Channel<input value="${esc(c.name)}" disabled></label><label>Price (NGN)<input id="mPrice" type="number" value="${old.price||1000}"></label><label>Duration<select id="mDuration"><option>24 Hours</option><option>7 Days</option><option>30 Days</option></select></label><button class="small primary" id="mSave">Save Pay-To-View</button></div>`);$("mSave").onclick=()=>{S.ptv[id]={enabled:true,price:Number($("mPrice").value)||0,duration:$("mDuration").value,orders:old.orders||0};S.locks[id]={...(S.locks[id]||{}),locked:true,disabled:false};put("btech-admin-ptv",S.ptv);put("btech-admin-locks",S.locks);closeModal();log(`Pay-To-View enabled: ${id}`);refresh()}}
function renderLocked(){const items=S.channels.filter(c=>S.locks[c.id]?.locked||S.ptv[c.id]?.enabled||S.locks[c.id]?.disabled);$("lockedCards").innerHTML=items.map(c=>{const st=status(c),p=S.ptv[c.id];return `<div class="locked-card"><h3>${esc(c.name)}</h3><p>${esc(country(c.country))} • ${esc(c.categories?.[0]||"General")}</p><div class="line"><span>Access</span><b class="badge ${st}">${label(st)}</b></div>${p?.enabled?`<div class="line"><span>Price</span><b>₦${Number(p.price||0).toLocaleString()}</b></div><div class="line"><span>Orders</span><b>${p.orders||0}</b></div>`:""}<button class="small" data-unlock="${esc(c.id)}">${st==="disabled"?"Enable":"Unlock"} Channel</button></div>`}).join("")||'<div class="panel">No locked or restricted channels.</div>'}
function renderUsers(){const q=$("userSearch").value.toLowerCase(),st=$("userStatus").value;const us=S.users.filter(u=>(!q||`${u.name} ${u.email} ${u.package}`.toLowerCase().includes(q))&&(!st||u.status===st));$("userRows").innerHTML=us.map(u=>`<tr><td><b>${esc(u.name)}</b><br><small>${esc(u.id)}</small></td><td>${esc(u.email)}</td><td>${esc(u.package)}</td><td>${esc(u.expires)}</td><td><span class="badge ${u.status==="Active"?"public":"disabled"}">${esc(u.status)}</span></td><td><button class="icon-btn" data-user="${esc(u.id)}">Manage</button></td></tr>`).join("")}
function renderPtv(){const items=S.channels.filter(c=>S.ptv[c.id]?.enabled);$("ptvRows").innerHTML=items.map(c=>{const p=S.ptv[c.id];return `<tr><td><b>${esc(c.name)}</b><br><small>${esc(country(c.country))}</small></td><td>₦${Number(p.price||0).toLocaleString()}</td><td>${esc(p.duration||"24 Hours")}</td><td><span class="badge ptv">ACTIVE</span></td><td><button class="icon-btn" data-ptvremove="${esc(c.id)}">Remove</button><button class="icon-btn" data-ptvorder="${esc(c.id)}">＋ Demo Sale</button></td></tr>`}).join("")||'<tr><td colspan="5">No Pay-To-View channels configured.</td></tr>'}
function renderActivity(){$("activityLog").innerHTML=S.activity.slice(0,8).map(x=>`<div><b>${esc(x.action)}</b><br><small>${esc(x.time)}</small></div>`).join("")||"<div>No activity yet.</div>"}
function loadSettings(){const s=S.settings;$("sName").value=s.name;$("sTrial").value=s.trial;$("sPackage").value=s.package;$("sPin").value=s.adminPin;$("sPublic").checked=s.public;$("sPtv").checked=s.ptv;$("sLock").checked=s.lock;$("sWatermark").checked=s.watermark;$("gPaystack").checked=s.paystack;$("gFlutter").checked=s.flutter;$("gMonnify").checked=s.monnify;$("gStripe").checked=s.stripe}
function saveSettings(){S.settings={name:$("sName").value,trial:Number($("sTrial").value),package:Number($("sPackage").value),adminPin:$("sPin").value,public:$("sPublic").checked,ptv:$("sPtv").checked,lock:$("sLock").checked,watermark:$("sWatermark").checked,paystack:$("gPaystack").checked,flutter:$("gFlutter").checked,monnify:$("gMonnify").checked,stripe:$("gStripe").checked};put("btech-admin-settings",S.settings);log("Platform settings saved");toast("Settings saved")}
function showModal(body){$("modalBody").innerHTML=body;$("modal").classList.add("show")}
function closeModal(){$("modal").classList.remove("show")}
function addUser(){showModal(`<h2>Add User</h2><div class="modal-form"><label>Name<input id="uName"></label><label>Email<input id="uEmail" type="email"></label><label>Package<input id="uPackage" value="500 Channels"></label><label>Expiry<input id="uExpiry" type="date"></label><button id="uSave" class="small primary">Create User</button></div>`);$("uSave").onclick=()=>{const u={id:"USR-"+String(Date.now()).slice(-6),name:$("uName").value||"New User",email:$("uEmail").value||"user@btech-tv.local",package:$("uPackage").value,expires:$("uExpiry").value||"—",status:"Active"};S.users.push(u);put("btech-admin-users",S.users);closeModal();log(`Created user: ${u.email}`);refresh()}}
function manageUser(id){const u=S.users.find(x=>x.id===id);if(!u)return;showModal(`<h2>Manage User</h2><div class="modal-form"><label>Name<input id="eName" value="${esc(u.name)}"></label><label>Package<input id="ePackage" value="${esc(u.package)}"></label><label>Status<select id="eStatus"><option ${u.status==="Active"?"selected":""}>Active</option><option ${u.status==="Suspended"?"selected":""}>Suspended</option></select></label><button id="eSave" class="small primary">Save User</button></div>`);$("eSave").onclick=()=>{u.name=$("eName").value;u.package=$("ePackage").value;u.status=$("eStatus").value;put("btech-admin-users",S.users);closeModal();log(`Updated user: ${u.email}`);refresh()}}
function nav(section){document.querySelectorAll(".section").forEach(x=>x.classList.toggle("active",x.id===section));document.querySelectorAll(".admin-nav").forEach(x=>x.classList.toggle("active",x.dataset.section===section));const titles={overview:"Super Admin Overview",channels:"All Channels",health:"Channel Health Monitor",locked:"Locked Channel Manager",users:"User Manager",payview:"Pay-To-View",settings:"Platform Settings"};$("sectionTitle").textContent=titles[section]||"Super Admin"}
document.addEventListener("click",e=>{
 const n=e.target.closest(".admin-nav");if(n)nav(n.dataset.section);
 const go=e.target.closest("[data-go]");if(go)nav(go.dataset.go);
 const a=e.target.closest("[data-action]");if(a){const id=a.dataset.id;if(a.dataset.action==="lock")toggleLock(id,true);if(a.dataset.action==="unlock")toggleLock(id,false);if(a.dataset.action==="disable")toggleDisable(id);if(a.dataset.action==="ptv")setPtv(id);if(a.dataset.action==="play"){monitorChannel(id);window.scrollTo({top:0,behavior:"smooth"})}} 
 const un=e.target.closest("[data-unlock]");if(un)toggleLock(un.dataset.unlock,false);
 const hp=e.target.closest("[data-health-play]");if(hp){monitorChannel(hp.dataset.healthPlay);window.scrollTo({top:0,behavior:"smooth"})}
 const hc=e.target.closest("[data-health-check]");if(hc)checkHealth(hc.dataset.healthCheck);
 const user=e.target.closest("[data-user]");if(user)manageUser(user.dataset.user);
 const rem=e.target.closest("[data-ptvremove]");if(rem){delete S.ptv[rem.dataset.ptvremove];put("btech-admin-ptv",S.ptv);log(`Removed Pay-To-View: ${rem.dataset.ptvremove}`);refresh()}
 const sale=e.target.closest("[data-ptvorder]");if(sale){const id=sale.dataset.ptvorder;S.ptv[id].orders=(S.ptv[id].orders||0)+1;put("btech-admin-ptv",S.ptv);log(`Recorded demo Pay-To-View sale: ${id}`);refresh()}
});
$("healthSearch").oninput=renderHealth;$("healthFilter").onchange=renderHealth;$("healthRefresh").onclick=checkAllHealth;
$("channelSearch").oninput=filterChannels;$("channelCountry").onchange=filterChannels;$("channelStatus").onchange=filterChannels;$("userSearch").oninput=renderUsers;$("userStatus").onchange=renderUsers;
$("selectAll").onchange=e=>{S.filtered.slice(0,S.page*S.pageSize).forEach(c=>e.target.checked?S.selected.add(c.id):S.selected.delete(c.id));renderChannelRows()};
document.addEventListener("change",e=>{if(e.target.classList.contains("rowSelect")){e.target.checked?S.selected.add(e.target.dataset.id):S.selected.delete(e.target.dataset.id)}});
$("bulkLock").onclick=()=>{S.selected.forEach(id=>S.locks[id]={...(S.locks[id]||{}),locked:true,disabled:false});put("btech-admin-locks",S.locks);log(`Locked ${S.selected.size} selected channels`);S.selected.clear();refresh()};
$("bulkUnlock").onclick=()=>{S.selected.forEach(id=>{if(S.locks[id])S.locks[id].locked=false});put("btech-admin-locks",S.locks);log(`Unlocked ${S.selected.size} selected channels`);S.selected.clear();refresh()};
$("bulkPtv").onclick=()=>{S.selected.forEach(id=>S.ptv[id]={enabled:true,price:1000,duration:"24 Hours",orders:S.ptv[id]?.orders||0});put("btech-admin-ptv",S.ptv);log(`Pay-To-View enabled for ${S.selected.size} selected channels`);S.selected.clear();refresh()};
$("prevPage").onclick=()=>{S.page=Math.max(1,S.page-1);renderChannelRows()};$("nextPage").onclick=()=>{if(S.page*S.pageSize<S.filtered.length)S.page++;renderChannelRows()};
$("unlockAll").onclick=()=>{S.channels.forEach(c=>{if(S.locks[c.id])S.locks[c.id].locked=false});put("btech-admin-locks",S.locks);log("Unlocked all channels");refresh()};
$("addUser").onclick=addUser;$("addPtv").onclick=()=>nav("channels");$("saveSettings").onclick=saveSettings;
$("closeModal").onclick=closeModal;$("modal").onclick=e=>{if(e.target.id==="modal")closeModal()};
$("previewBtn").onclick=()=>{nav("channels");if(S.channels[0])monitorChannel(S.channels[0].id)};
$("monitorPlay").onclick=()=>{if(!S.monitorId){if(S.channels[0])monitorChannel(S.channels[0].id);return}$("monitorVideo").play().then(()=>$("monitorStatus").textContent="LIVE").catch(()=>{})};
$("monitorStop").onclick=stopMonitor;$("monitorPrev").onclick=()=>monitorMove(-1);$("monitorNext").onclick=()=>monitorMove(1);$("monitorFullscreen").onclick=()=>{const v=$("monitorVideo");(v.requestFullscreen||v.webkitRequestFullscreen||v.msRequestFullscreen)?.call(v)};$("monitorVideo").addEventListener("timeupdate",syncMonitorClock);$("monitorVideo").addEventListener("playing",()=>$("monitorStatus").textContent="LIVE");$("monitorVideo").addEventListener("waiting",()=>$("monitorStatus").textContent="BUFFERING");
$("exportBtn").onclick=()=>{const data={exportedAt:new Date().toISOString(),channels:S.channels,locks:S.locks,ptv:S.ptv,users:S.users,settings:S.settings,activity:S.activity};const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));a.download="btech-tv-super-admin-export.json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)};
$("resetBtn").onclick=()=>{if(!confirm("Reset local Super Admin controls?"))return;["btech-admin-locks","btech-admin-ptv","btech-admin-users","btech-admin-settings","btech-admin-activity","btech-admin-health"].forEach(k=>localStorage.removeItem(k));location.reload()};
document.querySelectorAll(".admin-nav").forEach(x=>x.addEventListener("keydown",e=>{if(e.key==="Enter")nav(x.dataset.section)}));
load();
