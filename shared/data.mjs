/** Baron economic reference: classic US dollar game, 2008–2020 card effects. */
export const COLORS = [
  ['terracotta','Terracotta','#b65e49'],['evergreen','Evergreen','#477b70'],
  ['plum','Plum','#8d779e'],['brass','Brass','#b79a49'],
  ['azure','Azure','#4f7eaa'],['saffron','Saffron','#d48538'],
  ['teal','Teal','#359ba0'],['berry','Berry','#af5575'],
  ['olive','Olive','#778d3a'],['indigo','Indigo','#6260a0'],
  ['chocolate','Chocolate','#845a42'],['slate','Slate','#626d7a']
].map(([id,name,hex])=>({id,name,hex}));
export const GROUPS = {
 brown:{country:'Kenya',color:'#8a604d',build:50},
 sky:{country:'India',color:'#83b7c7',build:50},
 pink:{country:'Brazil',color:'#ba6f9c',build:100},
 orange:{country:'China',color:'#dc963f',build:100},
 red:{country:'Italy',color:'#c35f53',build:150},
 yellow:{country:'France',color:'#d7bd52',build:150},
 green:{country:'Japan',color:'#5c926c',build:200},
 blue:{country:'Switzerland',color:'#506e97',build:200}
};
const city=(id,name,group,price,rents)=>({id,name,kind:'city',group,price,rents,mortgage:price/2,...GROUPS[group]});
const airport=(id,name)=>({id,name,kind:'airport',price:200,mortgage:100});
const network=(id,name)=>({id,name,kind:'network',price:150,mortgage:75});
const square=(id,name,kind,extra={})=>({id,name,kind,...extra});
export const BOARD = [
 square(0,'GO','go'),city(1,'Mombasa','brown',60,[2,10,30,90,160,250]),square(2,'Bonus','bonus'),
 city(3,'Nairobi','brown',60,[4,20,60,180,320,450]),square(4,'Income Tax','tax',{amount:200}),airport(5,'LHR Airport'),
 city(6,'Kolkata','sky',100,[6,30,90,270,400,550]),square(7,'Risk','risk'),city(8,'Mumbai','sky',100,[6,30,90,270,400,550]),
 city(9,'New Delhi','sky',120,[8,40,100,300,450,600]),square(10,'Jail / Just Visiting','jail'),
 city(11,'Salvador','pink',140,[10,50,150,450,625,750]),network(12,'Energy Grid'),city(13,'Rio de Janeiro','pink',140,[10,50,150,450,625,750]),
 city(14,'São Paulo','pink',160,[12,60,180,500,700,900]),airport(15,'DXB Airport'),city(16,'Guangzhou','orange',180,[14,70,200,550,750,950]),
 square(17,'Bonus','bonus'),city(18,'Shanghai','orange',180,[14,70,200,550,750,950]),city(19,'Beijing','orange',200,[16,80,220,600,800,1000]),
 square(20,'Free Parking','parking'),city(21,'Naples','red',220,[18,90,250,700,875,1050]),square(22,'Risk','risk'),
 city(23,'Venice','red',220,[18,90,250,700,875,1050]),city(24,'Rome','red',240,[20,100,300,750,925,1100]),airport(25,'SIN Airport'),
 city(26,'Lyon','yellow',260,[22,110,330,800,975,1150]),city(27,'Nice','yellow',260,[22,110,330,800,975,1150]),network(28,'Data Network'),
 city(29,'Paris','yellow',280,[24,120,360,850,1025,1200]),square(30,'Go to Jail','gojail'),
 city(31,'Osaka','green',300,[26,130,390,900,1100,1275]),city(32,'Kyoto','green',300,[26,130,390,900,1100,1275]),square(33,'Bonus','bonus'),
 city(34,'Tokyo','green',320,[28,150,450,1000,1200,1400]),airport(35,'HND Airport'),square(36,'Risk','risk'),
 city(37,'Geneva','blue',350,[35,175,500,1100,1300,1500]),square(38,'Luxury Tax','tax',{amount:100}),city(39,'Zurich','blue',400,[50,200,600,1400,1700,2000])
];
export const RISK = [
 {id:'r0',text:'Advance to GO. Collect $200.',effect:'advance',to:0},
 {id:'r1',text:'Advance to Rome. Collect $200 if you pass GO.',effect:'advance',to:24},
 {id:'r2',text:'Advance to Salvador. Collect $200 if you pass GO.',effect:'advance',to:11},
 {id:'r3',text:'Advance to the nearest network. If owned, roll two dice and pay ten times the total.',effect:'network'},
 {id:'r4',text:'Advance to the nearest airport. If owned, pay twice the usual rent.',effect:'airport'},
 {id:'r5',text:'Advance to the nearest airport. If owned, pay twice the usual rent.',effect:'airport'},
 {id:'r6',text:'Your investments pay a $50 dividend.',effect:'gain',amount:50},
 {id:'r7',text:'Jail release. Keep this card until used or traded.',effect:'escape'},
 {id:'r8',text:'Go back three spaces.',effect:'back',steps:3},
 {id:'r9',text:'Go directly to Jail. Do not pass GO or collect $200.',effect:'jail'},
 {id:'r10',text:'Renovation bill: pay $25 per house and $100 per hotel.',effect:'repairs',house:25,hotel:100},
 {id:'r11',text:'Pay a $15 fine.',effect:'pay',amount:15},
 {id:'r12',text:'Fly to LHR Airport. Collect $200 if you pass GO.',effect:'advance',to:5},
 {id:'r13',text:'Advance to Zurich.',effect:'advance',to:39},
 {id:'r14',text:'You are elected chairperson. Pay every other player $50.',effect:'payAll',amount:50},
 {id:'r15',text:'Your investment matures. Collect $150.',effect:'gain',amount:150}
];
export const BONUS = [
 {id:'b0',text:'Advance to GO. Collect $200.',effect:'advance',to:0},
 {id:'b1',text:'A bank correction works in your favor. Collect $200.',effect:'gain',amount:200},
 {id:'b2',text:'Pay a $50 medical bill.',effect:'pay',amount:50},
 {id:'b3',text:'A share sale earns you $50.',effect:'gain',amount:50},
 {id:'b4',text:'Jail release. Keep this card until used or traded.',effect:'escape'},
 {id:'b5',text:'Go directly to Jail. Do not pass GO or collect $200.',effect:'jail'},
 {id:'b6',text:'A holiday fund matures. Collect $100.',effect:'gain',amount:100},
 {id:'b7',text:'Receive a $20 tax refund.',effect:'gain',amount:20},
 {id:'b8',text:'It is your birthday. Collect $10 from every other player.',effect:'collectAll',amount:10},
 {id:'b9',text:'Your life insurance matures. Collect $100.',effect:'gain',amount:100},
 {id:'b10',text:'Pay $100 in hospital fees.',effect:'pay',amount:100},
 {id:'b11',text:'Pay $50 in school fees.',effect:'pay',amount:50},
 {id:'b12',text:'Receive a $25 consultancy fee.',effect:'gain',amount:25},
 {id:'b13',text:'Street repairs: pay $40 per house and $115 per hotel.',effect:'repairs',house:40,hotel:115},
 {id:'b14',text:'A design competition earns you second prize. Collect $10.',effect:'gain',amount:10},
 {id:'b15',text:'You inherit $100.',effect:'gain',amount:100}
];
export const CARDS = Object.fromEntries([...RISK,...BONUS].map(x=>[x.id,x]));
export const RULES_VERSION = 'baron-classic-1';
export const money = n => '$'+Math.round(n).toLocaleString('en-US');
