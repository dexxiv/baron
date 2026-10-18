import test from 'node:test';
import assert from 'node:assert/strict';
import {BOARD,COLORS,RISK,BONUS} from '../shared/data.mjs';
import {newRoom,joinRoom,transition,maintain,assertState,rent,publicState,canBuild,redemptionCost} from '../shared/engine.mjs';
const NOW=1800000000000;
function base(count=2){
 const s=newRoom({id:'room',code:'ABCDEF',playerId:'a',name:'Ada',tokenHash:'SECRET',now:NOW});
 for(let i=1;i<count;i++)joinRoom(s,{playerId:String.fromCharCode(97+i),name:'Player '+i,tokenHash:'SECRET'+i,now:NOW});
 s.players.forEach((p,i)=>{p.color=COLORS[i].id;p.ready=true;});
 s.status='playing';s.risk=RISK.map(c=>c.id);s.bonus=BONUS.map(c=>c.id);
 s.turn={playerId:'a',phase:'roll',deadline:NOW+120000,remaining:null,doubles:0,extraRoll:false,expired:false,lockUntil:NOW,lastRoll:null,debtExtensionUsed:false,grace:null};return s;
}
function rnd(...values){let i=0;return max=>(values[i++%values.length]??0)%max;}
function own(s,id,...ids){for(const i of ids)s.deeds[i]={ownerId:id,buildings:0,mortgaged:false};return s;}
function act(s,id,a,dt=0,rng=rnd(0,1)){return transition(s,id,a,NOW+dt,rng);}
function online(s,time){for(const p of s.players)p.lastSeen=time;return s;}
function tick(s,dt){online(s,NOW+dt);return maintain(s,NOW+dt,rnd(0,1));}

