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

/* ---------- state ---------- */
let store=null, me=null, project=null, route="home", notifs=[];
let ui={room:"all",sort:"recent",editing:{},composeImgs:[],replyOpen:{},stageEdit:null,meetingEdit:false,askOpen:false};
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
  async createProject(name,clients){const p=JSON.parse(JSON.stringify(window.SAMPLE_PROJECT));p.id=uid();p.name=name;p.members=[p.designer,...clients.map(c=>({id:uid(),name:c.name||c.email.split("@")[0],email:c.email,role:"client"}))];p.notes=[];p.notifs=[];p.meeting=null;p.documents=[];p.architect_images=[];p.pinterest_url="";p.pinterest_note="";p.intake.forEach(s=>s.questions=s.questions.filter(q=>q.q).map(q=>({...q,a:"",updated_at:null,updated_by:null})));p.stages.forEach((s,i)=>{s.status=i===0?"current":"upcoming";s.due=null;s.payment={status:s.fee?"upcoming":"free",amount:s.fee||0,date:null};});this.all.push(p);this.project=p;this.persist();return p.id;}
  async signIn(){return{ok:true};}
  async signOut(){}
  async setMyName(n){const m=this.project.members.find(x=>x.id===this.meId);if(m)m.name=n;this.persist();}
  async loadNotifs(){return (this.project.notifs||[]).filter(n=>n.to===this.meId);}
  async markNotifSeen(id){const n=(this.project.notifs||[]).find(x=>x.id===id);if(n)n.seen_at=new Date().toISOString();this.persist();}
  async markAllNotifsSeen(){(this.project.notifs||[]).forEach(n=>{if(n.to===this.meId&&!n.seen_at)n.seen_at=new Date().toISOString();});this.persist();}
  async uploadImage(file){return readFile(file);}
  async saveAnswer(qid,text){for(const s of this.project.intake)for(const q of s.questions)if(q.id===qid){q.a=text;q.updated_at=new Date().toISOString();q.updated_by=me.id;q.seen_by_designer=me.role==="designer";}this.persist();}
  async markAnswerSeen(qid){for(const s of this.project.intake)for(const q of s.questions)if(q.id===qid)q.seen_by_designer=true;this.persist();}
  async addDirective(sid,text){const s=this.project.intake.find(x=>x.id===sid);const q={id:uid(),q:"",a:text,updated_at:new Date().toISOString(),updated_by:me.id,added_by:me.id,seen_by_designer:me.role==="designer"};s.questions.push(q);this.persist();return q;}
  async addDocument(doc){this.project.documents.push({id:uid(),...doc});this.persist();}
  async removeDocument(id){this.project.documents=this.project.documents.filter(x=>x.id!==id);this.persist();}
  async addNote(n){const note={id:uid(),author_id:me.id,room:n.room||"",body:n.body,images:n.images||[],created_at:new Date().toISOString(),edited_at:null,read_at:me.role==="designer"?new Date().toISOString():null,integrated_at:null,replies:[]};this.project.notes.unshift(note);this.persist();return note;}
  async editNote(id,body){const n=this.project.notes.find(x=>x.id===id);if(n){n.body=body;n.edited_at=new Date().toISOString();if(me.role!=="designer")n.read_at=null;}this.persist();}
  async setNoteRoom(id,room){const n=this.project.notes.find(x=>x.id===id);if(n)n.room=room;this.persist();}
  async markRead(id,on){const n=this.project.notes.find(x=>x.id===id);if(n)n.read_at=on?new Date().toISOString():null;this.persist();}
  async markIntegrated(id,on){const n=this.project.notes.find(x=>x.id===id);if(n)n.integrated_at=on?new Date().toISOString():null;this.persist();}
  async addReply(noteId,body){const n=this.project.notes.find(x=>x.id===noteId);const r={id:uid(),author_id:me.id,body,created_at:new Date().toISOString()};n.replies.push(r);this.persist();return r;}
  async saveStage(st){const i=this.project.stages.findIndex(x=>x.id===st.id);if(i<0){st.id=uid();this.project.stages.push(st);}else this.project.stages[i]=st;this.project.stages.sort((a,b)=>a.order-b.order);this.persist();}
  async deleteStage(id){this.project.stages=this.project.stages.filter(x=>x.id!==id);this.persist();}
  async saveMeeting(m){this.project.meeting=m;this.persist();}
  async addImage(img){this.project.architect_images.push({id:uid(),...img});this.persist();}
  async removeImage(id){this.project.architect_images=this.project.architect_images.filter(x=>x.id!==id);this.persist();}
  async savePinterest(url,note){this.project.pinterest_url=url;this.project.pinterest_note=note;this.persist();}
  async setNotifyClients(on){this.project.notify_clients=on;this.persist();}
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
    me={id:u.id,email:u.email,name:nm||prefix,role:designer?"designer":"client"};
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
    try{localStorage.setItem("parla-studio-project",id);}catch(e){}
    const members=(mems||[]).map(m=>({id:m.user_id,role:m.role,name:m.profiles?m.profiles.name:"—",email:m.profiles?m.profiles.email:""}));
    this.pid=id;
    return{
      id:p.id,name:p.name,designer:members.find(m=>m.role==="designer"),members,
      rooms:p.rooms||[],pinterest_url:p.pinterest_url||"",pinterest_note:p.pinterest_note||"",notify_clients:!!p.notify_clients,
      architect_images:imgs||[],documents:docs||[],
      intake:(secs||[]).map(s=>({id:s.id,title:s.title,room:s.room||"",questions:(qs||[]).filter(q=>q.section_id===s.id).map(q=>({id:q.id,q:q.question||"",a:q.answer||"",updated_at:q.updated_at,updated_by:q.updated_by,added_by:q.added_by,seen_by_designer:q.seen_by_designer}))})),
      notes:(notes||[]).map(n=>({...n,images:n.images||[],replies:(reps||[]).filter(r=>r.note_id===n.id)})),
      process:p.process||[],
      stages:(stages||[]).map(s=>({id:s.id,order:s.position,title:s.title,focus:s.focus||"",desc:s.description||"",deliverable:s.deliverable||"",due:s.due,status:s.status,standard:s.standard,fee:s.fee,hourly:s.hourly,payment:{status:s.payment_status||"upcoming",amount:s.payment_amount,date:s.payment_date}})),
      meeting:meet?{id:meet.id,when:meet.when,where:meet.where||"",notes:meet.notes||"",change_request:meet.change_request}:null
    };
  }
  async setMyName(n){await this.sb.from("profiles").update({name:n}).eq("id",me.id);}
  async loadNotifs(){const {data}=await this.sb.from("notifications").select("id,subject,body,link,created_at,seen_at").eq("to_user",me.id).order("created_at",{ascending:false}).limit(30);return data||[];}
  async markNotifSeen(id){await this.sb.from("notifications").update({seen_at:new Date().toISOString()}).eq("id",id);}
  async markAllNotifsSeen(){await this.sb.from("notifications").update({seen_at:new Date().toISOString()}).eq("to_user",me.id).is("seen_at",null);}
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
  async addDirective(sid,text){const {data,error}=await this.sb.from("intake_questions").insert({project_id:this.pid,section_id:sid,position:Date.now(),question:"",answer:text,updated_at:new Date().toISOString(),updated_by:me.id,added_by:me.id,seen_by_designer:me.role==="designer"}).select().single();if(error)throw error;return{id:data.id,q:"",a:data.answer,updated_at:data.updated_at,updated_by:data.updated_by,added_by:data.added_by,seen_by_designer:data.seen_by_designer};}
  async addDocument(doc){await this.sb.from("documents").insert({project_id:this.pid,title:doc.title,kind:doc.kind,url:doc.url,note:doc.note,position:Date.now()});}
  async removeDocument(id){await this.sb.from("documents").delete().eq("id",id);}
  async addNote(n){const row={project_id:this.pid,author_id:me.id,room:n.room||"",body:n.body,images:n.images||[],read_at:me.role==="designer"?new Date().toISOString():null};const {data,error}=await this.sb.from("notes").insert(row).select().single();if(error)throw error;return{...data,replies:[]};}
  async editNote(id,body){const patch={body,edited_at:new Date().toISOString()};if(me.role!=="designer")patch.read_at=null;await this.sb.from("notes").update(patch).eq("id",id);}
  async setNoteRoom(id,room){await this.sb.from("notes").update({room}).eq("id",id);}
  async markRead(id,on){await this.sb.from("notes").update({read_at:on?new Date().toISOString():null}).eq("id",id);}
  async markIntegrated(id,on){await this.sb.from("notes").update({integrated_at:on?new Date().toISOString():null}).eq("id",id);}
  async addReply(noteId,body){const {data,error}=await this.sb.from("note_replies").insert({note_id:noteId,project_id:this.pid,author_id:me.id,body}).select().single();if(error)throw error;return data;}
  async saveStage(st){const row={project_id:this.pid,position:st.order,title:st.title,focus:st.focus||"",description:st.desc,deliverable:st.deliverable,due:st.due?st.due.slice(0,10):null,status:st.status,standard:st.standard,fee:st.fee,hourly:!!st.hourly,payment_status:st.payment.status,payment_amount:st.payment.amount,payment_date:st.payment.date?st.payment.date.slice(0,10):null};if(st.id&&!st.id.startsWith("new"))row.id=st.id;const {error}=await this.sb.from("stages").upsert(row);if(error)throw error;}
  async deleteStage(id){await this.sb.from("stages").delete().eq("id",id);}
  async saveMeeting(m){const row={project_id:this.pid,when:m.when,where:m.where,notes:m.notes,change_request:m.change_request};if(m.id)row.id=m.id;const {error}=await this.sb.from("meetings").upsert(row);if(error)throw error;}
  async addImage(img){await this.sb.from("architect_images").insert({project_id:this.pid,url:img.url,caption:img.caption,position:Date.now()});}
  async removeImage(id){await this.sb.from("architect_images").delete().eq("id",id);}
  async savePinterest(url,note){await this.sb.from("projects").update({pinterest_url:url,pinterest_note:note}).eq("id",this.pid);}
  async setNotifyClients(on){await this.sb.from("projects").update({notify_clients:on}).eq("id",this.pid);}
  async createProject(name,clients){const {data,error}=await this.sb.rpc("create_project",{p_name:name,p_client_emails:clients.map(c=>c.email),p_client_names:clients.map(c=>c.name),p_intake:window.SAMPLE_PROJECT.intake.map(s=>({title:s.title,room:s.room||"",questions:s.questions.filter(q=>q.q).map(q=>q.q)})),p_process:window.SAMPLE_PROJECT.process,p_stages:window.SAMPLE_PROJECT.stages.map(s=>({title:s.title,focus:s.focus||"",description:s.desc,deliverable:s.deliverable,standard:s.standard,fee:s.fee,hourly:!!s.hourly})),p_rooms:window.SAMPLE_PROJECT.rooms});if(error)throw error;return data;}
}

