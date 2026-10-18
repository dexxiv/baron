import {BOARD,GROUPS,COLORS,CARDS,money} from './data.mjs';
import {BACKEND,PUBLIC_KEY} from './config.mjs';
import {ActionGate,Playback,turnLocked} from './interaction.mjs';
const $=s=>document.querySelector(s);
const app=$('#app'),modal=$('#modal'),modalContent=$('#modal-content');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const color=id=>COLORS.find(c=>c.id===id)?.hex??'#c2c9b6';
const colorName=id=>COLORS.find(c=>c.id===id)?.name??'Choose a color';
const token=p=>`<span class="token" style="--token-color:${color(p?.color)}" aria-label="${esc(p?.name??'Open seat')} · ${esc(colorName(p?.color))}"></span>`;
const btn=(text,action,extra='',secondary=false)=>`<button class="btn${secondary?' secondary':''}" data-action="${action}" ${extra} ${busy?'disabled':''}>${text}</button>`;
let S=null,version=0,session=null,clockOffset=0,busy=false,modalView=null,conversation='chat',renderKey='',socket=null,socketRoom=null,reconnectTimer=null,heartbeatTimer=null,lastResponse=0,syncPromise=null,timerSyncAt=0,tradeDraft=null,homeJoin=false,toastTimer,boardBuiltFor=null;
const playback=new Playback();let uiLocked=false,rollingRequest=false,diceFrame=-1;
const actionGate=new ActionGate(value=>{busy=value;if(!value)rollingRequest=false;render(true);if(modal.open&&modalView)renderModal();});
const locked=()=>turnLocked(S,now(),playback.end(now()));
const storage={get(k,fallback=null){try{return JSON.parse(localStorage.getItem(k))??fallback;}catch{return fallback;}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch{toast('Your browser cannot save your seat. Keep this tab open.');}}};
const sessions=()=>storage.get('baron.sessions',{});
const guestToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32))).map(n=>n.toString(16).padStart(2,'0')).join('');
const me=()=>S?.players.find(p=>p.id===S.viewerId);
const who=id=>S?.players.find(p=>p.id===id);
const own=(id)=>BOARD.filter(b=>S.deeds[b.id]?.ownerId===id);
const group=g=>BOARD.filter(b=>b.group===g);
const groupOwned=(id,g)=>group(g).every(b=>S.deeds[b.id]?.ownerId===id);
const groupBuilt=g=>group(g).some(b=>S.deeds[b.id]?.buildings>0);
const now=()=>Date.now()+clockOffset;
function toast(text,error=false){clearTimeout(toastTimer);const t=$('#toast');t.textContent=text;t.classList.toggle('error',error);t.hidden=false;toastTimer=setTimeout(()=>t.hidden=true,error?6500:3500);}
function saveSession(code,data){const map=sessions();map[code]={...data,at:Date.now()};storage.set('baron.sessions',map);storage.set('baron.lastRoom',code);}
function snapshot(root){
 const values={};root.querySelectorAll('[data-persist]').forEach(e=>values[e.id]={value:e.value,checked:e.checked});
 const active=document.activeElement;return {values,focus:root.contains(active)?active.id:null,start:active?.selectionStart,end:active?.selectionEnd};
}
function restore(root,snap){
 for(const [id,v] of Object.entries(snap.values)){const e=document.getElementById(id);if(e&&root.contains(e)){e.value=v.value;if('checked'in e)e.checked=v.checked;}}
 const e=snap.focus&&document.getElementById(snap.focus);if(e&&root.contains(e)){e.focus({preventScroll:true});if(e.setSelectionRange&&typeof snap.start==='number')try{e.setSelectionRange(snap.start,snap.end);}catch{}}
}
async function request(body,credential=session?.token){
 const requestId=body.requestId??crypto.randomUUID();let response,started;
 // Retry the same request ID once after a dropped response; never duplicate an action.
 for(let attempt=0;attempt<2;attempt++){
  try{started=Date.now();response=await fetch(BACKEND+'/functions/v1/baron',{method:'POST',headers:{apikey:PUBLIC_KEY,'content-type':'application/json','x-baron-token':credential},body:JSON.stringify({...body,requestId}),signal:AbortSignal.timeout(18000)});break;}
  catch(e){if(attempt===1)throw new Error('Connection lost. Your seat is saved; reconnecting will resume the game.');}
 }
 const data=await response.json().catch(()=>({error:'The game service is unavailable.'}));
 if(!response.ok)throw Object.assign(new Error(data.error??'Could not complete that action.'),{status:response.status});
 if(data.state){clockOffset=data.state.serverNow-Date.now()+Math.max(0,Date.now()-started-(data.elapsedMs??Date.now()-started))/2;lastResponse=Date.now();}
 return data;
}
function accept(data){
 if(!data.state||S&&data.state.id===S.id&&data.version<version)return;
 const old=S;playback.accept(data.state,now());S=data.state;version=data.version;session={...session,code:S.code};
 document.title=`${S.status==='lobby'?'Lobby':S.status==='finished'?'Results':'Playing'} ${S.code} · Baron`;
 $('#leave-room').hidden=false;connectRealtime();render();updateConnection();
 if(S.status==='finished'&&old?.status==='playing')openModal('results');
}
async function action(a){
 if(actionGate.busy)return false;rollingRequest=a.type==='roll';
 return actionGate.run(async()=>{
  try{const data=await request({op:'action',code:S.code,action:a});
   if(a.type==='leave'){if(S.status==='lobby'){const map=sessions();delete map[S.code];storage.set('baron.sessions',map);if(storage.get('baron.lastRoom')===S.code)storage.set('baron.lastRoom',null);}goHome();return true;}
   accept(data);return true;
  }catch(e){toast(e.message,true);return false;}
 });
}
let syncWanted=0,syncApplied=0;
async function sync(wanted=0){
 if(!S||!session)return;syncWanted=Math.max(syncWanted,Number(wanted)||0);if(syncPromise)return syncPromise;
 syncPromise=(async()=>{
  try{
   do{const target=syncWanted;accept(await request({op:'sync',code:S.code}));syncApplied=Math.max(target,version);}while(S&&syncWanted>syncApplied);
  }catch(e){updateConnection(true);if(e.status===401)toast('Your saved seat could not be restored. Open your original browser or return home.',true);}
  finally{syncPromise=null;}
 })();return syncPromise;
}
function updateConnection(failed=false){
 const el=$('#connection');if(!S){el.className='connection';el.textContent='2–8 PLAYERS · DESKTOP';return;}
 const online=!failed&&Date.now()-lastResponse<35000;el.className='connection '+(online?'online':'offline');el.textContent=online?`ROOM ${S.code} · ${socket?.readyState===1?'LIVE':'CONNECTED'}`:`ROOM ${S.code} · RECONNECTING…`;
}
function connectRealtime(){
 if(!S||socketRoom===S.id&&socket&&(socket.readyState===0||socket.readyState===1))return;
 clearTimeout(reconnectTimer);clearInterval(heartbeatTimer);if(socket){socket.onclose=null;socket.close();}
 socketRoom=S.id;let ref=1;socket=new WebSocket(BACKEND.replace('https:','wss:')+'/realtime/v1/websocket?apikey='+encodeURIComponent(PUBLIC_KEY)+'&vsn=1.0.0');
 const ws=socket,topic='realtime:baron:'+S.id;
 const send=(event,payload,channel=topic)=>{if(ws.readyState===1)ws.send(JSON.stringify({topic:channel,event,payload,ref:String(ref++),join_ref:channel===topic?'1':null}));};
 ws.onopen=()=>{send('phx_join',{config:{broadcast:{ack:false,self:false},presence:{enabled:false},private:false}});heartbeatTimer=setInterval(()=>send('heartbeat',{},'phoenix'),25000);updateConnection();};
 ws.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.event==='broadcast'&&m.payload?.event==='changed'){const v=Number(m.payload?.payload?.version)||0;if(v>version)sync(v);};if(m.event==='phx_error'||m.event==='phx_close')ws.close();}catch{}};
 ws.onerror=()=>{};
 ws.onclose=()=>{clearInterval(heartbeatTimer);if(S&&socketRoom===S.id){reconnectTimer=setTimeout(connectRealtime,5000);updateConnection();}};
}
function goHome(){playback.reset();uiLocked=false;syncWanted=0;syncApplied=0;S=null;session=null;version=0;renderKey='';modal.close();modalView=null;clearTimeout(reconnectTimer);clearInterval(heartbeatTimer);if(socket){socket.onclose=null;socket.close();socket=null;}socketRoom=null;history.replaceState(null,'',location.pathname);$('#leave-room').hidden=true;document.title='Baron · The world is your board';updateConnection();render();}
function render(force=false){
 if(!S){renderHome();return;}
 const key=JSON.stringify([S.status,S.seq,S.hostId,S.players.map(p=>[p.color,p.ready,p.online,p.cash,p.pos,p.inJail,p.bankrupt]),S.deeds,S.auction,S.buildRequest,S.debt,S.turn?.phase,S.turn?.playerId,S.turn?.grace,S.turn?.lockUntil,S.turn?.deadline,S.diceRoll,S.trades,S.chat,busy,locked()]);
 if(!force&&key===renderKey)return;renderKey=key;
 const snap=snapshot(app),scrolls=[...app.querySelectorAll('.chat-messages')].map(e=>({top:e.scrollTop,bottom:e.scrollHeight-e.scrollTop-e.clientHeight<45}));
 if(S.status!=='lobby'&&app.querySelector('.game')&&boardBuiltFor===S.id){
  // Keep the board and its token nodes in place during chat, bids and presence updates.
  const template=document.createElement('template');template.innerHTML=gameHTML();
  for(const selector of ['.board-center','.sidebar','.board-bottom']){
   const current=app.querySelector(selector),fresh=template.content.querySelector(selector);
   const html=fresh.innerHTML;if(current.dataset.html!==html){current.innerHTML=html;current.dataset.html=html;}
  }
  const board=app.querySelector('.board'),tilesKey=JSON.stringify([S.deeds,S.players.map(p=>[p.id,p.color,p.pos,p.bankrupt])]);
  if(board.dataset.tiles!==tilesKey){buildBoard();board.dataset.tiles=tilesKey;}
 }else{app.innerHTML=S.status==='lobby'?lobbyHTML():gameHTML();if(S.status!=='lobby')buildBoard();}
 uiLocked=locked();restore(app,snap);renderConversation();
 app.querySelectorAll('.chat-messages').forEach((e,i)=>{e.scrollTop=scrolls[i]?.bottom!==false?e.scrollHeight:scrolls[i].top;});
 updateClocks();renderTokens();renderDice();if(modal.open&&modalView&&modalView!=='tradeEdit')renderModal();
}
function renderHome(){
 const invite=new URLSearchParams(location.search).get('room')?.toUpperCase()??'',last=storage.get('baron.lastRoom'),saved=last&&sessions()[last];
 app.innerHTML=`<section class="home"><div><p class="kicker">A GLOBAL PROPERTY TRADING GAME</p><h1>A little ambition.<br>A whole <em>world.</em></h1><p class="home-copy">From your first city to your final hotel. Make a deal, take a risk, and build an empire with friends.</p><div class="entry"><form id="entry-form"><label for="username">YOUR NAME AT THE TABLE</label><input id="username" name="username" maxlength="24" autocomplete="nickname" placeholder="Enter a username" value="${esc(storage.get('baron.name',''))}" required><div class="actions"><button class="btn" type="submit">Create a lobby <span aria-hidden="true">↗</span></button><button class="btn secondary" type="button" id="show-join">Join with code</button></div><div class="join-row" id="join-row" ${invite||homeJoin?'':'hidden'}><input id="room-code" maxlength="6" aria-label="Room code" placeholder="Room code" value="${esc(invite)}" autocomplete="off" spellcheck="false"><button class="btn secondary" type="button" id="join-button">Join room</button></div></form><p class="entry-note">2–8 players · Free to play · No account needed</p>${saved?`<div class="resume"><small>Your seat in <b>${esc(last)}</b> is saved.</small><br><button class="text-button" id="resume-room" data-code="${esc(last)}">Return to your room →</button></div>`:''}</div></div><div class="hero-art" aria-label="Example Baron city deeds"><div class="orbits" aria-hidden="true"></div><div class="hero-deed back"><div class="deed-strip">Tokyo<small>JAPAN</small></div><div class="deed-label">TITLE DEED</div><div class="deed-price">$320</div><div class="deed-detail"><span>Rent</span><b>$28</b></div><div class="deed-detail"><span>With a hotel</span><b>$1,400</b></div></div><div class="hero-deed"><div class="deed-strip">Zurich<small>SWITZERLAND</small></div><div class="deed-label">TITLE DEED</div><div class="deed-price">$400</div><div class="deed-detail"><span>Rent</span><b>$50</b></div><div class="deed-detail"><span>With a hotel</span><b>$2,000</b></div></div><div class="hero-caption">COLLECT CITIES. CONNECT THE WORLD.<br>LEAVE YOUR MARK.</div></div></section><section class="home-facts" aria-label="About Baron"><div><b>Your table. Your people.</b><p>Create a private room and share the code.<br>Everyone joins with just a name.</p></div><div><b>Every deal changes the game.</b><p>Trade cities, cash, and held cards.<br>Add a note to make your case.</p></div><div><b>Think big. Keep moving.</b><p>Two-minute turns and live auctions.<br>The last player standing becomes Baron.</p></div></section>`;
}
async function enter(op,code){
 const name=$('#username')?.value.trim();if(!name||name.length>24){toast('Enter a username of 1–24 characters.',true);$('#username')?.focus();return;}
 code=code?.trim().toUpperCase();if(op==='join'&&!/^[A-Z2-9]{6}$/.test(code)){toast('Enter a six-character room code.',true);$('#room-code')?.focus();return;}
 storage.set('baron.name',name);const pending=op==='create'?storage.get('baron.pendingCreate'):null;
 session=op==='join'&&sessions()[code]?{...sessions()[code],code}:{token:pending?.token??guestToken(),name};
 const body={op,name,...(code?{code}:{}),requestId:pending?.requestId??crypto.randomUUID()};
 if(op==='create')storage.set('baron.pendingCreate',{token:session.token,requestId:body.requestId});
 app.innerHTML='<div class="loading"><div class="spinner" aria-hidden="true"></div><h1>Setting your table…</h1><p>Good deals are just around the corner.</p></div>';
 try{const data=await request(body);saveSession(data.state.code,session);storage.set('baron.pendingCreate',null);history.replaceState(null,'',location.pathname+'?room='+data.state.code);accept(data);}
 catch(e){toast(e.message,true);S=null;renderHome();}
}
async function resume(code){
 const saved=sessions()[code];if(!saved)return;session={...saved,code};app.innerHTML='<div class="loading"><div class="spinner"></div><h1>Welcome back.</h1><p>Reconnecting to your table…</p></div>';
 try{const data=await request({op:'sync',code});history.replaceState(null,'',location.pathname+'?room='+code);accept(data);}
 catch(e){S=null;toast(e.message,true);renderHome();}
}
function chatHTML(){return `<section class="panel chat-panel"><div class="conversation-tabs" role="tablist" aria-label="Room conversation"><button role="tab" data-tab="chat" aria-selected="${conversation==='chat'}">Room chat</button><button role="tab" data-tab="log" aria-selected="${conversation==='log'}">Game log</button></div><div class="chat-messages" role="log" aria-live="polite" aria-label="${conversation==='chat'?'Room chat':'Game log'}"></div><form class="chat-form"><input id="chat-input" data-persist maxlength="500" placeholder="Message the room…" aria-label="Chat message" autocomplete="off"><button class="btn" type="submit" aria-label="Send chat message">Send</button></form></section>`;}
function renderConversation(){
 for(const el of app.querySelectorAll('.chat-messages')){
  if(conversation==='chat')el.innerHTML=S.chat.length?S.chat.map(m=>`<article class="message"><b>${esc(who(m.playerId)?.name??'Former player')}</b><time>${new Date(m.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time><p>${esc(m.text)}</p></article>`).join(''):'<div class="empty">The conversation starts here.<br>Say hello to your table.</div>';
  else el.innerHTML=S.log.map(m=>`<article class="message log"><time>${new Date(m.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time><p>${esc(m.text)}</p></article>`).join('');
 }
 app.querySelectorAll('.chat-form').forEach(e=>e.hidden=conversation!=='chat');
}
function lobbyHTML(){
 const p=me(),ready=S.players.every(p=>p.ready&&p.color)&&S.players.length>=2;
 return `<section class="lobby"><div class="page-heading"><div><p class="kicker">YOUR TABLE IS OPEN</p><h1>A good empire starts with good company.</h1><p>Choose your color, invite your people, and get ready.</p></div><div style="text-align:right"><label>ROOM CODE</label><div class="room-code">${esc(S.code)}</div><button class="text-button" id="copy-invite">Copy invite link</button></div></div><div class="lobby-columns"><div class="stack"><section class="panel"><div class="panel-head"><h3>THE TABLE</h3><small>${S.players.length} / 8 players</small></div>${S.players.map(x=>`<div class="seat">${token(x)}<div class="seat-name">${esc(x.name)}${x.id===p.id?' <small style="display:inline">(you)</small>':''}<small>${x.id===S.hostId?'Host · ':''}${x.online?'Connected':'Away'} · ${esc(colorName(x.color))}</small></div>${x.ready?'<span class="ready-tag">Ready</span>':'<small>Choosing</small>'}${S.hostId===p.id&&x.id!==p.id?`<button class="text-button" data-host="${esc(x.id)}" title="Make this player host">Make host</button><button class="text-button" data-remove="${esc(x.id)}" title="Remove from lobby">Remove</button>`:''}</div>`).join('')}${S.players.length<8?`<div class="seat"><span class="token" style="background:transparent;border:1px dashed #9dab93"></span><div class="seat-name quiet">Room for ${8-S.players.length} more<small>Share the code to invite a friend.</small></div></div>`:''}<div class="color-picker"><label>CHOOSE YOUR COLOR</label><small>Your token is a simple circle. Each color belongs to one player.</small><div class="color-grid">${COLORS.map(c=>{const taken=S.players.some(x=>x.id!==p.id&&x.color===c.id);return `<button class="color-option" data-color="${c.id}" aria-pressed="${p.color===c.id}" ${taken?'disabled':''} title="${c.name}${taken?' · taken':''}"><span class="token" style="--token-color:${c.hex}" aria-hidden="true"></span><span>${c.name}</span></button>`;}).join('')}</div></div></section><div class="actions split lobby-bottom"><small>${p.id===S.hostId?'Start when everyone is ready.':'The host will start when everyone is ready.'}</small><div class="actions">${btn(p.ready?'Not ready':'I’m ready','ready',`data-ready="${!p.ready}" ${p.color?'':'disabled'}`,true)}${p.id===S.hostId?btn('Start game →','start',ready?'':'disabled'):''}</div></div></div><div class="stack"><section class="panel"><div class="panel-head"><h3>AT THIS TABLE</h3><button class="text-button" data-open="rules">Full rules</button></div><div class="settings"><div class="setting"><span>Starting cash</span><b>$1,500 each</b></div><div class="setting"><span>Turn clock</span><b>2 minutes</b></div><div class="setting"><span>Auction clock</span><b>30 seconds · +5 per bid</b></div><div class="setting"><span>Free Parking</span><b>Collects taxes and fines</b></div><div class="setting"><span>New players</span><b>Closed once the game starts</b></div></div></section>${chatHTML()}</div></div></section>`;
}
function boardPosition(i){if(i===0)return [11,11];if(i<10)return [11,11-i];if(i===10)return [11,1];if(i<20)return [21-i,1];if(i===20)return [1,1];if(i<30)return [1,i-19];if(i===30)return [1,11];return [i-29,11];}
function buildBoard(){
 const board=$('.board');if(!board)return;
 board.querySelectorAll('.tile').forEach(el=>el.remove());board.dataset.positions='';
 const tiles=BOARD.map(b=>{
  const [r,c]=boardPosition(b.id),d=S.deeds[b.id],owner=who(d?.ownerId),isMe=me()?.pos===b.id&&!me()?.bankrupt;
  let name=esc(b.name),mark='',price=b.price?money(b.price):b.kind==='tax'?money(b.amount):b.kind==='go'?'Collect $200':b.kind==='jail'?'Just Visiting':b.kind==='parking'?'Collect the pot':'';
  if(b.kind==='airport')name=esc(b.name).replace(' Airport','<br>Airport');
  if(b.kind==='jail')name='Jail';
  if(b.kind==='risk')mark='?';if(b.kind==='bonus')mark='+';
  const corner=[0,10,20,30].includes(b.id);
  return `<button class="tile ${corner?'corner ':''}${!b.price?'special ':''}${d?.mortgaged?'mortgaged ':''}${isMe?'current-space':''}" style="grid-area:${r}/${c};--band:${b.color??'transparent'};--owner:${color(owner?.color)}" data-space="${b.id}" aria-label="${esc(b.name)}${b.price?' · '+money(b.price):''}${owner?' · owned by '+esc(owner.name):''}${d?.mortgaged?' · mortgaged':''}"><span class="tile-band"></span>${d?.buildings?`<span class="tile-buildings">${d.buildings===5?'HOTEL':'▪'.repeat(d.buildings)}</span>`:''}<span class="tile-body">${mark?`<span class="tile-mark" aria-hidden="true">${mark}</span>`:''}<span class="tile-name">${name}</span>${price?`<span class="tile-price">${d?.mortgaged?'Mortgaged':price}</span>`:''}</span><span class="tile-token-lane" data-lane="${b.id}" aria-label="Player tokens"></span>${owner?'<span class="tile-owned" title="'+esc(owner.name)+'"></span>':''}</button>`;
 }).join('');
 board.insertAdjacentHTML('beforeend',tiles);boardBuiltFor=S.id;board.dataset.tiles=JSON.stringify([S.deeds,S.players.map(p=>[p.id,p.color,p.pos,p.bankrupt])]);
}
function gameHTML(){
 const pending=S.trades.filter(t=>t.status==='pending'&&t.toId===S.viewerId),p=me(),assets=own(p.id);
 return `<section class="game"><div class="board-wrap"><div class="board" aria-label="Baron game board"><div class="board-center"><div class="center-heading"><div class="center-brand">BARON<small>THE WORLD IS YOUR BOARD</small></div><div class="pot"><span>FREE PARKING</span><strong>${money(S.pot)}</strong></div></div><div class="turn-card ${S.debt?'debt-warning':''}">${turnHTML()}</div><div class="decks"><button class="deck" data-open="lastCard">RISK</button><button class="deck bonus" data-open="lastCard">BONUS</button></div><div class="last-card">${S.lastCard?esc(CARDS[S.lastCard.id]?.text):'Collect a country. Build an empire.'}</div></div></div><div class="board-bottom"><span>Bank: ${S.supply.houses} houses · ${S.supply.hotels} hotels</span><span>Click any space for its full details.</span><button class="text-button" data-open="rules">Table rules</button></div></div><aside class="sidebar" aria-label="Players and conversation"><section class="panel"><div class="panel-head"><h3>THE PLAYERS</h3><small>${S.players.filter(p=>!p.bankrupt).length} in play</small></div>${S.players.map(x=>`<div class="player-row ${S.turn?.playerId===x.id?'active ':''}${x.bankrupt?'eliminated':''}" style="--token-color:${color(x.color)}">${token(x)}<div class="player-name">${esc(x.name)}${x.id===p.id?' <small style="display:inline">(you)</small>':''}<small>${x.bankrupt?'Watching · place '+x.finishPlace:x.inJail?'In Jail · attempt '+(x.jailTurns+1)+'/3':x.online?S.turn?.playerId===x.id?'At the table':'Connected':'Away'}${x.id===S.hostId?' · Host':''}</small><div class="owned-bands" aria-label="Owned properties">${own(x.id).map(b=>`<i style="--band:${b.color??'#899881'}"></i>`).join('')}</div></div><span class="cash">${money(x.cash)}</span></div>`).join('')}</section><section class="panel"><div class="panel-head"><h3>YOUR EMPIRE</h3><button class="text-button" data-open="portfolio">Manage</button></div><div class="panel-body"><div class="portfolio-summary"><div><p>${assets.length} deeds · ${p.cards.length} held cards</p><strong>${money(p.cash)}</strong></div><button class="btn secondary small" data-open="tradeEdit" ${p.bankrupt||S.status==='finished'?'disabled':''}>Make a trade</button></div>${pending.length?`<button class="trade-alert" data-open="trades" style="margin-top:16px">${pending.length} trade offer${pending.length===1?'':'s'} waiting →</button>`:''}<div class="actions" style="margin-top:13px"><button class="text-button" data-open="trades">All your offers</button></div></div></section>${chatHTML()}</aside></section>`;
}
function dieHTML(n){const spots={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};return `<span class="die" role="img" aria-label="Die: ${n}">${Array.from({length:9},(_,i)=>`<i ${spots[n]?.includes(i)?'class="pip"':''}></i>`).join('')}</span>`;}
function clockHTML(end,duration=120000){return end?`<span class="clock" data-clock-end="${end}" data-duration="${duration}">--:--</span>`:'<span class="clock">Paused</span>';}
function turnHTML(){
 if(S.status==='finished')return `<div class="kicker">THE LAST EMPIRE STANDING</div><h2>${esc(who(S.winnerId)?.name)} is Baron.</h2><p>A world well played.</p><button class="btn wide" data-open="results">See the results</button>`;
 const t=S.turn,p=who(t.playerId),isMine=t.playerId===S.viewerId,isLocked=locked(),rolls=t.lastRoll??[1,1],diceBlock=diceHTML(rolls);
 if(S.auction){const a=S.auction,min=a.leaderId?a.bid+1:a.kind==='deed'?10:50,canBid=!me().bankrupt&&a.leaderId!==me().id;
  return `<div class="turn-label"><span>LIVE AUCTION · +5 SECONDS PER BID</span>${clockHTML(a.deadline,30000)}</div><div class="clock-track"><span data-track-end="${a.deadline}" data-duration="30000"></span></div><h2>${a.kind==='deed'?esc(BOARD[a.spaceId].name):'One '+a.kind}</h2><p>${a.leaderId?esc(who(a.leaderId)?.name)+' leads the bidding.':'The lot is open to every active player.'}</p><div class="auction-value">${money(a.bid)}</div><form id="bid-form"><label for="bid-amount">YOUR BID · MINIMUM ${money(min)}</label>${a.kind!=='deed'?`<label for="bid-target">BUILD AT</label><select id="bid-target" data-persist>${eligibleBuildings(me().id,a.kind).map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select>`:''}<div class="bid-row"><input id="bid-amount" data-persist type="number" min="${min}" max="${me().cash}" step="1" value="${min}" required aria-label="Your auction bid"><button class="btn" type="submit" ${canBid?'':'disabled'}>Place bid</button></div></form><div class="quick-bids">${[10,25,100].map(n=>`<button class="btn secondary" data-quick-bid="${n}" ${canBid?'':'disabled'}>+${money(n)}</button>`).join('')}</div><div class="status-line">${a.leaderId===me().id?'You have the highest bid. Your bid is reserved until the auction ends.':'The highest cash bid wins when time runs out.'}</div>`;
 }
 if(S.buildRequest){const r=S.buildRequest,candidates=eligibleBuildings(me().id,r.kind);return `<div class="turn-label"><span>BUILDING SHORTAGE</span>${clockHTML(r.deadline,5000)}</div><h2>One ${r.kind}. Any other buyers?</h2><p>${esc(who(r.playerId)?.name)} requested a ${r.kind} at ${esc(BOARD[r.target].name)}. Contest it now to open an auction.</p>${r.playerId!==me().id&&candidates.length?`<label for="contest-target">BUILD AT</label><select id="contest-target">${candidates.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select><button class="btn wide" data-action="contest" style="margin-top:12px">Contest and bid</button>`:'<small>Turn clock paused.</small>'}`;}
 if(t.grace)return `<div class="turn-label"><span>RECONNECT GRACE · ONCE PER GAME</span>${clockHTML(t.grace.until,30000)}</div><h2>Waiting for ${esc(who(t.grace.playerId)?.name)}.</h2><p>The decision clock is paused for up to 30 seconds. Play resumes when they return or the grace ends.</p>`;
 if(S.debt){const d=S.debt,debtor=who(d.from);return `<div class="turn-label"><span>OUTSTANDING DEBT</span>${clockHTML(d.deadline,d.active?150000:30000)}</div><div class="clock-track"><span data-track-end="${d.deadline}" data-duration="${d.active?150000:30000}"></span></div><h2>${esc(debtor.name)} owes ${money(d.amount)}.</h2><p>${esc(d.reason)} · ${money(Math.max(0,d.amount-debtor.cash))} more needed.<br>Sell buildings, mortgage deeds, or make a trade. Remaining debt triggers automatic liquidation at expiry.</p><div class="actions"><button class="btn" data-open="portfolio">Manage your assets</button><button class="btn secondary" data-open="tradeEdit">Trade</button></div>`;}
 let title,copy,actions='';
 if(t.phase==='purchase'){const b=BOARD[t.purchase.spaceId];title=esc(b.name);copy=isMine?`Add this property to your empire for ${money(b.price)}, or send it to auction.`:`${esc(p.name)} is deciding whether to buy for ${money(b.price)}.`;if(isMine)actions=btn('Buy for '+money(b.price),'buy',isLocked||me().cash<b.price?'disabled':'')+btn('Send to auction','decline',isLocked?'disabled':'',true);}
 else if(t.phase==='jail'){title=isMine?'A short stay in Jail.':esc(p.name)+' is in Jail.';copy=isMine?'Pay $50, use a held release card, or try for doubles. This is attempt '+(me().jailTurns+1)+' of 3.':'Rent, trades, and building continue while a player is in Jail.';if(isMine)actions=btn('Try for doubles','roll',isLocked?'disabled':'')+btn('Pay $50','jailPay',isLocked?'disabled':'',true)+me().cards.map(c=>btn('Use '+(c[0]==='r'?'Risk':'Bonus')+' release','jailCard',`data-card-id="${c}"`,true)).join('');}
 else if(t.phase==='end'){title=isMine?'Your move is complete.':esc(p.name)+' is finishing up.';copy=isMine?'Manage your properties or make a deal, then pass the dice.':'You can manage your empire and offer trades while you wait.';if(isMine)actions=btn('End turn →','end',isLocked?'disabled':'');}
 else {title=isMine?'The world is waiting.':esc(p.name)+' has the dice.';copy=isMine?(t.doubles?'Doubles! Roll again while your turn clock is running.':'Roll two dice and see where the world takes you.'):'Keep an eye on the board. The next big deal could be yours.';if(isMine)actions=btn(isLocked?'Moving…':'Roll the dice','roll',isLocked?'disabled':'');}
 return `<div class="turn-label"><span>${isMine?'YOUR TURN':esc(p.name.toUpperCase())+'’S TURN'}</span>${clockHTML(t.deadline)}</div><div class="clock-track"><span data-track-end="${t.deadline??0}" data-duration="120000"></span></div><h2>${title}</h2><p>${copy}</p>${diceBlock}<div class="actions">${actions}</div>${isMine?'':'<small>Your turn will come around soon.</small>'}`;
}
function updateClocks(){
 const n=now();document.querySelectorAll('[data-clock-end]').forEach(el=>{const secs=Math.max(0,Math.ceil((Number(el.dataset.clockEnd)-n)/1000));el.textContent=String(Math.floor(secs/60)).padStart(2,'0')+':'+String(secs%60).padStart(2,'0');el.classList.toggle('urgent',secs<=15);});
 document.querySelectorAll('[data-track-end]').forEach(el=>el.style.width=Math.max(0,Math.min(100,(Number(el.dataset.trackEnd)-n)/Number(el.dataset.duration)*100))+'%');
 if(S?.status==='playing'){
  const deadline=S.turn?.grace?.until??S.auction?.deadline??S.buildRequest?.deadline??S.debt?.deadline??S.turn?.deadline;
  if(deadline&&n>deadline&&Date.now()-timerSyncAt>1500&&!syncPromise){timerSyncAt=Date.now();sync();}
  const currentLock=locked();
  if(currentLock!==uiLocked){uiLocked=currentLock;render(true);}
 }
}
function diceHTML(rolls){
 const rolling=rollingRequest||!!playback.active('dice',now());
 const moving=!!playback.active('move',now());
 return `<div class="dice ${rolling?'rolling':''}" aria-label="${rolling?'Rolling dice':`Rolled ${rolls.join(' and ')}`}">${rolls.map(dieHTML).join('')}</div><div class="move-status" aria-live="polite">${rolling?'Rolling…':moving?'Moving around the board…':''}</div>`;
}
function renderDice(){
 if(!S||S.status!=='playing')return;const box=app.querySelector('.dice');if(!box)return;
 const n=now(),event=playback.active('dice',n),rolling=rollingRequest||!!event,frame=rolling?Math.floor(n/80):-1;
 if(box.classList.contains('rolling')!==rolling){box.classList.toggle('rolling',rolling);diceFrame=-2;}
 if(frame!==diceFrame){diceFrame=frame;const values=rolling?[frame%6+1,(frame*5+2)%6+1]:S.turn?.lastRoll??[1,1];box.innerHTML=values.map(dieHTML).join('');box.setAttribute('aria-label',rolling?'Rolling dice':`Rolled ${values.join(' and ')}`);}
 const status=app.querySelector('.move-status');if(status){const text=rolling?'Rolling…':playback.active('move',n)?'Moving around the board…':'';if(status.textContent!==text)status.textContent=text;}
}
function renderTokens(){
 if(!S||S.status==='lobby'||!$('.board'))return;
 const n=now(),board=$('.board');
 for(const [slot,p] of S.players.entries()){
  let circle=board.querySelector(`[data-player="${p.id}"]`);
  if(p.bankrupt){circle?.remove();continue;}
  const pos=playback.position(p,n),lane=board.querySelector(`[data-lane="${pos}"]`);if(!lane)continue;
  if(!circle){circle=document.createElement('span');circle.dataset.player=p.id;circle.className='tile-token'+(p.id===S.viewerId?' you':'');circle.style.setProperty('--token-color',color(p.color));circle.style.gridColumn=String(slot%4+1);circle.style.gridRow=String(Math.floor(slot/4)+1);circle.title=p.name;circle.setAttribute('aria-label',p.name);}
  if(circle.parentElement!==lane){circle.classList.remove('stepping');lane.append(circle);if(playback.active('move',n))circle.classList.add('stepping');}
 }
}
function eligibleBuildings(id,kind){
 if(!S||S.debt)return [];return BOARD.filter(b=>{const d=S.deeds[b.id];if(b.kind!=='city'||d?.ownerId!==id||d.buildings>=5||!groupOwned(id,b.group)||group(b.group).some(x=>S.deeds[x.id].mortgaged))return false;const levels=group(b.group).map(x=>S.deeds[x.id].buildings);return d.buildings===Math.min(...levels)&&(!kind||(d.buildings===4?'hotel':'house')===kind)&&(d.buildings===4?S.supply.hotels>0:S.supply.houses>0);});
}
function openModal(view){
 if(view==='tradeEdit'&&tradeDraft&&!S.players.some(p=>p.id===tradeDraft.toId&&!p.bankrupt&&p.id!==S.viewerId)){tradeDraft.toId=S.players.find(p=>p.id!==S.viewerId&&!p.bankrupt)?.id;tradeDraft.receive={cash:0,deeds:[],cards:[]};delete tradeDraft.counterId;}
 modalView=view;if(view==='tradeEdit'&&!tradeDraft)tradeDraft={toId:S?.players.find(p=>p.id!==S.viewerId&&!p.bankrupt)?.id,give:{cash:0,deeds:[],cards:[]},receive:{cash:0,deeds:[],cards:[]},note:''};
 renderModal();if(!modal.open)modal.showModal();
}
function modalHead(title,sub=''){return `<div class="modal-head"><div><h2 id="modal-title">${title}</h2>${sub?`<p class="modal-sub">${sub}</p>`:''}</div><button class="close-button" data-close aria-label="Close dialog">×</button></div>`;}
function renderModal(){
 const snap=snapshot(modalContent);
 if(modalView==='rules')modalContent.innerHTML=rulesHTML();
 else if(modalView?.startsWith('deed:'))modalContent.innerHTML=deedHTML(Number(modalView.split(':')[1]));
 else if(modalView==='portfolio')modalContent.innerHTML=portfolioHTML();
 else if(modalView==='tradeEdit')modalContent.innerHTML=tradeEditorHTML();
 else if(modalView==='trades')modalContent.innerHTML=tradesHTML();
 else if(modalView==='results')modalContent.innerHTML=resultsHTML();
 else if(modalView==='lastCard')modalContent.innerHTML=modalHead('Risk & Bonus')+`<p class="quiet">${S?.lastCard?esc(who(S.lastCard.playerId)?.name)+' drew:':'Your last card will appear here.'}</p>${S?.lastCard?`<div class="notice">${esc(CARDS[S.lastCard.id]?.text)}</div>`:''}<p class="quiet" style="margin-top:20px">Each deck has 16 cards. Used cards return to the bottom; Jail release cards stay with a player until used or traded.</p>`;
 else if(modalView==='leave')modalContent.innerHTML=modalHead(S?.status==='playing'&&!me().bankrupt?'Surrender your empire?':'Leave the room?')+`<p class="quiet">${S?.status==='playing'&&!me().bankrupt?'Your assets will be liquidated and the remaining players will continue. You can stay and watch instead.':'The host role passes to another player when needed.'}</p><div class="actions"><button class="btn secondary" data-close>Stay at the table</button><button class="btn danger" id="confirm-leave">${S?.status==='playing'&&!me().bankrupt?'Surrender and leave':'Leave room'}</button></div>`;
 restore(modalContent,snap);
}
function deedHTML(i){
 const b=BOARD[i],d=S?.deeds[i],owner=who(d?.ownerId),mine=owner?.id===S?.viewerId;
 if(!b.price)return modalHead(esc(b.name))+`<p class="quiet">${({go:'Collect $200 each time you pass or land on GO while moving forward.',bonus:'Draw the next Bonus card and follow its instructions.',risk:'Draw the next Risk card and follow its instructions.',tax:`Pay ${money(b.amount)} into the Free Parking pot.`,jail:'Visitors wait here safely. Jailed players may pay $50, use a held release card, or try for doubles on up to three turns.',parking:`Land here to collect the entire pot: ${money(S?.pot??0)}. The pot then resets to zero.`,gojail:'Go directly to Jail. Do not pass GO or collect $200.'})[b.kind]}</p>`;
 const locked=!!(S.auction||S.buildRequest||S.turn?.grace)||turnLocked(S,now(),playback.end(now())),developed=b.group&&groupBuilt(b.group),redeem=b.mortgage+(d?.interestPaidUntil>now()?0:Math.ceil(b.mortgage*.1));
 let economics=b.kind==='city'?`<table><tbody>${[['Base rent',b.rents[0]],['Full country, no buildings',2*b.rents[0]],...b.rents.slice(1,5).map((n,j)=>[(j+1)+' house'+(j?'s':''),n]),['Hotel',b.rents[5]]].map(([l,n])=>`<tr><th>${l}</th><td>${money(n)}</td></tr>`).join('')}</tbody></table><p class="modal-sub" style="margin-top:14px">Each house or hotel step costs ${money(b.build)}. Buildings sell for half price. Build and sell evenly across ${esc(b.country)}.</p>`:b.kind==='airport'?'<table><tbody><tr><th>1 airport</th><td>$25 rent</td></tr><tr><th>2 airports</th><td>$50 rent</td></tr><tr><th>3 airports</th><td>$100 rent</td></tr><tr><th>4 airports</th><td>$200 rent</td></tr></tbody></table>':'<p class="quiet">With one network, rent is 4 times the dice total. With both networks, rent is 10 times the total. A Risk card may require a new roll at 10 times the total.</p>';
 const canBuild=mine&&eligibleBuildings(me().id).some(x=>x.id===i)&&!S.debt&&me().cash>=b.build;
 return `<div class="tile-detail-band" style="--band:${b.color??'#83927d'}"></div>${modalHead(esc(b.name),`${esc(b.country??(b.kind==='airport'?'INTERNATIONAL TRANSPORT':'NETWORK'))} · ${money(b.price)} purchase`)}<div class="actions split" style="margin-bottom:16px"><span class="chip">${owner?'Owned by '+esc(owner.name):'Unowned'}</span>${d?`<span class="chip">${d.mortgaged?'Mortgaged':d.buildings===5?'Hotel':d.buildings+' houses'}</span>`:''}</div>${economics}<table><tbody><tr><th>Mortgage value</th><td>${money(b.mortgage)}</td></tr><tr><th>Mortgage redemption ${d?.interestPaidUntil>now()?'(transfer interest already paid)':''}</th><td>${money(redeem)}</td></tr></tbody></table>${mine&&S.status==='playing'?`<hr><div class="actions">${b.kind==='city'?btn(d.buildings===4?'Build hotel':'Build house','build',`data-space-id="${i}" ${!locked&&canBuild?'':'disabled'}`):''}${d.buildings?btn('Sell one building','sell',`data-space-id="${i}" ${locked?'disabled':''}`,true):''}${d.mortgaged?btn('Redeem for '+money(redeem),'redeem',`data-space-id="${i}" ${locked||S.debt||me().cash<redeem?'disabled':''}`,true):btn('Mortgage for '+money(b.mortgage),'mortgage',`data-space-id="${i}" ${locked||developed?'disabled':''}`,true)}${developed?btn('Sell all buildings in '+esc(b.country),'sellGroup',`data-group="${b.group}" ${locked?'disabled':''}`,true):''}</div><p class="modal-sub" style="margin-top:13px">${developed?'Sell all buildings in this country before mortgaging or trading its deeds.':'Mortgaged properties collect no rent.'}</p>`:''}`;
}
function portfolioHTML(){
 const p=me(),assets=own(p.id);return modalHead('Your empire',`${money(p.cash)} cash · ${assets.length} deeds · ${p.cards.length} held cards`)+(assets.length?`<div class="portfolio-grid">${assets.map(b=>{const d=S.deeds[b.id];return `<button class="portfolio-item" style="--band:${b.color??'#83927d'}" data-space="${b.id}"><b>${esc(b.name)}</b><small>${d.mortgaged?'Mortgaged':d.buildings===5?'1 hotel':d.buildings?d.buildings+' houses':'Undeveloped'} · ${money(b.price)}</small></button>`;}).join('')}</div>`:'<div class="empty">Your empire starts with your first deed.<br>Land on an unowned property to buy or bid at auction.</div>')+p.cards.map(c=>`<div class="notice" style="margin-top:14px">${c[0]==='r'?'Risk':'Bonus'} Jail release card · keep, use, or trade.</div>`).join('');
}
function assetChoices(id,side){
 const a=tradeDraft[side],p=who(id);if(!p)return '<p class="empty">Choose a player.</p>';
 return `<label for="trade-${side}-cash">Cash · ${money(p.cash)} held</label><input id="trade-${side}-cash" type="number" min="0" max="${p.cash}" step="1" value="${a.cash}" data-trade-cash="${side}" required><div class="asset-list">${own(id).map(b=>{const blocked=b.group&&groupBuilt(b.group),d=S.deeds[b.id];return `<label class="asset-choice"><input type="checkbox" data-trade-side="${side}" data-asset-deed="${b.id}" ${a.deeds.includes(b.id)?'checked':''} ${blocked?'disabled':''}><span class="asset-band" style="--band:${b.color??'#83927d'}"></span><span class="asset-name">${esc(b.name)}<small style="display:block">${blocked?'Sell country buildings first':d.mortgaged?'Mortgaged · '+money(Math.ceil(b.mortgage*.1))+' transfer interest':money(b.price)+' value'}</small></span></label>`;}).join('')}${p.cards.map(c=>`<label class="asset-choice"><input type="checkbox" data-trade-side="${side}" data-asset-card="${c}" ${a.cards.includes(c)?'checked':''}><span>${c[0]==='r'?'Risk':'Bonus'} Jail release card</span></label>`).join('')}${!own(id).length&&!p.cards.length?'<div class="empty">No deeds or held cards yet.<br>Cash can still be offered.</div>':''}</div>`;
}
function tradeEditorHTML(){
 if(!S)return '';const others=S.players.filter(p=>p.id!==S.viewerId&&!p.bankrupt);
 return `<div class="trade-editor">${modalHead(tradeDraft?.counterId?'Make a counteroffer':'A good deal works both ways.','Choose what you give and what you ask for. Cash and mortgage interest are checked when the offer is accepted.')}<form id="trade-form"><label for="trade-recipient">TRADE WITH</label><select id="trade-recipient" ${tradeDraft?.counterId?'disabled':''}>${others.map(p=>`<option value="${esc(p.id)}" ${tradeDraft.toId===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select><div class="trade-columns" style="margin-top:18px"><section class="trade-side"><h3>You give</h3>${assetChoices(S.viewerId,'give')}</section><section class="trade-side"><h3>You receive</h3>${assetChoices(tradeDraft.toId,'receive')}</section></div><div class="trade-note"><label for="trade-note">A NOTE WITH YOUR OFFER · OPTIONAL</label><textarea id="trade-note" maxlength="500" placeholder="Here’s what I have in mind…">${esc(tradeDraft.note)}</textarea></div>${S.auction||S.buildRequest?'<div class="notice">Trading pauses until the auction finishes.</div>':''}<div class="actions split trade-footer"><button type="button" class="text-button" data-open="trades">View your offers</button><button class="btn" type="submit" ${others.length&&!S.auction&&!S.buildRequest?'':'disabled'}>Send offer →</button></div></form></div>`;
}
function collectTrade(){
 if(!tradeDraft)return;for(const side of ['give','receive']){tradeDraft[side]={cash:Number($('#trade-'+side+'-cash')?.value??0),deeds:[...modal.querySelectorAll(`[data-trade-side="${side}"][data-asset-deed]:checked`)].map(e=>Number(e.dataset.assetDeed)),cards:[...modal.querySelectorAll(`[data-trade-side="${side}"][data-asset-card]:checked`)].map(e=>e.dataset.assetCard)};}
 tradeDraft.note=$('#trade-note')?.value??tradeDraft.note;
}
function tradeSummary(t){
 const list=(id,a)=>`<section><h3>${esc(who(id)?.name)} gives</h3><ul><li>${money(a.cash)} cash</li>${a.deeds.map(i=>`<li>${esc(BOARD[i].name)}${S.deeds[i]?.mortgaged?' (mortgaged)':''}</li>`).join('')}${a.cards.map(c=>`<li>${c[0]==='r'?'Risk':'Bonus'} Jail release</li>`).join('')}</ul></section>`;
 return `<div class="trade-summary">${list(t.fromId,t.give)}${list(t.toId,t.receive)}</div>${t.note?`<p class="quiet" style="margin:14px 0 6px;font-size:11px">NOTE FROM ${esc(who(t.fromId)?.name?.toUpperCase())}</p><p class="trade-note-view">${esc(t.note)}</p>`:''}`;
}
function tradesHTML(){
 const trades=[...S.trades].reverse();return modalHead('Your trade table','Offers expire after 10 minutes. Only the two players involved can read the note.')+(trades.length?trades.map(t=>`<article class="trade-offer"><div class="actions split"><h3>${esc(who(t.fromId)?.name)} → ${esc(who(t.toId)?.name)}</h3><span class="chip">${esc(t.status)}</span></div>${tradeSummary(t)}${t.status==='pending'?`<div class="actions" style="margin-top:15px">${t.toId===S.viewerId?btn('Accept trade','tradeAccept',`data-trade-id="${t.id}" ${S.auction||S.buildRequest?'disabled':''}`)+`<button class="btn secondary" data-counter="${t.id}">Counteroffer</button>`+btn('Decline','tradeReject',`data-trade-id="${t.id}"`,true):btn('Withdraw offer','tradeCancel',`data-trade-id="${t.id}"`,true)}</div>`:''}</article>`).join(''):'<div class="empty">No offers yet.<br>A country set could be one good deal away.</div>')+`<button class="btn" id="new-trade">Make a new offer</button>`;
}
function resultsHTML(){return modalHead('A world well played.',`${esc(who(S.winnerId)?.name)} is Baron.`)+[...S.players].sort((a,b)=>(a.finishPlace??99)-(b.finishPlace??99)).map(p=>`<div class="result-rank"><strong>${p.finishPlace??'—'}</strong>${token(p)}<div class="seat-name">${esc(p.name)}</div><span class="cash">${money(p.cash)}</span></div>`).join('')+`<div class="actions split" style="margin-top:24px"><small>${S.hostId===S.viewerId?'Invite everyone back for another empire.':'The host can open a rematch lobby.'}</small>${S.hostId===S.viewerId?btn('Open rematch lobby','rematch'):''}</div>`;}
function rulesHTML(){return modalHead('The rules of the table.','The familiar property economy, with a world of cities.')+`<div class="rules-content"><h3>Build your empire</h3><p>Each player starts with $1,500. Roll two dice and move clockwise. Collect $200 when passing or landing on GO. Buy an unowned property at its printed price or send it to a 30-second auction. The player who declined may bid. Bidding starts at $10; each valid bid adds five seconds. You must have the cash to cover a bid.</p><h3>Countries, airports & networks</h3><p>Own every city in a country to double its unimproved rent and build there. Build and sell evenly, at the cost shown on the deed. Four houses become a hotel with one more building payment. There are 32 houses and 12 hotels. When the supply runs low and another eligible builder contests a purchase, the building goes to auction. Rent is collected automatically.</p><p>Airports cost $200. Rent is $25, $50, $100, or $200 when their owner holds 1, 2, 3, or 4. Networks cost $150. Rent is 4 times the roll with one network, 10 times with both. Click a space for its complete rent and mortgage table.</p><h3>Doubles & Jail</h3><p>Doubles grant another roll within the same turn clock. Three consecutive doubles send you straight to Jail before the third move. In Jail, pay $50 or use a held release card before rolling, or try for doubles on up to three turns. A successful Jail doubles roll moves you but grants no extra roll. On your third failed attempt, pay $50 and move the rolled total. You can still collect rent, build, mortgage, and trade while in Jail.</p><h3>Risk, Bonus & Free Parking</h3><p>Each deck has 16 shuffled cards with the traditional pre-2021 effects. Used cards go to the bottom; Jail release cards can be held or traded. Income Tax is $200 and Luxury Tax is $100. Taxes, Jail fines, and bank-directed card fees and repairs go into Free Parking. Landing there collects the whole pot and resets it to zero. Purchases, buildings, and mortgage repayments go to the bank.</p><h3>Trading & mortgages</h3><p>Offer deeds, held release cards, and cash on either side, with an optional private note. The recipient can accept, decline, or counter. No loans or promises of future rent. Sell every building in a country before trading or mortgaging a deed from that country. Buildings sell for half their purchase cost. Mortgages pay the amount printed on the deed and collect no rent. Redemption costs the principal plus 10% interest, rounded up.</p><p>A transferred mortgaged deed immediately costs its new owner 10% interest. The next 30 seconds are the immediate-redemption window: repay the principal during that window to redeem without another interest charge. Later redemption costs principal plus a further 10%. If there are not enough bank houses to downgrade a hotel, you may sell all buildings in that country at half price.</p><h3>Keep the table moving</h3><p>A turn has two minutes of decision time. Actions do not reset the clock. Animations and auctions pause it. An untouched expired turn is forfeited without a roll. A roll already made finishes its required consequences; an unresolved purchase goes to auction. No extra doubles roll follows expiry.</p><p>Debt adds 30 seconds once to an active player’s clock. An off-turn debtor gets a separate 30 seconds while the active turn waits. At expiry, buildings are sold legally and deeds mortgaged only as needed. If that cannot cover the debt, bankruptcy transfers assets to the creditor; bank-owned repossessions go to auction. The last solvent player wins.</p><p>Each player gets one reconnect grace of up to 30 seconds per game. Refreshing restores the saved seat in the same browser. Further disconnections do not pause the clocks. Host leadership transfers when needed. New players cannot enter after the game starts. Eliminated players may watch and chat.</p><h3>Before you start</h3><p>Choose a unique token color, mark yourself ready, and let the host start. The highest opening dice total goes first; tied players roll again. Turn order then follows the seating order. Rooms support 2–8 players. Keep the original browser’s site data to preserve your seat.</p></div>`;}

document.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b||b.disabled)return;
 if(b.matches('[data-close]')){modal.close();return;}
 if(b.dataset.open){openModal(b.dataset.open);return;}
 if(b.dataset.space){openModal('deed:'+b.dataset.space);return;}
 if(b.dataset.color){await action({type:'color',color:b.dataset.color});return;}
 if(b.dataset.host){await action({type:'host',playerId:b.dataset.host});return;}
 if(b.dataset.remove){await action({type:'remove',playerId:b.dataset.remove});return;}
 if(b.dataset.tab){conversation=b.dataset.tab;render(true);return;}
 if(b.dataset.counter){const t=S.trades.find(t=>t.id===b.dataset.counter);tradeDraft={toId:t.fromId,give:structuredClone(t.receive),receive:structuredClone(t.give),note:'',counterId:t.id};openModal('tradeEdit');return;}
 if(b.dataset.quickBid){const a=S.auction,amount=Math.max(10,(a?.bid??0)+Number(b.dataset.quickBid));await action({type:'bid',amount,target:Number($('#bid-target')?.value)});return;}
 if(b.dataset.action){const a={type:b.dataset.action};if(b.dataset.spaceId)a.spaceId=Number(b.dataset.spaceId);if(b.dataset.group)a.group=b.dataset.group;if(b.dataset.cardId)a.cardId=b.dataset.cardId;if(b.dataset.tradeId)a.tradeId=b.dataset.tradeId;if(a.type==='ready')a.ready=b.dataset.ready==='true';if(a.type==='contest')a.spaceId=Number($('#contest-target')?.value);
  if(await action(a)){if(['rematch'].includes(a.type))modal.close();if(a.type==='tradeAccept'||a.type==='tradeReject'||a.type==='tradeCancel')renderModal();}return;}
 switch(b.id){
  case 'show-join':homeJoin=true;$('#join-row').hidden=false;$('#room-code').focus();break;
  case 'join-button':await enter('join',$('#room-code').value);break;
  case 'resume-room':await resume(b.dataset.code);break;
  case 'brand-home':if(S)openModal('leave');else window.scrollTo({top:0,behavior:'smooth'});break;
  case 'leave-room':openModal('leave');break;
  case 'confirm-leave':if(S.status==='finished'||me().bankrupt){goHome();}else await action({type:'leave'});break;
  case 'copy-invite':try{await navigator.clipboard.writeText(location.origin+location.pathname+'?room='+S.code);toast('Invite link copied.');}catch{toast('Room code: '+S.code+' · Share this page’s URL.');}break;
  case 'new-trade':tradeDraft=null;openModal('tradeEdit');break;
 }
});
document.addEventListener('submit',async e=>{
 e.preventDefault();const form=e.target;
 if(form.id==='entry-form'){if(document.activeElement?.id==='room-code')await enter('join',$('#room-code').value);else await enter('create');}
 else if(form.classList.contains('chat-form')){const input=$('#chat-input'),text=input.value.trim();if(text&&await action({type:'chat',text})){$('#chat-input').value='';$('#chat-input').focus();}}
 else if(form.id==='bid-form')await action({type:'bid',amount:Number($('#bid-amount').value),target:Number($('#bid-target')?.value)});
 else if(form.id==='trade-form'){collectTrade();if(await action({type:'tradeOffer',...tradeDraft})){tradeDraft=null;openModal('trades');toast('Trade offer sent.');}}
});
document.addEventListener('change',e=>{if(e.target.id==='trade-recipient'){collectTrade();tradeDraft.toId=e.target.value;tradeDraft.receive={cash:0,deeds:[],cards:[]};renderModal();}});
modal.addEventListener('close',()=>{if(modalView==='tradeEdit')collectTrade();modalView=null;});
modal.addEventListener('click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)modal.close();}});
window.addEventListener('online',()=>sync());document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});
setInterval(()=>{updateClocks();renderTokens();renderDice();},60);
setInterval(()=>{if(S)sync();},15000);
const invite=new URLSearchParams(location.search).get('room')?.toUpperCase();
if(invite&&sessions()[invite])resume(invite);else renderHome();
