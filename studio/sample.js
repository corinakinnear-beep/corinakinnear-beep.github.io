// Studio — sample projects for preview mode. Everyone and everything here is invented.
// The sample is built from the starter template (template.js) so the two never drift apart.
(function(){
  function ph(w,h,text){
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#DED7C9"/><rect x="${w*.08}" y="${h*.08}" width="${w*.84}" height="${h*.84}" fill="none" stroke="#C9C1B2" stroke-width="1"/><text x="50%" y="52%" text-anchor="middle" font-family="Georgia,serif" font-size="${Math.round(w/16)}" fill="#8A8477">${text}</text></svg>`;
    return "data:image/svg+xml;utf8,"+encodeURIComponent(svg);
  }
  // Dates are relative to today so the sample never looks stale.
  const d=(days,h)=>{const t=new Date();t.setHours(h||10,0,0,0);t.setDate(t.getDate()+days);return t.toISOString();};
  const DF=new Intl.DateTimeFormat("en-US",{weekday:"long",month:"long",day:"numeric"});
  const T=window.STUDIO_TEMPLATE;

  const DANA={id:"u-designer",name:"Dana",email:"designer@example.com",phone:"(555) 010-0142",reply_to:"",role:"designer"};
  const SAM={id:"u-client1",name:"Sam",email:"client.one@example.com",role:"client"};
  const PRIYA={id:"u-client2",name:"Priya",email:"client.two@example.com",role:"client"};

  // Answers, keyed "section.question" against the starter template.
  const A={
    "0.0":["Groceries and two school bags, most days. Right now it all lands on the kitchen counter.",-12,"u-designer"],
    "0.1":["Shoes for four, and the dog's lead. Coats can live further in.",-12,"u-designer"],
    "1.0":["Both of us, most nights. Weeknights are fast: one pan, everyone eating by 6:30.",-12,"u-designer"],
    "1.1":["At the counter now. We'd like a real table that seats eight when family visits.",-3,"u-client2",19],
    "2.0":["Evenings in, and board games on the weekend. The screen shouldn't be the first thing you see.",-12,"u-designer"],
    "3.0":["Two full closets. Mostly hanging on one side, mostly folded on the other.",-12,"u-designer"],
    "4.1":["Shower every day. The bath is for the kids and can be small.",-12,"u-designer"],
    "5.0":["Priya works at home four days a week, with calls most mornings. Sam now and then.",-12,"u-designer"],
    "7.0":["Calm. Somewhere you put your bag down and breathe out.",-12,"u-designer"]
  };
  const intake=T.intake.map((s,i)=>({id:"s"+(i+1),title:s.title,room:s.room,questions:s.questions.map((q,j)=>{
    const a=A[i+"."+j];
    return{id:"q"+(i+1)+"-"+(j+1),q,a:a?a[0]:"",updated_at:a?d(a[1],a[3]):null,updated_by:a?a[2]:null};
  })}));
  // One directive a client added on their own.
  intake[1].questions.push({id:"q-added",q:"",a:"We'd like the kitchen to look tidy even when it isn't: closed storage rather than open shelves, and somewhere the toaster and kettle can live out of sight.",updated_at:d(-2,21),updated_by:"u-client2",added_by:"u-client2"});

  const fees=[[250,0],[null,900],[null,900],[null,110]];
  const stageState=[
    {due:d(-12),status:"done",payment:{status:"free",amount:0,date:null}},
    {due:d(16),status:"current",payment:{status:"paid",amount:900,date:d(-10)}},
    {due:d(44),status:"upcoming",payment:{status:"upcoming",amount:900,date:null}},
    {due:null,status:"upcoming",payment:{status:"upcoming",amount:null,date:null}}
  ];
  const stages=T.stages.map((s,i)=>Object.assign({id:"st"+(i+1),order:i+1},s,{standard:fees[i]?fees[i][0]:s.standard,fee:fees[i]?fees[i][1]:s.fee},stageState[i]||{due:null,status:"upcoming",payment:{status:"upcoming",amount:null,date:null}}));
  const meetingWhen=d(16,10);

  window.SAMPLE_PROJECT={
    id:"p-sample-home",
    name:"Sam and Priya's home",
    designer:DANA,
    members:[DANA,SAM,PRIYA],
    rooms:T.rooms.slice(),
    notify_clients:false,
    pinterest_url:"https://example.com/mood-board",
    pinterest_note:"The board we built together after the first meeting. Texture, natural materials and open flow run through it; the images we both saved are at the top.",
    documents:[
      {id:"d1",title:"Services and fees",kind:"PDF",url:ph(900,640,"Services and fees"),note:"What I'll do, what it costs, and how payment works."},
      {id:"d2",title:"Agreement",kind:"PDF",url:"",note:"Coming before the concept presentation. The signed copy will live here."},
      {id:"d3",title:"Drawing set",kind:"PDF",url:ph(900,640,"Drawing set"),note:"The full set the drawings below come from."}
    ],
    architect_images:[
      {id:"a1",url:ph(900,640,"Ground floor plan"),caption:"Ground floor, current set"},
      {id:"a2",url:ph(900,1100,"Upper floor plan"),caption:"Upper floor"},
      {id:"a3",url:ph(900,560,"South elevation"),caption:"South elevation with the garden doors"},
      {id:"a4",url:ph(900,800,"Section A–A"),caption:"Section through the kitchen and living room"},
      {id:"a5",url:ph(900,700,"Site plan"),caption:"Site plan. The side store is still an open question"}
    ],
    intake,
    notes:[
      {id:"n1",author_id:"u-client2",room:"Kitchen",body:"We cooked for six on Saturday and kept bumping into each other at the sink. Could the sink move to the island, so one of us can prep facing the room?",images:[ph(720,540,"Island sink reference")],created_at:d(-3,20),edited_at:d(-3,21),read_at:d(-2,9),integrated_at:null,
        replies:[{id:"r1",author_id:"u-designer",body:"Yes, and it helps the view too. I'm drawing two versions for the concept presentation: the sink on the island, and the sink under the window with a prep counter on the island. Bring Saturday's menu and we'll walk through it on both.",created_at:d(-2,9)}]},
      {id:"n2",author_id:"u-client1",room:"Kitchen",body:"Will an induction range be a problem with our old pans? Trying to work out what else we'd have to replace.",images:[],created_at:d(-1,8),edited_at:null,read_at:null,integrated_at:null,replies:[]},
      {id:"n3",author_id:"u-client2",room:"",body:"I keep saving photos with one dark, matte wall. Could that happen somewhere here? Not sure where it belongs yet.",images:[],created_at:d(0,7),edited_at:null,read_at:null,integrated_at:null,replies:[]},
      {id:"n4",author_id:"u-client2",room:"Outdoor",body:"Bikes: four, two of them kids'. Plus the garden tools and the hose. We'd love all of it out of sight from the patio.",images:[ph(720,900,"Bike store photo")],created_at:d(-8,18),edited_at:null,read_at:d(-7,10),integrated_at:d(-5,10),
        replies:[{id:"r2",author_id:"u-designer",body:"Noted. I'm putting a shallow store along the side fence, with a door wide enough to roll the bikes straight in. It's in the concept drawings.",created_at:d(-5,10)}]}
    ],
    process:T.process.map((p,i)=>({id:"ph"+(i+1),title:p.title,body:p.body})),
    stages,
    notifs:[
      {id:"nt1",to:"u-designer",subject:"Priya added to the conversation · Kitchen",body:"We cooked for six on Saturday and kept bumping into each other at the sink…",link:"#conversation",created_at:d(-3,20),seen_at:d(-2,9)},
      {id:"nt2",to:"u-designer",subject:"Sam added to the conversation · Kitchen",body:"Will an induction range be a problem with our old pans?",link:"#conversation",created_at:d(-1,8),seen_at:null},
      {id:"nt3",to:"u-designer",subject:"Priya added a directive · Kitchen",body:"We'd like the kitchen to look tidy even when it isn't…",link:"#directives",created_at:d(-2,21),seen_at:null},
      {id:"nt4",to:"u-designer",subject:"Priya added to the conversation",body:"I keep saving photos with one dark, matte wall…",link:"#conversation",created_at:d(0,7),seen_at:null},
      {id:"nt5",to:"u-client2",subject:"Dana replied · Kitchen",body:"Yes, and it helps the view too. I'm drawing two versions for the concept presentation…",link:"#conversation",created_at:d(-2,9),seen_at:null},
      {id:"nt6",to:"u-client2",subject:"Meeting updated · Sam and Priya's home",body:"Now "+DF.format(new Date(meetingWhen))+" at 10:00 AM · At the house",link:"#meeting",created_at:d(-4,12),seen_at:d(-4,13)},
      {id:"nt7",to:"u-client1",subject:"Dana replied · Kitchen",body:"Yes, and it helps the view too…",link:"#conversation",created_at:d(-2,9),seen_at:null}
    ],
    meeting:{id:"m1",when:meetingWhen,where:"At the house",notes:"Concept presentation. I'll bring printed plans. Please have the latest drawing set open on a screen if you can.",change_request:null}
  };

  // A second project so the dashboard has something to show.
  const P2=JSON.parse(JSON.stringify(window.SAMPLE_PROJECT));
  P2.id="p-sample-flat";P2.name="Jo's apartment";
  P2.members=[DANA,{id:"u-client3",name:"Jo",email:"client.three@example.com",role:"client"}];P2.designer=DANA;
  P2.notes=[{id:"p2n1",author_id:"u-client3",room:"Bedrooms",body:"Could the bed go under the window? I'd like to wake up with the light.",images:[],created_at:d(-1,21),edited_at:null,read_at:null,integrated_at:null,replies:[]}];
  P2.notifs=[];P2.documents=[];P2.architect_images=[];P2.pinterest_url="";P2.pinterest_note="";
  P2.intake.forEach(s=>s.questions=s.questions.filter(q=>q.q).map(q=>({...q,a:"",updated_at:null,updated_by:null})));
  P2.stages.forEach((s,i)=>{s.status=i===0?"done":i===1?"current":"upcoming";s.due=i===1?d(30):null;s.payment={status:i===0?"free":i===1?"requested":"upcoming",amount:s.fee||null,date:null};});
  P2.meeting={id:"m2",when:d(6,14),where:"Video call",notes:"Concept presentation.",change_request:null};
  window.SAMPLE_PROJECTS=[window.SAMPLE_PROJECT,P2];
})();
