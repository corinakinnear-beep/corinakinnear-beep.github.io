// Studio — the starter template.
// What a designer's new projects begin with until they edit their own template in Settings.
// Shape: rooms [name], process [{title, body}], intake [{title, room, questions [text]}],
// stages [{title, focus, desc, deliverable, standard, fee, hourly}].
// fee: null = set per project, 0 = free. standard: shown crossed out when the fee is lower.
window.STUDIO_TEMPLATE={
  rooms:["Entry","Kitchen","Living","Bedrooms","Bathrooms","Work space","Outdoor","Whole home"],
  process:[
    {title:"Discover",body:"How you live in the space now and what you want from it. Routines, priorities, budget, and what is likely to change over the next few years."},
    {title:"Concept",body:"A first layout and direction built from what you told me. You react to it, and what feels right or wrong shapes the next round."},
    {title:"Develop",body:"The direction made specific: materials, fixtures, lighting, storage, and the details that make each room work day to day."},
    {title:"Deliver",body:"Final drawings and selections, ready for whoever is building, with a ranked list of what matters most for the budget."}
  ],
  intake:[
    {title:"Arriving",room:"Entry",questions:[
      "When you come home, what is in your hands, and where does it all go?",
      "Shoes, coats, bags, keys: what needs a place by the door?"
    ]},
    {title:"Kitchen",room:"Kitchen",questions:[
      "Who cooks, how often, and what does a normal weeknight look like?",
      "Where do you eat most meals? Where would you like to?",
      "What is on your counters now that you wish wasn't?"
    ]},
    {title:"Living",room:"Living",questions:[
      "What is this room for: evenings in, guests, kids, screens, reading?",
      "How many people need to sit comfortably, and how often?"
    ]},
    {title:"Sleeping and storage",room:"Bedrooms",questions:[
      "What has to fit in the closets? Hanging, folded, shoes, anything bulky or seasonal.",
      "Morning light or darkness? Who wakes first?"
    ]},
    {title:"Bathrooms and routine",room:"Bathrooms",questions:[
      "Walk me through a morning. Who needs the bathroom when, and for how long?",
      "Bath, shower, or both? What do you use every day?"
    ]},
    {title:"Working at home",room:"Work space",questions:[
      "Who works from home, during which hours, and what do they need around them?"
    ]},
    {title:"Outside",room:"Outdoor",questions:[
      "How do you use the outside now, and what would you do there if you could?"
    ]},
    {title:"The whole home",room:"Whole home",questions:[
      "What should the home feel like when you walk in?",
      "Who visits, how often, and do they stay over?",
      "What will change in the next five to ten years?",
      "What is the budget, and what would you protect first if it got tight?"
    ]}
  ],
  stages:[
    {title:"First meeting",focus:"Discover",desc:"Questions, measuring, your wishes and budget. We start with how you live, not what it looks like.",deliverable:"Your answers, kept under Directives and open to you to change.",standard:null,fee:0,hourly:false},
    {title:"Concept presentation",focus:"Concept",desc:"I bring a layout and direction built from your directives. You tell me what feels right and what doesn't.",deliverable:"Concept drawings and a first palette, presented in person.",standard:null,fee:null,hourly:false},
    {title:"Final presentation",focus:"Develop · Deliver",desc:"The finished design with your notes worked in: layout, finishes and fixtures, lighting, and the priority list for the budget. Includes one round of revisions.",deliverable:"A final design document your builder or architect can work from.",standard:null,fee:null,hourly:false},
    {title:"Ongoing support",focus:"",desc:"Optional. Calls, revisions and sourcing while the work is being built.",deliverable:"Billed for the hours used.",standard:null,fee:null,hourly:true}
  ]
};
