/* Parlā Studio — client portal app.
   Runs in preview mode (sample data, role switch) until config.js points at a Supabase project. */
(function(){
"use strict";
const cfg=window.STUDIO_CONFIG||{};
const LIVE=!!(cfg.SUPABASE_URL&&cfg.SUPABASE_ANON_KEY&&window.supabase);
const DESIGNER_NAME=cfg.DESIGNER_NAME||"Corina";

/* ---------- helpers ---------- */
const $=(s,r)=>(r||document).querySelector(s);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid=()=>"x"+Math.random().toString(36).slice(2,10)+Date.now().toString(36);
const linkify=t=>esc(t).replace(/(https?:\/\/[^\s<]+)/g,u=>`<a class="link" href="${u}" target="_blank" rel="noopener">${u.replace(/^https?:\/\//,"").replace(/\/$/,"")}</a>`);
const DF=new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric"});
const DFY=new Intl.DateTimeFormat("en-US",{month:"long",day:"numeric",year:"numeric"});
const DFW=new Intl.DateTimeFormat("en-US",{weekday:"long",month:"long",day:"numeric"});
const TF=new Intl.DateTimeFormat("en-US",{hour:"numeric",minute:"2-digit"});
const fmtDate=iso=>iso?DF.format(new Date(iso)):"";
const fmtLong=iso=>iso?DFY.format(new Date(iso)):"";
const fmtWeek=iso=>iso?DFW.format(new Date(iso)):"";
const fmtTime=iso=>iso?TF.format(new Date(iso)):"";
const fmtStamp=iso=>iso?`${fmtDate(iso)} · ${fmtTime(iso)}`:"";
const money=n=>n==null?"":"$"+Number(n).toLocaleString("en-US",{minimumFractionDigits:n%1?2:0,maximumFractionDigits:2});
const toLocalInput=iso=>{if(!iso)return"";const d=new Date(iso);const p=n=>String(n).padStart(2,"0");return`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;};
const toDateInput=iso=>iso?toLocalInput(iso).slice(0,10):"";
let toastT;function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove("show"),2200);}
const readFile=f=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(f);});

/* Automatic room sorting for conversation notes. A note is filed under the room whose
   words it uses most; ties or no match leave it Unsorted for a person to place. */
const ROOM_WORDS={
  "Entry & outdoor":["entry","entrance","front door","back door","mudroom","shoes","coats","outdoor","outside","garden","firepit","fire pit","patio","deck","yard","surf","board","bike","wetsuit","outdoor shower","landing","porch","gate","fence","planter"],
  "Kitchen":["kitchen","island","counter","countertop","range","stove","oven","fridge","sink","pantry","cabinet","backsplash","dishwasher","table","dining","breakfast","toaster","kettle","cooking","cook"],
  "Living":["living","couch","sofa","fireplace","tv","television","game night","lounge","rug","coffee table","bookshelf","shelves"],
  "Bedrooms":["bedroom","bed","closet","wardrobe","sleep","nightstand","curtain","blackout","dresser","zoe","nursery","kids room"],
  "Bathrooms":["bathroom","bath","shower","toilet","vanity","tile","bidet","mirror","towel","tub","sink"],
  "Loft & office":["loft","office","desk","attic","upstairs","work from home","wfh","study","monitor","projector screen"],
  "Hosting":["host","hosting","guests","guest","party","dinner party","stay over","overnight","entertain","dishware","plates","glasses"]
};
function autoRoom(text,rooms){
  const t=" "+String(text||"").toLowerCase().replace(/[^a-z0-9' ]+/g," ")+" ";
  let best=null,bestN=0,tie=false;
  for(const room of rooms){
    const words=ROOM_WORDS[room]||[room.toLowerCase()];
    let n=0;for(const w of words){const re=new RegExp("(^|\\W)"+w.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"(s|es)?(\\W|$)","g");n+=(t.match(re)||[]).length;}
    if(n>bestN){best=room;bestN=n;tie=false;}else if(n===bestN&&n>0)tie=true;
  }
  return bestN>0&&!tie?best:"";
}

/* Draft a directive from a message: second person, statements only, first two sentences. */
function suggestDirective(n){
  let t=String(n.body||"").replace(/\s+/g," ").trim();
  const sentences=t.match(/[^.!?]+[.!?]?/g)||[t];
  const keep=sentences.map(x=>x.trim()).filter(x=>x&&!/\?$/.test(x)).slice(0,2);
  t=(keep.length?keep:sentences.slice(0,1)).join(" ").replace(/\?/g,".");
  const map=[[/\bwe'd\b/gi,"you'd"],[/\bwe're\b/gi,"you're"],[/\bwe've\b/gi,"you've"],[/\bwe\b/gi,"you"],[/\bour\b/gi,"your"],[/\bours\b/gi,"yours"],[/\bus\b/gi,"you"],[/\bI'd\b/g,"you'd"],[/\bI'm\b/g,"you're"],[/\bI've\b/g,"you've"],[/\bI\b/g,"you"],[/\bmy\b/gi,"your"],[/\bmine\b/gi,"yours"],[/\bme\b/gi,"you"]];
  for(const [re,to] of map)t=t.replace(re,m=>m[0]===m[0].toUpperCase()&&m[0]!==m[0].toLowerCase()?to[0].toUpperCase()+to.slice(1):to);
  t=t.replace(/^(so|also|and|but)\s+/i,"");
  t=t.charAt(0).toUpperCase()+t.slice(1);
  if(!/[.!]$/.test(t))t+=".";
  return t;
}
const STATUS={noted:"Noted",directive:"Added as a directive",integrated:"Integrated"};
const noteStatus=n=>n.status||(n.integrated_at?"integrated":"");
/* ---------- state ---------- */
let store=null, me=null, project=null, route="home", notifs=[];
let ui={room:"all",sort:"recent",open:{},review:false,payOpen:null,projEdit:false,toDir:{},commentOpen:{},reqOpen:false,roomEdit:null,roomAdd:false,editing:{},composeImgs:[],replyOpen:{},stageEdit:null,meetingEdit:false,askOpen:false};
const isDesigner=()=>me&&me.role==="designer";
const member=id=>(project.members||[]).find(m=>m.id===id)||{name:"—"};
const nameOf=id=>member(id).name;

/* ---------- Preview store (sample data in this browser only) ---------- */
class MockStore{
  constructor(){this.key="parla-studio-preview-v2-"+(cfg.PREVIEW_AS||"any");}
  load(){
    let saved=null;try{saved=JSON.parse(localStorage.getItem(this.key)||"null");}catch(e){}
    this.all=saved&&saved.all?saved.all:JSON.parse(JSON.stringify(window.SAMPLE_PROJECTS||[window.SAMPLE_PROJECT]));
    this.project=this.all.find(p=>p.id===(saved&&saved.pid))||this.all[0];
    this.meId=cfg.PREVIEW_AS||(saved&&saved.meId)||"u-cori";
  }
  persist(){try{localStorage.setItem(this.key,JSON.stringify({all:this.all,pid:this.project.id,meId:this.meId}));}catch(e){}}
  async init(){this.load();const mine=this.all.filter(p=>p.members.some(m=>m.id===this.meId));if(!mine.includes(this.project))this.project=mine[0];return{me:this.project.members.find(m=>m.id===this.meId),project:this.project};}
  async loadProject(id){this.project=this.all.find(p=>p.id===id)||this.project;this.persist();return this.project;}
  async listProjects(){const did=this.meId;return this.all.filter(p=>p.members.some(m=>m.id===did)).map(p=>{const dz=(p.designer||{}).id;const cs=p.stages.find(s=>s.status==="current");return{id:p.id,name:p.name,clients:p.members.filter(m=>m.role==="client").map(m=>m.name).join(" & "),unread:p.notes.filter(n=>!n.read_at&&n.author_id!==dz).length,changed:p.intake.flatMap(x=>x.questions).filter(q=>q.updated_by&&q.updated_by!==dz&&!q.seen_by_designer).length,stage:cs?cs.title:"",stage_due:cs?cs.due:null,meeting:p.meeting?p.meeting.when:null,meeting_request:!!(p.meeting&&p.meeting.change_request),payment_requested:p.stages.filter(x=>x.payment.status==="requested").length,last_activity:[...p.notes.map(n=>n.created_at),...p.notes.flatMap(n=>n.replies.map(r=>r.created_at))].sort().pop()||null};});}
  switchUser(id){this.meId=id;this.persist();return this.project.members.find(m=>m.id===id);}
  reset(){try{localStorage.removeItem(this.key);}catch(e){}this.load();return{me:this.project.members.find(m=>m.id===this.meId),project:this.project};}
  async createProject(name,clients){const p=JSON.parse(JSON.stringify(window.SAMPLE_PROJECT));p.id=uid();p.name=name;p.members=[p.designer,...clients.map(c=>({id:uid(),name:c.name||c.email.split("@")[0],email:c.email,role:"client"}))];p.notes=[];p.notifs=[];p.meeting=null;p.documents=[];p.architect_images=[];p.pinterest_url="";p.pinterest_note="";p.intake.forEach(s=>{s.title=s.room||s.title;s.questions=[];});p.stages.forEach((s,i)=>{s.status=i===0?"current":"upcoming";s.due=null;s.payment={status:s.fee?"upcoming":"free",amount:s.fee||0,date:null};});this.all.push(p);this.project=p;this.persist();return p.id;}
  async signIn(){return{ok:true};}
  async signInEmail(){return{ok:true};}
  async checkPin(){return true;}
  async tellClients(qid){const q=this.project.intake.flatMap(s=>s.questions).find(x=>x.id===qid);this.project.notifs=this.project.notifs||[];this.project.members.filter(m=>m.role==="client").forEach(m=>this.project.notifs.push({id:uid(),to:m.id,subject:"New directive · "+this.project.name,body:q?q.directive:"",link:"#directives",created_at:new Date().toISOString(),seen_at:null}));this.persist();}
  async ensureCred(){}
  async signOut(){}
  async setMyName(n){this.all.forEach(p=>{const m=p.members.find(x=>x.id===this.meId);if(m)m.name=n;});this.persist();}
  async setMyEmail(em){this.all.forEach(p=>{const m=p.members.find(x=>x.id===this.meId);if(m)m.email=em;});this.persist();return{ok:true};}
  async loadNotifs(){return (this.project.notifs||[]).filter(n=>n.to===this.meId);}
  async markNotifSeen(id){const n=(this.project.notifs||[]).find(x=>x.id===id);if(n)n.seen_at=new Date().toISOString();this.persist();}
  async markNotifsSeenByLink(link){(this.project.notifs||[]).forEach(n=>{if(n.to===this.meId&&!n.seen_at&&n.link===link)n.seen_at=new Date().toISOString();});this.persist();}
  async markAllNotifsSeen(){(this.project.notifs||[]).forEach(n=>{if(n.to===this.meId&&!n.seen_at)n.seen_at=new Date().toISOString();});this.persist();}
  async uploadImage(file){return readFile(file);}
  async saveAnswer(qid,text){for(const s of this.project.intake)for(const q of s.questions)if(q.id===qid){q.a=text;q.updated_at=new Date().toISOString();q.updated_by=me.id;q.seen_by_designer=me.role==="designer";}this.persist();}
  async markAnswerSeen(qid){for(const s of this.project.intake)for(const q of s.questions)if(q.id===qid)q.seen_by_designer=true;this.persist();}
  async addDirective(sid,text,extra){const s=this.project.intake.find(x=>x.id===sid);const q={id:uid(),q:"",a:"",directive:text,directive_reviewed:true,images:(extra&&extra.images)||[],source_note_id:(extra&&extra.source_note_id)||null,updated_at:new Date().toISOString(),updated_by:me.id,added_by:me.id,seen_by_designer:me.role==="designer"};s.questions.push(q);this.persist();return q;}
  async addQuestion(sid,text){const s=this.project.intake.find(x=>x.id===sid);const q={id:uid(),q:text,a:"",directive:"",directive_reviewed:false,updated_at:null,updated_by:null,seen_by_designer:true};s.questions.push(q);this.persist();return q;}
  async deleteDirective(qid){for(const s of this.project.intake)s.questions=s.questions.filter(q=>q.id!==qid);this.persist();}
  async addComment(qid,body){const c={id:uid(),author_id:me.id,body,created_at:new Date().toISOString()};for(const s of this.project.intake)for(const q of s.questions)if(q.id===qid){q.comments=q.comments||[];q.comments.push(c);if(me.role!=="designer"){q.seen_by_designer=false;q.updated_by=me.id;q.updated_at=c.created_at;}}this.persist();return c;}
  async saveDirective(qid,patch){for(const s of this.project.intake)for(const q of s.questions)if(q.id===qid)Object.assign(q,patch);this.persist();}
  async addDocument(doc){this.project.documents.push({id:uid(),added_by:me.id,...doc});this.persist();}
  async removeDocument(id){this.project.documents=this.project.documents.filter(x=>x.id!==id);this.persist();}
  async addNote(n){const note={id:uid(),author_id:me.id,room:n.room||"",body:n.body,images:n.images||[],created_at:new Date().toISOString(),edited_at:null,read_at:me.role==="designer"?new Date().toISOString():null,integrated_at:null,replies:[]};this.project.notes.unshift(note);this.persist();return note;}
  async editNote(id,body){const n=this.project.notes.find(x=>x.id===id);if(n){n.body=body;n.edited_at=new Date().toISOString();if(me.role!=="designer")n.read_at=null;}this.persist();}
  async setNoteRoom(id,room){const n=this.project.notes.find(x=>x.id===id);if(n)n.room=room;this.persist();}
  async markRead(id,on){const n=this.project.notes.find(x=>x.id===id);if(n)n.read_at=on?new Date().toISOString():null;this.persist();}
  async markIntegrated(id,on){const n=this.project.notes.find(x=>x.id===id);if(n)n.integrated_at=on?new Date().toISOString():null;this.persist();}
  async setStatus(id,st){const n=this.project.notes.find(x=>x.id===id);if(n){n.status=st;n.status_at=st?new Date().toISOString():null;n.integrated_at=st==="integrated"?n.status_at:null;if(st&&!n.read_at)n.read_at=n.status_at;}this.persist();}
  async addReply(noteId,body){const n=this.project.notes.find(x=>x.id===noteId);const r={id:uid(),author_id:me.id,body,created_at:new Date().toISOString()};n.replies.push(r);this.persist();return r;}
  async saveStage(st){const i=this.project.stages.findIndex(x=>x.id===st.id);if(i<0){st.id=uid();this.project.stages.push(st);}else this.project.stages[i]=st;this.project.stages.sort((a,b)=>a.order-b.order);this.persist();}
  async deleteStage(id){this.project.stages=this.project.stages.filter(x=>x.id!==id);this.persist();}
  async saveMeeting(m){this.project.meeting=m;this.persist();}
  async addImage(img){this.project.architect_images.push({id:uid(),...img});this.persist();}
  async removeImage(id){this.project.architect_images=this.project.architect_images.filter(x=>x.id!==id);this.persist();}
  async savePinterest(url,note){this.project.pinterest_url=url;this.project.pinterest_note=note;this.persist();}
  async setRooms(rooms){const p=this.project;const removed=p.rooms.filter(r=>!rooms.includes(r));for(const r of removed){const sec=p.intake.find(x=>x.room===r);if(sec&&sec.questions.length)throw new Error(`"${r}" still has directives; move or delete them first`);}p.intake=p.intake.filter(x=>!removed.includes(x.room));for(const r of rooms)if(!p.intake.some(x=>x.room===r))p.intake.push({id:uid(),title:r,room:r,questions:[]});p.intake.sort((a,b)=>rooms.indexOf(a.room)-rooms.indexOf(b.room));p.rooms=rooms;this.persist();}
  async renameRoom(old,nw){const p=this.project;p.rooms=p.rooms.map(r=>r===old?nw:r);p.intake.forEach(s=>{if(s.room===old){s.room=nw;s.title=nw;}});p.notes.forEach(n=>{if(n.room===old)n.room=nw;});this.persist();}
  async setEmailAlerts(on){this.project.members.forEach(m=>{if(m.id===this.meId)m.email_alerts=on;});this.persist();}
  async updateProject(name,clients){const p=this.project;p.name=name;const keep=p.members.filter(m=>m.role!=="client");p.members=[...keep,...clients.map(c=>{const ex=p.members.find(m=>(m.email||"").toLowerCase()===c.email);return ex?{...ex,name:c.name||ex.name}:{id:uid(),name:c.name||c.email.split("@")[0],email:c.email,role:"client"};})];this.persist();}
}

/* ---------- Supabase store ---------- */
class SupabaseStore{
  constructor(){this.sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);}
  async init(){
    const {data:{session}}=await this.sb.auth.getSession();
    if(!session)return null;
    const u=session.user;
    await this.sb.rpc("join_invited_projects");
    const {data:prof}=await this.sb.from("profiles").select("*").eq("id",u.id).maybeSingle();
    if(!prof){await this.sb.from("profiles").upsert({id:u.id,email:u.email,name:(u.email||"").split("@")[0]});}
    const designerEmails=[].concat(cfg.DESIGNER_EMAILS||[],cfg.DESIGNER_EMAIL||[]).map(e=>String(e).toLowerCase());
    const designer=designerEmails.includes((u.email||"").toLowerCase());
    const prefix=(u.email||"").split("@")[0];
    let nm=prof&&prof.name||"";
    if(designer&&(!nm||nm.toLowerCase()===prefix.toLowerCase())){nm=DESIGNER_NAME;await this.sb.from("profiles").update({name:nm}).eq("id",u.id);}
    me={id:u.id,email:u.email,name:nm||prefix,role:designer?"designer":"client",email_alerts:!!(prof&&prof.email_alerts)};
    const {data:mems}=await this.sb.from("project_members").select("project_id, projects(id,name)").eq("user_id",u.id);
    this.projects=(mems||[]).map(m=>m.projects).filter(Boolean);
    let pid=null;try{pid=localStorage.getItem("parla-studio-project");}catch(e){}
    const chosen=this.projects.find(p=>p.id===pid)||this.projects[0];
    if(!chosen)return{me,project:null};
    return{me,project:await this.loadProject(chosen.id)};
  }
  async listProjects(){const {data}=await this.sb.rpc("project_summaries");this.projects=(data||[]).map(p=>({id:p.id,name:p.name}));return data||[];}
  async loadProject(id){
    const sb=this.sb;
    const [{data:p},{data:mems},{data:secs},{data:qs},{data:notes},{data:reps},{data:stages},{data:meet},{data:imgs}]=await Promise.all([
      sb.from("projects").select("*").eq("id",id).single(),
      sb.from("project_members").select("user_id, role, profiles(id,name,email)").eq("project_id",id),
      sb.from("intake_sections").select("*").eq("project_id",id).order("position"),
      sb.from("intake_questions").select("*").eq("project_id",id).order("position"),
      sb.from("notes").select("*").eq("project_id",id).order("created_at",{ascending:false}),
      sb.from("note_replies").select("*").eq("project_id",id).order("created_at"),
      sb.from("stages").select("*").eq("project_id",id).order("position"),
      sb.from("meetings").select("*").eq("project_id",id).order("when").limit(1).maybeSingle(),
      sb.from("architect_images").select("*").eq("project_id",id).order("position")
    ]);
    const {data:docs}=await sb.from("documents").select("*").eq("project_id",id).order("position");
    const {data:invs}=await sb.from("project_invites").select("email,name").eq("project_id",id);
    const {data:cmts}=await sb.from("directive_comments").select("*").eq("project_id",id).order("created_at");
    try{localStorage.setItem("parla-studio-project",id);}catch(e){}
    const members=(mems||[]).map(m=>({id:m.user_id,role:m.role,name:m.profiles?m.profiles.name:"—",email:m.profiles?m.profiles.email:""}));
    this.pid=id;
    return{
      id:p.id,name:p.name,designer:members.find(m=>m.role==="designer"),members,invites:invs||[],
      rooms:p.rooms||[],pin:p.pin||"",pinterest_url:p.pinterest_url||"",pinterest_note:p.pinterest_note||"",
      architect_images:imgs||[],documents:docs||[],
      intake:(secs||[]).map(s=>({id:s.id,title:s.title,room:s.room||"",questions:(qs||[]).filter(q=>q.section_id===s.id).map(q=>({id:q.id,q:q.question||"",a:q.answer||"",directive:q.directive||"",directive_reviewed:!!q.directive_reviewed,images:q.images||[],source_note_id:q.source_note_id,comments:(cmts||[]).filter(c=>c.question_id===q.id),updated_at:q.updated_at,updated_by:q.updated_by,added_by:q.added_by,seen_by_designer:q.seen_by_designer}))})),
      notes:(notes||[]).map(n=>({...n,images:n.images||[],replies:(reps||[]).filter(r=>r.note_id===n.id)})),
      process:p.process||[],
      stages:(stages||[]).map(s=>({id:s.id,order:s.position,title:s.title,focus:s.focus||"",desc:s.description||"",deliverable:s.deliverable||"",due:s.due,status:s.status,standard:s.standard,fee:s.fee,hourly:s.hourly,payment:{status:s.payment_status||"upcoming",amount:s.payment_amount,date:s.payment_date}})),
      meeting:meet?{id:meet.id,when:meet.when,where:meet.where||"",notes:meet.notes||"",change_request:meet.change_request}:null
    };
  }
  async setMyName(n){await this.sb.from("profiles").update({name:n}).eq("id",me.id);}
  async setMyEmail(em){const {error}=await this.sb.auth.updateUser({email:em},{emailRedirectTo:location.origin+location.pathname});if(error)return{ok:false,error:error.message};return{ok:true};}
  async loadNotifs(){const {data}=await this.sb.from("notifications").select("id,subject,body,link,created_at,seen_at").eq("to_user",me.id).order("created_at",{ascending:false}).limit(30);return data||[];}
  async markNotifSeen(id){await this.sb.from("notifications").update({seen_at:new Date().toISOString()}).eq("id",id);}
  async markNotifsSeenByLink(link){await this.sb.from("notifications").update({seen_at:new Date().toISOString()}).eq("to_user",me.id).eq("link",link).is("seen_at",null);}
  async markAllNotifsSeen(){await this.sb.from("notifications").update({seen_at:new Date().toISOString()}).eq("to_user",me.id).is("seen_at",null);}
  // Email-only sign-in: the account credential is derived from the address, so nothing to remember.
  async cred(email){const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode("parla-studio:"+email.toLowerCase()));return "s"+Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("").slice(0,40);}
  async signInEmail(email){
    const password=await this.cred(email);
    let {error}=await this.sb.auth.signInWithPassword({email,password});
    if(!error)return{ok:true};
    const {data:pid}=await this.sb.rpc("email_ok",{p_email:email});
    if(!pid)return{ok:false,error:"No project for that email yet. Check the address with "+DESIGNER_NAME+"."};
    const r=await this.sb.auth.signUp({email,password});
    if(r.error)return{ok:false,error:r.error.message};
    if(!r.data.session)return{ok:false,error:"Check your email to confirm, then sign in again."};
    return{ok:true};
  }
  async tellClients(qid){await this.sb.rpc("notify_directive",{p_question:qid});}
  async checkPin(pin){const {data}=await this.sb.rpc("designer_pin_ok",{p_pin:pin});return !!data;}
  // One-time: an account that signed in by link (before email-only) gets its derived credential set.
  async ensureCred(){try{if(localStorage.getItem("parla-studio-cred")==="1")return;const password=await this.cred(me.email);const {error}=await this.sb.auth.updateUser({password});if(!error)localStorage.setItem("parla-studio-cred","1");}catch(e){}}
  async signIn(email){const {error}=await this.sb.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname}});return{ok:!error,error:error&&error.message};}
  async signOut(){await this.sb.auth.signOut();}
  async uploadImage(file){
    const path=`${this.pid}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g,"_")}`;
    const {error}=await this.sb.storage.from("studio").upload(path,file,{upsert:false});
    if(error)throw error;
    return this.sb.storage.from("studio").getPublicUrl(path).data.publicUrl;
  }
  async saveAnswer(qid,text){await this.sb.from("intake_questions").update({answer:text,updated_at:new Date().toISOString(),updated_by:me.id,seen_by_designer:me.role==="designer"}).eq("id",qid);}
  async markAnswerSeen(qid){await this.sb.from("intake_questions").update({seen_by_designer:true}).eq("id",qid);}
  async addDirective(sid,text,extra){const {data,error}=await this.sb.from("intake_questions").insert({project_id:this.pid,section_id:sid,position:Date.now(),question:"",answer:"",directive:text,directive_reviewed:true,images:(extra&&extra.images)||[],source_note_id:(extra&&extra.source_note_id)||null,updated_at:new Date().toISOString(),updated_by:me.id,added_by:me.id,seen_by_designer:me.role==="designer"}).select().single();if(error)throw error;return{id:data.id,q:"",a:"",directive:data.directive,directive_reviewed:true,images:data.images||[],source_note_id:data.source_note_id,comments:[],updated_at:data.updated_at,updated_by:data.updated_by,added_by:data.added_by,seen_by_designer:data.seen_by_designer};}
  async addQuestion(sid,text){const {data,error}=await this.sb.from("intake_questions").insert({project_id:this.pid,section_id:sid,position:Date.now(),question:text}).select().single();if(error)throw error;return{id:data.id,q:text,a:"",directive:"",directive_reviewed:false,updated_at:null,updated_by:null,seen_by_designer:true};}
  async deleteDirective(qid){await this.sb.from("intake_questions").delete().eq("id",qid);}
  async addComment(qid,body){const {data,error}=await this.sb.from("directive_comments").insert({question_id:qid,project_id:this.pid,author_id:me.id,body}).select().single();if(error)throw error;if(me.role!=="designer")await this.sb.from("intake_questions").update({seen_by_designer:false,updated_by:me.id,updated_at:new Date().toISOString()}).eq("id",qid);return data;}
  async saveDirective(qid,patch){const row={};if("directive"in patch)row.directive=patch.directive;if("a"in patch)row.answer=patch.a;for(const k of ["updated_at","updated_by","seen_by_designer","directive_reviewed"])if(k in patch)row[k]=patch[k];await this.sb.from("intake_questions").update(row).eq("id",qid);}
  async addDocument(doc){await this.sb.from("documents").insert({project_id:this.pid,title:doc.title,kind:doc.kind,url:doc.url,note:doc.note,position:Date.now(),added_by:me.id});}
  // (documents.created_at is set by the database)
  async removeDocument(id){await this.sb.from("documents").delete().eq("id",id);}
  async addNote(n){const row={project_id:this.pid,author_id:me.id,room:n.room||"",body:n.body,images:n.images||[],read_at:me.role==="designer"?new Date().toISOString():null};const {data,error}=await this.sb.from("notes").insert(row).select().single();if(error)throw error;return{...data,replies:[]};}
  async editNote(id,body){const patch={body,edited_at:new Date().toISOString()};if(me.role!=="designer")patch.read_at=null;await this.sb.from("notes").update(patch).eq("id",id);}
  async setNoteRoom(id,room){await this.sb.from("notes").update({room}).eq("id",id);}
  async markRead(id,on){await this.sb.from("notes").update({read_at:on?new Date().toISOString():null}).eq("id",id);}
  async markIntegrated(id,on){await this.sb.from("notes").update({integrated_at:on?new Date().toISOString():null}).eq("id",id);}
  async setStatus(id,st){const now=new Date().toISOString();const patch={status:st,status_at:st?now:null,integrated_at:st==="integrated"?now:null};const n=project.notes.find(x=>x.id===id);if(st&&n&&!n.read_at)patch.read_at=now;await this.sb.from("notes").update(patch).eq("id",id);}
  async addReply(noteId,body){const {data,error}=await this.sb.from("note_replies").insert({note_id:noteId,project_id:this.pid,author_id:me.id,body}).select().single();if(error)throw error;return data;}
  async saveStage(st){const row={project_id:this.pid,position:st.order,title:st.title,focus:st.focus||"",description:st.desc,deliverable:st.deliverable,due:st.due?st.due.slice(0,10):null,status:st.status,standard:st.standard,fee:st.fee,hourly:!!st.hourly,payment_status:st.payment.status,payment_amount:st.payment.amount,payment_date:st.payment.date?st.payment.date.slice(0,10):null};if(st.id&&!st.id.startsWith("new"))row.id=st.id;const {error}=await this.sb.from("stages").upsert(row);if(error)throw error;}
  async deleteStage(id){await this.sb.from("stages").delete().eq("id",id);}
  async saveMeeting(m){const row={project_id:this.pid,when:m.when,where:m.where,notes:m.notes,change_request:m.change_request};if(m.id)row.id=m.id;const {error}=await this.sb.from("meetings").upsert(row);if(error)throw error;}
  async addImage(img){await this.sb.from("architect_images").insert({project_id:this.pid,url:img.url,caption:img.caption,position:Date.now()});}
  async removeImage(id){await this.sb.from("architect_images").delete().eq("id",id);}
  async savePinterest(url,note){await this.sb.from("projects").update({pinterest_url:url,pinterest_note:note}).eq("id",this.pid);}
  async setRooms(rooms){const {error}=await this.sb.rpc("set_project_rooms",{p_project:this.pid,p_rooms:rooms});if(error)throw error;}
  async renameRoom(old,nw){const {error}=await this.sb.rpc("rename_room",{p_project:this.pid,p_old:old,p_new:nw});if(error)throw error;}
  async setEmailAlerts(on){await this.sb.from("profiles").update({email_alerts:on}).eq("id",me.id);}
  async updateProject(name,clients){const {error}=await this.sb.rpc("update_project_clients",{p_project:this.pid,p_name:name,p_client_emails:clients.map(c=>c.email),p_client_names:clients.map(c=>c.name)});if(error)throw error;}
  async createProject(name,clients){const {data,error}=await this.sb.rpc("create_project",{p_name:name,p_client_emails:clients.map(c=>c.email),p_client_names:clients.map(c=>c.name),p_intake:window.SAMPLE_PROJECT.intake.map(s=>({title:s.room||s.title,room:s.room||"",questions:[]})),p_process:window.SAMPLE_PROJECT.process,p_stages:window.SAMPLE_PROJECT.stages.map(s=>({title:s.title,focus:s.focus||"",description:s.desc,deliverable:s.deliverable,standard:s.standard,fee:s.fee,hourly:!!s.hourly})),p_rooms:window.SAMPLE_PROJECT.rooms});if(error)throw error;return data;}
}

/* ---------- derived ---------- */
const unreadNotes=()=>project.notes.filter(n=>!n.read_at&&n.author_id!==(project.designer||{}).id);
const changedAnswers=()=>project.intake.flatMap(s=>s.questions).filter(q=>q.updated_by&&q.updated_by!==(project.designer||{}).id&&!q.seen_by_designer);
const openAnswers=()=>project.intake.flatMap(s=>s.questions).filter(q=>!dirText(q));
const newRepliesForClient=()=>project.notes.filter(n=>n.author_id!==(project.designer||{}).id&&n.replies.some(r=>r.author_id===(project.designer||{}).id));
const currentStage=()=>project.stages.find(s=>s.status==="current");
const projectLink=()=>`${location.origin}${location.pathname}?p=${project.id}`;
const clientLines=()=>{const seen=new Set();const out=[];for(const m of (project.members||[]).filter(m=>m.role==="client")){seen.add((m.email||"").toLowerCase());out.push(`${m.name} <${m.email}>`);}for(const i of (project.invites||[]))if(!seen.has(i.email))out.push(`${i.name||""} <${i.email}>`.trim());return out.join("\n");};
const clientNames=()=>(project.members||[]).filter(m=>m.role==="client").map(m=>m.name).concat((project.invites||[]).filter(i=>!(project.members||[]).some(m=>(m.email||"").toLowerCase()===i.email)).map(i=>i.name||i.email)).join(" and ");
function activity(){
  const d=(project.designer||{}).id,a=[];
  for(const n of project.notes){a.push({t:`${nameOf(n.author_id)} sent a message${n.room?" · "+n.room:""}`,w:n.created_at,go:"conversation"});for(const r of n.replies)a.push({t:`${nameOf(r.author_id)} replied${n.room?" · "+n.room:""}`,w:r.created_at,go:"conversation"});}
  for(const s of project.intake)for(const q of s.questions)if(q.updated_at&&q.updated_by)a.push({t:`${nameOf(q.updated_by)} ${q.added_by?"added a directive":q.updated_by===d?"recorded a directive":"updated a directive"} · ${s.title}`,w:q.updated_at,go:"directives"});
  for(const s of project.stages)if(s.payment&&s.payment.date)a.push({t:`Payment ${s.payment.status} · ${s.title}`,w:s.payment.date,go:"timeline"});
  return a.sort((x,y)=>new Date(y.w)-new Date(x.w)).slice(0,6);
}

/* ---------- rendering ---------- */
const NAV=[["home","Home"],["directives","Design directives"],["conversation","Messages"],["documents","Documents"],["timeline","Timeline"],["account","Settings"]];
const ROUTES=["projects",...NAV.map(([k])=>k)];
let summaries=null;
function needsName(){return me&&(!me.name||(LIVE&&me.name===(me.email||"").split("@")[0]));}
function pinOk(){try{return sessionStorage.getItem("parla-studio-pin")==="ok";}catch(e){return false;}}
function renderAskPin(app){
  $("#menuBtn").hidden=true;closePops();$("#mastRight").innerHTML="";$("#foot").hidden=true;$("#projName").hidden=true;
  app.innerHTML=`<div class="signin"><div class="signin-card"><h1>PIN</h1>
  <form id="pinForm"><div class="field"><input class="input" id="pinIn" type="password" inputmode="numeric" autocomplete="one-time-code" required aria-label="PIN" placeholder="••••"></div><div class="actions"><button class="btn" type="submit">Continue</button><button class="textlink" type="button" id="pinOut">Sign out</button></div></form><p class="small muted" id="pinMsg"></p></div></div>`;
  $("#pinIn",app).focus();
  $("#pinForm",app).onsubmit=async e=>{e.preventDefault();const ok=await store.checkPin($("#pinIn",app).value.trim());if(ok){try{sessionStorage.setItem("parla-studio-pin","ok");}catch(e){}render();}else{$("#pinMsg",app).textContent="That's not it.";$("#pinIn",app).value="";}};
  $("#pinOut",app).onclick=async()=>{await store.signOut();me=null;project=null;notifs=[];render();};
}
function renderAskName(app){
  $("#menuBtn").hidden=true;closePops();$("#mastRight").innerHTML="";$("#foot").hidden=true;$("#projName").hidden=true;
  app.innerHTML=`<div class="signin"><div class="signin-card"><h1>Name</h1>
  <form id="nameForm"><div class="field"><input class="input" id="myname" required autocomplete="given-name" placeholder="Your name" aria-label="Name"></div><div class="actions"><button class="btn" type="submit">Save</button></div></form></div></div>`;
  $("#nameForm",app).onsubmit=async e=>{e.preventDefault();const n=$("#myname",app).value.trim();if(!n)return;await store.setMyName(n);me.name=n;const m=(project&&project.members||[]).find(x=>x.id===me.id);if(m)m.name=n;render();};
}
function render(){
  const app=$("#app");
  if(!me){renderSignIn(app);return;}
  if(needsName()){renderAskName(app);return;}
  if(isDesigner()&&LIVE&&!pinOk()){renderAskPin(app);return;}
  if(isDesigner()&&(route==="projects"||!project)){renderDashboard(app);return;}
  if(!project){renderNoProject(app);return;}
  renderNav();
  $("#foot").hidden=false;$("#footProject").textContent=project.name;
  const views={home:viewHome,documents:viewDocuments,directives:viewDirectives,conversation:viewConversation,timeline:viewTimeline,meeting:viewTimeline,account:viewSettings};
  app.innerHTML=`<div class="view">${(views[route]||viewHome)()}</div>`;
  bind(app);
  renderPreviewBar();
  if(ui.jump){const el=document.getElementById(ui.jump);ui.jump=null;if(el)setTimeout(()=>el.scrollIntoView({block:"start"}),30);}
}
const ICONS={
  msg:`<svg viewBox="0 0 24 24"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H9l-4.5 3.5V17H6.5A2.5 2.5 0 0 1 4 14.5z"/></svg>`,
  bell:`<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0"/></svg>`
};
function closePops(){$("#menuPop").hidden=true;$("#bellPop").hidden=true;}
document.addEventListener("click",e=>{if(!e.target.closest(".pop,#menuBtn,#bellBtn"))closePops();});
function renderNav(){
  const nav=$("#nav");$("#menuBtn").hidden=false;
  nav.innerHTML=(isDesigner()?`<a href="#projects" class="${route==="projects"?"active":""}">All projects</a>`:"")+NAV.map(([k,l])=>{
    let c="";
    if(isDesigner()){if(k==="conversation"&&unreadNotes().length)c=unreadNotes().length;if(k==="directives"&&changedAnswers().length)c=changedAnswers().length;}
    else{const nm=notifs.filter(n=>!n.seen_at&&(n.link||"")==="#conversation").length;if(k==="conversation"&&nm)c=nm;if(k==="directives"&&openAnswers().length)c=openAnswers().length;}
    return`<a href="#${k}" class="${route===k?"active":""}">${l}${c?`<span class="count">${c}</span>`:""}</a>`;}).join("");
  $("#menuBtn").onclick=e=>{e.stopPropagation();const p=$("#menuPop");const open=p.hidden;closePops();p.hidden=!open;};
  $(".wordmark").href=isDesigner()?"#projects":"#home";
  const pn=$("#projName");if(pn){pn.textContent=isDesigner()&&project&&route!=="projects"?project.name:"";pn.hidden=!pn.textContent;}
  nav.querySelectorAll("a").forEach(a=>a.addEventListener("click",closePops));
  const r=$("#mastRight");
  const convCount=isDesigner()?unreadNotes().length:notifs.filter(n=>!n.seen_at&&(n.link||"")==="#conversation").length;
  const newN=notifs.filter(n=>!n.seen_at).length;
  r.innerHTML=`<a class="icon-btn" href="#conversation" aria-label="Messages">${ICONS.msg}${convCount?`<span class="badge">${convCount}</span>`:""}</a>
    <button class="icon-btn" id="bellBtn" aria-label="Notifications">${ICONS.bell}${newN?`<span class="badge">${newN}</span>`:""}</button>`;
  $("#bellBtn",r).onclick=async e=>{e.stopPropagation();const p=$("#bellPop");const open=p.hidden;closePops();if(!open)return;renderBell();p.hidden=false;};
}
function renderBell(){
  const p=$("#bellPop");
  const list=notifs.slice(0,20);
  p.innerHTML=`<div class="head"><span class="label">Notifications</span>${list.some(n=>!n.seen_at)?`<button class="textlink" id="seenAll">Mark all read</button>`:""}</div>
  <div class="items">${list.map(n=>`<button class="notif ${n.seen_at?"":"new"}" data-nid="${n.id}" data-link="${esc(n.link||"#home")}"><span class="s">${n.seen_at?"":`<span class="dot"></span>`}${esc(n.subject)}</span><span class="b">${esc(n.body)}</span><span class="w">${fmtStamp(n.created_at)}</span></button>`).join("")||`<p class="empty">Nothing yet.</p>`}</div>`;
  p.querySelectorAll("[data-nid]").forEach(b=>b.onclick=async()=>{const n=notifs.find(x=>x.id===b.dataset.nid);if(n&&!n.seen_at){n.seen_at=new Date().toISOString();await store.markNotifSeen(n.id);}closePops();let h=(b.dataset.link||"#home").replace(/^#/,"");if(h==="meeting"){ui.jump="meeting";h="timeline";}if(h===route)render();else location.hash=h;});
  const sa=$("#seenAll",p);if(sa)sa.onclick=async()=>{for(const n of notifs)if(!n.seen_at){n.seen_at=new Date().toISOString();}await store.markAllNotifsSeen();renderNav();renderBell();};
}
function renderPreviewBar(){
  const bar=$("#previewBar");
  if(LIVE){bar.hidden=true;return;}
  bar.hidden=false;
  const fixed=!!cfg.PREVIEW_AS;
  bar.innerHTML=`<span>Preview · sample data</span><span class="spacer"></span><span>${fixed?`${me.role==="designer"?"Your side":"Client side"} · ${esc(me.name)}`:"Viewing as"}</span>${fixed?"":project.members.map(m=>`<button class="chip ${m.id===me.id?"on":""}" data-user="${m.id}">${esc(m.name)}</button>`).join("")}<button class="chip" id="resetSample">Reset sample</button>`;
  bar.querySelectorAll("[data-user]").forEach(b=>b.onclick=()=>{me=store.switchUser(b.dataset.user);ui.editing={};render();});
  $("#resetSample",bar).onclick=()=>{const r=store.reset();me=r.me;project=r.project;render();toast("Sample data reset");};
}
function renderSignIn(app){
  $("#menuBtn").hidden=true;closePops();$("#mastRight").innerHTML="";$("#foot").hidden=true;$("#previewBar").hidden=true;$("#projName").hidden=true;
  app.innerHTML=`<div class="signin"><div class="signin-card">
    <p class="label">Private</p>
    <h1>Welcome.</h1>
    <form id="signinForm"><div class="field"><label for="email">Email</label><input class="input" id="email" type="email" required autocomplete="email" placeholder="you@example.com"></div>
    <div class="actions"><button class="btn" type="submit">Sign in</button></div></form>
    <p class="small muted" id="signinMsg"></p></div></div>`;
  $("#signinForm",app).onsubmit=async e=>{e.preventDefault();const email=$("#email",app).value.trim().toLowerCase();$("#signinMsg",app).textContent="";const r=await store.signInEmail(email);if(!r.ok)$("#signinMsg",app).textContent=r.error;};
}
async function renderDashboard(app){
  renderNav();
  $("#foot").hidden=false;$("#footProject").textContent="All projects";
  if(!summaries){app.innerHTML=`<div class="view"><div class="page-head"><p class="label">Studio</p><h1>Hello, ${esc(me.name.split(" ")[0])}.</h1></div></div>`;summaries=await store.listProjects();if(route!=="projects")return;}
  const list=summaries;
  const attn=p=>{const a=[];if(p.unread)a.push(`${p.unread} unread`);if(p.changed)a.push(`${p.changed} directive${p.changed>1?"s":""} changed`);if(p.meeting_request)a.push("meeting request");if(p.payment_requested)a.push(`${p.payment_requested} payment${p.payment_requested>1?"s":""} requested`);return a;};
  const needs=list.filter(p=>attn(p).length).length;
  app.innerHTML=`<div class="view">
    <div class="page-head"><p class="label">Studio</p><h1 class="big">Hello, ${esc(me.name.split(" ")[0])}.</h1><p class="lede">${list.length?(needs?`${needs===1?"One project needs":needs+" projects need"} you.`:"Nothing waiting on you."):"No projects yet."}</p></div>
    <section class="section"><div class="band"><h2>Projects</h2><span class="desc"></span></div>
    <div class="dash">${list.map(p=>{const a=attn(p);return`<a class="proj ${a.length?"needs":""}" href="#home" data-open="${p.id}">
      <div class="ptop"><h3>${esc(p.name)}</h3>${a.length?`<span class="tag accent">${a.length===1?a[0]:a.length+" things"}</span>`:""}</div>
      ${p.clients?`<p class="small muted">${esc(p.clients)}</p>`:""}
      <div class="pgrid">
        <div class="kv"><span class="label">Stage</span><span class="v">${esc(p.stage||"—")}${p.stage_due?`<br><span class="small muted">${fmtLong(p.stage_due)}</span>`:""}</span></div>
        <div class="kv"><span class="label">Next meeting</span><span class="v">${p.meeting?`${fmtWeek(p.meeting)}<br><span class="small muted">${fmtTime(p.meeting)}</span>`:"—"}</span></div>
        <div class="kv"><span class="label">Last activity</span><span class="v">${p.last_activity?fmtStamp(p.last_activity):"—"}</span></div>
      </div>
      ${a.length>1?`<p class="small" style="color:var(--accent)">${a.join(" · ")}</p>`:""}
    </a>`;}).join("")}</div>
    <div class="actions"><button class="btn ghost" id="newProjBtn">Start a project</button></div></section>
    <div id="newProjWrap" hidden></div>
  </div>`;
  app.querySelectorAll("[data-open]").forEach(a=>a.onclick=async e=>{e.preventDefault();project=await store.loadProject(a.dataset.open);summaries=null;ui.room="all";ui.sort="recent";location.hash="home";if(route==="home")render();});
  $("#newProjBtn",app).onclick=()=>{const w=$("#newProjWrap",app);w.hidden=false;renderNewProjectForm(w);w.scrollIntoView({behavior:"smooth",block:"start"});};
  renderPreviewBar();
}
function renderNewProjectForm(w){
  w.innerHTML=`<section class="section"><div class="band"><h2>New project</h2><p class="desc">Starts with your standard stages, intake questions and rooms. Nobody is emailed by this.</p></div>
  <form id="newProj" class="row" style="max-width:560px"><div class="field"><label for="pname">Project name</label><input class="input" id="pname" required placeholder="The Nguyens' kitchen"></div>
  <div class="field"><label for="pemails">Clients, one per line, as Name &lt;email&gt;</label><textarea class="input" id="pemails" required placeholder="Brook &lt;brook@example.com&gt;&#10;Evan &lt;evan@example.com&gt;"></textarea></div>
  <div class="actions"><button class="btn" type="submit">Create project</button></div></form></section>`;
  $("#newProj",w).onsubmit=async e=>{e.preventDefault();const name=$("#pname",w).value.trim();const clients=$("#pemails",w).value.split(/[\n,]/).map(s=>s.trim()).filter(Boolean).map(s=>{const m=s.match(/^(.*?)\s*<([^>]+)>$/);return m?{name:m[1].trim(),email:m[2].trim().toLowerCase()}:{name:"",email:s.toLowerCase()};});try{const id=await store.createProject(name,clients);project=await store.loadProject(id);summaries=null;location.hash="home";render();toast("Project created");}catch(err){toast("Couldn't create: "+err.message);}};
}
function renderNoProject(app){
  $("#menuBtn").hidden=true;closePops();$("#foot").hidden=true;$("#projName").hidden=true;
  $("#mastRight").innerHTML=`<span class="who">${esc(me.name)} · <button id="signout">Sign out</button></span>`;
  $("#signout").onclick=async()=>{await store.signOut();me=null;render();};
  if(!isDesigner()){app.innerHTML=`<div class="signin"><div class="signin-card"><h1>Almost.</h1><p class="lede">You're signed in, but no project is linked to this email yet. ${esc(DESIGNER_NAME)} can add you from her side — if you expected to be here, tell her which email you used.</p></div></div>`;return;}
  app.innerHTML=`<div class="view"><div class="page-head"><p class="label">New project</p><h1>Start a project.</h1><p class="lede">Give it a name and the clients. It starts with your standard stages, intake questions and rooms, which you can edit after. Nobody is emailed by this; clients only hear about Studio when you tell them.</p></div>
  <form id="newProj" class="row" style="max-width:560px"><div class="field"><label for="pname">Project name</label><input class="input" id="pname" required placeholder="Brook and Evan's home"></div>
  <div class="field"><label for="pemails">Clients, one per line, as Name &lt;email&gt;</label><textarea class="input" id="pemails" required placeholder="Brook &lt;brook@example.com&gt;&#10;Evan &lt;evan@example.com&gt;"></textarea></div>
  <div class="actions"><button class="btn" type="submit">Create project</button></div></form></div>`;
  $("#newProj",app).onsubmit=async e=>{e.preventDefault();const name=$("#pname",app).value.trim();const clients=$("#pemails",app).value.split(/[\n,]/).map(s=>s.trim()).filter(Boolean).map(s=>{const m=s.match(/^(.*?)\s*<([^>]+)>$/);return m?{name:m[1].trim(),email:m[2].trim().toLowerCase()}:{name:"",email:s.toLowerCase()};});try{const id=await store.createProject(name,clients);project=await store.loadProject(id);route="home";location.hash="home";render();toast("Project created");}catch(err){toast("Couldn't create: "+err.message);}};
}

/* ---------- views ---------- */
function viewHome(){
  const d=isDesigner(),cs=currentStage(),m=project.meeting;
  const firstName=me.name.split(" ")[0];
  const unread=unreadNotes().length,changed=changedAnswers().length,open=openAnswers().length,replied=newRepliesForClient().length;
  const req=m&&m.change_request;
  const unsorted=project.notes.filter(n=>!n.room).length;
  let lede,cards;
  if(d){
    const needs=[];if(unread)needs.push(`${unread} unread message${unread>1?"s":""}`);if(changed)needs.push(`${changed} directive${changed>1?"s":""} changed`);if(req)needs.push("a meeting request");if(unsorted)needs.push(`${unsorted} under Other`);
    lede=`${needs.length?`Needs you: ${needs.join(", ")}.`:"Nothing waiting on you."} ${cs?`${esc(cs.title)} is the current stage${cs.due?`, due ${fmtLong(cs.due)}`:""}.`:""}`;
    cards=[
      ["conversation","Messages",`${unread?unread+" unread":"Nothing unread"}${project.notes.some(n=>n.author_id!==(project.designer||{}).id&&!noteStatus(n))?" · some not yet marked":""}`,unread||""],
      ["directives","Design directives",changed?`${changed} changed or added by the clients`:"Nothing new since you last looked",changed||""],
      ["timeline","Timeline",`${cs?cs.title+" now":"Stages and payments"}${m?` · next meeting ${fmtDate(m.when)}`:""}${req?" · change requested":""}${project.stages.some(s=>s.payment.status==="requested")?" · payment requested":""}`,req?"!":""],
      ["documents","Documents",`Process, fees, mood board, drawings`,""]
    ];
  }else{
    lede=`${cs?`We're in the <b>${esc(cs.title.toLowerCase())}</b> stage${cs.due?`, due ${fmtLong(cs.due)}`:""}.`:""} ${m?`Next we meet ${fmtWeek(m.when)} at ${fmtTime(m.when)}.`:""} ${open?`${open} directive${open>1?"s":""} still open.`:""}`;
    cards=[
      ["conversation","Messages",`New thoughts, photos and questions, whenever they come${replied?` · ${replied} with replies from ${esc(DESIGNER_NAME)}`:""}`,replied||""],
      ["directives","Design directives",`How you live and what you need from each room — change or add to it any time`,open||""],
      ["timeline","Timeline",`${cs?cs.title+" now":"Stages, meetings and payments"}${m?` · next meeting ${fmtDate(m.when)}`:""}${project.stages.some(s=>s.payment.status==="requested")?" · payment requested":""}`,project.stages.some(s=>s.payment.status==="requested")?"!":""],
      ["documents","Documents",`Fees and process, the Pinterest board, the architect's drawings`,""]
    ];
  }
  return`<div class="page-head"><p class="label">${esc(project.name)}</p><h1 class="big">Hello, ${esc(firstName)}.</h1><p class="lede">${lede}</p></div>
  <div class="home-grid ${d?"":"one"}">
    <div class="cards">${cards.map(([k,t,s,n])=>`<a class="card" href="#${k}"><h3>${t}</h3><p class="sub">${s}</p><span class="side">${n?`<span class="tag accent">${n}</span>`:""}<span class="arrow">→</span></span></a>`).join("")}</div>
    <div class="statline">${d?`<div class="switchrow"><span class="label">Project</span>${ui.projEdit?`<form id="projForm" class="row"><div class="field"><label for="pjName">Name</label><input class="input" id="pjName" value="${esc(project.name)}" required></div><div class="field"><label for="pjClients">Clients, one per line, as Name &lt;email&gt;</label><textarea class="input" id="pjClients">${esc(clientLines())}</textarea></div><div class="field"><label for="pjRooms">Spaces, one per line</label><textarea class="input" id="pjRooms">${esc(project.rooms.join("\n"))}</textarea></div><div class="actions"><button class="btn tiny" type="submit">Save</button><button class="textlink" type="button" id="projCancel">Cancel</button></div><p class="small muted">Nobody is emailed by this.</p></form>`:`<p>${esc(project.name)}</p><p class="small muted">${esc(clientNames()||"No clients yet")}</p><div class="actions"><button class="textlink" id="projEdit">Edit name or clients</button><button class="textlink" id="copyLink">Copy project link</button></div><p class="small muted" id="projLink" hidden>${esc(projectLink())}</p>`}</div><p class="label">Recently</p><div class="activity">${activity().map(a=>`<a class="act" href="#${a.go}"><span class="t">${esc(a.t)}</span><span class="w">${fmtStamp(a.w)}</span></a>`).join("")||`<p class="muted small">Nothing yet.</p>`}</div>`:""}</div>
  </div>`;
}

function viewDocuments(){
  const d=isDesigner();
  const docs=[...project.documents].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));
  return`<div class="page-head"><p class="label">Documents</p><h1>Your documents</h1></div>
  <section class="section">
    <div class="cards">${docs.map(doc=>`<${doc.url?`a href="${esc(doc.url)}" target="_blank" rel="noopener"`:"div"} class="card"><h3>${esc(doc.title)}</h3><p class="sub">${esc(doc.note)}${doc.added_by&&doc.added_by!==(project.designer||{}).id?` · added by ${esc(nameOf(doc.added_by))}`:""}${d||doc.added_by===me.id?` · <button class="textlink" data-rmdoc="${doc.id}">remove</button>`:""}</p><span class="side"><span class="small muted">${doc.created_at?"Added "+fmtLong(doc.created_at):""}</span><span class="tag quiet">${esc(doc.kind||"Link")}</span>${doc.url?"":`<span class="small muted">Coming</span>`}</span></${doc.url?"a":"div"}>`).join("")||`<p class="muted" style="padding:22px 0">Nothing here yet.</p>`}</div>
    ${`<form id="docForm" class="editbox" style="max-width:560px"><p class="label">Add a document</p><div class="row two"><div class="field"><label>Title</label><input class="input" id="docTitle" required placeholder="Signed agreement"></div><div class="field"><label>Type</label><input class="input" id="docKind" placeholder="PDF, Mood board, Drawings, Link"></div></div><div class="field"><label>Link (or upload a file)</label><input class="input" id="docUrl" placeholder="https://…"></div><div class="field"><label>One line about it</label><input class="input" id="docNote"></div><div class="actions"><span class="btn ghost tiny filebtn">Choose file<input type="file" id="docFile"></span><span class="small muted" id="docName"></span><button class="btn tiny" type="submit">Add</button></div></form>`}
  </section>`;
}

function dirText(q){return (q.directive||"").trim();}
function viewDirectives(){
  const d=isDesigner(),did=(project.designer||{}).id;
  const convCount=room=>project.notes.filter(n=>n.room===room).length;
  const changedIn=s=>s.questions.filter(q=>q.updated_by&&q.updated_by!==did&&!q.seen_by_designer).length;
  const toReview=project.intake.flatMap(s=>s.questions).filter(q=>dirText(q)&&!q.directive_reviewed).length;
  if(d&&ui.review)return viewReview();
  return`<div class="page-head"><p class="label">Design directives</p><h1>How you live, and what you need from this house.</h1>${d?"":`<p class="lede">Clarify any of these, change one when you understand it better, or add your own.</p>`}
  ${d?`<div class="actions"><button class="btn ghost tiny" id="reviewBtn">${toReview?`Review ${toReview} from meeting notes`:"Meeting notes"}</button></div>`:""}</div>
  <div class="chips" id="jump">${project.intake.map(s=>`<button class="chip ${changedIn(s)?"accent":""}" data-jump="sec-${s.id}">${esc(s.room||s.title)}</button>`).join("")}</div>
  ${project.intake.map(s=>`<section class="section qa-section" id="sec-${s.id}"><div class="band">${d&&ui.roomEdit===s.room?`<form class="row" data-roomrename="${esc(s.room)}" style="max-width:420px"><div class="field"><input class="input" id="rn-${s.id}" value="${esc(s.room)}" required aria-label="Space name"></div><div class="actions"><button class="btn tiny" type="submit">Save</button><button class="textlink" type="button" id="roomCancel">Cancel</button>${!s.questions.length?`<button class="textlink" type="button" data-roomdel="${esc(s.room)}">Remove</button>`:""}</div></form>`:`<h2>${esc(s.room||s.title)}</h2><span class="desc">${d?`<button class="textlink" data-roomedit="${esc(s.room)}">Rename</button>`:""}</span>`}</div>
    <div class="rows">${s.questions.map(q=>{
      const changed=q.updated_by&&q.updated_by!==did&&!q.seen_by_designer;
      const editing=ui.editing[q.id];
      const open=!!ui.open[q.id]||editing;
      const text=dirText(q);
      return`<div class="qa ${open?"open":""} ${text?"":"blank"}" id="qa-${q.id}">
        <button class="qrow one" data-toggle="${q.id}" aria-expanded="${open}">
          <span class="qq ${text?"":"openq"}">${text?esc(text):`<span class="tag accent" style="margin-right:10px">Open</span>${esc(q.q)}`}</span>
          <span class="qs">${changed?`<span class="tag accent">${q.added_by&&q.added_by!==did?"New":"Changed"}</span>`:""}<span class="chev">${open?"−":"+"}</span></span>
        </button>
        ${open?`<div class="qbody">
          ${editing?`<form class="edit" data-qsave="${q.id}"><div class="field"><label>Directive</label><textarea class="input" id="ans-${q.id}">${esc(text)}</textarea></div>${d&&q.q?`<div class="field"><label>Notes from the meeting</label><textarea class="input small" id="notes-${q.id}">${esc(q.a||"")}</textarea></div>`:""}<div class="actions"><button class="btn tiny" type="submit">Save</button><button class="textlink" type="button" data-qcancel="${q.id}">Cancel</button>${d?`<button class="textlink" type="button" data-qdel="${q.id}">Delete</button>`:""}</div></form>`
          :`${text?`<p class="a">${linkify(text)}</p>`:""}
            ${(q.images||[]).length?`<div class="imgs">${q.images.map(u=>`<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt=""></a>`).join("")}</div>`:""}
            ${q.source_note_id?`<p class="small muted">From a message${(()=>{const sn=project.notes.find(x=>x.id===q.source_note_id);return sn?` by ${esc(nameOf(sn.author_id))} · ${fmtDate(sn.created_at)}`:"";})()}</p>`:""}
            ${q.q?`<div class="src"><span class="label">From the first meeting</span><p class="small">${esc(q.q)}</p>${q.a?`<p class="small muted">${esc(q.a)}</p>`:""}</div>`:""}
            ${(q.comments||[]).length?`<div class="replies">${q.comments.map(c=>`<div class="reply"><div class="rtop"><b>${esc(nameOf(c.author_id))}</b><span>${fmtStamp(c.created_at)}</span></div><p class="rbody">${linkify(c.body)}</p></div>`).join("")}</div>`:""}
            ${ui.commentOpen[q.id]?`<form class="ask" data-csave="${q.id}"><textarea class="input" id="cb-${q.id}" placeholder="${d?"A note back to them…":"A comment or a clarification…"}"></textarea><div class="actions"><button class="btn tiny" type="submit">Comment</button><button class="textlink" type="button" data-ccancel="${q.id}">Cancel</button></div></form>`:""}
            <div class="meta">${q.updated_at?`<span>${q.updated_by===did?"Recorded":"Updated"} by ${esc(nameOf(q.updated_by))} · ${fmtStamp(q.updated_at)}</span>`:""}${d||!q.q?`<button class="textlink" data-qedit="${q.id}">${text?"Edit":"Answer"}</button>`:""}${!ui.commentOpen[q.id]?`<button class="textlink" data-comment="${q.id}">Comment</button>`:""}${d&&changed?`<button class="textlink" data-qseen="${q.id}">Mark seen</button>`:""}</div>`}
        </div>`:""}
      </div>`;}).join("")}
      ${s.room&&convCount(s.room)?`<div class="qa inconv"><p class="label">From messages</p>${project.notes.filter(n=>n.room===s.room).map(n=>`<div class="mini"><div class="rtop"><b>${esc(nameOf(n.author_id))}</b><span>${fmtDate(n.created_at)}</span>${noteStatus(n)?`<span class="tag quiet">${STATUS[noteStatus(n)]}</span>`:""}</div><p class="rbody">${linkify(n.body)}</p>${n.replies.map(r=>`<p class="rbody" style="padding-left:16px;border-left:1px solid var(--line)"><b style="font-weight:500">${esc(nameOf(r.author_id))}</b> · ${linkify(r.body)}</p>`).join("")}</div>`).join("")}<div class="actions"><button class="textlink" data-conv="${esc(s.room)}">Open in messages →</button></div></div>`:""}
      ${ui.editing["add-"+s.id]?`<form class="qa edit" data-dadd="${s.id}"><p class="label">New directive · ${esc(s.room||s.title)}</p><textarea class="input" id="dir-${s.id}" placeholder="${d?"Something to design to…":"Something you want the design to honor…"}"></textarea>${d?`<label class="small" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="tell-${s.id}"> Let the clients know</label>`:""}<div class="actions"><button class="btn tiny" type="submit">Add</button><button class="textlink" type="button" data-qcancel="add-${s.id}">Cancel</button></div></form>`:`<div class="qa"><div class="actions"><button class="btn ghost tiny" data-dnew="${s.id}">Add a directive</button></div></div>`}
    </div></section>`).join("")}
  ${d?(ui.roomAdd?roomAddForm():`<div class="actions"><button class="btn ghost" id="roomAddDir">Add a space</button></div>`):""}`;
}
function roomAddForm(){return`<form class="editbox" id="roomAddForm" style="max-width:420px"><div class="field"><label for="newRoom">New space</label><input class="input" id="newRoom" required placeholder="Garage"></div><div class="actions"><button class="btn tiny" type="submit">Add</button><button class="textlink" type="button" id="roomAddCancel">Cancel</button></div></form>`;}
function viewReview(){
  // Designer only: meeting notes on the left, the directive each becomes on the right. Edit, then accept.
  return`<div class="page-head"><p class="label">Design directives · meeting notes</p><h1>From notes to directives.</h1><p class="lede">Each question with the notes you took, and the directive it becomes. Edit any, then accept.</p>
  <div class="actions"><button class="btn tiny" id="acceptAll">Accept all</button><button class="textlink" id="reviewBack">Back to directives</button></div></div>
  ${project.intake.map(s=>`<section class="section"><div class="band"><h2>${esc(s.room||s.title)}</h2><span class="desc"></span></div>
    <div class="rev">${s.questions.filter(q=>q.q).map(q=>`<div class="revrow ${q.directive_reviewed?"ok":""}" id="rev-${q.id}">
      <div class="revl"><p class="small" style="color:var(--ink)">${esc(q.q)}</p><textarea class="input small" data-notes="${q.id}" placeholder="Notes from the meeting…">${esc(q.a||"")}</textarea></div>
      <div class="revr"><textarea class="input" data-dir="${q.id}" placeholder="The directive this becomes…">${esc(q.directive||"")}</textarea><div class="actions"><button class="btn tiny ${q.directive_reviewed?"ghost":""}" data-accept="${q.id}">${q.directive_reviewed?"Accepted":"Accept"}</button>${!q.directive&&q.a?`<button class="textlink" data-draft="${q.id}">Use notes as draft</button>`:""}</div></div>
    </div>`).join("")}
    <form class="revrow" data-qadd="${s.id}"><div class="revl"><input class="input" placeholder="A question to ask in the first meeting" required></div><div class="revr"><div class="actions"><button class="btn ghost tiny" type="submit">Add question</button></div></div></form></div></section>`).join("")}`;
}

function viewConversation(){
  const d=isDesigner(),did=(project.designer||{}).id;
  if(!d){const pend=notifs.filter(n=>!n.seen_at&&(n.link||"")==="#conversation");if(pend.length){pend.forEach(n=>n.seen_at=new Date().toISOString());store.markNotifsSeenByLink("#conversation");setTimeout(renderNav,0);}}
  const rooms=["all","unsorted",...project.rooms];
  const count=r=>r==="all"?project.notes.length:r==="unsorted"?project.notes.filter(n=>!n.room).length:project.notes.filter(n=>n.room===r).length;
  const list=ui.sort==="recent"?project.notes.filter(n=>noteStatus(n)!=="integrated"):project.notes.filter(n=>ui.room==="all"||(ui.room==="unsorted"?!n.room:n.room===ui.room));
  const sel=(cur,id)=>`<select class="input" style="padding:7px 10px;width:auto;font-size:12px;letter-spacing:.08em;text-transform:uppercase" data-room="${id}" aria-label="Room"><option value="">Other</option>${project.rooms.map(r=>`<option ${r===cur?"selected":""}>${esc(r)}</option>`).join("")}</select>`;
  const secFor=room=>project.intake.find(s=>s.room===room);
  const unsorted=count("unsorted");
  return`<div class="page-head"><p class="label">Messages</p><h1>Conversation</h1>${d?(unsorted?`<p class="lede">${unsorted} under Other — file ${unsorted>1?"them":"it"} by space when you can.</p>`:""):`<p class="lede">An idea, a photo, a question, a change of heart — I want to hear it, at any point. Post it here and it will be filed by room on its own. When it's a question, you'll see my answer underneath and get an email with it.</p>`}</div>
  <form class="compose" id="compose"><p class="label">New message</p>
    <textarea class="input" id="noteBody" placeholder="${d?"Something to show them, or an idea to float…":"We kept thinking about the table…"}"></textarea>
    <div class="files"><span class="btn ghost tiny filebtn">Add image<input type="file" id="noteFiles" accept="image/*" multiple></span>${ui.composeImgs.map(u=>`<img src="${u}" alt="">`).join("")}</div>
    <div class="actions"><button class="btn" type="submit">Post</button></div></form>
  <section class="section"><div class="band"><div class="chips"><button class="chip ${ui.sort==="recent"?"on":""}" data-sort="recent">Open · recent</button><button class="chip ${ui.sort!=="recent"?"on":""}" data-sort="room">By room</button>${d&&unreadNotes().length?`<button class="textlink" id="readAllMsgs">Mark all read</button>`:""}</div><div class="rooms" ${ui.sort==="recent"?"hidden":""}>${rooms.map(r=>`<button class="chip ${ui.room===r?"on":""}" data-pick="${esc(r)}">${r==="all"?"All":r==="unsorted"?"Other":esc(r)}</button>`).join("")}${d?`<button class="textlink" id="roomAddMsg">Add a space</button>`:""}</div></div>
  ${d&&ui.roomAdd?roomAddForm():""}
  ${ui.sort!=="recent"&&ui.room!=="all"&&ui.room!=="unsorted"&&secFor(ui.room)?`<p class="small"><button class="textlink" data-dir="sec-${secFor(ui.room).id}">See the directives for ${esc(ui.room.toLowerCase())} →</button></p>`:""}
  <div class="note-list">${list.map(n=>{
    const mine=n.author_id===me.id,unread=!n.read_at&&n.author_id!==did,editing=ui.editing[n.id];
    const state=[];
    if(n.author_id!==did){state.push(n.read_at?`<span class="tag quiet">Read by ${esc(DESIGNER_NAME)} · ${fmtDate(n.read_at)}</span>`:`<span class="tag accent">${d?"Unread":"Not read yet"}</span>`);const st=noteStatus(n);if(st)state.push(`<span class="tag">${STATUS[st]}${n.status_at||n.integrated_at?` · ${fmtDate(n.status_at||n.integrated_at)}`:""}</span>`);}
    return`<article class="note ${unread?"unread":""}" id="note-${n.id}"><div class="top">${unread&&d?`<span class="dot"></span>`:""}<span class="by">${esc(nameOf(n.author_id))}</span><span class="when">${fmtStamp(n.created_at)}${n.edited_at?` · edited ${fmtStamp(n.edited_at)}`:""}</span>${sel(n.room,n.id)}</div>
      ${editing?`<form data-nsave="${n.id}" class="ask"><textarea class="input" id="nb-${n.id}">${esc(n.body)}</textarea><div class="actions"><button class="btn tiny" type="submit">Save</button><button class="textlink" type="button" data-ncancel="${n.id}">Cancel</button></div></form>`:`<p class="body">${linkify(n.body)}</p>`}
      ${n.images.length?`<div class="imgs">${n.images.map(u=>`<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt=""></a>`).join("")}</div>`:""}
      <div class="state">${state.join("")}</div>
      ${n.replies.length?`<div class="replies">${n.replies.map(r=>`<div class="reply"><div class="rtop"><b>${esc(nameOf(r.author_id))}</b><span>${fmtStamp(r.created_at)}</span></div><p class="rbody">${linkify(r.body)}</p></div>`).join("")}</div>`:""}
      ${ui.toDir[n.id]?`<form class="ask editbox" data-dirsave="${n.id}"><p class="label">Suggested directive</p><textarea class="input" id="td-${n.id}">${esc(suggestDirective(n))}</textarea><div class="row two"><div class="field"><label>Space</label><select class="input" id="tdroom-${n.id}">${project.intake.map(s=>`<option value="${s.id}" ${s.room===n.room?"selected":""}>${esc(s.room||s.title)}</option>`).join("")}</select></div></div><div class="actions"><button class="btn tiny" type="submit">Add directive</button><button class="textlink" type="button" data-tdcancel="${n.id}">Cancel</button></div></form>`:""}
      ${ui.replyOpen[n.id]?`<form class="ask" data-rsave="${n.id}"><textarea class="input" id="rb-${n.id}" placeholder="${d?"Yes — and here's what I'm thinking…":"Reply…"}"></textarea><div class="actions"><button class="btn tiny" type="submit">Reply</button><button class="textlink" type="button" data-rcancel="${n.id}">Cancel</button></div></form>`:""}
      <div class="actions">
        ${d&&n.author_id!==did?`<button class="btn ghost tiny" data-read="${n.id}" data-on="${n.read_at?"0":"1"}">${n.read_at?"Mark unread":"Mark read"}</button><span class="chips">${Object.entries(STATUS).map(([k,l])=>`<button class="chip ${noteStatus(n)===k?"on":""}" data-status="${k}" data-note="${n.id}">${l}</button>`).join("")}</span>`:""}
        ${!ui.replyOpen[n.id]?`<button class="textlink" data-reply="${n.id}">Reply</button>`:""}
        ${d&&!ui.toDir[n.id]?`<button class="textlink" data-todir="${n.id}">Make a directive</button>`:""}
        ${mine&&!editing?`<button class="textlink" data-nedit="${n.id}">Edit</button>`:""}
      </div></article>`;}).join("")||`<p class="muted" style="padding:28px 0">No notes here yet.</p>`}</div></section>`;
}

function viewTimeline(){
  const d=isDesigner();
  const payLabel={free:"Free",upcoming:"Not yet due",requested:"Requested",paid:"Paid"};
  const cs=currentStage();
  const phases=project.process||[];
  const activePhases=cs?(cs.focus||"").split("·").map(x=>x.trim().toLowerCase()):[];
  return`<div class="page-head"><p class="label">Timeline</p><h1>Where things stand.</h1></div>
  ${meetingBlock()}
  <section class="section"><div class="band"><h2>The process</h2><span class="desc"></span></div>
    <div class="phases">${phases.map((p,i)=>{const on=activePhases.includes(p.title.toLowerCase());return`<div class="phase ${on?"on":""}"><span class="label">${on?"Now":"&nbsp;"}</span><h3>${esc(p.title)}</h3><p class="small">${esc(p.body)}</p></div>`;}).join("")}</div></section>
  <section class="section"><div class="band"><h2>Meetings</h2><span class="desc"></span></div>
  <div class="stages">${project.stages.map(s=>{
    const p=s.payment||{};
    if(ui.stageEdit===s.id)return stageForm(s);
    return`<div class="stage ${s.status}"><span class="mark"></span><div style="display:grid;gap:14px;min-width:0">
      <div class="head"><h3>${esc(s.title)}</h3>${s.status==="current"?`<span class="tag accent">Now</span>`:s.status==="done"?`<span class="tag quiet">Done</span>`:""}${s.due?`<span class="small due">${s.status==="done"?"":"Expected "}${fmtLong(s.due)}</span>`:""}</div>
      ${s.focus?`<p class="label" style="color:var(--accent)">${esc(s.focus)}</p>`:""}
      <div class="grid"><div class="kv"><span class="label">What happens</span><span class="v">${esc(s.desc)}</span>${s.deliverable?`<span class="label" style="margin-top:8px">You receive</span><span class="v">${esc(s.deliverable)}</span>`:""}</div>
        <div class="kv"><span class="label">Fee</span><span class="fee">${s.standard!=null?`<s>${money(s.standard)}</s>`:""}${s.fee?money(s.fee)+(s.hourly?"/hr":""):"Free"}</span></div>
        <div class="kv"><span class="label">Payment</span>${!d&&p.status==="requested"?`<span class="pay ${p.status}"><span class="sq"></span>${payLabel[p.status]}${p.amount?` · ${money(p.amount)}`:""}</span><button class="textlink" data-pay="${s.id}" style="justify-self:start">Payment information</button>`:`<span class="pay ${p.status}"><span class="sq"></span>${payLabel[p.status]||p.status}${p.amount?` · ${money(p.amount)}`:""}${p.date?` · ${fmtDate(p.date)}`:""}</span>`}
        ${!d&&ui.payOpen===s.id?`<div class="payopts">
          ${cfg.PAY&&cfg.PAY.venmo?`<a class="payopt" href="https://venmo.com/u/${esc(cfg.PAY.venmo.replace(/^@/,""))}" target="_blank" rel="noopener"><span class="label">Venmo</span><span>@${esc(cfg.PAY.venmo.replace(/^@/,""))}</span></a>`:""}
          ${cfg.PAY&&cfg.PAY.zelle?`<div class="payopt"><span class="label">Zelle</span><span class="phone">${esc(cfg.PAY.zelle)}</span></div>`:""}
          <form class="payopt ask" data-payreq="${s.id}"><span class="label">Another way</span><textarea class="input small" placeholder="Check, bank transfer, something else — tell me what works." required></textarea><div class="actions"><button class="btn tiny" type="submit">Send request</button></div></form>
        </div>`:""}</div></div>
      ${d?`<div class="actions"><button class="textlink" data-sedit="${s.id}">Edit stage</button></div>`:""}</div></div>`;}).join("")}
  ${ui.stageEdit==="new"?stageForm({id:"new",order:project.stages.length+1,title:"",focus:"",desc:"",deliverable:"",due:null,status:"upcoming",standard:null,fee:null,hourly:false,payment:{status:"upcoming",amount:null,date:null}}):""}
  </div>${d&&ui.stageEdit!=="new"?`<div class="actions"><button class="btn ghost" id="addStage">Add a stage</button></div>`:""}</section>`;
}
function stageForm(s){
  const opt=(v,cur,l)=>`<option value="${v}" ${v===cur?"selected":""}>${l}</option>`;
  return`<form class="editbox" data-ssave="${s.id}"><p class="label">${s.id==="new"?"New stage":"Edit stage"}</p>
  <div class="row two"><div class="field"><label>Title</label><input class="input" name="title" value="${esc(s.title)}" required></div><div class="field"><label>Order</label><input class="input" name="order" type="number" value="${s.order}"></div></div>
  <div class="field"><label>Focus (phases, separated by ·)</label><input class="input" name="focus" value="${esc(s.focus||"")}" placeholder="Movement patterns · Feeling"></div>
  <div class="field"><label>What happens</label><textarea class="input" name="desc" style="min-height:70px">${esc(s.desc)}</textarea></div>
  <div class="field"><label>They receive</label><textarea class="input" name="deliverable" style="min-height:70px">${esc(s.deliverable)}</textarea></div>
  <div class="row three"><div class="field"><label>Status</label><select class="input" name="status">${opt("upcoming",s.status,"Upcoming")}${opt("current",s.status,"Now")}${opt("done",s.status,"Done")}</select></div><div class="field"><label>Expected date</label><input class="input" name="due" type="date" value="${toDateInput(s.due)}"></div><div class="field"><label>Hourly?</label><select class="input" name="hourly">${opt("0",s.hourly?"1":"0","No")}${opt("1",s.hourly?"1":"0","Yes")}</select></div></div>
  <div class="row three"><div class="field"><label>Standard fee</label><input class="input" name="standard" type="number" step="0.01" value="${s.standard==null?"":s.standard}"></div><div class="field"><label>Their fee</label><input class="input" name="fee" type="number" step="0.01" value="${s.fee==null?"":s.fee}"></div></div>
  <div class="row three"><div class="field"><label>Payment</label><select class="input" name="pstatus">${opt("free",s.payment.status,"Free")}${opt("upcoming",s.payment.status,"Not yet due")}${opt("requested",s.payment.status,"Requested")}${opt("paid",s.payment.status,"Paid")}</select></div><div class="field"><label>Amount</label><input class="input" name="pamount" type="number" step="0.01" value="${s.payment.amount==null?"":s.payment.amount}"></div><div class="field"><label>Date</label><input class="input" name="pdate" type="date" value="${toDateInput(s.payment.date)}"></div></div>
  <div class="actions"><button class="btn tiny" type="submit">Save</button><button class="textlink" type="button" data-scancel="1">Cancel</button>${s.id!=="new"?`<button class="textlink" type="button" data-sdel="${s.id}">Remove stage</button>`:""}</div></form>`;
}

function meetingBlock(){
  const d=isDesigner(),m=project.meeting;
  const cr=m&&m.change_request;
  const showReq=!d&&m&&ui.reqOpen;
  return`<section class="section" id="meeting"><div class="band"><h2>Next meeting</h2><span class="desc"></span></div>
  <div class="meeting"><div style="display:grid;gap:18px">
    ${m?`<p class="when-big">${fmtWeek(m.when)}<br>${fmtTime(m.when)}</p><p class="label">${esc(m.where)}</p><p style="max-width:52ch;color:var(--ink-2)">${linkify(m.notes)}</p>`:`<p class="when-big">Nothing scheduled.</p>`}
    ${cr?`<div class="req"><span class="label">${cr.kind==="cancel"?"Cancel requested":"Change requested"} · ${esc(nameOf(cr.by))} · ${fmtStamp(cr.at)}</span><p>${linkify(cr.message)}</p>${d?`<div class="actions"><button class="textlink" id="clearReq">Clear request</button></div>`:""}</div>`:""}
    ${d?`<div class="actions"><button class="btn ghost tiny" id="meetEdit">${m?"Edit meeting":"Schedule a meeting"}</button></div>`:""}
    ${!d&&!showReq&&!ui.meetingEdit?`<div class="actions">${m?`<button class="btn ghost tiny" id="reqOpen">Need a different time?</button>`:`<button class="btn ghost tiny" id="meetEdit">Propose a meeting</button>`}<span class="small muted">Or text ${esc(DESIGNER_NAME)}: <span class="phone" id="phone">${esc(cfg.DESIGNER_PHONE||"")}</span></span></div>`:""}
    ${ui.meetingEdit?`<form class="editbox" id="meetForm"><div class="field"><label>When</label><input class="input" name="when" type="datetime-local" value="${toLocalInput(m&&m.when)}" required></div><div class="field"><label>Where</label><input class="input" name="where" value="${esc(m?m.where:"")}"></div><div class="field"><label>${d?"Notes for them":"Anything to add"}</label><textarea class="input" name="notes">${esc(m?m.notes:"")}</textarea></div><div class="actions"><button class="btn tiny" type="submit">${d?"Save":"Propose"}</button><button class="textlink" type="button" id="meetCancel">Cancel</button></div></form>`:""}
  </div>
  ${showReq?`<form class="editbox" id="reqForm"><p class="label">This emails ${esc(DESIGNER_NAME)}.</p><div class="field"><label>Request</label><select class="input" name="kind"><option value="move">Move it</option><option value="cancel">Cancel it</option></select></div><div class="field"><label>What works</label><textarea class="input" name="message" placeholder="Could we do the following Tuesday instead, any time after 10?" required></textarea></div><div class="actions"><button class="btn" type="submit">Send request</button><button class="textlink" type="button" id="reqCancel">Cancel</button></div></form>`:""}
  </div></section>`;
}
function viewSettings(){
  return`<div class="page-head"><h1>Settings</h1></div>
  <section class="section"><div class="band"><h2>Name</h2><span class="desc"></span></div>
    <form id="nameSet" class="row" style="max-width:460px"><div class="field"><label for="setName">Name</label><input class="input" id="setName" value="${esc(me.name)}" required></div><div class="actions"><button class="btn tiny" type="submit">Save name</button></div></form></section>
  <section class="section"><div class="band"><h2>Email</h2><span class="desc"></span></div>
    <form id="emailSet" class="row" style="max-width:460px"><div class="field"><label for="setEmail">Email</label><input class="input" id="setEmail" type="email" value="${esc(me.email||"")}" required></div><div class="actions"><button class="btn tiny" type="submit">Change email</button></div><p class="small muted" id="emailMsg">${LIVE?"A confirmation link goes to the new address.":""}</p></form></section>
  <section class="section"><div class="band"><h2>Email alerts</h2><span class="desc"></span></div>
    <div class="switchrow" style="border:0;padding:0"><span class="small muted">${isDesigner()?"Get an email when a client posts, changes a directive, adds a document or asks about a meeting.":`Get an email when ${esc(DESIGNER_NAME)} replies, adds a meeting, or documents.`}</span><div class="chips"><button class="chip ${me.email_alerts?"on":""}" data-alerts="1">On</button><button class="chip ${me.email_alerts?"":"on"}" data-alerts="0">Off</button></div></div></section>
  <section class="section"><div class="band"><h2>Sign out</h2><span class="desc"></span></div>
    <div class="actions"><button class="btn ghost" id="signoutBtn">Sign out of this device</button></div></section>`;
}
/* ---------- events ---------- */
function bind(app){
  app.querySelectorAll("[data-pick]").forEach(b=>b.onclick=()=>{ui.room=b.dataset.pick;render();});
  app.querySelectorAll("[data-roomedit]").forEach(b=>b.onclick=()=>{ui.roomEdit=b.dataset.roomedit;render();});
  const rcn=$("#roomCancel",app);if(rcn)rcn.onclick=()=>{ui.roomEdit=null;render();};
  app.querySelectorAll("[data-roomrename]").forEach(f=>f.onsubmit=async e=>{e.preventDefault();const old=f.dataset.roomrename,nw=f.querySelector("input").value.trim();if(!nw||nw===old){ui.roomEdit=null;render();return;}if(project.rooms.includes(nw)){toast("There's already a space called "+nw);return;}try{await store.renameRoom(old,nw);if(LIVE)project=await store.loadProject(project.id);ui.roomEdit=null;if(ui.room===old)ui.room=nw;render();toast("Renamed");}catch(err){toast("Couldn't rename: "+err.message);}});
  app.querySelectorAll("[data-roomdel]").forEach(b=>b.onclick=async()=>{const r=b.dataset.roomdel;try{await store.setRooms(project.rooms.filter(x=>x!==r));if(LIVE)project=await store.loadProject(project.id);ui.roomEdit=null;render();toast("Removed");}catch(err){toast("Couldn't remove: "+err.message);}});
  for(const id of ["roomAddDir","roomAddMsg"]){const b=$("#"+id,app);if(b)b.onclick=()=>{ui.roomAdd=true;render();const i=$("#newRoom",app);if(i)i.focus();};}
  const rac=$("#roomAddCancel",app);if(rac)rac.onclick=()=>{ui.roomAdd=false;render();};
  const raf=$("#roomAddForm",app);if(raf)raf.onsubmit=async e=>{e.preventDefault();const r=$("#newRoom",app).value.trim();if(!r)return;if(project.rooms.includes(r)){toast("Already there");return;}try{await store.setRooms([...project.rooms,r]);if(LIVE)project=await store.loadProject(project.id);ui.roomAdd=false;render();toast("Added "+r);}catch(err){toast("Couldn't add: "+err.message);}};
  const ns=$("#nameSet",app);if(ns)ns.onsubmit=async e=>{e.preventDefault();const n=$("#setName",app).value.trim();if(!n)return;await store.setMyName(n);me.name=n;const m=(project.members||[]).find(x=>x.id===me.id);if(m)m.name=n;render();toast("Name saved");};
  const es=$("#emailSet",app);if(es)es.onsubmit=async e=>{e.preventDefault();const em=$("#setEmail",app).value.trim().toLowerCase();if(!em||em===(me.email||"").toLowerCase())return;const r=await store.setMyEmail(em);$("#emailMsg",app).textContent=r.ok?(LIVE?`Check ${me.email} and ${em} for confirmation links.`:"Email changed."):`Couldn't change it: ${r.error}`;if(r.ok&&!LIVE){me.email=em;const m=(project.members||[]).find(x=>x.id===me.id);if(m)m.email=em;}};
  const so=$("#signoutBtn",app);if(so)so.onclick=async()=>{await store.signOut();if(LIVE){me=null;project=null;notifs=[];summaries=null;try{localStorage.removeItem("parla-studio-project");sessionStorage.removeItem("parla-studio-pin");}catch(e){}location.hash="";render();}else toast("Preview: sign-out does nothing here");};
  const cl=$("#copyLink",app);if(cl)cl.onclick=async()=>{const t=projectLink();try{await navigator.clipboard.writeText(t);toast("Link copied");}catch(e){const el=$("#projLink",app);el.hidden=false;const r=document.createRange();r.selectNodeContents(el);const sel=getSelection();sel.removeAllRanges();sel.addRange(r);toast("Select and copy the link");}};
  const pe=$("#projEdit",app);if(pe)pe.onclick=()=>{ui.projEdit=true;render();};
  const pc=$("#projCancel",app);if(pc)pc.onclick=()=>{ui.projEdit=false;render();};
  const pf=$("#projForm",app);if(pf)pf.onsubmit=async e=>{e.preventDefault();const name=$("#pjName",app).value.trim();const clients=$("#pjClients",app).value.split(/[\n,]/).map(x=>x.trim()).filter(Boolean).map(x=>{const m=x.match(/^(.*?)\s*<([^>]+)>$/);return m?{name:m[1].trim(),email:m[2].trim().toLowerCase()}:{name:"",email:x.toLowerCase()};});const rooms=[...new Set($("#pjRooms",app).value.split(/\n/).map(x=>x.trim()).filter(Boolean))];try{await store.updateProject(name,clients);await store.setRooms(rooms);if(LIVE)project=await store.loadProject(project.id);else{project.name=name;project.rooms=rooms;}ui.projEdit=false;summaries=null;render();toast("Project saved");}catch(err){toast("Couldn't save: "+err.message);}};
  app.querySelectorAll("[data-alerts]").forEach(b=>b.onclick=async()=>{const on=b.dataset.alerts==="1";if(on===!!me.email_alerts)return;me.email_alerts=on;await store.setEmailAlerts(on);render();toast(on?"Email alerts on":"Email alerts off");});

  app.querySelectorAll("[data-sort]").forEach(b=>b.onclick=()=>{ui.sort=b.dataset.sort;render();});
  const ram=$("#readAllMsgs",app);if(ram)ram.onclick=async()=>{for(const n of unreadNotes()){await store.markRead(n.id,true);n.read_at=new Date().toISOString();}render();toast("All read");};
  app.querySelectorAll("[data-toggle]").forEach(b=>b.onclick=()=>{const id=b.dataset.toggle;if(ui.editing[id])return;ui.open[id]=!ui.open[id];render();});
  const rb=$("#reviewBtn",app);if(rb)rb.onclick=()=>{ui.review=true;render();};
  const rk=$("#reviewBack",app);if(rk)rk.onclick=()=>{ui.review=false;render();};
  const acceptOne=async id=>{const f=app.querySelector(`#rev-${id}`);const dir=f.querySelector("[data-dir]").value.trim(),notes=f.querySelector("[data-notes]").value.trim();await store.saveDirective(id,{directive:dir,a:notes,directive_reviewed:true});project.intake.forEach(s=>s.questions.forEach(q=>{if(q.id===id){q.directive=dir;q.a=notes;q.directive_reviewed=true;}}));};
  app.querySelectorAll("[data-qadd]").forEach(f=>f.onsubmit=async e=>{e.preventDefault();const sid=f.dataset.qadd,text=f.querySelector("input").value.trim();if(!text)return;const q=await store.addQuestion(sid,text);if(LIVE)project.intake.find(x=>x.id===sid).questions.push(q);render();});
  app.querySelectorAll("[data-accept]").forEach(b=>b.onclick=async()=>{await acceptOne(b.dataset.accept);render();toast("Accepted");});
  app.querySelectorAll("[data-draft]").forEach(b=>b.onclick=()=>{const f=app.querySelector(`#rev-${b.dataset.draft}`);f.querySelector("[data-dir]").value=f.querySelector("[data-notes]").value;});
  const aa=$("#acceptAll",app);if(aa)aa.onclick=async()=>{for(const el of app.querySelectorAll(".revrow[id]"))if(el.querySelector("[data-dir]").value.trim())await acceptOne(el.id.slice(4));ui.review=false;render();toast("Directives updated");};
  app.querySelectorAll("[data-pay]").forEach(b=>b.onclick=()=>{ui.payOpen=ui.payOpen===b.dataset.pay?null:b.dataset.pay;render();});
  app.querySelectorAll("[data-payreq]").forEach(f=>f.onsubmit=async e=>{e.preventDefault();const st=project.stages.find(x=>x.id===f.dataset.payreq);const body=`Payment for ${st?st.title:"a stage"}: I'd like to pay another way. ${f.querySelector("textarea").value.trim()}`;try{const n=await store.addNote({room:"",body,images:[]});if(LIVE)project.notes.unshift(n);ui.payOpen=null;render();toast(`Sent — ${DESIGNER_NAME} will reply in messages`);}catch(err){toast("Couldn't send: "+err.message);}});
  app.querySelectorAll("[data-qedit]").forEach(b=>b.onclick=()=>{ui.editing[b.dataset.qedit]=true;ui.open[b.dataset.qedit]=true;render();$("#ans-"+b.dataset.qedit).focus();});
  app.querySelectorAll("[data-qcancel]").forEach(b=>b.onclick=()=>{delete ui.editing[b.dataset.qcancel];render();});
  app.querySelectorAll("[data-qseen]").forEach(b=>b.onclick=async()=>{await store.markAnswerSeen(b.dataset.qseen);project.intake.forEach(s=>s.questions.forEach(q=>{if(q.id===b.dataset.qseen)q.seen_by_designer=true;}));render();});
  app.querySelectorAll("[data-qsave]").forEach(f=>f.onsubmit=async e=>{e.preventDefault();const id=f.dataset.qsave,t=$("#ans-"+id).value.trim();const nEl=$("#notes-"+id);const patch={directive:t,updated_at:new Date().toISOString(),updated_by:me.id,seen_by_designer:isDesigner(),directive_reviewed:true};if(nEl)patch.a=nEl.value.trim();await store.saveDirective(id,patch);project.intake.forEach(s=>s.questions.forEach(q=>{if(q.id===id)Object.assign(q,patch);}));delete ui.editing[id];render();toast(isDesigner()?"Saved":`Saved — ${DESIGNER_NAME} will see this`);});
  app.querySelectorAll("[data-qdel]").forEach(b=>b.onclick=async()=>{const id=b.dataset.qdel;if(ui.confirmDel!==id){ui.confirmDel=id;b.textContent="Delete for sure?";return;}await store.deleteDirective(id);project.intake.forEach(s=>s.questions=s.questions.filter(q=>q.id!==id));delete ui.editing[id];ui.confirmDel=null;render();toast("Deleted");});
  app.querySelectorAll("[data-comment]").forEach(b=>b.onclick=()=>{ui.commentOpen[b.dataset.comment]=true;ui.open[b.dataset.comment]=true;render();$("#cb-"+b.dataset.comment).focus();});
  app.querySelectorAll("[data-ccancel]").forEach(b=>b.onclick=()=>{delete ui.commentOpen[b.dataset.ccancel];render();});
  app.querySelectorAll("[data-csave]").forEach(f=>f.onsubmit=async e=>{e.preventDefault();const id=f.dataset.csave,body=$("#cb-"+id).value.trim();if(!body)return;const c=await store.addComment(id,body);project.intake.forEach(s=>s.questions.forEach(q=>{if(q.id===id){q.comments=q.comments||[];if(!q.comments.some(x=>x.id===c.id))q.comments.push(c);if(!isDesigner())q.seen_by_designer=false;}}));delete ui.commentOpen[id];render();toast("Comment added");});
  const nf=$("#noteFiles",app);if(nf)nf.onchange=async()=>{for(const f of nf.files){try{ui.composeImgs.push(await store.uploadImage(f));}catch(err){toast("Upload failed: "+err.message);}}render();};
  const comp=$("#compose",app);if(comp)comp.onsubmit=async e=>{e.preventDefault();const body=$("#noteBody",app).value.trim();if(!body&&!ui.composeImgs.length)return;const room=autoRoom(body,project.rooms);try{const n=await store.addNote({room,body,images:ui.composeImgs});if(LIVE)project.notes.unshift(n);ui.composeImgs=[];ui.room="all";render();toast(room?"Posted · filed under "+room:"Posted · under Other for now");}catch(err){toast("Couldn't save: "+err.message);}};
  app.querySelectorAll("select[data-room]").forEach(s=>{s.onchange=async()=>{await store.setNoteRoom(s.dataset.room,s.value);const n=project.notes.find(x=>x.id===s.dataset.room);if(n)n.room=s.value;render();toast(s.value?"Moved to "+s.value:"Moved to Other");};});
  app.querySelectorAll("[data-jump]").forEach(b=>b.onclick=()=>{const el=document.getElementById(b.dataset.jump);if(el)el.scrollIntoView({block:"start",behavior:"smooth"});});
  app.querySelectorAll("[data-conv]").forEach(b=>b.onclick=()=>{ui.room=b.dataset.conv;ui.sort="room";location.hash="conversation";});
  app.querySelectorAll("[data-dir]").forEach(b=>b.onclick=()=>{ui.jump=b.dataset.dir;location.hash="directives";});
  app.querySelectorAll("[data-dnew]").forEach(b=>b.onclick=()=>{ui.editing["add-"+b.dataset.dnew]=true;render();$("#dir-"+b.dataset.dnew).focus();});
  app.querySelectorAll("[data-dadd]").forEach(f=>f.onsubmit=async e=>{e.preventDefault();const sid=f.dataset.dadd,t=$("#dir-"+sid).value.trim();if(!t)return;try{const q=await store.addDirective(sid,t);if(LIVE)project.intake.find(s=>s.id===sid).questions.push(q);const tell=$("#tell-"+sid);if(tell&&tell.checked)await store.tellClients(q.id);delete ui.editing["add-"+sid];ui.jump="sec-"+sid;render();toast(isDesigner()?(tell&&tell.checked?"Directive added · clients notified":"Directive added"):`Added — ${DESIGNER_NAME} will see it`);}catch(err){toast("Couldn't save: "+err.message);}});
  const df=$("#docFile",app);if(df)df.onchange=()=>{$("#docName",app).textContent=df.files[0]?df.files[0].name:"";};
  const docForm=$("#docForm",app);if(docForm)docForm.onsubmit=async e=>{e.preventDefault();let url=$("#docUrl",app).value.trim();const f=df&&df.files[0];try{if(f)url=await store.uploadImage(f);const doc={title:$("#docTitle",app).value.trim(),kind:$("#docKind",app).value.trim()||(f?f.name.split(".").pop().toUpperCase():"Link"),url,note:$("#docNote",app).value.trim(),created_at:new Date().toISOString()};await store.addDocument(doc);if(LIVE)project=await store.loadProject(project.id);render();toast("Added");}catch(err){toast("Couldn't add: "+err.message);}};
  app.querySelectorAll("[data-rmdoc]").forEach(b=>b.onclick=async e=>{e.preventDefault();e.stopPropagation();await store.removeDocument(b.dataset.rmdoc);project.documents=project.documents.filter(x=>x.id!==b.dataset.rmdoc);render();});
  app.querySelectorAll("[data-read]").forEach(b=>b.onclick=async()=>{const on=b.dataset.on==="1";await store.markRead(b.dataset.read,on);const n=project.notes.find(x=>x.id===b.dataset.read);n.read_at=on?new Date().toISOString():null;render();});
  app.querySelectorAll("[data-status]").forEach(b=>b.onclick=async()=>{const n=project.notes.find(x=>x.id===b.dataset.note);const st=noteStatus(n)===b.dataset.status?"":b.dataset.status;await store.setStatus(n.id,st);n.status=st;n.status_at=st?new Date().toISOString():null;n.integrated_at=st==="integrated"?n.status_at:null;if(st&&!n.read_at)n.read_at=n.status_at;render();toast(st?STATUS[st]:"Status cleared");});
  app.querySelectorAll("[data-todir]").forEach(b=>b.onclick=()=>{ui.toDir[b.dataset.todir]=true;render();$("#td-"+b.dataset.todir).focus();});
  app.querySelectorAll("[data-tdcancel]").forEach(b=>b.onclick=()=>{delete ui.toDir[b.dataset.tdcancel];render();});
  app.querySelectorAll("[data-dirsave]").forEach(f=>f.onsubmit=async e=>{e.preventDefault();const id=f.dataset.dirsave,text=$("#td-"+id).value.trim(),sid=$("#tdroom-"+id).value;if(!text)return;const n=project.notes.find(x=>x.id===id);try{const q=await store.addDirective(sid,text,{images:n?n.images:[],source_note_id:id});if(LIVE)project.intake.find(x=>x.id===sid).questions.push(q);if(n){await store.setStatus(id,"directive");n.status="directive";n.status_at=new Date().toISOString();n.integrated_at=null;if(!n.read_at)n.read_at=n.status_at;}delete ui.toDir[id];render();toast("Added as a directive");}catch(err){toast("Couldn't add: "+err.message);}});
  app.querySelectorAll("[data-reply]").forEach(b=>b.onclick=()=>{ui.replyOpen[b.dataset.reply]=true;render();$("#rb-"+b.dataset.reply).focus();});
  app.querySelectorAll("[data-rcancel]").forEach(b=>b.onclick=()=>{delete ui.replyOpen[b.dataset.rcancel];render();});
  app.querySelectorAll("[data-rsave]").forEach(f=>f.onsubmit=async e=>{e.preventDefault();const id=f.dataset.rsave,body=$("#rb-"+id).value.trim();if(!body)return;const r=await store.addReply(id,body);if(LIVE)project.notes.find(x=>x.id===id).replies.push(r);if(isDesigner()){const n=project.notes.find(x=>x.id===id);if(!n.read_at){await store.markRead(id,true);n.read_at=new Date().toISOString();}}delete ui.replyOpen[id];render();toast("Reply posted");});
  app.querySelectorAll("[data-nedit]").forEach(b=>b.onclick=()=>{ui.editing[b.dataset.nedit]=true;render();$("#nb-"+b.dataset.nedit).focus();});
  app.querySelectorAll("[data-ncancel]").forEach(b=>b.onclick=()=>{delete ui.editing[b.dataset.ncancel];render();});
  app.querySelectorAll("[data-nsave]").forEach(f=>f.onsubmit=async e=>{e.preventDefault();const id=f.dataset.nsave,body=$("#nb-"+id).value.trim();await store.editNote(id,body);const n=project.notes.find(x=>x.id===id);n.body=body;n.edited_at=new Date().toISOString();if(!isDesigner())n.read_at=null;delete ui.editing[id];render();toast("Edited");});
  app.querySelectorAll("[data-sedit]").forEach(b=>b.onclick=()=>{ui.stageEdit=b.dataset.sedit;render();});
  const add=$("#addStage",app);if(add)add.onclick=()=>{ui.stageEdit="new";render();};
  app.querySelectorAll("[data-scancel]").forEach(b=>b.onclick=()=>{ui.stageEdit=null;render();});
  app.querySelectorAll("[data-sdel]").forEach(b=>b.onclick=async()=>{await store.deleteStage(b.dataset.sdel);project.stages=project.stages.filter(s=>s.id!==b.dataset.sdel);ui.stageEdit=null;render();toast("Stage removed");});
  app.querySelectorAll("[data-ssave]").forEach(f=>f.onsubmit=async e=>{e.preventDefault();const v=n=>f.elements[n].value;const num=n=>v(n)===""?null:Number(v(n));
    const st={id:f.dataset.ssave,order:Number(v("order"))||project.stages.length+1,title:v("title").trim(),focus:v("focus").trim(),desc:v("desc").trim(),deliverable:v("deliverable").trim(),due:v("due")?new Date(v("due")+"T12:00").toISOString():null,status:v("status"),standard:num("standard"),fee:num("fee"),hourly:v("hourly")==="1",payment:{status:v("pstatus"),amount:num("pamount"),date:v("pdate")?new Date(v("pdate")+"T12:00").toISOString():null}};
    if(st.status==="current")project.stages.forEach(s=>{if(s.id!==st.id&&s.status==="current"){s.status="done";store.saveStage(s);}});
    try{await store.saveStage(st);if(LIVE)project=await store.loadProject(project.id);ui.stageEdit=null;render();toast("Timeline updated");}catch(err){toast("Couldn't save: "+err.message);}});
  const me1=$("#meetEdit",app);if(me1)me1.onclick=()=>{ui.meetingEdit=true;render();};
  const mc=$("#meetCancel",app);if(mc)mc.onclick=()=>{ui.meetingEdit=false;render();};
  const mf=$("#meetForm",app);if(mf)mf.onsubmit=async e=>{e.preventDefault();const m={id:project.meeting?project.meeting.id:undefined,when:new Date(mf.elements.when.value).toISOString(),where:mf.elements.where.value.trim(),notes:mf.elements.notes.value.trim(),change_request:null};try{await store.saveMeeting(m);project.meeting=LIVE?(await store.loadProject(project.id)).meeting:m;ui.meetingEdit=false;render();toast("Meeting saved");}catch(err){toast("Couldn't save: "+err.message);}};
  const cq=$("#clearReq",app);if(cq)cq.onclick=async()=>{const m={...project.meeting,change_request:null};await store.saveMeeting(m);project.meeting=m;render();};
  const ro=$("#reqOpen",app);if(ro)ro.onclick=()=>{ui.reqOpen=true;render();};
  const rc=$("#reqCancel",app);if(rc)rc.onclick=()=>{ui.reqOpen=false;render();};
  const rq=$("#reqForm",app);if(rq)rq.onsubmit=async e=>{e.preventDefault();const m={...project.meeting,change_request:{kind:rq.elements.kind.value,message:rq.elements.message.value.trim(),by:me.id,at:new Date().toISOString()}};await store.saveMeeting(m);project.meeting=m;ui.reqOpen=false;render();toast(`Sent — ${DESIGNER_NAME} will confirm`);};
}

/* ---------- boot ---------- */
function syncRoute(){const h=(location.hash||"").slice(1);route=ROUTES.includes(h)?h:(me&&isDesigner()?"projects":"home");window.scrollTo({top:0});}
window.addEventListener("hashchange",()=>{summaries=null;syncRoute();ui.editing={};ui.open={};ui.roomEdit=null;ui.roomAdd=false;ui.replyOpen={};ui.stageEdit=null;ui.meetingEdit=false;render();});
(async function start(){
  try{const p=new URLSearchParams(location.search).get("p");if(p){localStorage.setItem("parla-studio-project",p);history.replaceState(null,"",location.pathname+location.hash);}}catch(e){}
  store=LIVE?new SupabaseStore():new MockStore();
  syncRoute();
  try{const r=await store.init();if(r){me=r.me;project=r.project;if(me){notifs=await store.loadNotifs();store.ensureCred();}}}catch(err){console.error(err);}
  if(!location.hash)syncRoute();
  render();
  if(LIVE)setInterval(async()=>{if(me&&project){try{notifs=await store.loadNotifs();renderNav();}catch(e){}}},60000);
  if(LIVE){store.sb.auth.onAuthStateChange(async(ev)=>{if((ev==="SIGNED_IN"||ev==="INITIAL_SESSION")&&!me){const r=await store.init();if(r){me=r.me;project=r.project;if(me)notifs=await store.loadNotifs();if(!location.hash)syncRoute();render();}}});}
})();
})();
