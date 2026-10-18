// Presentation state is local; dice, moves, cash and deadlines remain server-authoritative.
export class ActionGate {
 constructor(onChange=()=>{}){this.busy=false;this.onChange=onChange;}
 async run(task){
  if(this.busy)return false;
  this.busy=true;this.onChange(true);
  try{return await task();}
  finally{this.busy=false;this.onChange(false);}
 }
}
export function turnLocked(state,at,presentationEnd=0){return Math.max(state?.turn?.lockUntil??0,presentationEnd)>at;}
export class Playback {
 constructor(){this.reset();}
 reset(){this.room=null;this.seen=new Set();this.events=[];}
 accept(state,at){
  const initial=this.room!==state.id;if(initial){this.reset();this.room=state.id;}
  this.events=this.events.filter(e=>e.end>at);
  const events=[...(state.animations??[]).map(a=>({...a,kind:'move'})),...(state.diceRoll?[{...state.diceRoll,kind:'dice'}]:[])].sort((a,b)=>a.start-b.start);
  let end=Math.max(at,...this.events.map(e=>e.end));
  for(const event of events){
   const key=event.kind+':'+event.id;if(this.seen.has(key))continue;this.seen.add(key);
   // A refresh does not replay old turns. A newly received roll always gets visible playback.
   if(initial&&event.end<=at||event.end<at-20000)continue;
   const duration=initial?event.end-Math.max(event.start,at):event.end-event.start;
   const start=Math.max(end,initial?event.start:at);
   this.events.push({...event,start,end:start+duration});end=start+duration;
  }
  if(this.seen.size>160)this.seen=new Set([...this.seen].slice(-80));
 }
 end(at){return Math.max(at,...this.events.filter(e=>e.end>at).map(e=>e.end));}
 active(kind,at){return this.events.find(e=>e.kind===kind&&e.start<=at&&e.end>at);}
 position(player,at){
  const moves=this.events.filter(e=>e.kind==='move'&&e.playerId===player.id&&e.end>at);
  const a=moves.find(e=>e.start<=at)??moves[0];if(!a)return player.pos;
  const step=Math.max(0,Math.min(a.path.length-1,Math.floor((at-a.start)/(a.end-a.start)*a.path.length)));
  return a.path[step];
 }
}