/* ---------- derived ---------- */
const unreadNotes=()=>project.notes.filter(n=>!n.read_at&&n.author_id!==(project.designer||{}).id);
const changedAnswers=()=>project.intake.flatMap(s=>s.questions).filter(q=>q.updated_by&&q.updated_by!==(project.designer||{}).id&&!q.seen_by_designer);
const openAnswers=()=>project.intake.flatMap(s=>s.questions).filter(q=>!q.a);
const newRepliesForClient=()=>project.notes.filter(n=>n.author_id!==(project.designer||{}).id&&n.replies.some(r=>r.author_id===(project.designer||{}).id));
const currentStage=()=>project.stages.find(s=>s.status==="current");
function activity(){
  const d=(project.designer||{}).id,a=[];
  for(const n of project.notes){a.push({t:`${nameOf(n.author_id)} added to the conversation${n.room?" · "+n.room:""}`,w:n.created_at,go:"conversation"});for(const r of n.replies)a.push({t:`${nameOf(r.author_id)} replied${n.room?" · "+n.room:""}`,w:r.created_at,go:"conversation"});}
  for(const s of project.intake)for(const q of s.questions)if(q.updated_at&&q.updated_by)a.push({t:`${nameOf(q.updated_by)} ${q.added_by?"added a directive":q.updated_by===d?"recorded a directive":"updated a directive"} · ${s.title}`,w:q.updated_at,go:"directives"});
  for(const s of project.stages)if(s.payment&&s.payment.date)a.push({t:`Payment ${s.payment.status} · ${s.title}`,w:s.payment.date,go:"timeline"});
  return a.sort((x,y)=>new Date(y.w)-new Date(x.w)).slice(0,6);
}

