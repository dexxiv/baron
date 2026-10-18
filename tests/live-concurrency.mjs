// Manual hosted stress check. Guest credentials remain only in process memory.
import {BACKEND,PUBLIC_KEY} from '../public/config.mjs';
const users=Array.from({length:8},(_,i)=>({name:'Load QA '+i,token:Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex')}));
let code=process.argv[2],roomId;
async function req(u,body){const r=await fetch(BACKEND+'/functions/v1/baron',{method:'POST',headers:{apikey:PUBLIC_KEY,'content-type':'application/json','x-baron-token':u.token},body:JSON.stringify({requestId:crypto.randomUUID(),code,...body}),signal:AbortSignal.timeout(25000)});const data=await r.json();return {status:r.status,data};}
if(!code){const created=await req(users[0],{op:'create',name:users[0].name});if(created.status!==200)throw new Error(created.data.error);code=created.data.state.code;roomId=created.data.state.id;}else{const joined=await req(users[0],{op:'join',name:users[0].name});if(joined.status!==200)throw new Error(joined.data.error);roomId=joined.data.state.id;}
for(const u of users.slice(1)){const x=await req(u,{op:'join',name:u.name});if(x.status!==200)throw new Error(x.data.error);}
const results=[];for(let round=0;round<3;round++){const batch=await Promise.all(users.map(u=>req(u,{op:'action',action:{type:'chat',text:'Concurrent room check '+round}})));results.push(batch.map(x=>x.status));}
const final=await req(users[0],{op:'sync'});console.log(JSON.stringify({roomId,code,statuses:results,messages:final.data.state?.chat.length,expectedMessages:24}));
if(results.flat().some(s=>s!==200)||final.data.state.chat.length!==24)process.exitCode=1;