test('40 squares, 22 cities, 4 airports, 2 networks, 12 colors and complete economies',()=>{
 assert.equal(BOARD.length,40);assert.equal(BOARD.filter(b=>b.kind==='city').length,22);assert.equal(BOARD.filter(b=>b.kind==='airport').length,4);assert.equal(BOARD.filter(b=>b.kind==='network').length,2);assert.equal(COLORS.length,12);
 for(const b of BOARD.filter(b=>b.price)){assert.equal(b.mortgage,b.price/2);if(b.kind==='city')assert.equal(b.rents.length,6);}
 assert.equal(RISK.length,16);assert.equal(BONUS.length,16);
});
test('lobby requires explicit unique colors and ready players',()=>{
 let s=newRoom({id:'room',code:'ABCDEF',playerId:'a',name:'Ada',tokenHash:'SECRET',now:NOW});joinRoom(s,{playerId:'b',name:'Bea',tokenHash:'SECRET2',now:NOW});
 assert.throws(()=>act(s,'a',{type:'start'}),/color|ready/);
 s=act(s,'a',{type:'color',color:'terracotta'});assert.throws(()=>act(s,'b',{type:'color',color:'terracotta'}),/taken/);
 s=act(s,'b',{type:'color',color:'plum'});s=act(s,'a',{type:'ready',ready:true});s=act(s,'b',{type:'ready',ready:true});
 s=act(s,'a',{type:'start'},0,rnd(0,1,3,4));assert.equal(s.status,'playing');assert.equal(s.players[0].id,'b');assertState(s);
 assert.throws(()=>joinRoom(s,{playerId:'c',name:'C',tokenHash:'x',now:NOW}),/started/);
});
test('ordinary movement, GO payment, purchase and end turn',()=>{
 let s=base();s.players[0].pos=39;s.bonus=['b1',...s.bonus.filter(c=>c!=='b1')];
 s=act(s,'a',{type:'roll'},0,rnd(0,1));assert.equal(s.players[0].pos,2);assert.equal(s.players[0].cash,1900); // GO + Bonus bank correction
 assert.equal(s.turn.phase,'end');s=act(s,'a',{type:'end'},5000);assert.equal(s.turn.playerId,'b');
 s=base();s=act(s,'a',{type:'roll'},0,rnd(0,1));assert.equal(s.turn.phase,'purchase');s=act(s,'a',{type:'buy'},1000);assert.equal(s.deeds[3].ownerId,'a');assert.equal(s.players[0].cash,1440);
});
test('declined property auctions include declining player and add five seconds each bid',()=>{
 let s=base();s=act(s,'a',{type:'roll'},0,rnd(0,1));s=act(s,'a',{type:'decline'},1000);assert.equal(s.auction.deadline,NOW+31000);assert.equal(s.turn.deadline,null);
 s=act(s,'a',{type:'bid',amount:10},2000);assert.equal(s.auction.deadline,NOW+36000);
 assert.throws(()=>act(s,'a',{type:'bid',amount:11},2500),/highest/);
 s=act(s,'b',{type:'bid',amount:20},3000);assert.equal(s.auction.deadline,NOW+41000);tick(s,41001);assert.equal(s.deeds[3].ownerId,'b');assert.equal(s.players[1].cash,1480);assert.equal(s.turn.phase,'end');assert.equal(s.turn.deadline,NOW+160881);
});
test('rent tables, monopoly doubling, mortgage suppression, airports and networks',()=>{
 const s=own(base(),'b',1,3,5,15,25,35,12,28);assert.equal(rent(s,3),8);s.deeds[3].mortgaged=true;assert.equal(rent(s,3),0);assert.equal(rent(s,1),4);assert.equal(rent(s,5),200);assert.equal(rent(s,5,0,{doubleAirport:true}),400);assert.equal(rent(s,12,7),70);
 s.deeds[28]=null;assert.equal(rent(s,12,7),28);assert.equal(rent(s,12,7,{tenNetwork:true}),70);
});
test('three doubles sends player to Jail without moving on the third roll',()=>{
 let s=base();own(s,'a',6,8,9); // avoid buying on middle rolls
 s.risk=[...s.risk.filter(c=>c!=='r6')];s.risk.unshift('r6');
 s.players[0].pos=4;s=act(s,'a',{type:'roll'},0,rnd(0,0));assert.equal(s.turn.phase,'roll');
 s=act(s,'a',{type:'roll'},1000,rnd(0,0));assert.equal(s.turn.phase,'roll');
 s=act(s,'a',{type:'roll'},2000,rnd(0,0));assert.equal(s.players[0].pos,10);assert.equal(s.players[0].inJail,true);assert.equal(s.turn.phase,'end');
});
test('Jail doubles releases without bonus roll; third failure pays and uses rolled move',()=>{
 let s=base();s.players[0].pos=10;s.players[0].inJail=true;s.turn.phase='jail';s=act(s,'a',{type:'roll'},0,rnd(2,2));assert.equal(s.players[0].inJail,false);assert.equal(s.turn.extraRoll,false);
 s=act(s,'a',{type:'buy'},s.turn.lockUntil-NOW+1);assert.equal(s.turn.phase,'end');
 s=base();s.players[0].pos=10;s.players[0].inJail=true;s.players[0].jailTurns=2;s.turn.phase='jail';s=act(s,'a',{type:'roll'},0,rnd(0,1));assert.equal(s.pot,50);assert.equal(s.players[0].pos,13);assert.equal(s.players[0].cash,1450);
});
test('taxes and bank card fees feed Free Parking, landing empties it',()=>{
 let s=base();s.players[0].pos=1;s=act(s,'a',{type:'roll'},0,rnd(0,1));assert.equal(s.pot,200);s.players[0].pos=17;s.turn.phase='roll';s.turn.lockUntil=NOW;s=act(s,'a',{type:'roll'},5000,rnd(0,1));assert.equal(s.pot,0);assert.equal(s.players[0].cash,1500);
});
test('even construction, finite supply, hotel exchange and half-price building sales',()=>{
 let s=own(base(),'a',1,3);s.players[0].cash=10000;
 s=act(s,'a',{type:'build',spaceId:1});assert.throws(()=>act(s,'a',{type:'build',spaceId:1}),/evenly/);s=act(s,'a',{type:'build',spaceId:3});
 for(let n=1;n<4;n++){s=act(s,'a',{type:'build',spaceId:1});s=act(s,'a',{type:'build',spaceId:3});}
 assert.equal(s.supply.houses,24);s=act(s,'a',{type:'build',spaceId:1});assert.equal(s.supply.houses,28);assert.equal(s.supply.hotels,11);assert.equal(s.deeds[1].buildings,5);
 assert.throws(()=>act(s,'a',{type:'mortgage',spaceId:3}),/every building/);s=act(s,'a',{type:'sell',spaceId:1});assert.equal(s.deeds[1].buildings,4);assert.equal(s.supply.houses,24);assert.equal(s.supply.hotels,12);assertState(s);
});
test('mortgages pay half and redeem for principal plus rounded 10 percent',()=>{
 let s=own(base(),'a',1,12);s=act(s,'a',{type:'mortgage',spaceId:12});assert.equal(s.players[0].cash,1575);assert.equal(redemptionCost(s,12,NOW),83);s=act(s,'a',{type:'redeem',spaceId:12});assert.equal(s.players[0].cash,1492);assert.equal(s.deeds[12].mortgaged,false);
});
test('trade exchanges cash, deeds and cards atomically and charges mortgage interest',()=>{
 let s=own(base(),'a',1);own(s,'b',12);s.deeds[12].mortgaged=true;s.players[0].cards=['r7'];s.risk=s.risk.filter(c=>c!=='r7');
 s=act(s,'a',{type:'tradeOffer',toId:'b',give:{cash:100,deeds:[1],cards:['r7']},receive:{cash:0,deeds:[12],cards:[]},note:'A useful swap.'});
 const id=s.trades[0].id;s=act(s,'b',{type:'tradeAccept',tradeId:id});assert.equal(s.players[0].cash,1392);assert.equal(s.players[1].cash,1600);assert.equal(s.deeds[12].ownerId,'a');assert.deepEqual(s.players[1].cards,['r7']);assert.equal(redemptionCost(s,12,NOW),75);assert.equal(redemptionCost(s,12,NOW+31000),83);assertState(s);
 assert.throws(()=>act(s,'b',{type:'tradeAccept',tradeId:id}),/unavailable/);
});
test('stale or insolvent trade is rejected without transferring assets',()=>{
 let s=own(base(),'a',1);s=act(s,'a',{type:'tradeOffer',toId:'b',give:{cash:1000,deeds:[1],cards:[]},receive:{cash:1000,deeds:[],cards:[]},note:''});s.players[0].cash=10;
 assert.throws(()=>act(s,'b',{type:'tradeAccept',tradeId:s.trades[0].id}),/cash/);assert.equal(s.deeds[1].ownerId,'a');assert.equal(s.players[1].cash,1500);
});
test('untouched turn expires without rolling and pending purchase goes to auction',()=>{
 let s=base();tick(s,120001);assert.equal(s.turn.playerId,'b');assert.equal(s.players[0].pos,0);
 s=base();s=act(s,'a',{type:'roll'},0,rnd(0,1));tick(s,121000);assert.equal(s.auction.spaceId,3);tick(s,151001);assert.equal(s.turn.playerId,'b');assert.equal(s.turn.phase,'roll');
});
test('debt adds 30 seconds once and automatically mortgages only enough deeds',()=>{
 let s=own(base(),'a',5,15,25);own(s,'b',3);s.players[0].cash=0;s=act(s,'a',{type:'roll'},0,rnd(0,1));assert.equal(s.debt.amount,4);assert.equal(s.turn.debtExtensionUsed,true);const deadline=s.debt.deadline;
 online(s,deadline+1);maintain(s,deadline+1,rnd(0,1));assert.equal(s.debt,null);assert.equal(ownedCount(s,'a',true),1);assert.equal(s.players[0].cash,96);assert.equal(s.players[1].cash,1504);assertState(s);
});
function ownedCount(s,id,mortgaged){return s.deeds.filter(d=>d?.ownerId===id&&d.mortgaged===mortgaged).length;}
test('bankruptcy transfers deeds and held cards to creditor; last solvent player wins',()=>{
 let s=own(base(),'b',39);own(s,'a',1);s.players[0].cash=0;s.players[0].cards=['r7'];s.risk=s.risk.filter(x=>x!=='r7');s.players[0].pos=36;
 s=act(s,'a',{type:'roll'},0,rnd(0,1));assert.equal(s.debt.amount,50);online(s,s.debt.deadline+1);maintain(s,s.debt.deadline+1,rnd(0,1));assert.equal(s.status,'finished');assert.equal(s.winnerId,'b');assert.equal(s.deeds[1].ownerId,'b');assert.deepEqual(s.players[1].cards,['r7']);assertState(s);
});
test('one reconnect grace per game, subsequent disconnects leave deadline running',()=>{
 const s=base();s.players[1].lastSeen=NOW+26000;maintain(s,NOW+26000,rnd(0,1));assert.equal(s.turn.grace.playerId,'a');assert.equal(s.players[0].graceUsed,true);assert.equal(s.turn.deadline,NOW+150000);
 s.players[0].lastSeen=NOW+30000;maintain(s,NOW+30000,rnd(0,1));assert.equal(s.turn.grace,null);assert.equal(s.turn.deadline,NOW+124000);
 s.players[1].lastSeen=NOW+60000;maintain(s,NOW+60000,rnd(0,1));assert.equal(s.turn.grace,null);assert.equal(s.turn.deadline,NOW+124000);
});
test('public state does not leak sessions, deck order, request IDs or third-party trade notes',()=>{
 let s=base(3);s=act(s,'a',{type:'tradeOffer',toId:'b',give:{cash:1,deeds:[],cards:[]},receive:{cash:0,deeds:[],cards:[]},note:'PRIVATE'});const view=publicState(s,'c',NOW);const encoded=JSON.stringify(view);assert.equal(view.trades.length,0);for(const secret of ['SECRET','PRIVATE','sessions','"risk":','requests'])assert.equal(encoded.includes(secret),false);
});
test('whole games survive randomized actions, auctions, debts and clocks',()=>{
 let seed=798213;const rng=max=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed>>>8)%max;};
 for(let game=0;game<4;game++){
  let s=base(4),time=NOW;
  // Legal mid-game portfolios ensure the simulator can finish without a negotiating AI.
  const countries=['brown','sky','pink','orange','red','yellow','green','blue'];
  for(const b of BOARD.filter(b=>b.price)){const owner=b.kind==='city'?String.fromCharCode(97+Math.floor(countries.indexOf(b.group)/2)):String.fromCharCode(97+(b.id%4));own(s,owner,b.id);if(b.kind==='city')s.deeds[b.id].buildings=1;}
  s.supply.houses=10;assertState(s);
  for(let step=0;step<8000&&s.status==='playing';step++){
   time+=6000;online(s,time);maintain(s,time,rng);if(s.status!=='playing')break;
   let id=s.turn.playerId,a;
   if(s.auction){const bids=s.players.filter(p=>!p.bankrupt&&p.id!==s.auction.leaderId&&p.cash>=Math.max(10,s.auction.bid+1));if(bids.length&&rng(3)===0){id=bids[rng(bids.length)].id;a={type:'bid',amount:Math.min(playerCash(s,id),Math.max(10,s.auction.bid+1)+rng(40))};}else{time=s.auction.deadline+1;online(s,time);maintain(s,time,rng);}}
   else if(s.debt){time=s.debt.deadline+1;online(s,time);maintain(s,time,rng);}
   else if(s.turn.phase==='roll'||s.turn.phase==='jail')a={type:'roll'};
   else if(s.turn.phase==='purchase')a={type:s.players.find(p=>p.id===id).cash>=BOARD[s.turn.purchase.spaceId].price&&rng(3)?'buy':'decline'};
   else if(s.turn.phase==='end')a={type:'end'};
   if(a){time=Math.max(time,s.turn.lockUntil);online(s,time);s=transition(s,id,a,time,rng);}assertState(s);
   if(step>30&&s.status==='playing'&&!s.auction&&!s.debt&&!s.buildRequest&&time>=s.turn.lockUntil){
    const participants=s.players.filter(p=>!p.bankrupt);const p=participants[rng(participants.length)];
    const mortgaged=BOARD.find(b=>s.deeds[b.id]?.ownerId===p.id&&s.deeds[b.id].mortgaged&&p.cash>redemptionCost(s,b.id,time)+300);
    if(mortgaged)s=transition(s,p.id,{type:'redeem',spaceId:mortgaged.id},time,rng);
    const candidates=BOARD.filter(b=>canBuild(s,p.id,b.id)&&s.players.find(x=>x.id===p.id).cash>b.build+100);
    if(candidates.length)s=transition(s,p.id,{type:'build',spaceId:candidates.sort((a,b)=>s.deeds[b.id].buildings-s.deeds[a.id].buildings||a.id-b.id)[0].id},time,rng);
   }
  }
  assert.ok(s.seq>50);assertState(s);assert.equal(s.status,'finished','Randomized game must reach a winner: '+JSON.stringify({turn:s.turn,auction:s.auction,debt:s.debt,players:s.players.map(p=>[p.id,p.cash,p.bankrupt]),supply:s.supply,deeds:s.deeds}));
 }
});
function playerCash(s,id){return s.players.find(p=>p.id===id).cash;}