/* ---------- rendering ---------- */
const NAV=[["home","Home"],["directives","Directives"],["conversation","Conversation"],["documents","Documents"],["timeline","Timeline"],["meeting","Meeting"]];
const ROUTES=["projects",...NAV.map(([k])=>k)];
let summaries=null;
function needsName(){return me&&(!me.name||me.name.toLowerCase()===(me.email||"").split("@")[0].toLowerCase());}
function renderAskName(app){
  $("#menuBtn").hidden=true;closePops();$("#mastRight").innerHTML="";$("#foot").hidden=true;
  app.innerHTML=`<div class="signin"><div class="signin-card"><p class="label">One thing</p><h1>What should we call you?</h1><p class="lede">Your first name is how your notes and replies will be signed.</p>
  <form id="nameForm"><div class="field"><label for="myname">Name</label><input class="input" id="myname" required autocomplete="given-name" placeholder="Brook"></div><div class="actions"><button class="btn" type="submit">That's me</button></div></form></div></div>`;
  $("#nameForm",app).onsubmit=async e=>{e.preventDefault();const n=$("#myname",app).value.trim();if(!n)return;await store.setMyName(n);me.name=n;const m=(project&&project.members||[]).find(x=>x.id===me.id);if(m)m.name=n;render();};
}
function render(){
  const app=$("#app");
  if(!me){renderSignIn(app);return;}
  if(needsName()){renderAskName(app);return;}
  if(isDesigner()&&(route==="projects"||!project)){renderDashboard(app);return;}
  if(!project){renderNoProject(app);return;}
  renderNav();
  $("#foot").hidden=false;$("#footProject").textContent=project.name;
  const views={home:viewHome,documents:viewDocuments,directives:viewDirectives,conversation:viewConversation,timeline:viewTimeline,meeting:viewMeeting};
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
    else{if(k==="conversation"&&newRepliesForClient().length)c=newRepliesForClient().length;if(k==="directives"&&openAnswers().length)c=openAnswers().length;}
    return`<a href="#${k}" class="${route===k?"active":""}">${l}${c?`<span class="count">${c}</span>`:""}</a>`;}).join("");
  $("#menuBtn").onclick=e=>{e.stopPropagation();const p=$("#menuPop");const open=p.hidden;closePops();p.hidden=!open;};
  $(".wordmark").href=isDesigner()?"#projects":"#home";
  nav.querySelectorAll("a").forEach(a=>a.addEventListener("click",closePops));
  const r=$("#mastRight");
  const convCount=isDesigner()?unreadNotes().length:newRepliesForClient().length;
  const newN=notifs.filter(n=>!n.seen_at).length;
  r.innerHTML=`<a class="icon-btn" href="#conversation" aria-label="Conversation">${ICONS.msg}${convCount?`<span class="badge">${convCount}</span>`:""}</a>
    <button class="icon-btn" id="bellBtn" aria-label="Notifications">${ICONS.bell}${newN?`<span class="badge">${newN}</span>`:""}</button>
    <span class="who">${esc(me.name)}${LIVE?` · <button id="signout">Sign out</button>`:""}</span>`;
  if(LIVE)$("#signout",r).onclick=async()=>{await store.signOut();me=null;project=null;render();};
  $("#bellBtn",r).onclick=async e=>{e.stopPropagation();const p=$("#bellPop");const open=p.hidden;closePops();if(!open)return;renderBell();p.hidden=false;};
}
function renderBell(){
  const p=$("#bellPop");
  const list=notifs.slice(0,20);
  p.innerHTML=`<div class="head"><span class="label">Notifications</span>${list.some(n=>!n.seen_at)?`<button class="textlink" id="seenAll">Mark all read</button>`:""}</div>
  <div class="items">${list.map(n=>`<button class="notif ${n.seen_at?"":"new"}" data-nid="${n.id}" data-link="${esc(n.link||"#home")}"><span class="s">${n.seen_at?"":`<span class="dot"></span>`}${esc(n.subject)}</span><span class="b">${esc(n.body)}</span><span class="w">${fmtStamp(n.created_at)}</span></button>`).join("")||`<p class="empty">Nothing yet. You'll see it here when ${isDesigner()?"the clients":DESIGNER_NAME} post, reply or change something.</p>`}</div>`;
  p.querySelectorAll("[data-nid]").forEach(b=>b.onclick=async()=>{const n=notifs.find(x=>x.id===b.dataset.nid);if(n&&!n.seen_at){n.seen_at=new Date().toISOString();await store.markNotifSeen(n.id);}closePops();const h=(b.dataset.link||"#home").replace(/^#/,"");if(h===route)render();else location.hash=h;});
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
  $("#menuBtn").hidden=true;closePops();$("#mastRight").innerHTML="";$("#foot").hidden=true;$("#previewBar").hidden=true;
  app.innerHTML=`<div class="signin"><div class="signin-card">
    <p class="label">Private</p>
    <h1>Welcome.</h1>
    <p class="lede">Type the email you use with ${esc(DESIGNER_NAME)} and we'll send a link that signs you in. No password.</p>
    <form id="signinForm"><div class="field"><label for="email">Email</label><input class="input" id="email" type="email" required autocomplete="email" placeholder="you@example.com"></div>
    <div class="actions"><button class="btn" type="submit">Send me a link</button></div></form>
    <p class="small muted" id="signinMsg"></p></div></div>`;
  $("#signinForm",app).onsubmit=async e=>{e.preventDefault();const email=$("#email",app).value.trim();const r=await store.signIn(email);$("#signinMsg",app).textContent=r.ok?`Check ${email} for a link. It works for about an hour and keeps you signed in on this device.`:`That didn't send: ${r.error}`;};
}
async function renderDashboard(app){
  renderNav();
  $("#foot").hidden=false;$("#footProject").textContent="All projects";
  if(!summaries){app.innerHTML=`<div class="view"><div class="page-head"><p class="label">Studio</p><h1>Hello, ${esc(me.name.split(" ")[0])}.</h1></div></div>`;summaries=await store.listProjects();if(route!=="projects")return;}
  const list=summaries;
  const attn=p=>{const a=[];if(p.unread)a.push(`${p.unread} unread`);if(p.changed)a.push(`${p.changed} directive${p.changed>1?"s":""} changed`);if(p.meeting_request)a.push("meeting request");if(p.payment_requested)a.push(`${p.payment_requested} payment${p.payment_requested>1?"s":""} requested`);return a;};
  const needs=list.filter(p=>attn(p).length).length;
  app.innerHTML=`<div class="view">
    <div class="page-head"><p class="label">Studio</p><h1>Hello, ${esc(me.name.split(" ")[0])}.</h1><p class="lede">${list.length?`${list.length} project${list.length>1?"s":""}${needs?` · ${needs} need${needs>1?"":"s"} you`:" · nothing waiting on you"}.`:"No projects yet."}</p></div>
    <section class="section"><div class="band"><h2>Projects</h2><span class="desc"></span><span class="n">${list.length}</span></div>
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
  $("#menuBtn").hidden=true;closePops();$("#foot").hidden=true;
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
    const needs=[];if(unread)needs.push(`${unread} unread in the conversation`);if(changed)needs.push(`${changed} directive${changed>1?"s":""} changed`);if(req)needs.push("a meeting request");if(unsorted)needs.push(`${unsorted} unsorted`);
    lede=`${needs.length?`Needs you: ${needs.join(", ")}.`:"Nothing waiting on you."} ${cs?`${esc(cs.title)} is the current stage${cs.due?`, due ${fmtLong(cs.due)}`:""}.`:""}`;
    cards=[
      ["conversation","Conversation",`${unread?unread+" unread · ":""}${project.notes.length} notes · ${project.notes.filter(n=>n.integrated_at).length} integrated`,unread||""],
      ["directives","Directives",changed?`${changed} changed or added by the clients`:"Nothing new since you last looked",changed||""],
      ["meeting","Next meeting",m?`${fmtWeek(m.when)} · ${fmtTime(m.when)}${req?" · change requested":""}`:"Nothing scheduled yet",req?"!":""],
      ["timeline","Timeline",cs?`${cs.title} now · ${project.stages.filter(s=>s.payment.status==="requested").length} payment${project.stages.filter(s=>s.payment.status==="requested").length===1?"":"s"} requested`:"Stages and payments",""],
      ["documents","Documents",`${project.documents.length} documents · ${project.architect_images.length} drawings`,""]
    ];
  }else{
    lede=`${cs?`We're in the <b>${esc(cs.title.toLowerCase())}</b> stage${cs.due?`, due ${fmtLong(cs.due)}`:""}.`:""} ${m?`Next we meet ${fmtWeek(m.when)} at ${fmtTime(m.when)}.`:""} ${open?`${open} directive${open>1?"s":""} still open.`:""}`;
    cards=[
      ["conversation","Conversation",`New thoughts, photos and questions, whenever they come${replied?` · ${replied} with replies from ${esc(DESIGNER_NAME)}`:""}`,replied||""],
      ["directives","Directives",`How you live and what you need from each room — change or add to it any time`,open||""],
      ["meeting","Next meeting",m?`${fmtWeek(m.when)} · ${fmtTime(m.when)}${req?" · change requested":""}`:"Nothing scheduled yet",""],
      ["timeline","Timeline",cs?`${cs.title} now · ${project.stages.filter(s=>s.status==="done").length} of ${project.stages.length} stages done`:"Stages, deliverables and payments",""],
      ["documents","Documents",`Fees and process, the Pinterest board, the architect's drawings`,""]
    ];
  }
  return`<div class="page-head"><p class="label">${esc(project.name)}</p><h1>Hello, ${esc(firstName)}.</h1><p class="lede">${lede}</p></div>
  <div class="home-grid">
    <div class="cards">${cards.map(([k,t,s,n])=>`<a class="card" href="#${k}"><h3>${t}</h3><p class="sub">${s}</p><span class="side">${n?`<span class="tag accent">${n}</span>`:""}<span class="arrow">→</span></span></a>`).join("")}</div>
    <div class="statline">${d?`<div class="switchrow"><span class="label">Email the clients about replies and meeting changes</span><button class="chip ${project.notify_clients?"on":""}" id="notifyToggle">${project.notify_clients?"On":"Off"}</button>${project.notify_clients?"":`<span class="small muted">Off until you turn it on. Brook and Evan get nothing by email.</span>`}</div>`:""}<p class="label">Recently</p><div class="activity">${activity().map(a=>`<a class="act" href="#${a.go}"><span class="t">${esc(a.t)}</span><span class="w">${fmtStamp(a.w)}</span></a>`).join("")||`<p class="muted small">Nothing yet.</p>`}</div></div>
  </div>`;
}

function viewDocuments(){
  const d=isDesigner();
  return`<div class="page-head"><p class="label">Documents</p><h1>Your documents</h1><p class="lede">The process, mood boards, fees, architect's drawings.</p></div>
  <section class="section"><div class="band"><h2>Documents</h2><span class="desc"></span><span class="n">${project.documents.length}</span></div>
    <div class="cards">${project.documents.map(doc=>`<${doc.url?`a href="${esc(doc.url)}" target="_blank" rel="noopener"`:"div"} class="card"><h3>${esc(doc.title)}</h3><p class="sub">${esc(doc.note)}${d?` · <button class="textlink" data-rmdoc="${doc.id}">remove</button>`:""}</p><span class="side"><span class="tag quiet">${esc(doc.kind||"Link")}</span>${doc.url?`<span class="arrow">→</span>`:`<span class="small muted">Coming</span>`}</span></${doc.url?"a":"div"}>`).join("")||`<p class="muted" style="padding:22px 0">Nothing here yet.</p>`}</div>
    ${d?`<form id="docForm" class="editbox" style="max-width:560px"><p class="label">Add a document</p><div class="row two"><div class="field"><label>Title</label><input class="input" id="docTitle" required placeholder="Signed agreement"></div><div class="field"><label>Type</label><input class="input" id="docKind" placeholder="PDF, Google Doc, Link"></div></div><div class="field"><label>Link (or upload a file)</label><input class="input" id="docUrl" placeholder="https://…"></div><div class="field"><label>One line about it</label><input class="input" id="docNote"></div><div class="actions"><span class="btn ghost tiny filebtn">Choose file<input type="file" id="docFile"></span><span class="small muted" id="docName"></span><button class="btn tiny" type="submit">Add</button></div></form>`:""}
  </section>
  <section class="section"><div class="band"><h2>Mood board</h2><p class="desc">${esc(project.pinterest_note)}</p></div>
    <div class="pin">${project.pinterest_url?`<a class="link url" href="${esc(project.pinterest_url)}" target="_blank" rel="noopener">${esc(project.pinterest_url.replace(/^https?:\/\//,""))}</a>`:`<p class="muted">No board linked yet.</p>`}
      ${d?`<details><summary class="textlink">Edit board</summary><form id="pinForm" class="row" style="margin-top:14px;max-width:560px"><div class="field"><label>Board URL</label><input class="input" id="pinUrl" value="${esc(project.pinterest_url)}"></div><div class="field"><label>Note</label><textarea class="input" id="pinNote">${esc(project.pinterest_note)}</textarea></div><div class="actions"><button class="btn tiny" type="submit">Save</button></div></form></details>`:""}</div></section>
  <section class="section"><div class="band"><h2>From the architect</h2><span class="desc"></span><span class="n">${project.architect_images.length}</span></div>
    <div class="masonry">${project.architect_images.map(i=>`<figure><a href="${esc(i.url)}" target="_blank" rel="noopener"><img src="${esc(i.url)}" alt="${esc(i.caption)}" loading="lazy"></a><figcaption>${esc(i.caption)}${d?` · <button class="textlink" data-rmimg="${i.id}">remove</button>`:""}</figcaption></figure>`).join("")}</div>
    ${d?`<form id="imgForm" class="editbox" style="max-width:560px"><p class="label">Add a drawing or image</p><div class="field"><label>Caption</label><input class="input" id="imgCap" placeholder="Upper floor — revised Nov set"></div><div class="actions"><span class="btn ghost tiny filebtn">Choose file<input type="file" id="imgFile" accept="image/*,.pdf"></span><button class="btn tiny" type="submit">Add</button><span class="small muted" id="imgName"></span></div></form>`:""}
  </section>`;
}

function viewDirectives(){
  const d=isDesigner(),did=(project.designer||{}).id;
  const convCount=room=>project.notes.filter(n=>n.room===room).length;
  const changedIn=s=>s.questions.filter(q=>q.updated_by&&q.updated_by!==did&&!q.seen_by_designer).length;
  return`<div class="page-head"><p class="label">Directives</p><h1>How you live, and what you need from this house.</h1>${d?"":`<p class="lede">Answer them in your own words, change an answer when you understand it better, and add directives of your own.</p>`}</div>
  <div class="chips" id="jump">${project.intake.map(s=>`<button class="chip" data-jump="sec-${s.id}">${esc(s.room||s.title)}${changedIn(s)?` <span style="color:var(--accent)">${changedIn(s)}</span>`:""}</button>`).join("")}</div>
  ${project.intake.map(s=>`<section class="section qa-section" id="sec-${s.id}"><div class="band"><h2>${esc(s.title)}</h2><span class="desc"></span><span class="n">${s.questions.filter(q=>q.a).length}/${s.questions.length}</span></div>
    <div>${s.questions.map(q=>{
      const changed=q.updated_by&&q.updated_by!==did&&!q.seen_by_designer;
      const editing=ui.editing[q.id];
      return`<div class="qa" id="qa-${q.id}">${q.q?`<p class="q">${esc(q.q)}</p>`:`<p class="label" style="color:var(--accent)">Added by ${esc(nameOf(q.added_by||q.updated_by))}</p>`}
        ${editing?`<form class="edit" data-qsave="${q.id}"><textarea class="input" id="ans-${q.id}">${esc(q.a)}</textarea><div class="actions"><button class="btn tiny" type="submit">Save</button><button class="textlink" type="button" data-qcancel="${q.id}">Cancel</button></div></form>`
        :`<p class="a ${q.a?"":"empty"}">${q.a?linkify(q.a):"Open — answer when you're ready."}</p>
          <div class="meta">${q.updated_at?`<span>${q.updated_by===did?"Recorded":"Updated"} by ${esc(nameOf(q.updated_by))} · ${fmtStamp(q.updated_at)}</span>`:""}${changed?`<span class="tag accent">${q.added_by&&q.added_by!==did?"New":"Changed"}</span>`:""}<button class="textlink" data-qedit="${q.id}">${q.a?"Edit":"Answer"}</button>${d&&changed?`<button class="textlink" data-qseen="${q.id}">Mark seen</button>`:""}</div>`}
      </div>`;}).join("")}
      ${s.room&&convCount(s.room)?`<div class="qa inconv"><p class="label">From the conversation</p>${project.notes.filter(n=>n.room===s.room).map(n=>`<div class="mini"><div class="rtop"><b>${esc(nameOf(n.author_id))}</b><span>${fmtDate(n.created_at)}</span>${n.integrated_at?`<span class="tag quiet">Integrated</span>`:""}</div><p class="rbody">${linkify(n.body)}</p>${n.replies.map(r=>`<p class="rbody" style="padding-left:16px;border-left:1px solid var(--line)"><b style="font-weight:500">${esc(nameOf(r.author_id))}</b> · ${linkify(r.body)}</p>`).join("")}</div>`).join("")}<div class="actions"><button class="textlink" data-conv="${esc(s.room)}">Open in the conversation →</button></div></div>`:""}
      ${ui.editing["add-"+s.id]?`<form class="qa edit" data-dadd="${s.id}"><p class="label">New directive · ${esc(s.room||s.title)}</p><textarea class="input" id="dir-${s.id}" placeholder="${d?"Something to design to…":"Something you want the design to honor…"}"></textarea><div class="actions"><button class="btn tiny" type="submit">Add</button><button class="textlink" type="button" data-qcancel="add-${s.id}">Cancel</button></div></form>`:`<div class="qa"><div class="actions"><button class="btn ghost tiny" data-dnew="${s.id}">Add a directive</button></div></div>`}
    </div></section>`).join("")}`;
}

function viewConversation(){
  const d=isDesigner(),did=(project.designer||{}).id;
  const rooms=["all","unsorted",...project.rooms];
  const count=r=>r==="all"?project.notes.length:r==="unsorted"?project.notes.filter(n=>!n.room).length:project.notes.filter(n=>n.room===r).length;
  const list=ui.sort==="recent"?project.notes.filter(n=>!n.integrated_at):project.notes.filter(n=>ui.room==="all"||(ui.room==="unsorted"?!n.room:n.room===ui.room));
  const sel=(cur,id)=>`<select class="input" style="padding:7px 10px;width:auto;font-size:12px;letter-spacing:.08em;text-transform:uppercase" data-room="${id}" aria-label="Room"><option value="">Unsorted</option>${project.rooms.map(r=>`<option ${r===cur?"selected":""}>${esc(r)}</option>`).join("")}</select>`;
  const secFor=room=>project.intake.find(s=>s.room===room);
  const unsorted=count("unsorted");
  return`<div class="page-head"><p class="label">Conversation</p><h1>Ongoing conversation</h1>${d?(unsorted?`<p class="lede">${unsorted} unsorted — file ${unsorted>1?"them":"it"} by room when you can.</p>`:""):`<p class="lede">An idea, a photo, a question, a change of heart — I want to hear it, at any point. Post it here and it will be filed by room on its own. When it's a question, you'll see my answer underneath and get an email with it.</p>`}</div>
  <form class="compose" id="compose"><p class="label">Add to the conversation</p>
    <textarea class="input" id="noteBody" placeholder="${d?"Something to show them, or an idea to float…":"We kept thinking about the table…"}"></textarea>
    <div class="files"><span class="btn ghost tiny filebtn">Add image<input type="file" id="noteFiles" accept="image/*" multiple></span>${ui.composeImgs.map(u=>`<img src="${u}" alt="">`).join("")}</div>
    <div class="actions"><button class="btn" type="submit">Post</button></div></form>
  <section class="section"><div class="band"><div class="chips"><button class="chip ${ui.sort==="recent"?"on":""}" data-sort="recent">Open · recent</button><button class="chip ${ui.sort!=="recent"?"on":""}" data-sort="room">By room</button></div><div class="rooms" ${ui.sort==="recent"?"hidden":""}>${rooms.map(r=>`<button class="chip ${ui.room===r?"on":""}" data-pick="${esc(r)}">${r==="all"?"All":r==="unsorted"?"Unsorted":esc(r)} <span class="muted">${count(r)}</span></button>`).join("")}</div><span class="n">${list.length}</span></div>
  ${ui.sort!=="recent"&&ui.room!=="all"&&ui.room!=="unsorted"&&secFor(ui.room)?`<p class="small"><button class="textlink" data-dir="sec-${secFor(ui.room).id}">See the directives for ${esc(ui.room.toLowerCase())} →</button></p>`:""}
  <div class="note-list">${list.map(n=>{
    const mine=n.author_id===me.id,unread=!n.read_at&&n.author_id!==did,editing=ui.editing[n.id];
    const state=[];
    if(n.author_id!==did){state.push(n.read_at?`<span class="tag quiet">Read by ${esc(DESIGNER_NAME)} · ${fmtDate(n.read_at)}</span>`:`<span class="tag accent">${d?"Unread":"Not read yet"}</span>`);if(n.integrated_at)state.push(`<span class="tag">Integrated · ${fmtDate(n.integrated_at)}</span>`);}
    return`<article class="note ${unread?"unread":""}" id="note-${n.id}"><div class="top">${unread&&d?`<span class="dot"></span>`:""}<span class="by">${esc(nameOf(n.author_id))}</span><span class="when">${fmtStamp(n.created_at)}${n.edited_at?` · edited ${fmtStamp(n.edited_at)}`:""}</span>${sel(n.room,n.id)}</div>
      ${editing?`<form data-nsave="${n.id}" class="ask"><textarea class="input" id="nb-${n.id}">${esc(n.body)}</textarea><div class="actions"><button class="btn tiny" type="submit">Save</button><button class="textlink" type="button" data-ncancel="${n.id}">Cancel</button></div></form>`:`<p class="body">${linkify(n.body)}</p>`}
      ${n.images.length?`<div class="imgs">${n.images.map(u=>`<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt=""></a>`).join("")}</div>`:""}
      <div class="state">${state.join("")}</div>
      ${n.replies.length?`<div class="replies">${n.replies.map(r=>`<div class="reply"><div class="rtop"><b>${esc(nameOf(r.author_id))}</b><span>${fmtStamp(r.created_at)}</span></div><p class="rbody">${linkify(r.body)}</p></div>`).join("")}</div>`:""}
      ${ui.replyOpen[n.id]?`<form class="ask" data-rsave="${n.id}"><textarea class="input" id="rb-${n.id}" placeholder="${d?"Yes — and here's what I'm thinking…":"Reply…"}"></textarea><div class="actions"><button class="btn tiny" type="submit">Reply</button><button class="textlink" type="button" data-rcancel="${n.id}">Cancel</button></div></form>`:""}
      <div class="actions">
        ${d&&n.author_id!==did?`<button class="btn ghost tiny" data-read="${n.id}" data-on="${n.read_at?"0":"1"}">${n.read_at?"Mark unread":"Mark read"}</button><button class="btn ghost tiny" data-integ="${n.id}" data-on="${n.integrated_at?"0":"1"}">${n.integrated_at?"Not integrated":"Mark integrated"}</button>`:""}
        ${!ui.replyOpen[n.id]?`<button class="textlink" data-reply="${n.id}">Reply</button>`:""}
        ${mine&&!editing?`<button class="textlink" data-nedit="${n.id}">Edit</button>`:""}
      </div></article>`;}).join("")||`<p class="muted" style="padding:28px 0">No notes here yet.</p>`}</div></section>`;
}

function viewTimeline(){
  const d=isDesigner();
  const payLabel={free:"Free",upcoming:"Not yet due",requested:"Requested",paid:"Paid"};
  const cs=currentStage();
  const phases=project.process||[];
  const activePhases=cs?(cs.focus||"").split("·").map(x=>x.trim().toLowerCase()):[];
  return`<div class="page-head"><p class="label">Timeline</p><h1>Where we are.</h1></div>
  <section class="section"><div class="band"><h2>How we work</h2><span class="desc"></span><span class="n">${phases.length}</span></div>
    <div class="phases">${phases.map((p,i)=>{const on=activePhases.includes(p.title.toLowerCase());return`<div class="phase ${on?"on":""}"><span class="label">${on?"Now":"&nbsp;"}</span><h3>${esc(p.title)}</h3><p class="small">${esc(p.body)}</p></div>`;}).join("")}</div></section>
  <section class="section"><div class="band"><h2>Meetings</h2><span class="desc"></span><span class="n">${project.stages.filter(s=>s.status==="done").length}/${project.stages.length}</span></div>
  <div class="stages">${project.stages.map(s=>{
    const p=s.payment||{};
    if(ui.stageEdit===s.id)return stageForm(s);
    return`<div class="stage ${s.status}"><span class="mark"></span><div style="display:grid;gap:14px;min-width:0">
      <div class="head"><h3>${esc(s.title)}</h3>${s.status==="current"?`<span class="tag accent">Now</span>`:s.status==="done"?`<span class="tag quiet">Done</span>`:""}${s.due?`<span class="small muted">${s.status==="done"?"":"Expected "}${fmtLong(s.due)}</span>`:""}</div>
      ${s.focus?`<p class="label" style="color:var(--accent)">${esc(s.focus)}</p>`:""}
      <div class="grid"><div class="kv"><span class="label">What happens</span><span class="v">${esc(s.desc)}</span>${s.deliverable?`<span class="label" style="margin-top:8px">You receive</span><span class="v">${esc(s.deliverable)}</span>`:""}</div>
        <div class="kv"><span class="label">Fee</span><span class="fee">${s.standard!=null?`<s>${money(s.standard)}</s>`:""}${s.fee?money(s.fee)+(s.hourly?"/hr":""):"Free"}</span></div>
        <div class="kv"><span class="label">Payment</span><span class="pay ${p.status}"><span class="sq"></span>${payLabel[p.status]||p.status}${p.amount?` · ${money(p.amount)}`:""}${p.date?` · ${fmtDate(p.date)}`:""}</span></div></div>
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

function viewMeeting(){
  const d=isDesigner(),m=project.meeting;
  const cr=m&&m.change_request;
  return`<div class="page-head"><p class="label">Meeting</p><h1>Next time we meet.</h1>${d?"":`<p class="lede">If this time doesn't work, the form below will email me. Or text me any time: <span class="phone" id="phone">${esc(cfg.DESIGNER_PHONE||"")}</span></p>`}</div>
  <div class="meeting"><div style="display:grid;gap:18px">
    ${m?`<p class="when-big">${fmtWeek(m.when)}<br>${fmtTime(m.when)}</p><p class="label">${esc(m.where)}</p><p style="max-width:52ch;color:var(--ink-2)">${linkify(m.notes)}</p>`:`<p class="when-big">Nothing scheduled.</p>`}
    ${cr?`<div class="req"><span class="label">${cr.kind==="cancel"?"Cancel requested":"Change requested"} · ${esc(nameOf(cr.by))} · ${fmtStamp(cr.at)}</span><p>${linkify(cr.message)}</p>${d?`<div class="actions"><button class="textlink" id="clearReq">Clear request</button></div>`:""}</div>`:""}
    ${d?`<div class="actions"><button class="btn ghost" id="meetEdit">${m?"Edit meeting":"Schedule a meeting"}</button></div>`:""}
    ${d&&ui.meetingEdit?`<form class="editbox" id="meetForm"><div class="field"><label>When</label><input class="input" name="when" type="datetime-local" value="${toLocalInput(m&&m.when)}" required></div><div class="field"><label>Where</label><input class="input" name="where" value="${esc(m?m.where:"")}"></div><div class="field"><label>Notes for them</label><textarea class="input" name="notes">${esc(m?m.notes:"")}</textarea></div><div class="actions"><button class="btn tiny" type="submit">Save</button><button class="textlink" type="button" id="meetCancel">Cancel</button></div></form>`:""}
  </div>
  ${!d&&m?`<form class="editbox" id="reqForm"><p class="label">Need a different time? This emails me.</p><div class="field"><label>Request</label><select class="input" name="kind"><option value="move">Move it</option><option value="cancel">Cancel it</option></select></div><div class="field"><label>Tell me what works</label><textarea class="input" name="message" placeholder="Could we do the following Tuesday instead, any time after 10?" required></textarea></div><div class="actions"><button class="btn" type="submit">Send request</button></div></form>`:""}
  </div>`;
}

/* ---------- events ---------- */
function bind(app){
  app.querySelectorAll("[data-pick]").forEach(b=>b.onclick=()=>{ui.room=b.dataset.pick;render();});
  const nt=$("#notifyToggle",app);if(nt)nt.onclick=async()=>{project.notify_clients=!project.notify_clients;await store.setNotifyClients(project.notify_clients);render();toast(project.notify_clients?"Clients will be emailed":"Client emails off");};
  app.querySelectorAll("[data-sort]").forEach(b=>b.onclick=()=>{ui.sort=b.dataset.sort;render();});
  app.querySelectorAll("[data-qedit]").forEach(b=>b.onclick=()=>{ui.editing[b.dataset.qedit]=true;render();$("#ans-"+b.dataset.qedit).focus();});
  app.querySelectorAll("[data-qcancel]").forEach(b=>b.onclick=()=>{delete ui.editing[b.dataset.qcancel];render();});
  app.querySelectorAll("[data-qseen]").forEach(b=>b.onclick=async()=>{await store.markAnswerSeen(b.dataset.qseen);project.intake.forEach(s=>s.questions.forEach(q=>{if(q.id===b.dataset.qseen)q.seen_by_designer=true;}));render();});
  app.querySelectorAll("[data-qsave]").forEach(f=>f.onsubmit=async e=>{e.preventDefault();const id=f.dataset.qsave,t=$("#ans-"+id).value.trim();await store.saveAnswer(id,t);project.intake.forEach(s=>s.questions.forEach(q=>{if(q.id===id){q.a=t;q.updated_at=new Date().toISOString();q.updated_by=me.id;q.seen_by_designer=isDesigner();}}));delete ui.editing[id];render();toast(isDesigner()?"Saved":`Saved — ${DESIGNER_NAME} will see this`);});
  const nf=$("#noteFiles",app);if(nf)nf.onchange=async()=>{for(const f of nf.files){try{ui.composeImgs.push(await store.uploadImage(f));}catch(err){toast("Upload failed: "+err.message);}}render();};
  const comp=$("#compose",app);if(comp)comp.onsubmit=async e=>{e.preventDefault();const body=$("#noteBody",app).value.trim();if(!body&&!ui.composeImgs.length)return;const room=autoRoom(body,project.rooms);try{const n=await store.addNote({room,body,images:ui.composeImgs});if(LIVE)project.notes.unshift(n);ui.composeImgs=[];ui.room="all";render();toast(room?"Posted · filed under "+room:"Posted · unsorted for now");}catch(err){toast("Couldn't save: "+err.message);}};
  app.querySelectorAll("select[data-room]").forEach(s=>{s.onchange=async()=>{await store.setNoteRoom(s.dataset.room,s.value);const n=project.notes.find(x=>x.id===s.dataset.room);if(n)n.room=s.value;render();toast(s.value?"Moved to "+s.value:"Unsorted");};});
  app.querySelectorAll("[data-jump]").forEach(b=>b.onclick=()=>{const el=document.getElementById(b.dataset.jump);if(el)el.scrollIntoView({block:"start",behavior:"smooth"});});
  app.querySelectorAll("[data-conv]").forEach(b=>b.onclick=()=>{ui.room=b.dataset.conv;ui.sort="room";location.hash="conversation";});
  app.querySelectorAll("[data-dir]").forEach(b=>b.onclick=()=>{ui.jump=b.dataset.dir;location.hash="directives";});
  app.querySelectorAll("[data-dnew]").forEach(b=>b.onclick=()=>{ui.editing["add-"+b.dataset.dnew]=true;render();$("#dir-"+b.dataset.dnew).focus();});
  app.querySelectorAll("[data-dadd]").forEach(f=>f.onsubmit=async e=>{e.preventDefault();const sid=f.dataset.dadd,t=$("#dir-"+sid).value.trim();if(!t)return;try{const q=await store.addDirective(sid,t);if(LIVE)project.intake.find(s=>s.id===sid).questions.push(q);delete ui.editing["add-"+sid];ui.jump="sec-"+sid;render();toast(isDesigner()?"Directive added":`Added — ${DESIGNER_NAME} will see it`);}catch(err){toast("Couldn't save: "+err.message);}});
  const df=$("#docFile",app);if(df)df.onchange=()=>{$("#docName",app).textContent=df.files[0]?df.files[0].name:"";};
  const docForm=$("#docForm",app);if(docForm)docForm.onsubmit=async e=>{e.preventDefault();let url=$("#docUrl",app).value.trim();const f=df&&df.files[0];try{if(f)url=await store.uploadImage(f);const doc={title:$("#docTitle",app).value.trim(),kind:$("#docKind",app).value.trim()||(f?f.name.split(".").pop().toUpperCase():"Link"),url,note:$("#docNote",app).value.trim()};await store.addDocument(doc);if(LIVE)project=await store.loadProject(project.id);render();toast("Added");}catch(err){toast("Couldn't add: "+err.message);}};
  app.querySelectorAll("[data-rmdoc]").forEach(b=>b.onclick=async e=>{e.preventDefault();e.stopPropagation();await store.removeDocument(b.dataset.rmdoc);project.documents=project.documents.filter(x=>x.id!==b.dataset.rmdoc);render();});
  app.querySelectorAll("[data-read]").forEach(b=>b.onclick=async()=>{const on=b.dataset.on==="1";await store.markRead(b.dataset.read,on);const n=project.notes.find(x=>x.id===b.dataset.read);n.read_at=on?new Date().toISOString():null;render();});
  app.querySelectorAll("[data-integ]").forEach(b=>b.onclick=async()=>{const on=b.dataset.on==="1";await store.markIntegrated(b.dataset.integ,on);const n=project.notes.find(x=>x.id===b.dataset.integ);n.integrated_at=on?new Date().toISOString():null;if(on&&!n.read_at){await store.markRead(n.id,true);n.read_at=n.integrated_at;}render();});
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
  const rq=$("#reqForm",app);if(rq)rq.onsubmit=async e=>{e.preventDefault();const m={...project.meeting,change_request:{kind:rq.elements.kind.value,message:rq.elements.message.value.trim(),by:me.id,at:new Date().toISOString()}};await store.saveMeeting(m);project.meeting=m;render();toast(`Sent — ${DESIGNER_NAME} will confirm by email`);};
  const pf=$("#pinForm",app);if(pf)pf.onsubmit=async e=>{e.preventDefault();const u=$("#pinUrl",app).value.trim(),n=$("#pinNote",app).value.trim();await store.savePinterest(u,n);project.pinterest_url=u;project.pinterest_note=n;render();toast("Board updated");};
  const imf=$("#imgFile",app);if(imf)imf.onchange=()=>{$("#imgName",app).textContent=imf.files[0]?imf.files[0].name:"";};
  const imgForm=$("#imgForm",app);if(imgForm)imgForm.onsubmit=async e=>{e.preventDefault();const f=imf.files[0];if(!f){toast("Choose a file first");return;}try{const url=await store.uploadImage(f);const img={url,caption:$("#imgCap",app).value.trim()||f.name};await store.addImage(img);if(LIVE)project=await store.loadProject(project.id);render();toast("Added");}catch(err){toast("Upload failed: "+err.message);}};
  app.querySelectorAll("[data-rmimg]").forEach(b=>b.onclick=async()=>{await store.removeImage(b.dataset.rmimg);project.architect_images=project.architect_images.filter(i=>i.id!==b.dataset.rmimg);render();});
}

/* ---------- boot ---------- */
function syncRoute(){const h=(location.hash||"").slice(1);route=ROUTES.includes(h)?h:(me&&isDesigner()?"projects":"home");window.scrollTo({top:0});}
window.addEventListener("hashchange",()=>{summaries=null;syncRoute();ui.editing={};ui.replyOpen={};ui.stageEdit=null;ui.meetingEdit=false;render();});
(async function start(){
  store=LIVE?new SupabaseStore():new MockStore();
  syncRoute();
  try{const r=await store.init();if(r){me=r.me;project=r.project;if(me)notifs=await store.loadNotifs();}}catch(err){console.error(err);}
  render();
  if(LIVE)setInterval(async()=>{if(me&&project){try{notifs=await store.loadNotifs();renderNav();}catch(e){}}},60000);
  if(LIVE){store.sb.auth.onAuthStateChange(async(ev)=>{if(ev==="SIGNED_IN"&&!me){const r=await store.init();if(r){me=r.me;project=r.project;if(me)notifs=await store.loadNotifs();render();}}});}
})();
})();
