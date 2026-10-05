import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {createProxy,forwardHeaders} from '../backend/gateway.mjs';
test('client proxy headers cannot impersonate an internal caller',()=>{
 const headers=forwardHeaders({headers:{host:'192.168.5.67:19627','x-forwarded-for':'127.0.0.1','x-termix-internal-token':'secret',forwarded:'for=127.0.0.1','x-real-ip':'127.0.0.1'},socket:{remoteAddress:'192.168.5.2'}});
 assert.equal(headers['x-forwarded-for'],'192.168.5.2');assert.equal(headers['x-termix-internal-token'],undefined);assert.equal(headers.forwarded,undefined);assert.equal(headers['x-real-ip'],undefined);
});
test('access policy covers ordinary HTTP and WebSocket upgrades',async()=>{
 const p=createProxy({port:1,allowed:()=>false,languageScript:()=>'',assets:{}}),s=http.createServer(p.handle);p.track(s);s.on('upgrade',p.upgrade);
 await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;
 try{
 const result=await fetch(`http://127.0.0.1:${port}/`);assert.equal(result.status,403);
 const answer=await new Promise((resolve,reject)=>{const socket=net.connect(port,'127.0.0.1',()=>socket.write('GET /socket HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n'));let text='';socket.on('data',b=>text+=b);socket.on('end',()=>resolve(text));socket.on('error',reject);});
 assert.match(answer,/403 Forbidden/);
 }finally{p.disconnect();await new Promise(r=>s.close(r));}
});
test('only local proxy can redeem window login, initializing frontend session with HttpOnly cookie',async()=>{
 let calls=0;
 const options={port:1,allowed:()=>true,languageScript:()=>'',assets:{},windowLogin:async ticket=>{calls++;return ticket==='ticket'?{token:'session-token',maxAge:60000,username:'test'}:null;}};
 const local=createProxy({...options,local:true}),lan=createProxy(options);
 const servers=[http.createServer(local.handle),http.createServer(lan.handle)];
 for(const s of servers)await new Promise(r=>s.listen(0,'127.0.0.1',r));
 const url=(s)=>`http://127.0.0.1:${s.address().port}/framely-window/login?ticket=ticket`;
 try{
  assert.equal((await fetch(url(servers[1]),{redirect:'manual'})).status,403);assert.equal(calls,0);
  assert.equal((await fetch(url(servers[0]),{redirect:'manual',headers:{Origin:'https://untrusted.example'}})).status,403);assert.equal(calls,0);
  assert.equal((await fetch(url(servers[0]),{method:'POST',redirect:'manual'})).status,403);assert.equal(calls,0);
  const r=await fetch(url(servers[0]),{redirect:'manual'});assert.equal(r.status,200);assert.match(await r.text(),/framely-window-session/);
  assert.equal((await fetch(url(servers[1]).split('/framely-window')[0]+'/framely-window/session.js')).status,403);
  assert.match(r.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('referrer-policy'),'no-referrer');
 }finally{await Promise.all(servers.map(s=>new Promise(r=>s.close(r))));}
});
