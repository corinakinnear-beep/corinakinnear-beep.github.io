// Studio — sample projects for preview mode. Everyone and everything here is invented.
// The sample is built from the starter template (template.js) so the two never drift apart.
(function(){
  function ph(w,h,text){
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#DED7C9"/><rect x="${w*.08}" y="${h*.08}" width="${w*.84}" height="${h*.84}" fill="none" stroke="#C9C1B2" stroke-width="1"/><text x="50%" y="52%" text-anchor="middle" font-family="Georgia,serif" font-size="${Math.round(w/16)}" fill="#8A8477">${text}</text></svg>`;
    return "data:image/svg+xml;utf8,"+encodeURIComponent(svg);
  }
  // Dates are relative to today so the sample never looks stale.
  const d=(days,h)=>{const t=new Date();t.setHours(h||10,0,0,0);t.setDate(t.getDate()+days);return t.toISOString();};
  const T=window.STUDIO_TEMPLATE;

  const DANA={id:"u-designer",name:"Dana",email:"designer@example.com",phone:"(555) 010-0142",reply_to:"",payment_info:"Zelle: designer@example.com\nOr a check made out to Dana Studio, mailed to the address on your agreement.",role:"designer"};
  const SAM={id:"u-client1",name:"Sam",email:"client.one@example.com",role:"client"};
  const PRIYA={id:"u-client2",name:"Priya",email:"client.two@example.com",role:"client"};

  // From the first meeting, keyed "section.question" against the starter template:
  // [what was said, the directive it became, days ago, who recorded it, hour].
  const A={
    "0.0":["Groceries and two school bags, most days. Right now it all lands on the kitchen counter.","Groceries and school bags come in through the entry and have a place there, so the kitchen counter stays clear.",-12,"u-designer"],
    "0.1":["Shoes for four, and the dog's lead. Coats can live further in.","Shoes for four and the dog's lead live at the door. Coats can live further in.",-12,"u-designer"],
    "1.0":["Both of us, most nights. Weeknights are fast: one pan, everyone eating by 6:30.","Two people cook on most nights, quickly: one pan, everyone eating by 6:30.",-12,"u-designer"],
    "1.1":["At the counter now. We'd like a real table that seats eight when family visits.","A real table that seats eight when family visits, instead of eating at the counter.",-3,"u-client2",19],
    "2.0":["Evenings in, and board games on the weekend. The screen shouldn't be the first thing you see.","The living room is for evenings in and weekend board games. The screen is not the first thing you see.",-12,"u-designer"],
    "3.0":["Two full closets. Mostly hanging on one side, mostly folded on the other.","Two full closets, hanging on one side and folded on the other.",-12,"u-designer"],
    "4.1":["Shower every day. The bath is for the kids and can be small.","A daily shower for the adults. The bath is for the kids and can be small.",-12,"u-designer"],
    "5.0":["Priya works at home four days a week, with calls most mornings. Sam now and then.","Priya works at home four days a week with calls most mornings; Sam now and then. The work space needs a door.",-12,"u-designer"],
    "7.0":["Calm. Somewhere you put your bag down and breathe out.","The home feels calm: somewhere you put your bag down and breathe out.",-12,"u-designer"]
  };
  const intake=T.intake.map((s,i)=>({id:"s"+(i+1),title:s.title,room:s.room,questions:s.questions.map((q,j)=>{
    const a=A[i+"."+j];
    return{id:"q"+(i+1)+"-"+(j+1),q,a:a?a[0]:"",directive:a?a[1]:"",directive_reviewed:!!a,comments:[],updated_at:a?d(a[2],a[4]):null,updated_by:a?a[3]:null};
  })}));
  // A directive a client added on their own, with a comment each way.
  intake[1].questions.push({id:"q-added",q:"",a:"",directive:"The kitchen looks tidy even when it isn't: closed storage rather than open shelves, and somewhere the toaster and kettle can live out of sight.",directive_reviewed:true,updated_at:d(-2,21),updated_by:"u-client2",added_by:"u-client2",
    comments:[{id:"c1",author_id:"u-designer",body:"Closed storage is easy. Do you want the toaster and kettle behind a lift-up door on the counter, or inside a tall cabinet?",created_at:d(-1,9)}]});
  // A directive that came out of a conversation.
  intake[7].questions.push({id:"q-from-note",q:"",a:"",directive:"Bikes, garden tools and the hose live in a store along the side fence, out of sight from the patio, with a door wide enough to roll the bikes straight in.",directive_reviewed:true,source_note_id:"n4",comments:[],updated_at:d(-5,10),updated_by:"u-designer"});

  const fees=[[250,0],[null,900],[null,900],[null,110]];
  const stageState=[
    {due:d(-12),status:"done",payment:{status:"free",amount:0,date:null}},
    {due:d(16),status:"current",payment:{status:"paid",amount:900,date:d(-10)}},
    {due:d(44),status:"upcoming",payment:{status:"upcoming",amount:900,date:null}},
    {due:null,status:"upcoming",payment:{status:"upcoming",amount:null,date:null}}
  ];
  const stages=T.stages.map((s,i)=>Object.assign({id:"st"+(i+1),order:i+1},s,{standard:fees[i]?fees[i][0]:s.standard,fee:fees[i]?fees[i][1]:s.fee},stageState[i]||{due:null,status:"upcoming",payment:{status:"upcoming",amount:null,date:null}}));

  // The next meeting: Dana offered two times, Priya asked about the morning, Sam has not picked yet.
  const t1=d(16,10),t2=d(17,14);
  const M1={id:"m1",when:t1,where:"At the house",notes:"Concept presentation. I'll bring printed plans.",change_request:null,status:"proposed",proposed_by:"u-designer",options:[t1,t2],thread:[
    {id:"mt1",by:"u-designer",at:d(-6,9),kind:"set",when:d(16,9),where:"At the house",message:"Concept presentation. I'll bring printed plans. Please have the latest drawing set open on a screen if you can."},
    {id:"mt2",by:"u-client2",at:d(-2,18),kind:"note",message:"Sam has a call until 10 that morning. Could we start a little later, or another day?"},
    {id:"mt3",by:"u-designer",at:d(-1,8),kind:"propose",when:t1,where:"At the house",options:[t1,t2],message:"Of course. Here are two options that work for me."}]};
  const M0={id:"m0",when:d(-12,10),where:"At the house",notes:"First meeting.",change_request:null,status:"confirmed",proposed_by:"u-designer",options:[],thread:[
    {id:"mt0",by:"u-designer",at:d(-20,9),kind:"set",when:d(-12,10),where:"At the house",message:"First meeting: questions, measuring, your wishes and budget."}]};
  const meetingNotes=[
    {id:"mn1",meeting_id:"m0",room:"Kitchen",question:"",body:"cooks in pairs; counter seating for four is fine",created_at:d(-12,10),author_id:"u-designer",directive_id:null,skipped:false},
    {id:"mn2",meeting_id:"m0",room:"Kitchen",question:"What is on your counters now that you wish wasn't?",body:"toaster, kettle, the mail",created_at:d(-12,10),author_id:"u-designer",directive_id:null,skipped:false},
    {id:"mn3",meeting_id:"m0",room:"Living",question:"",body:"keep the old sofa for now; TV not over the fireplace",created_at:d(-12,11),author_id:"u-designer",directive_id:null,skipped:false},
    {id:"mn4",meeting_id:"m0",room:"",question:"What is the budget, and what would you protect first?",body:"flexible on the kitchen, tight everywhere else",created_at:d(-12,11),author_id:"u-designer",directive_id:null,skipped:false}];
  const noteSessions=[{id:"ns1",kind:"call",title:"Call about the garden doors",at:d(-6,16),created_at:d(-6,16)}];
  meetingNotes.push({id:"mn5",session_id:"ns1",room:"Outdoor",question:"",body:"wants the garden doors to open fully; keep the step flush",created_at:d(-6,16),author_id:"u-designer",directive_id:null,skipped:false});

  window.SAMPLE_PROJECT={
    id:"p-sample-home",
    name:"Sam and Priya's home",
    designer:DANA,
    members:[DANA,SAM,PRIYA],
    invites:[],
    rooms:T.rooms.slice(),
    pinterest_url:"",pinterest_note:"",
    documents:[
      {id:"d1",title:"Services and fees",kind:"PDF",url:ph(900,640,"Services and fees"),note:"What I'll do, what it costs, and how payment works.",created_at:d(-12),added_by:"u-designer"},
      {id:"d4",title:"Mood board",kind:"Mood board",url:"https://example.com/mood-board",note:"The board we built together after the first meeting. Texture, natural materials and open flow run through it.",created_at:d(-10),added_by:"u-designer"},
      {id:"d2",title:"Agreement",kind:"PDF",url:"",note:"Coming before the concept presentation. The signed copy will live here.",created_at:d(-9),added_by:"u-designer"},
      {id:"d3",title:"Drawing set",kind:"PDF",url:ph(900,640,"Drawing set"),note:"Ground floor, upper floor, elevations and sections, current set.",created_at:d(-4),added_by:"u-designer"},
      {id:"d5",title:"Our measurements of the side yard",kind:"Photo",url:ph(900,640,"Side yard"),note:"We took these on Sunday.",created_at:d(-1),added_by:"u-client1"}
    ],
    architect_images:[],
    intake,
    notes:[
      {id:"n1",author_id:"u-client2",room:"Kitchen",body:"We cooked for six on Saturday and kept bumping into each other at the sink. Could the sink move to the island, so one of us can prep facing the room?",images:[ph(720,540,"Island sink reference")],created_at:d(-3,20),edited_at:d(-3,21),read_at:d(-2,9),integrated_at:null,status:"noted",status_at:d(-2,9),
        replies:[{id:"r1",author_id:"u-designer",body:"Yes, and it helps the view too. I'm drawing two versions for the concept presentation: the sink on the island, and the sink under the window with a prep counter on the island. Bring Saturday's menu and we'll walk through it on both.",created_at:d(-2,9)}]},
      {id:"n2",author_id:"u-client1",room:"Kitchen",body:"Will an induction range be a problem with our old pans? Trying to work out what else we'd have to replace.",images:[],created_at:d(-1,8),edited_at:null,read_at:null,integrated_at:null,replies:[]},
      {id:"n3",author_id:"u-client2",room:"",body:"I keep saving photos with one dark, matte wall. Could that happen somewhere here? Not sure where it belongs yet.",images:[],created_at:d(0,7),edited_at:null,read_at:null,integrated_at:null,replies:[]},
      {id:"n4",author_id:"u-client2",room:"Outdoor",body:"Bikes: four, two of them kids'. Plus the garden tools and the hose. We'd love all of it out of sight from the patio.",images:[ph(720,900,"Bike store photo")],created_at:d(-8,18),edited_at:null,read_at:d(-7,10),integrated_at:d(-5,10),status:"directive",status_at:d(-5,10),
        replies:[{id:"r2",author_id:"u-designer",body:"Noted. I'm putting a shallow store along the side fence, with a door wide enough to roll the bikes straight in. It's in the concept drawings.",created_at:d(-5,10)}]}
    ],
    process:T.process.map((p,i)=>({id:"ph"+(i+1),title:p.title,body:p.body})),
    stages,
    notifs:[
      {id:"nt1",to:"u-designer",subject:"Priya added to the conversation · Kitchen",body:"We cooked for six on Saturday and kept bumping into each other at the sink…",link:"#conversation",created_at:d(-3,20),seen_at:d(-2,9)},
      {id:"nt2",to:"u-designer",subject:"Sam added to the conversation · Kitchen",body:"Will an induction range be a problem with our old pans?",link:"#conversation",created_at:d(-1,8),seen_at:null},
      {id:"nt3",to:"u-designer",subject:"Priya added a directive · Kitchen",body:"The kitchen looks tidy even when it isn't…",link:"#directives",created_at:d(-2,21),seen_at:null},
      {id:"nt4",to:"u-designer",subject:"Priya added to the conversation",body:"I keep saving photos with one dark, matte wall…",link:"#conversation",created_at:d(0,7),seen_at:null},
      {id:"nt5",to:"u-client2",subject:"Dana replied · Kitchen",body:"Yes, and it helps the view too. I'm drawing two versions for the concept presentation…",link:"#conversation",created_at:d(-2,9),seen_at:null},
      {id:"nt6",to:"u-client1",subject:"Dana offered times for the next meeting",body:"Of course. Here are two options that work for me.",link:"#meeting",created_at:d(-1,8),seen_at:null},
      {id:"nt7",to:"u-client1",subject:"Dana replied · Kitchen",body:"Yes, and it helps the view too…",link:"#conversation",created_at:d(-2,9),seen_at:null}
    ],
    meeting:M1,
    meetings:[M1,M0],
    meetingNotes,
    noteSessions
  };

  // A second project so the dashboard has something to show.
  const P2=JSON.parse(JSON.stringify(window.SAMPLE_PROJECT));
  P2.id="p-sample-flat";P2.name="Jo's apartment";
  P2.members=[DANA,{id:"u-client3",name:"Jo",email:"client.three@example.com",role:"client"}];P2.designer=DANA;
  P2.notes=[{id:"p2n1",author_id:"u-client3",room:"Bedrooms",body:"Could the bed go under the window? I'd like to wake up with the light.",images:[],created_at:d(-1,21),edited_at:null,read_at:null,integrated_at:null,replies:[]}];
  P2.notifs=[];P2.documents=[];
  P2.intake.forEach(s=>s.questions=s.questions.filter(q=>q.q).map(q=>({...q,a:"",directive:"",directive_reviewed:false,comments:[],updated_at:null,updated_by:null})));
  P2.stages.forEach((s,i)=>{s.status=i===0?"done":i===1?"current":"upcoming";s.due=i===1?d(30):null;s.payment={status:i===0?"free":i===1?"requested":"upcoming",amount:s.fee||null,date:null};});
  P2.meeting={id:"m2",when:d(6,14),where:"Video call",notes:"Concept presentation.",change_request:null,status:"confirmed",proposed_by:"u-designer",options:[],thread:[]};
  P2.meetings=[P2.meeting];P2.meetingNotes=[];P2.noteSessions=[];
  window.SAMPLE_PROJECTS=[window.SAMPLE_PROJECT,P2];
})();
