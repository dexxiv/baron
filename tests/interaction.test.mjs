import test from 'node:test';
import assert from 'node:assert/strict';
import {ActionGate,Playback,turnLocked} from '../public/interaction.mjs';
const state=(extra={})=>({id:'room',turn:{phase:'purchase',lockUntil:1500},animations:[],...extra});
test('purchase unlocks when motion ends without a new state response',()=>{
 const s=state();assert.equal(turnLocked(s,1499),true);assert.equal(turnLocked(s,1500),false);
 assert.equal(turnLocked(s,45000),false);
});
test('an unchanged or older successful response always releases the action gate',async()=>{
 const changes=[],gate=new ActionGate(b=>changes.push(b));let finish;
 const pending=gate.run(()=>new Promise(resolve=>finish=resolve));assert.equal(gate.busy,true);
 assert.equal(await gate.run(()=>assert.fail('duplicate action')),false);
 finish({version:1});await pending;assert.equal(gate.busy,false);assert.deepEqual(changes,[true,false]);
 await assert.rejects(gate.run(()=>Promise.reject(new Error('offline'))),/offline/);assert.equal(gate.busy,false);
 assert.equal(await gate.run(()=>true),true);
});
test('a slow response still plays dice before every movement step, once only',()=>{
 const p=new Playback();p.accept(state({turn:{lockUntil:0}}),0);
 const s=state({diceRoll:{id:'roll',playerId:'a',values:[1,2],start:100,end:500},animations:[{id:'move',playerId:'a',path:[0,1,2,3],start:500,end:980}]});
 p.accept(s,1400);assert.equal(p.active('dice',1400).id,'roll');assert.equal(p.position({id:'a',pos:3},1500),0);
 assert.equal(p.active('move',1800).id,'move');assert.equal(p.position({id:'a',pos:3},2040),2);
 assert.equal(turnLocked(s,2279,p.end(2279)),true);assert.equal(turnLocked(s,2280,p.end(2280)),false);
 p.accept(s,2400);assert.equal(p.events.length,0);assert.equal(p.position({id:'a',pos:3},2400),3);
});
test('refresh skips completed history and preserves ordered card movement',()=>{
 const p=new Playback();p.accept(state({diceRoll:{id:'old',start:0,end:400},animations:[{id:'old',playerId:'a',path:[0,1],start:400,end:700}]}),10000);assert.equal(p.events.length,0);
 p.accept(state({animations:[{id:'one',playerId:'a',path:[1,2],start:10000,end:10300},{id:'two',playerId:'a',path:[2,1,0],start:10300,end:10660}]}),10100);
 assert.equal(p.position({id:'a',pos:0},10100),1);assert.equal(p.position({id:'a',pos:0},10400),2);assert.equal(p.position({id:'a',pos:0},10640),0);
});
