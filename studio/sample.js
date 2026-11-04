// Sample project for preview mode: Brook and Evan's home.
// Intake content comes from the "Brook and Evan Questions" doc. Images are placeholders.
(function(){
  function ph(w,h,text){
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#DED7C9"/><rect x="${w*.08}" y="${h*.08}" width="${w*.84}" height="${h*.84}" fill="none" stroke="#C9C1B2" stroke-width="1"/><text x="50%" y="52%" text-anchor="middle" font-family="Georgia,serif" font-size="${Math.round(w/16)}" fill="#8A8477">${text}</text></svg>`;
    return "data:image/svg+xml;utf8,"+encodeURIComponent(svg);
  }
  const d=(days,h)=>{const t=new Date(2026,10,4,h||10,0,0);t.setDate(t.getDate()+days);return t.toISOString();};

  const CORI={id:"u-cori",name:"Cori",email:"corina@parladesigns.com",role:"designer"};
  const BROOK={id:"u-brook",name:"Brook",email:"brook@example.com",role:"client"};
  const EVAN={id:"u-evan",name:"Evan",email:"evan@example.com",role:"client"};

  window.SAMPLE_PROJECT={
    id:"p-brook-evan",
    name:"Brook and Evan's home",
    designer:CORI,
    members:[CORI,BROOK,EVAN],
    rooms:["Entry & outdoor","Kitchen","Living","Bedrooms","Bathrooms","Loft & office","Hosting","Whole house"],
    pinterest_url:"https://www.pinterest.com/parlamoves/brook-evan/",
    pinterest_note:"The board we built together after the first meeting. Texture, natural fibers and open flow are the through-line; the pins we both saved are at the top.",
    documents:[
      {id:"d1",title:"The process, design services and fees",kind:"Google Doc",url:"https://docs.google.com/document/d/1ykJxIB-KpPOyHNQlzxUKX5uRcmhEC7VJwIEvQUmHD2w/edit",note:"What I'll do, the founding-client rate, and how payment works."},
      {id:"d2",title:"One-page agreement",kind:"PDF",url:"",note:"Coming before the concept presentation — I'll put the signed copy here."},
      {id:"d3",title:"Architect's drawing set, Oct 2026",kind:"PDF",url:ph(900,640,"Drawing set PDF"),note:"The full set the drawings below come from."}
    ],
    architect_images:[
      {id:"a1",url:ph(900,640,"Ground floor plan"),caption:"Ground floor — current set from the architect, Oct 2026"},
      {id:"a2",url:ph(900,1100,"Upper floor plan"),caption:"Upper floor — loft and small office"},
      {id:"a3",url:ph(900,560,"South elevation"),caption:"South elevation with the panoramic doors"},
      {id:"a4",url:ph(900,800,"Section A–A"),caption:"Section through the shared core"},
      {id:"a5",url:ph(900,700,"Site plan"),caption:"Site — outdoor shower and firepit are still open questions"}
    ],
    intake:[
      {id:"s1",room:"Entry & outdoor",title:"Entry, transitions & outdoor",questions:[
        {id:"q1",q:"How sure are you about the farm-style doors? Can we imagine a space where the whole wall opens, but there's still a bit of separation?",a:"We like the doors.",updated_at:d(-12),updated_by:"u-cori"},
        {id:"q2",q:"When you come in through the back doors, where do shoes and coats go?",a:"Back door for shoes; coat storage mostly out front. Shower situation: think about the floor between the back door and the bathroom, and outdoor storage.",updated_at:d(-12),updated_by:"u-cori"},
        {id:"q3",q:"Is there a reason you chose to have a hall?",a:"Washer and dryer go outside. We don't like the hall.",updated_at:d(-12),updated_by:"u-cori"},
        {id:"q4",q:"Walk me through a load of laundry, start to finish — sorting, the basket mid-load, folding, where it sits before it's put away. I'm not sure the washer/dryer space is big enough to hold that in action.",a:"",updated_at:null,updated_by:null},
        {id:"q5",q:"Outdoor priorities: secret garden, firepit, surfing gear, bike storage, bedroom privacy — how do these rank?",a:"",updated_at:null,updated_by:null},
        {id:"q6",q:"Can we integrate the outdoor shower into the outdoor landing? Where will it be now?",a:"",updated_at:null,updated_by:null}
      ]},
      {id:"s2",room:"Kitchen",title:"Kitchen & the shared core",questions:[
        {id:"q7",q:"The kitchen island — is this for functionality, or is this the table you want to eat at?",a:"A big table for homework and hosting — maybe eight people.",updated_at:d(-3,19),updated_by:"u-brook"},
        {id:"q8",q:"The dining workspace — do you see that as a booth-type situation?",a:"",updated_at:null,updated_by:null},
        {id:"q9",q:"What is your living room for? If it's only for receiving visitors, is it really an extension of the kitchen?",a:"Hanging out, game night, parent seating.",updated_at:d(-12),updated_by:"u-cori"},
        {id:"q10",q:"Cook / sink / fridge workflow — walk me through it. I generally recommend fridge → sink → cook, or a triangle.",a:"Triangle. A window, and continuous space.",updated_at:d(-12),updated_by:"u-cori"},
        {id:"q11",q:"What is the morning routine? How much cooking in general?",a:"Fireplace is gas and works. Outdoor kitchen.",updated_at:d(-12),updated_by:"u-cori"},
        {id:"q21",q:"",a:"We'd like the kitchen to be the one room that stays tidy-looking even when it isn't — closed storage over open shelves, and somewhere the toaster and kettle can live out of sight.",updated_at:d(-2,21),updated_by:"u-brook",added_by:"u-brook"}
      ]},
      {id:"s3",room:"Bedrooms",title:"Sleeping & storage",questions:[
        {id:"q12",q:"Bedroom windows — full length, or a higher window that gives you more variation in how you organize the room? (This is really a question about another kid, and co-sleeping.)",a:"Door goes outside — windows and furniture should flex.",updated_at:d(-12),updated_by:"u-cori"},
        {id:"q13",q:"What has to fit in the primary closet for the two of you? Hanging vs. folded, shoes, anything bulky, seasonal things. I'm concerned the current size won't cover it.",a:"Two full-size closets. Zoe's bedroom can be smaller.",updated_at:d(-12),updated_by:"u-cori"}
      ]},
      {id:"s4",room:"Bathrooms",title:"Bathrooms & routine",questions:[
        {id:"q14",q:"The primary bathroom has a pocket door — it saves space, but comes with some noise concerns I want you aware of.",a:"",updated_at:null,updated_by:null},
        {id:"q15",q:"Tell me about the double-sink priority. What is your bathroom routine like?",a:"No need for a double sink.",updated_at:d(-12),updated_by:"u-cori"}
      ]},
      {id:"s5",room:"Loft & office",title:"Upper & flex spaces",questions:[
        {id:"q16",q:"Is there a reason the attic space — the small office — doesn't have a window?",a:"It should have a window.",updated_at:d(-12),updated_by:"u-cori"},
        {id:"q17",q:"I want to design the loft more carefully. Projector or TV?",a:"",updated_at:null,updated_by:null},
        {id:"q18",q:"What are both of your work hours, and in which spaces?",a:"Brook works at home; Evan has the option.",updated_at:d(-12),updated_by:"u-cori"}
      ]},
      {id:"s6",room:"Hosting",title:"Hosting",questions:[
        {id:"q19",q:"Tell me about your hosting routines. How often, how many people, what kind of dishware?",a:"Outdoor kitchen. One dishwasher.",updated_at:d(-12),updated_by:"u-cori"},
        {id:"q20",q:"Do people stay with you?",a:"Couch or bed — the loft could host someone.",updated_at:d(-12),updated_by:"u-cori"}
      ]}
    ],
    notes:[
      {id:"n1",author_id:"u-brook",room:"Kitchen",body:"We kept talking about the table after you left. What if the island IS the table — one long piece, counter height on the cooking end stepping down to table height? Then we don't need a separate dining area at all. Could that work with the window?",images:[ph(720,540,"Stepped island reference")],created_at:d(-3,20),edited_at:d(-3,21),read_at:d(-2,9),integrated_at:null,
        replies:[{id:"r1",author_id:"u-cori",body:"Yes — this is the direction I was hoping you'd land on. A stepped island keeps the window and the continuous space you asked for. I'm drawing two versions for the concept presentation: one long piece, and one where the table end swings out a few degrees so eight people can sit without anyone facing the range. A reference I like: https://www.pinterest.com/pin/stepped-island-oak",created_at:d(-2,9)}]},
      {id:"n2",author_id:"u-evan",room:"Kitchen",body:"Do you think we can afford kitchen tile all the way to the ceiling behind the range?",images:[],created_at:d(-1,8),edited_at:null,read_at:null,integrated_at:null,replies:[]},
      {id:"n3",author_id:"u-brook",room:"",body:"We've been saving photos of limewashed walls with a slightly rougher texture. Could that happen somewhere? Not sure where it belongs yet — maybe just one wall.",images:[],created_at:d(0,7),edited_at:null,read_at:null,integrated_at:null,replies:[]},
      {id:"n4",author_id:"u-brook",room:"Entry & outdoor",body:"Surf storage: two longboards (9'6\") and three shortboards, plus wetsuits that need to drip somewhere. Bikes: four, two of them kids'. Would love these out of sight from the garden.",images:[ph(720,900,"Board rack photo")],created_at:d(-8,18),edited_at:null,read_at:d(-7,10),integrated_at:d(-5,10),
        replies:[{id:"r2",author_id:"u-cori",body:"Noted — I'm giving the outdoor landing a lined board wall with a drip channel into the drain, and the bikes go on the garden-side wall of the storage so they're hidden from the firepit. This is in the concept drawings.",created_at:d(-5,10)}]}
    ],
    process:[
      {id:"ph1",title:"Movement patterns",body:"How you move through the space now, and how you want to. Your priorities, how your time is spent, what will change in the next ten years."},
      {id:"ph2",title:"Feeling",body:"The goal of each room and of the house as a whole. A retreat, a lively place that welcomes guests, an intimate safe space. Whether work spaces should energize or focus."},
      {id:"ph3",title:"Style",body:"What we both value: texture, natural fibers, open flow. What I'll ask you to consider: character pieces, focused lighting, upkeep, modular pieces for small spaces, built-ins."},
      {id:"ph4",title:"Priorities",body:"The budget isn't endless, but you can have what you want. We rank what that is and leave room to grow toward the pieces that aren't available yet."}
    ],
    stages:[
      {id:"st1",order:1,title:"First meeting",focus:"Movement patterns · Feeling",desc:"Questions, measuring, your wishes and budget. We start with how you live, not what it looks like.",deliverable:"Your answers, kept under Directives and open to you to change.",due:d(-12),status:"done",standard:350,fee:0,payment:{status:"free",amount:0,date:null}},
      {id:"st2",order:2,title:"Layout proposal",focus:"Movement patterns · Feeling",desc:"I bring a layout and flow proposal built from your directives, with a first palette and lighting approach. You tell me what feels right and what doesn't.",deliverable:"Concept deck and marked-up plans, presented in person. Your notes come back to me through the Conversation.",due:d(16),status:"current",standard:1250,fee:625,payment:{status:"paid",amount:625,date:d(-10)}},
      {id:"st3",order:3,title:"Final presentation",focus:"Style · Priorities",desc:"The finished design intent with your notes and the architect's worked in: specific style choices, finishes and fixtures, lighting, outlets and switching, and the priority list for the budget. Includes one round of revisions.",deliverable:"Design-intent document the architect's drafter can use directly.",due:d(44),status:"upcoming",standard:1250,fee:625,payment:{status:"upcoming",amount:625,date:null}},
      {id:"st4",order:4,title:"Ongoing support",focus:"Staying on the team",desc:"Optional and to be determined. Potential of project calls, plan revisions, extra revision rounds while drawings are in progress, sourcing appliances, materials, etc.",deliverable:"Invoiced monthly for hours used, due within 15 days.",due:null,status:"upcoming",standard:125,fee:62.5,hourly:true,payment:{status:"upcoming",amount:null,date:null}}
    ],
    notifs:[
      {id:"nt1",to:"u-cori",subject:"Brook added to the conversation · Kitchen",body:"We kept talking about the table after you left. What if the island IS the table…",link:"#conversation",created_at:d(-3,20),seen_at:d(-2,9)},
      {id:"nt2",to:"u-cori",subject:"Evan added to the conversation · Kitchen",body:"Do you think we can afford kitchen tile all the way to the ceiling behind the range?",link:"#conversation",created_at:d(-1,8),seen_at:null},
      {id:"nt3",to:"u-cori",subject:"Brook added a directive · Kitchen & the shared core",body:"We'd like the kitchen to be the one room that stays tidy-looking even when it isn't…",link:"#directives",created_at:d(-2,21),seen_at:null},
      {id:"nt4",to:"u-cori",subject:"Brook added to the conversation",body:"We've been saving photos of limewashed walls with a slightly rougher texture…",link:"#conversation",created_at:d(0,7),seen_at:null},
      {id:"nt5",to:"u-brook",subject:"Cori replied · Kitchen",body:"Yes — this is the direction I was hoping you'd land on. A stepped island keeps the window…",link:"#conversation",created_at:d(-2,9),seen_at:null},
      {id:"nt6",to:"u-brook",subject:"Meeting updated · Brook and Evan's home",body:"Now Friday, November 20 at 10:00 AM · At the house",link:"#meeting",created_at:d(-4,12),seen_at:d(-4,13)},
      {id:"nt7",to:"u-evan",subject:"Cori replied · Kitchen",body:"Yes — this is the direction I was hoping you'd land on…",link:"#conversation",created_at:d(-2,9),seen_at:null}
    ],
    meeting:{id:"m1",when:d(16,10),where:"At the house",notes:"Concept presentation. I'll bring printed plans; please have the architect's latest set open on a screen if you can.",change_request:null},
    activity:[]
  };
})();
