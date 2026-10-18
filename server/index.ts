import {newRoom,joinRoom,transition,publicState,secureInt,RuleError,assertState} from './engine.mjs';
const URL = Deno.env.get('SUPABASE_URL')!;
const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');
const KEY=secretKeys.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const headers:Record<string,string>={'apikey':KEY,'Content-Type':'application/json'};
if(!KEY?.startsWith('sb_secret_'))headers.Authorization='Bearer '+KEY;
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type,apikey,x-baron-token','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...CORS,'Content-Type':'application/json'}});
const sha=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
async function db(path:string,body?:unknown,method?:string){
 const r=await fetch(URL+'/rest/v1/'+path,{method:method||(body?'POST':'GET'),headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)});
 const data=await r.json().catch(()=>null);
 if(!r.ok){console.error('Database request failed',r.status,data?.code);throw new Error('The game service is temporarily unavailable. Please retry.');}
 return data;
}
async function findRoom(code:string){return (await db('baron_rooms?code=eq.'+encodeURIComponent(code)+'&select=id,code,version,state&limit=1'))?.[0];}
async function rate(key:string,limit:number,seconds:number){if(!await db('rpc/baron_take_rate',{p_key:key,p_limit:limit,p_seconds:seconds}))throw new RuleError('Too many requests. Wait a moment and try again.');}
function identity(state:any,hash:string){return Object.keys(state.sessions).find(id=>state.sessions[id]===hash);}
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code=()=>Array.from({length:6},()=>alphabet[secureInt(alphabet.length)]).join('');

Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
 if(req.method!=='POST')return respond({error:'Use POST.'},405);
 try{
  const length=Number(req.headers.get('content-length')||0);if(length>16000)return respond({error:'Request too large.'},413);
  const raw=await req.text();if(raw.length>16000)return respond({error:'Request too large.'},413);
  let b:any;try{b=JSON.parse(raw);}catch{return respond({error:'Invalid JSON.'},400);}
  const token=req.headers.get('x-baron-token');
  if(!token||!/^[a-f0-9]{64}$/.test(token))return respond({error:'A valid player session is required.'},401);
  if(!uuid(b.requestId))return respond({error:'A request ID is required.'},400);
  const receivedAt=Date.now(),hash=await sha(token);
  const view=(state:any,id:string,version:number)=>{const sentAt=Date.now();return respond({state:publicState(state,id,sentAt),version,elapsedMs:sentAt-receivedAt});};
  if(b.op==='create'){
   const existing=(await db('baron_rooms?id=eq.'+b.requestId+'&select=id,code,version,state&limit=1'))?.[0];
   if(existing){const id=identity(existing.state,hash);if(!id)return respond({error:'This request ID is already used.'},409);return view(existing.state,id,existing.version);}
   const ip=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
   await rate('create:'+await sha(KEY+ip),5,3600);
   const playerId=crypto.randomUUID();
   const s=newRoom({id:b.requestId,code:code(),playerId,name:b.name,tokenHash:hash,now:Date.now()});
   // Room codes use a uniqueness constraint. Retry a collision without creating extra rooms.
   for(let i=0;i<5;i++){
    const r=await fetch(URL+'/rest/v1/baron_rooms',{method:'POST',headers:{...headers,Prefer:'return=representation'},body:JSON.stringify({id:s.id,code:s.code,state:s}),signal:AbortSignal.timeout(12000)});
    if(r.ok){const rows=await r.json();return view(s,playerId,rows[0].version);}
    const err=await r.json().catch(()=>null);if(err?.code==='23505'){s.code=code();continue;}
    console.error('Create room failed',r.status,err?.code);throw new Error('Could not create the room. Please retry.');
   }
   throw new Error('Could not allocate a room code. Please retry.');
  }
  if(typeof b.code!=='string'||!/^[A-Z2-9]{6}$/.test(b.code))return respond({error:'Enter a six-character room code.'},400);
  // One database round trip loads the room and applies the per-session rate limit.
  const loaded=await db('rpc/baron_load_room',{p_code:b.code,p_session_hash:hash});
  if(loaded.limited)return respond({error:'Too many requests. Wait a moment and try again.'},422);
  for(let attempt=0;attempt<12;attempt++){
   const room=attempt===0?loaded.room:await findRoom(b.code),now=Date.now();if(!room)return respond({error:'Room not found. Check the code.'},404);
   const state=room.state;let id=identity(state,hash),next;
   if(b.op==='join'&&!id){
    if(state.status!=='lobby')return respond({error:'This game has started. Reconnect using the browser that holds your original seat.'},403);
    id=crypto.randomUUID();next=structuredClone(state);joinRoom(next,{playerId:id,name:b.name,tokenHash:hash,now});
   }else{
    if(!id)return respond({error:'Your saved session does not belong to this room.'},401);
    if(state.requests.some((r:any)=>r.id===b.requestId&&r.playerId===id))return view(state,id,room.version);
    const action=b.op==='join'||b.op==='sync'?{type:'sync'}:b.op==='action'?b.action:null;
    if(!action||typeof action.type!=='string')return respond({error:'Invalid game request.'},400);
    next=transition(state,id,action,now);
   }
   // Invalidation reads within the heartbeat window require no write, CAS conflict or broadcast.
   if((b.op==='sync'||b.op==='join')&&JSON.stringify(next)===JSON.stringify(state))return view(state,id,room.version);
   assertState(next);next.requests.push({id:b.requestId,playerId:id});next.requests=next.requests.slice(-100);
   const notify=state.seq!==next.seq||JSON.stringify(state.trades)!==JSON.stringify(next.trades)||JSON.stringify(state.chat)!==JSON.stringify(next.chat)||JSON.stringify(state.players.map((p:any)=>[p.id,p.color,p.ready]))!==JSON.stringify(next.players.map((p:any)=>[p.id,p.color,p.ready]))||state.status!==next.status;
   const committed=await db('rpc/baron_commit',{p_id:room.id,p_expected:room.version,p_state:next,p_notify:notify});
   if(committed)return view(next,id,room.version+1);
  }
  return respond({error:'The room changed at the same time. Please try that action again.'},409);
 }catch(e){
  if(e instanceof RuleError)return respond({error:e.message},422);
  console.error('Baron request failed',e instanceof Error?e.name:'Unknown');
  return respond({error:e instanceof Error&&e.message.startsWith('The game service')?e.message:'The game service could not complete this request. Please retry.'},503);
 }
});
