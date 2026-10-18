// Run manually after deployment. Uses guest sessions held only in this process.
import assert from 'node:assert/strict';
import {BACKEND,PUBLIC_KEY} from '../public/config.mjs';
const token=()=>Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');
const a=token(),b=token(),unknown=token();
async function request(session,body){
 const r=await fetch(BACKEND+'/functions/v1/baron',{method:'POST',headers:{apikey:PUBLIC_KEY,'content-type':'application/json','x-baron-token':session},body:JSON.stringify({requestId:crypto.randomUUID(),...body}),signal:AbortSignal.timeout(30000)});
 return {status:r.status,data:await r.json()};
}
let r=await request(a,{op:'create',name:'QA Host'});assert.equal(r.status,200,JSON.stringify(r.data));const code=r.data.state.code,aid=r.data.state.viewerId;
console.log('Created QA room',code,'version',r.data.version);
r=await request(b,{op:'join',code,name:'QA Guest'});assert.equal(r.status,200,JSON.stringify(r.data));const bid=r.data.state.viewerId;
for(const [session,color] of [[a,'terracotta'],[b,'evergreen']]){
 r=await request(session,{op:'action',code,action:{type:'color',color}});assert.equal(r.status,200,JSON.stringify(r.data));
 r=await request(session,{op:'action',code,action:{type:'ready',ready:true}});assert.equal(r.status,200,JSON.stringify(r.data));
}
r=await request(a,{op:'action',code,action:{type:'start'}});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.state.status,'playing');
const active=r.data.state.turn.playerId===aid?a:b,other=active===a?b:a;
r=await request(other,{op:'action',code,action:{type:'roll'}});assert.equal(r.status,422); // server owns turn rights
const id=crypto.randomUUID();r=await request(active,{requestId:id,op:'action',code,action:{type:'roll'}});assert.equal(r.status,200,JSON.stringify(r.data));const seq=r.data.state.seq;
r=await request(active,{requestId:id,op:'action',code,action:{type:'roll'}});assert.equal(r.status,200);assert.equal(r.data.state.seq,seq); // idempotency
r=await request(unknown,{op:'sync',code});assert.equal(r.status,401);
r=await request(unknown,{op:'join',code,name:'Late'});assert.equal(r.status,403);
const roomId=r.data.state?.id??(await request(a,{op:'sync',code})).data.state.id;
const ws=new WebSocket(BACKEND.replace('https:','wss:')+'/realtime/v1/websocket?apikey='+encodeURIComponent(PUBLIC_KEY)+'&vsn=1.0.0');
let sawBroadcast=false;
await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Realtime join timed out')),10000);ws.onopen=()=>ws.send(JSON.stringify({topic:'realtime:baron:'+roomId,event:'phx_join',payload:{config:{broadcast:{ack:false,self:false},presence:{enabled:false},private:false}},ref:'1',join_ref:'1'}));ws.onerror=()=>reject(new Error('Realtime connection failed'));ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.event==='phx_reply'&&m.ref==='1'){clearTimeout(timer);assert.equal(m.payload.status,'ok',JSON.stringify(m));resolve();}if(m.event==='broadcast'&&m.payload.event==='changed')sawBroadcast=true;};});
const concurrent=await Promise.all([request(a,{op:'action',code,action:{type:'chat',text:'First concurrent message'}}),request(b,{op:'action',code,action:{type:'chat',text:'Second concurrent message'}})]);for(const x of concurrent)assert.equal(x.status,200,JSON.stringify(x.data));
r=await request(a,{op:'sync',code});assert.equal(r.data.state.chat.length,2);assert.ok(!JSON.stringify(r.data.state).includes('sessions'));
const direct=await fetch(BACKEND+'/rest/v1/baron_rooms?select=id',{headers:{apikey:PUBLIC_KEY},signal:AbortSignal.timeout(10000)});assert.ok([401,403].includes(direct.status),'Anonymous database must be blocked');
await new Promise(resolve=>setTimeout(resolve,1500));ws.close();assert.ok(sawBroadcast,'Realtime broadcast must reach the subscribed room');
console.log('PASS: realtime broadcast, two-player lobby, game start, turn validation, idempotency, closed entry, concurrent chat, session authentication and private database.');
console.log('QA room ID:',r.data.state.id);