test('back three from Risk can chain into Bonus and the correct bank penalty',()=>{
 let s=base();s.players[0].pos=33;s.risk=['r8',...s.risk.filter(c=>c!=='r8')];s.bonus=['b11',...s.bonus.filter(c=>c!=='b11')];s=act(s,'a',{type:'roll'},0,rnd(0,1));assert.equal(s.players[0].pos,33);assert.equal(s.pot,50);assert.equal(s.players[0].cash,1450);assertState(s);
});
test('off-turn birthday debt pauses active player and supplies its own 30 seconds',()=>{
 let s=base(3);s.players[0].pos=14;s.players[1].cash=0;own(s,'b',1);s.bonus=['b8',...s.bonus.filter(c=>c!=='b8')];s=act(s,'a',{type:'roll'},0,rnd(0,1));assert.equal(s.debt.from,'b');assert.equal(s.debt.active,false);assert.equal(s.turn.deadline,null);assert.equal(s.debt.deadline,s.turn.lockUntil+30000);
 online(s,s.debt.deadline+1);maintain(s,s.debt.deadline+1,rnd(0,1));assert.equal(s.players[0].cash,1520);assert.equal(s.players[1].cash,20);assert.equal(s.players[2].cash,1490);assert.equal(s.debt,null);assert.equal(s.turn.playerId,'a');assert.equal(s.turn.phase,'end');assert.ok(s.turn.deadline>NOW+120000);assertState(s);
});
test('bankruptcy to bank queues property auctions and skips the bankrupt turn',()=>{
 let s=base(3);own(s,'a',1);s.players[0].cash=0;s.players[0].pos=1;s=act(s,'a',{type:'roll'},0,rnd(0,1));assert.equal(s.debt.to,'pot');online(s,s.debt.deadline+1);maintain(s,s.debt.deadline+1,rnd(0,1));assert.equal(s.players[0].bankrupt,true);assert.equal(s.auction.spaceId,1);assert.equal(s.deeds[1],null);
 const end=s.auction.deadline+1;online(s,end);maintain(s,end,rnd(0,1));assert.equal(s.turn.playerId,'b');assert.equal(s.turn.phase,'roll');assertState(s);
});
test('scarce houses create a contest window and then an auction with legal targets',()=>{
 let s=base(3);s.players.forEach(p=>p.cash=10000);own(s,'a',1,3);own(s,'b',6,8,9);own(s,'c',11,13,14,16,18,19);
 for(const i of [11,13,14,16,18,19])s.deeds[i].buildings=4;
 for(const i of [1,3])s.deeds[i].buildings=2;s.supply.houses=4;assertState(s);
 s=act(s,'a',{type:'build',spaceId:1});assert.equal(s.buildRequest.kind,'house');assert.equal(s.turn.deadline,null);
 s=act(s,'b',{type:'contest',spaceId:6},1000);assert.equal(s.auction.kind,'house');assert.equal(s.auction.leaderId,'b');assert.equal(s.auction.bid,51);assert.equal(s.auction.deadline,NOW+36000);
 tick(s,36001);assert.equal(s.deeds[6].buildings,1);assert.equal(s.supply.houses,3);assert.equal(s.players[1].cash,9949);assertState(s);
});
test('hotel liquidation with no bank houses sells the group legally',()=>{
 let s=base(3);own(s,'a',1,3);own(s,'b',6,8,9,11,13,14,16,18);s.deeds[1].buildings=5;s.deeds[3].buildings=5;s.supply.hotels=10;
 // Create a legal 32-house distribution among complete groups.
 own(s,'b',19);for(const i of [6,8,9,11,13,14])s.deeds[i].buildings=4;for(const i of [16,18])s.deeds[i].buildings=3;s.deeds[19].buildings=2;s.supply.houses=0;assertState(s);
 assert.throws(()=>act(s,'a',{type:'sell',spaceId:1}),/four houses/);s=act(s,'a',{type:'sellGroup',group:'brown'});assert.equal(s.players[0].cash,1750);assert.equal(s.supply.hotels,12);assertState(s);
});
test('expiry after a doubles roll does not grant an extra roll after mandatory auction',()=>{
 let s=base();s.turn.deadline=NOW+5;s.players[0].pos=1;s=act(s,'a',{type:'roll'},0,rnd(0,0));assert.equal(s.turn.phase,'purchase');assert.equal(s.players[0].pos,3);tick(s,1000);assert.ok(s.auction);tick(s,31001);assert.equal(s.turn.playerId,'b');assert.equal(s.turn.phase,'roll');
});


