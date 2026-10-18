import {BOARD,GROUPS,COLORS,RISK,BONUS,CARDS,RULES_VERSION,money} from './data.mjs';
export class RuleError extends Error {}
const ok=(condition,message)=>{if(!condition)throw new RuleError(message);};
const copy=x=>structuredClone(x);
const int=(x,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
export const player=(s,id)=>s.players.find(p=>p.id===id);
const alive=s=>s.players.filter(p=>!p.bankrupt);
export const groupSpaces=g=>BOARD.filter(b=>b.group===g);
export const ownsGroup=(s,id,g)=>groupSpaces(g).every(b=>s.deeds[b.id]?.ownerId===id);
const hasBuildings=(s,g)=>groupSpaces(g).some(b=>s.deeds[b.id]?.buildings>0);
const allUnmortgaged=(s,g)=>groupSpaces(g).every(b=>!s.deeds[b.id]?.mortgaged);
export const owned=(s,id)=>BOARD.filter(b=>s.deeds[b.id]?.ownerId===id);
const held=s=>s.players.flatMap(p=>p.cards);
export function secureInt(max){
  ok(int(max,1,0x100000000),'Invalid random bound.');
  const limit=Math.floor(0x100000000/max)*max; let n;
  do {n=crypto.getRandomValues(new Uint32Array(1))[0];}while(n>=limit);
  return n%max;
}
export function shuffle(a,rng=secureInt){const b=[...a];for(let i=b.length-1;i>0;i--){const j=rng(i+1);[b[i],b[j]]=[b[j],b[i]];}return b;}
const dice=rng=>[rng(6)+1,rng(6)+1];
const log=(s,text,now,extra={})=>{s.seq++;s.log.push({id:s.seq,text,at:now,...extra});s.log=s.log.slice(-160);};
const enqueue=(s,...cmds)=>s.flow.push(...cmds);
const prepend=(s,...cmds)=>s.flow.unshift(...cmds);
const charge=(from,to,amount,reason)=>({type:'pay',from,to,amount,reason});
function pauseTurn(s,now){if(s.turn?.deadline!=null){s.turn.remaining=Math.max(0,s.turn.deadline-now);s.turn.deadline=null;}}
function resumeTurn(s,now){if(s.turn&&s.turn.deadline==null&&!s.auction&&!s.debt&&!s.buildRequest){s.turn.deadline=now+(s.turn.remaining??120000);s.turn.remaining=null;}}
function reserved(s,id){return s.auction?.leaderId===id?s.auction.bid:0;}
export const spendable=(s,id)=>Math.max(0,player(s,id).cash-reserved(s,id));
const addCash=(s,id,n)=>{const p=player(s,id);if(p&&!p.bankrupt)p.cash+=n;};
function transferPayment(s,c,now){
  const p=player(s,c.from);if(!p||p.bankrupt)return;
  p.cash-=c.amount;
  if(c.to==='pot')s.pot+=c.amount;else if(c.to!=='bank')addCash(s,c.to,c.amount);
  log(s,`${p.name} paid ${money(c.amount)} ${c.to==='pot'?'into Free Parking':c.to==='bank'?'to the bank':`to ${player(s,c.to)?.name??'the bank'}`} · ${c.reason}.`,now);
}
export function newRoom({id,code,playerId,name,tokenHash,now=Date.now()}){
  ok(typeof name==='string'&&name.trim().length>=1&&name.trim().length<=24,'Use a name of 1–24 characters.');
  const s={schema:RULES_VERSION,id,code,status:'lobby',createdAt:now,hostId:playerId,players:[],sessions:{},deeds:Array(40).fill(null),supply:{houses:32,hotels:12},pot:0,turn:null,auction:null,buildRequest:null,debt:null,flow:[],risk:[],bonus:[],trades:[],chat:[],log:[],seq:0,animations:[],requests:[]};
  joinRoom(s,{playerId,name,tokenHash,now});return s;
}
export function joinRoom(s,{playerId,name,tokenHash,now}){
  ok(s.status==='lobby','This game has started. Only returning players can reconnect.');
  ok(s.players.length<8,'This room already has eight players.');
  ok(typeof name==='string'&&name.trim().length>=1&&name.trim().length<=24,'Use a name of 1–24 characters.');
  ok(!s.players.some(p=>p.name.toLowerCase()===name.trim().toLowerCase()),'That name is already in this room.');
  s.players.push({id:playerId,name:name.trim(),color:null,ready:false,cash:1500,pos:0,inJail:false,jailTurns:0,cards:[],bankrupt:false,lastSeen:now,graceUsed:false,finishPlace:null});
  s.sessions[playerId]=tokenHash;log(s,`${name.trim()} joined the room.`,now);
}
function start(s,actor,now,rng){
  ok(s.hostId===actor,'Only the host can start.');ok(s.status==='lobby','The game has already started.');
  ok(s.players.length>=2,'You need at least two players.');
  ok(s.players.every(p=>p.ready&&p.color),'Everyone must choose a color and be ready.');
  ok(new Set(s.players.map(p=>p.color)).size===s.players.length,'Choose different colors.');
  s.status='playing';
  let contenders=s.players.map(p=>p.id),winner;let attempts=0;
  do{const rolls=contenders.map(id=>({id,dice:dice(rng)}));for(const r of rolls)log(s,`${player(s,r.id).name} rolled ${r.dice.join(' + ')} for starting order.`,now);
    const max=Math.max(...rolls.map(r=>r.dice[0]+r.dice[1]));contenders=rolls.filter(r=>r.dice[0]+r.dice[1]===max).map(r=>r.id);attempts++;
  }while(contenders.length>1&&attempts<100);
  s.risk=shuffle(RISK.map(c=>c.id),rng);s.bonus=shuffle(BONUS.map(c=>c.id),rng);
  winner=contenders[0];const n=s.players.findIndex(p=>p.id===winner);s.players=[...s.players.slice(n),...s.players.slice(0,n)];
  setTurn(s,winner,now);log(s,`${player(s,winner).name} goes first. The game is on.`,now);
}
function setTurn(s,id,now){
  const p=player(s,id);s.turn={playerId:id,phase:p.inJail?'jail':'roll',deadline:now+120000,remaining:null,doubles:0,extraRoll:false,expired:false,lockUntil:now,lastRoll:null,debtExtensionUsed:false,grace:null};
  log(s,`${p.name}'s turn.`,now);
}
function nextTurn(s,now){
  if(s.status!=='playing')return;
  const i=s.players.findIndex(p=>p.id===s.turn.playerId);for(let k=1;k<=s.players.length;k++){const p=s.players[(i+k)%s.players.length];if(!p.bankrupt){setTurn(s,p.id,now);return;}}
}
function finishRoll(s,now){
  if(s.status!=='playing')return;
  const p=player(s,s.turn.playerId);
  if(p.bankrupt){nextTurn(s,now);return;}
  if(s.turn.expired||s.turn.deadline!=null&&now>=s.turn.deadline){s.turn.expired=true;nextTurn(s,Math.max(now,s.turn.lockUntil));return;}
  s.turn.phase=s.turn.extraRoll&&!p.inJail?'roll':'end';
}
function animate(s,id,path,now){
  const begin=Math.max(now,s.turn?.lockUntil??now),duration=Math.max(260,path.length*90);
  s.animations.push({id:s.seq+':'+s.animations.length,playerId:id,path,start:begin,end:begin+duration});s.animations=s.animations.filter(a=>a.end>now-20000).slice(-12);
  if(s.turn){s.turn.lockUntil=begin+duration;if(s.turn.deadline!=null)s.turn.deadline+=duration;else s.turn.remaining=(s.turn.remaining??0)+duration;}
}
function sendJail(s,id,now){const p=player(s,id);animate(s,id,[p.pos,10],now);p.pos=10;p.inJail=true;p.jailTurns=0;if(s.turn?.playerId===id)s.turn.extraRoll=false;log(s,`${p.name} went to Jail.`,now);}
function move(s,id,steps,now,options={}){
  const p=player(s,id);if(!p||p.bankrupt)return;
  const path=[p.pos],old=p.pos;let pos=old;
  for(let i=0;i<Math.abs(steps);i++){pos=(pos+(steps<0?-1:1)+40)%40;path.push(pos);if(pos===0&&steps>0){p.cash+=200;log(s,`${p.name} collected $200 at GO.`,now);}}
  p.pos=pos;animate(s,id,path,now);log(s,`${p.name} landed on ${BOARD[pos].name}.`,now);prepend(s,{type:'land',id,options});
}
export function rent(s,spaceId,total=0,options={}){
  const b=BOARD[spaceId],d=s.deeds[spaceId];if(!d||d.mortgaged)return 0;
  if(b.kind==='city')return d.buildings?b.rents[d.buildings]:b.rents[0]*(ownsGroup(s,d.ownerId,b.group)?2:1);
  if(b.kind==='airport'){const count=owned(s,d.ownerId).filter(x=>x.kind==='airport').length;return 25*2**(count-1)*(options.doubleAirport?2:1);}
  const count=owned(s,d.ownerId).filter(x=>x.kind==='network').length;return total*(options.tenNetwork||count===2?10:4);
}
function land(s,id,options,now,rng){
  const p=player(s,id),b=BOARD[p.pos],d=s.deeds[p.pos];
  if(b.price){
    if(!d){s.turn.phase='purchase';s.turn.purchase={spaceId:b.id,playerId:id};return;}
    if(d.ownerId!==id&&!d.mortgaged){let total=s.turn.lastRoll?.reduce((a,b)=>a+b,0)??0;
      if(b.kind==='network'&&options.tenNetwork){const roll=dice(rng);total=roll[0]+roll[1];log(s,`Network rent roll: ${roll.join(' + ')}.`,now);}
      prepend(s,charge(id,d.ownerId,rent(s,b.id,total,options),`rent at ${b.name}`));}
  }else if(b.kind==='tax')prepend(s,charge(id,'pot',b.amount,b.name));
  else if(b.kind==='risk'||b.kind==='bonus')drawCard(s,id,b.kind,now);
  else if(b.kind==='gojail')sendJail(s,id,now);
  else if(b.kind==='parking'){p.cash+=s.pot;log(s,`${p.name} collected the ${money(s.pot)} Free Parking pot.`,now);s.pot=0;}
}
function drawCard(s,id,deck,now){
  const cardId=s[deck].shift(),c=CARDS[cardId],p=player(s,id);ok(c,'The card deck is unavailable.');
  if(c.effect!=='escape')s[deck].push(cardId);else p.cards.push(cardId);
  s.lastCard={id:cardId,playerId:id,at:now};log(s,`${deck==='risk'?'Risk':'Bonus'} · ${p.name}: ${c.text}`,now);
  switch(c.effect){
    case 'advance': {const steps=(c.to-p.pos+40)%40;prepend(s,{type:'move',id,steps:steps||40,options:{}});break;}
    case 'back':prepend(s,{type:'move',id,steps:-c.steps,options:{}});break;
    case 'airport':case 'network':{const targets=BOARD.filter(b=>b.kind===c.effect);const to=targets.find(b=>b.id>p.pos)??targets[0];prepend(s,{type:'move',id,steps:(to.id-p.pos+40)%40,options:{doubleAirport:c.effect==='airport',tenNetwork:c.effect==='network'}});break;}
    case 'gain':p.cash+=c.amount;break;
    case 'pay':prepend(s,charge(id,'pot',c.amount,'card fee'));break;
    case 'jail':sendJail(s,id,now);break;
    case 'repairs':{const ds=owned(s,id).map(b=>s.deeds[b.id]);const amount=ds.reduce((n,d)=>n+(d.buildings===5?c.hotel:d.buildings*c.house),0);if(amount)prepend(s,charge(id,'pot',amount,'repairs'));break;}
    case 'payAll':prepend(s,...alive(s).filter(x=>x.id!==id).map(x=>charge(id,x.id,c.amount,'card payment')));break;
    case 'collectAll':prepend(s,...alive(s).filter(x=>x.id!==id).map(x=>charge(x.id,id,c.amount,'birthday card')));break;
  }
}
function beginDebt(s,c,now){
  const active=c.from===s.turn.playerId;
  if(active){if(!s.turn.debtExtensionUsed){s.turn.deadline=Math.max(now,s.turn.deadline??now)+30000;s.turn.debtExtensionUsed=true;}}
  else pauseTurn(s,now);
  s.debt={...c,deadline:active?s.turn.deadline:Math.max(now,s.turn.lockUntil)+30000,active};s.turn.phase='debt';
  log(s,`${player(s,c.from).name} needs ${money(c.amount)} for ${c.reason}. Liquidate or trade before the debt clock expires.`,now);
}
function settleDebt(s,now){
  if(!s.debt)return;
  const c=s.debt,p=player(s,c.from);if(p.bankrupt){s.debt=null;resumeTurn(s,now);return;}
  if(p.cash>=c.amount){transferPayment(s,c,now);s.debt=null;resumeTurn(s,now);s.turn.phase='resolve';}
}
function drain(s,now,rng){
  let count=0;
  while(s.status==='playing'&&!s.debt&&!s.auction&&!s.buildRequest&&s.turn?.phase!=='purchase'&&s.flow.length){
    ok(++count<180,'Too many chained game effects.');
    const c=s.flow.shift();
    if(c.type==='pay'){const p=player(s,c.from);if(!p||p.bankrupt||c.amount===0)continue;
      if(c.to!=='bank'&&c.to!=='pot'&&player(s,c.to)?.bankrupt)continue;
      if(p.cash>=c.amount)transferPayment(s,c,now);else beginDebt(s,c,now);
    }else if(c.type==='move')move(s,c.id,c.steps,now,c.options);
    else if(c.type==='land')land(s,c.id,c.options??{},now,rng);
    else if(c.type==='jail')sendJail(s,c.id,now);
    else if(c.type==='releaseMove'){const p=player(s,c.id);if(!p.bankrupt){p.inJail=false;p.jailTurns=0;move(s,c.id,c.steps,now);}}
    else if(c.type==='release'){const p=player(s,c.id);if(!p.bankrupt){p.inJail=false;p.jailTurns=0;s.turn.phase='roll';}}
    else if(c.type==='finish')finishRoll(s,now);
    else if(c.type==='auction')openAuction(s,{kind:'deed',spaceId:c.spaceId},now);
    else if(c.type==='mortgageFees'){
      const p=player(s,c.id);if(p.bankrupt)continue;const targets=c.ids.filter(i=>s.deeds[i]?.ownerId===p.id&&s.deeds[i].mortgaged);
      for(const i of targets)s.deeds[i].interestPaidUntil=now+30000;
      prepend(s,...targets.map(i=>charge(p.id,'bank',Math.ceil(BOARD[i].mortgage*.1),'mortgage transfer interest')));
    }
  }
}
function roll(s,id,now,rng){
  const t=s.turn,p=player(s,id);ok(t.playerId===id,'It is not your turn.');ok(['roll','jail'].includes(t.phase),'Finish the current decision first.');
  ok(now>=t.lockUntil,'The pieces are still moving.');const ds=dice(rng),total=ds[0]+ds[1],double=ds[0]===ds[1];t.lastRoll=ds;t.phase='resolve';
  log(s,`${p.name} rolled ${ds.join(' + ')}.`,now);
  if(p.inJail){p.jailTurns++;t.extraRoll=false;
    if(double){p.inJail=false;p.jailTurns=0;enqueue(s,{type:'move',id,steps:total},{type:'finish'});}
    else if(p.jailTurns>=3)enqueue(s,charge(id,'pot',50,'Jail release'),{type:'releaseMove',id,steps:total},{type:'finish'});
    else enqueue(s,{type:'finish'});
  }else{t.doubles=double?t.doubles+1:0;t.extraRoll=double;
    if(t.doubles>=3)enqueue(s,{type:'jail',id},{type:'finish'});else enqueue(s,{type:'move',id,steps:total},{type:'finish'});}
  drain(s,now,rng);
}
function openAuction(s,lot,now,initial={}){
  pauseTurn(s,now);s.auction={...lot,id:crypto.randomUUID(),deadline:now+30000,bid:initial.bid??0,leaderId:initial.leaderId??null,target:initial.target??null,previousPhase:s.turn.phase,bids:0};
  s.turn.phase='auction';log(s,`${lot.kind==='deed'?BOARD[lot.spaceId].name:lot.kind==='house'?'One house':'One hotel'} is up for auction. Each bid adds five seconds.`,now);
}
function finishAuction(s,now,rng){
  const a=s.auction;s.auction=null;
  if(a.leaderId){const p=player(s,a.leaderId);ok(!p.bankrupt&&p.cash>=a.bid,'Auction reserve was violated.');p.cash-=a.bid;
    if(a.kind==='deed')s.deeds[a.spaceId]={ownerId:p.id,buildings:0,mortgaged:false};
    else applyBuild(s,p.id,a.target);
    log(s,`${p.name} won ${a.kind==='deed'?BOARD[a.spaceId].name:a.kind==='house'?'a house':'a hotel'} for ${money(a.bid)}.`,now);
  }else log(s,'The auction ended without a bid.',now);
  s.turn.phase=a.previousPhase;resumeTurn(s,now);drain(s,now,rng);
}
function bid(s,id,amount,target,now){
  const a=s.auction;ok(a,'There is no active auction.');ok(now<a.deadline,'This auction has ended.');ok(!player(s,id).bankrupt,'Spectators cannot bid.');
  ok(a.leaderId!==id,'You already have the highest bid.');
  const minimum=a.leaderId?a.bid+1:a.kind==='deed'?10:BOARD[target]?.build;
  ok(int(amount,minimum??1),'Enter a whole-dollar bid at or above the minimum.');ok(player(s,id).cash>=amount,'You do not have enough cash.');
  if(a.kind!=='deed'){ok(canBuild(s,id,target,true), 'Choose a property where you can legally build.');ok((s.deeds[target].buildings===4?'hotel':'house')===a.kind,'Choose a property for this building type.');}
  a.bid=amount;a.leaderId=id;a.target=a.kind==='deed'?null:target;a.deadline+=5000;a.bids++;
  log(s,`${player(s,id).name} bid ${money(amount)}. +5 seconds.`,now);
}
export function canBuild(s,id,spaceId,ignoreCash=false){
  const b=BOARD[spaceId],d=s.deeds[spaceId];if(!b||b.kind!=='city'||!d||d.ownerId!==id||d.buildings>=5)return false;
  if(!ownsGroup(s,id,b.group)||!allUnmortgaged(s,b.group)||s.debt||player(s,id).bankrupt)return false;
  if(s.auction?.kind==='deed')return false;
  const levels=groupSpaces(b.group).map(x=>s.deeds[x.id].buildings);
  if(d.buildings!==Math.min(...levels))return false;
  if(d.buildings===4?s.supply.hotels<1:s.supply.houses<1)return false;
  return ignoreCash||spendable(s,id)>=b.build;
}
function applyBuild(s,id,spaceId){
  const d=s.deeds[spaceId];if(d.buildings===4){s.supply.houses+=4;s.supply.hotels--;}else s.supply.houses--;
  d.buildings++;
}
function build(s,id,spaceId,now){
  ok(!s.auction&&!s.buildRequest&&!s.debt,'Finish the current auction or debt first.');ok(canBuild(s,id,spaceId),'You cannot build here. Own the full unmortgaged group, build evenly, and keep enough cash.');
  const kind=s.deeds[spaceId].buildings===4?'hotel':'house',scarce=s.supply[kind==='house'?'houses':'hotels']<=(kind==='house'?4:2);
  const competitors=alive(s).filter(p=>p.id!==id).some(p=>BOARD.some(b=>canBuild(s,p.id,b.id)&&((s.deeds[b.id].buildings===4?'hotel':'house')===kind)));
  if(scarce&&competitors){pauseTurn(s,now);s.buildRequest={kind,playerId:id,target:spaceId,deadline:now+5000,previousPhase:s.turn.phase};s.turn.phase='building';log(s,`${player(s,id).name} requested a scarce ${kind}. Other eligible builders have five seconds to contest.`,now);}
  else{player(s,id).cash-=BOARD[spaceId].build;applyBuild(s,id,spaceId);log(s,`${player(s,id).name} built at ${BOARD[spaceId].name}.`,now);}
}
function sell(s,id,spaceId,now){
  const b=BOARD[spaceId],d=s.deeds[spaceId];ok(b?.kind==='city'&&d?.ownerId===id&&d.buildings>0,'There is no building of yours to sell here.');
  ok(d.buildings===Math.max(...groupSpaces(b.group).map(x=>s.deeds[x.id]?.buildings??0)),'Sell buildings evenly across the group.');
  if(d.buildings===5){ok(s.supply.houses>=4,'The bank needs four houses to replace this hotel. Sell all buildings in this group instead.');s.supply.hotels++;s.supply.houses-=4;}else s.supply.houses++;
  d.buildings--;player(s,id).cash+=b.build/2;log(s,`${player(s,id).name} sold a building at ${b.name}.`,now);
}
function sellGroup(s,id,g,now){
  const spaces=groupSpaces(g);ok(spaces.length&&ownsGroup(s,id,g)&&hasBuildings(s,g),'You have no developed full group here.');
  let value=0;for(const b of spaces){const d=s.deeds[b.id];value+=d.buildings*b.build/2;if(d.buildings===5)s.supply.hotels++;else s.supply.houses+=d.buildings;d.buildings=0;}
  player(s,id).cash+=value;log(s,`${player(s,id).name} sold all buildings in ${GROUPS[g].country} for ${money(value)}.`,now);
}
function mortgage(s,id,i,now){
  const b=BOARD[i],d=s.deeds[i];ok(d?.ownerId===id&&!d.mortgaged,'You cannot mortgage this property.');ok(!b.group||!hasBuildings(s,b.group),'Sell every building in this color group first.');
  d.mortgaged=true;delete d.interestPaidUntil;player(s,id).cash+=b.mortgage;log(s,`${player(s,id).name} mortgaged ${b.name}.`,now);
}
export function redemptionCost(s,i,now){const b=BOARD[i],d=s.deeds[i];return b.mortgage+(d.interestPaidUntil>now?0:Math.ceil(b.mortgage*.1));}
function redeem(s,id,i,now){const b=BOARD[i],d=s.deeds[i];ok(d?.ownerId===id&&d.mortgaged,'You do not own this mortgaged property.');const cost=redemptionCost(s,i,now);ok(spendable(s,id)>=cost,'You need more available cash.');player(s,id).cash-=cost;d.mortgaged=false;delete d.interestPaidUntil;log(s,`${player(s,id).name} redeemed ${b.name} for ${money(cost)}.`,now);}
function checkWinner(s,now){
  const active=alive(s);if(active.length!==1)return;
  s.status='finished';s.winnerId=active[0].id;active[0].finishPlace=1;s.auction=null;s.debt=null;s.flow=[];s.buildRequest=null;s.turn=null;
  for(const t of s.trades)if(t.status==='pending')t.status='expired';log(s,`${active[0].name} is the Baron!`,now);
}
function bankrupt(s,id,to,now){
  const p=player(s,id);if(!p||p.bankrupt)return;
  for(const g of Object.keys(GROUPS))if(ownsGroup(s,id,g)&&hasBuildings(s,g))sellGroup(s,id,g,now);
  const creditor=player(s,to);if(creditor&&!creditor.bankrupt)creditor.cash+=p.cash;else if(to==='pot')s.pot+=p.cash;
  p.cash=0;p.bankrupt=true;p.finishPlace=alive(s).length+1;p.inJail=false;
  const ids=owned(s,id).map(b=>b.id),mortgages=[];
  for(const i of ids){if(creditor&&!creditor.bankrupt){s.deeds[i].ownerId=to;if(s.deeds[i].mortgaged)mortgages.push(i);}else s.deeds[i]=null;}
  for(const card of p.cards){if(creditor&&!creditor.bankrupt)creditor.cards.push(card);else s[card[0]==='r'?'risk':'bonus'].push(card);}p.cards=[];
  for(const t of s.trades)if(t.status==='pending'&&(t.fromId===id||t.toId===id))t.status='expired';
  log(s,`${p.name} is bankrupt${creditor?` to ${creditor.name}`:''}.`,now);
  if(s.debt?.from===id){s.debt=null;resumeTurn(s,now);if(s.turn)s.turn.phase='resolve';}
  checkWinner(s,now);if(s.status!=='playing')return;
  if(mortgages.length)prepend(s,{type:'mortgageFees',id:to,ids:mortgages});
  if(!creditor)prepend(s,...ids.map(spaceId=>({type:'auction',spaceId})));
  if(s.turn.playerId===id&&!s.flow.some(c=>c.type==='finish'))enqueue(s,{type:'finish'});
}
function autoLiquidate(s,now){
  const c=s.debt;if(!c)return;const p=player(s,c.from);
  // Sell only what is needed, at a legal even-building maximum each step.
  for(let count=0;p.cash<c.amount&&count<200;count++){
    const candidates=owned(s,p.id).filter(b=>s.deeds[b.id].buildings>0&&s.deeds[b.id].buildings===Math.max(...groupSpaces(b.group).map(x=>s.deeds[x.id]?.buildings??0))).sort((a,b)=>b.build-a.build||a.id-b.id);
    if(!candidates.length)break;const b=candidates[0];
    if(s.deeds[b.id].buildings===5&&s.supply.houses<4)sellGroup(s,p.id,b.group,now);else sell(s,p.id,b.id,now);
  }
  for(const b of owned(s,p.id).filter(b=>!s.deeds[b.id].mortgaged&&(!b.group||!hasBuildings(s,b.group))).sort((a,b)=>b.mortgage-a.mortgage||a.id-b.id)){
    if(p.cash>=c.amount)break;mortgage(s,p.id,b.id,now);
  }
  if(p.cash>=c.amount)settleDebt(s,now);else bankrupt(s,p.id,c.to,now);
}
function validateAssets(s,id,a){
  ok(a&&int(a.cash)&&Array.isArray(a.deeds)&&Array.isArray(a.cards),'Invalid trade assets.');
  ok(new Set(a.deeds).size===a.deeds.length&&new Set(a.cards).size===a.cards.length,'Do not select an asset twice.');
  ok(a.deeds.length<=28&&a.cards.length<=2,'Invalid asset count.');
  for(const i of a.deeds){ok(int(i,0,39)&&s.deeds[i]?.ownerId===id,'A selected property is no longer owned by that player.');ok(!BOARD[i].group||!hasBuildings(s,BOARD[i].group),'Buildings must be removed from the entire group before a deed is traded.');}
  for(const c of a.cards)ok(player(s,id).cards.includes(c),'A selected card is no longer held by that player.');
}
function makeTrade(s,id,a,now){
  ok(!s.auction&&!s.buildRequest,'Trading pauses during an auction.');const to=player(s,a.toId);ok(to&&!to.bankrupt&&to.id!==id,'Choose another active player.');
  validateAssets(s,id,a.give);validateAssets(s,to.id,a.receive);
  ok(a.give.cash<=spendable(s,id)&&a.receive.cash<=spendable(s,to.id),'The selected cash is unavailable.');
  ok(a.give.cash+a.receive.cash+a.give.deeds.length+a.receive.deeds.length+a.give.cards.length+a.receive.cards.length>0,'Select something to trade.');
  ok(typeof(a.note??'')==='string'&&(a.note??'').length<=500,'Trade notes can contain up to 500 characters.');
  ok(s.trades.filter(t=>t.fromId===id&&t.status==='pending').length<8,'Resolve some existing offers first.');
  if(a.counterId){const t=s.trades.find(t=>t.id===a.counterId);ok(t?.status==='pending'&&t.toId===id&&t.fromId===a.toId,'This offer cannot be countered.');t.status='countered';}
  s.trades.push({id:crypto.randomUUID(),fromId:id,toId:a.toId,give:copy(a.give),receive:copy(a.receive),note:(a.note??'').trim(),status:'pending',createdAt:now,expiresAt:now+600000});s.trades=s.trades.slice(-80);
  log(s,`${player(s,id).name} offered a trade to ${to.name}.`,now);
}
function acceptTrade(s,id,a,now){
  ok(!s.auction&&!s.buildRequest,'Trading pauses during auctions.');const t=s.trades.find(t=>t.id===a.tradeId);ok(t&&t.toId===id&&t.status==='pending'&&t.expiresAt>now,'This offer is unavailable.');
  const p=player(s,t.fromId),q=player(s,t.toId);ok(!p.bankrupt&&!q.bankrupt,'A player is no longer active.');validateAssets(s,p.id,t.give);validateAssets(s,q.id,t.receive);
  const fees=assets=>assets.deeds.reduce((n,i)=>n+(s.deeds[i].mortgaged?Math.ceil(BOARD[i].mortgage*.1):0),0);
  const pCash=p.cash-t.give.cash+t.receive.cash-fees(t.receive),qCash=q.cash-t.receive.cash+t.give.cash-fees(t.give);
  ok(p.cash>=t.give.cash&&q.cash>=t.receive.cash&&pCash>=0&&qCash>=0,'This trade cannot cover its cash and mortgage-transfer interest.');
  p.cash=pCash;q.cash=qCash;
  for(const [from,to,assets] of [[p,q,t.give],[q,p,t.receive]]){
    for(const i of assets.deeds){s.deeds[i].ownerId=to.id;if(s.deeds[i].mortgaged)s.deeds[i].interestPaidUntil=now+30000;}
    for(const c of assets.cards){from.cards=from.cards.filter(x=>x!==c);to.cards.push(c);}
  }
  t.status='accepted';log(s,`${p.name} and ${q.name} completed a trade. Mortgage-transfer interest was paid where applicable.`,now);
  for(const other of s.trades)if(other.status==='pending'){
    try{validateAssets(s,other.fromId,other.give);validateAssets(s,other.toId,other.receive);}catch{other.status='expired';}
  }
}
function releaseJail(s,id,cardId,now){
  const p=player(s,id);ok(s.turn.playerId===id&&s.turn.phase==='jail'&&p.inJail,'You cannot use a Jail release now.');
  s.turn.phase='resolve';if(cardId){ok(p.cards.includes(cardId),'You do not hold this card.');p.cards=p.cards.filter(x=>x!==cardId);s[cardId[0]==='r'?'risk':'bonus'].push(cardId);p.inJail=false;p.jailTurns=0;s.turn.phase='roll';log(s,`${p.name} used a Jail release card.`,now);}
  else enqueue(s,charge(id,'pot',50,'Jail release'),{type:'release',id});
}
export function maintain(s,now=Date.now(),rng=secureInt){
  for(const t of s.trades)if(t.status==='pending'&&t.expiresAt<=now)t.status='expired';
  const host=player(s,s.hostId);if(!host||now-host.lastSeen>30000){const candidate=s.players.find(p=>!p.bankrupt&&now-p.lastSeen<25000);if(candidate&&candidate.id!==s.hostId){s.hostId=candidate.id;log(s,`${candidate.name} is now the host.`,now);}}
  if(s.status!=='playing')return s;
  const t=s.turn;
  // Only the player holding a normal/debt decision gets a reconnect pause. Auctions keep moving.
  const decision=player(s,s.debt?.from??t.playerId);
  if(!s.auction&&!s.buildRequest&&decision){
    if(t.grace){
      if(now-decision.lastSeen<25000||now>=t.grace.until){
        const unused=Math.max(0,t.grace.until-now);if(s.debt)s.debt.deadline-=unused;if(t.deadline!=null)t.deadline-=unused;
        log(s,now-decision.lastSeen<25000?`${decision.name} reconnected.`:`${decision.name}'s reconnect grace ended.`,now);t.grace=null;
      }else return s;
    }else if(!decision.graceUsed&&now-decision.lastSeen>=25000){
      decision.graceUsed=true;t.grace={playerId:decision.id,until:now+30000};if(t.deadline!=null)t.deadline+=30000;if(s.debt)s.debt.deadline+=30000;
      log(s,`${decision.name} disconnected. Their one 30-second reconnect grace is running.`,now);return s;
    }
  }
  if(s.buildRequest&&now>=s.buildRequest.deadline){
    const r=s.buildRequest;s.buildRequest=null;
    if(canBuild(s,r.playerId,r.target)){player(s,r.playerId).cash-=BOARD[r.target].build;applyBuild(s,r.playerId,r.target);log(s,`${player(s,r.playerId).name} bought the unchallenged ${r.kind}.`,now);}
    s.turn.phase=r.previousPhase;resumeTurn(s,now);
  }
  if(s.auction&&now>=s.auction.deadline)finishAuction(s,now,rng);
  if(s.status!=='playing')return s;
  settleDebt(s,now);if(s.debt&&now>=s.debt.deadline){log(s,'The debt clock expired. Automatic liquidation begins.',now);autoLiquidate(s,now);}
  if(s.status!=='playing')return s;
  drain(s,now,rng);
  if(s.status!=='playing'||s.auction||s.debt||s.buildRequest)return s;
  const current=s.turn;
  if(current.deadline!=null&&now>=current.deadline&&now>=current.lockUntil){
    current.expired=true;log(s,`${player(s,current.playerId).name}'s turn clock expired.`,now);
    if(current.phase==='purchase'){
      const {spaceId}=current.purchase;delete current.purchase;openAuction(s,{kind:'deed',spaceId},now);s.auction.previousPhase='resolve';if(!s.flow.some(c=>c.type==='finish'))enqueue(s,{type:'finish'});
    }else if(s.flow.length){current.phase='resolve';drain(s,now,rng);}
    else if(current.phase==='jail'&&player(s,current.playerId).inJail){
      const p=player(s,current.playerId);p.jailTurns++;
      if(p.jailTurns>=3){current.phase='resolve';enqueue(s,charge(p.id,'pot',50,'third Jail turn'),{type:'release',id:p.id},{type:'finish'});drain(s,now,rng);}else nextTurn(s,now);
    }else nextTurn(s,now);
  }
  return s;
}
export function transition(source,id,a,now=Date.now(),rng=secureInt){
  const s=copy(source);const p=player(s,id);ok(p,'Your player session is not in this room.');
  // Update presence before maintenance so a returning tab reclaims its unused grace.
  p.lastSeen=now;maintain(s,now,rng);
  if(a.type==='sync')return s;
  if(a.type==='chat'){
    ok(typeof a.text==='string'&&a.text.trim().length>0&&a.text.length<=500,'Messages can contain 1–500 characters.');
    ok(s.chat.filter(m=>m.playerId===id&&m.at>now-5000).length<5,'Give others a moment to chat.');
    s.chat.push({id:crypto.randomUUID(),playerId:id,text:a.text.trim(),at:now});s.chat=s.chat.slice(-120);return s;
  }
  if(a.type==='leave'){
    if(s.status==='lobby'){s.players=s.players.filter(x=>x.id!==id);delete s.sessions[id];if(s.hostId===id)s.hostId=s.players[0]?.id??null;log(s,`${p.name} left the lobby.`,now);}
    else if(s.status==='playing'){ok(!s.auction&&!s.buildRequest,'Wait until the current auction finishes before surrendering.');bankrupt(s,id,s.debt?.from===id?s.debt.to:'bank',now);drain(s,now,rng);}
    return s;
  }
  if(s.status==='lobby'){
    if(a.type==='color'){ok(COLORS.some(c=>c.id===a.color),'Choose one of the twelve colors.');ok(!s.players.some(x=>x.id!==id&&x.color===a.color),'That color is already taken.');p.color=a.color;p.ready=false;}
    else if(a.type==='ready'){ok(p.color,'Choose a color first.');p.ready=!!a.ready;}
    else if(a.type==='host'){ok(s.hostId===id&&player(s,a.playerId),'Only the host can transfer leadership.');s.hostId=a.playerId;}
    else if(a.type==='remove'){ok(s.hostId===id&&a.playerId!==id&&player(s,a.playerId),'Only the host can remove another lobby player.');const target=player(s,a.playerId);s.players=s.players.filter(p=>p.id!==target.id);delete s.sessions[target.id];log(s,`${target.name} was removed from the lobby.`,now);}
    else if(a.type==='start')start(s,id,now,rng);else throw new RuleError('That action is unavailable in the lobby.');
    return s;
  }
  if(s.status==='finished'){
    ok(a.type==='rematch'&&s.hostId===id,'The host can open a rematch lobby.');
    s.status='lobby';s.deeds=Array(40).fill(null);s.supply={houses:32,hotels:12};s.pot=0;s.trades=[];s.flow=[];s.risk=[];s.bonus=[];s.winnerId=null;s.lastCard=null;s.animations=[];
    for(const p of s.players)Object.assign(p,{cash:1500,pos:0,inJail:false,jailTurns:0,cards:[],bankrupt:false,ready:false,graceUsed:false,finishPlace:null});return s;
  }
  ok(!p.bankrupt,'You are watching this game.');ok(!s.turn.grace,'Waiting for a reconnect grace to finish.');ok(now>=s.turn.lockUntil,'The pieces are still moving.');
  if(a.type==='bid')bid(s,id,a.amount,a.target,now);
  else if(a.type==='contest'){
    const r=s.buildRequest;ok(r&&r.playerId!==id&&canBuild(s,id,a.spaceId),'You cannot contest this building request.');ok((s.deeds[a.spaceId].buildings===4?'hotel':'house')===r.kind,'Choose the same building type.');
    s.buildRequest=null;openAuction(s,{kind:r.kind},now,{bid:BOARD[r.target].build,leaderId:r.playerId,target:r.target});s.auction.previousPhase=r.previousPhase;bid(s,id,Math.max(BOARD[a.spaceId].build,BOARD[r.target].build+1),a.spaceId,now);
  }else if(a.type==='tradeOffer')makeTrade(s,id,a,now);
  else if(a.type==='tradeAccept')acceptTrade(s,id,a,now);
  else if(a.type==='tradeReject'||a.type==='tradeCancel'){
    const t=s.trades.find(t=>t.id===a.tradeId);ok(t?.status==='pending'&&(a.type==='tradeReject'?t.toId===id:t.fromId===id),'That offer cannot be changed.');t.status=a.type==='tradeReject'?'rejected':'cancelled';
  }else{
    ok(!s.auction&&!s.buildRequest,'The auction must finish first.');
    if(['build','redeem'].includes(a.type))ok(!s.debt,'Resolve the outstanding debt first.');
    switch(a.type){
      case 'roll':ok(!s.debt,'Resolve your debt first.');roll(s,id,now,rng);break;
      case 'buy':case 'decline':{
        ok(!s.debt&&s.turn.playerId===id&&s.turn.phase==='purchase','There is no purchase decision for you.');const i=s.turn.purchase.spaceId,b=BOARD[i];
        if(a.type==='buy'){ok(spendable(s,id)>=b.price,'You need more cash to purchase this property.');p.cash-=b.price;s.deeds[i]={ownerId:id,buildings:0,mortgaged:false};log(s,`${p.name} bought ${b.name} for ${money(b.price)}.`,now);s.turn.phase='resolve';delete s.turn.purchase;drain(s,now,rng);}
        else{s.turn.phase='resolve';delete s.turn.purchase;openAuction(s,{kind:'deed',spaceId:i},now);}break;
      }
      case 'end':ok(!s.debt&&s.turn.playerId===id&&s.turn.phase==='end','Finish your roll and required decisions first.');nextTurn(s,now);break;
      case 'jailPay':releaseJail(s,id,null,now);drain(s,now,rng);break;
      case 'jailCard':releaseJail(s,id,a.cardId,now);break;
      case 'build':build(s,id,a.spaceId,now);break;
      case 'sell':sell(s,id,a.spaceId,now);break;
      case 'sellGroup':sellGroup(s,id,a.group,now);break;
      case 'mortgage':mortgage(s,id,a.spaceId,now);break;
      case 'redeem':redeem(s,id,a.spaceId,now);break;
      default:throw new RuleError('Unknown game action.');
    }
  }
  settleDebt(s,now);drain(s,now,rng);assertState(s);return s;
}
export function publicState(s,viewerId,now=Date.now()){
  // Explicit allowlist: never reveal credential hashes, deck order, or request history.
  return {schema:s.schema,id:s.id,code:s.code,status:s.status,hostId:s.hostId,createdAt:s.createdAt,players:s.players.map(p=>({id:p.id,name:p.name,color:p.color,ready:p.ready,cash:p.cash,pos:p.pos,inJail:p.inJail,jailTurns:p.jailTurns,cards:p.cards,bankrupt:p.bankrupt,graceUsed:p.graceUsed,finishPlace:p.finishPlace,online:now-p.lastSeen<25000})),deeds:s.deeds,supply:s.supply,pot:s.pot,turn:s.turn,auction:s.auction,buildRequest:s.buildRequest,debt:s.debt,trades:s.trades.filter(t=>t.fromId===viewerId||t.toId===viewerId),chat:s.chat,log:s.log,seq:s.seq,animations:s.animations,lastCard:s.lastCard??null,winnerId:s.winnerId??null,serverNow:now,viewerId};
}
export function assertState(s){
  for(const p of s.players){ok(int(p.cash),'Cash invariant failed.');ok(int(p.pos,0,39),'Position invariant failed.');ok(p.cards.every(c=>CARDS[c]?.effect==='escape'),'Held card invariant failed.');}
  let houses=s.supply.houses,hotels=s.supply.hotels;
  for(const b of BOARD){const d=s.deeds[b.id];if(!d)continue;ok(b.price&&player(s,d.ownerId)&&!player(s,d.ownerId).bankrupt,'Ownership invariant failed.');ok(int(d.buildings,0,5),'Building invariant failed.');ok(!d.mortgaged||d.buildings===0,'Mortgage invariant failed.');if(d.buildings===5)hotels++;else houses+=d.buildings;}
  ok(houses===32&&hotels===12&&s.supply.houses>=0&&s.supply.hotels>=0,'Bank building supply invariant failed.');
  for(const g of Object.keys(GROUPS)){const ds=groupSpaces(g).map(b=>s.deeds[b.id]);if(ds.some(d=>d?.buildings)){ok(ds.every(d=>d&&d.ownerId===ds[0].ownerId&&!d.mortgaged),'Developed group invariant failed.');ok(Math.max(...ds.map(d=>d.buildings))-Math.min(...ds.map(d=>d.buildings))<=1,'Even-building invariant failed.');}}
  if(s.status==='playing'){ok(new Set([...s.risk,...s.bonus,...held(s)]).size===32,'Card circulation invariant failed.');}
  return true;
}