test('only the lobby host can remove a seat and its returning session',()=>{
 let s=newRoom({id:'room',code:'ABCDEF',playerId:'a',name:'Ada',tokenHash:'one',now:NOW});joinRoom(s,{playerId:'b',name:'Bea',tokenHash:'two',now:NOW});assert.throws(()=>act(s,'b',{type:'remove',playerId:'a'}),/host/);s=act(s,'a',{type:'remove',playerId:'b'});assert.equal(s.players.length,1);assert.equal(s.sessions.b,undefined);
});


test('dice and chained movement have ordered, compensated animation windows',()=>{
 let s=base();const deadline=s.turn.deadline;
 s=act(s,'a',{type:'roll'},0,rnd(0,1));
 assert.deepEqual(s.diceRoll.values,[1,2]);assert.equal(s.diceRoll.end,NOW+400);
 assert.equal(s.animations[0].start,s.diceRoll.end);assert.equal(s.turn.lockUntil,s.animations[0].end);
 assert.equal(s.turn.deadline-deadline,s.turn.lockUntil-NOW);
 assert.throws(()=>act(s,'a',{type:'buy'},s.turn.lockUntil-NOW-1),/moving/);
 s=act(s,'a',{type:'buy'},s.turn.lockUntil-NOW);assert.equal(s.deeds[3].ownerId,'a');
});
test('invalidation syncs are read-only until presence or a game deadline needs maintenance',()=>{
 let s=base();const first=act(s,'a',{type:'sync'},100);assert.deepEqual(first,s);
 const heartbeat=act(s,'a',{type:'sync'},15000);assert.equal(heartbeat.players[0].lastSeen,NOW+15000);
 s.players.forEach(p=>p.lastSeen=NOW+120001);const expired=act(s,'a',{type:'sync'},120001);assert.equal(expired.turn.playerId,'b');
});
