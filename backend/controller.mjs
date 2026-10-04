import {fork,spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir,chmod,rename} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {randomUUID} from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadConfig,saveConfig,validateConfig} from './config.mjs';
import {discoverInterfaces,defaultInterfaces,privateIP,permitted} from './network.mjs';
import {createProxy} from './gateway.mjs';
import {certificate} from './tls.mjs';
import {normalizeLanguage} from './language.mjs';
import {windowTickets} from './window-login.mjs';
import {exportCertificate} from './certificate-export.mjs';

const exec=promisify(execFile),root=path.dirname(fileURLToPath(import.meta.url));
const data=process.env.FRAMELY_DATA_DIR;if(!data)throw Error('FRAMELY_DATA_DIR is required');
const runtime=process.env.TERMIX_RUNTIME;if(!runtime)throw Error('TERMIX_RUNTIME is required');
const app=path.join(runtime,'termix'),node=path.join(runtime,'runtime/node');
let config=await loadConfig(data),interfaces=[],children=[],servers=[],proxies=[],internalPort=0,localPort=0,phase='stopped',error='',busy=false,child=null,certInfo=null;
let sequence=0,pidWrites=Promise.resolve();const pending=new Map();
const tickets=windowTickets();
const settingsFields=['httpEnabled','httpsEnabled','httpPort','httpsPort','interfaces','language'];
const assets={ '/framely-page.js':await readFile(path.join(root,'page.js')), '/framely-bridge.js':await readFile(path.join(root,'bridge.js')) };
const wrapper='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script src="/framely-bridge.js"></script><script src="/framely-page.js"></script></body></html>';
function effectiveLanguage(){return config.language==='auto'?config.systemLanguage:config.language;}
function termixLanguage(){return normalizeLanguage(effectiveLanguage());}
function languageScript(){return `(()=>{const d=${JSON.stringify(termixLanguage())};try{const old=localStorage.getItem('framely-default-language'),current=localStorage.getItem('i18nextLng');if(!current||current===old)localStorage.setItem('i18nextLng',d);localStorage.setItem('framely-default-language',d);}catch{}})();`;}
function selected(){return config.interfaces??defaultInterfaces(interfaces);}
function status(){return {phase,error,busy,config,interfaces:selectedInterfaces(),language:effectiveLanguage(),localUrl:localPort?`http://localhost:${localPort}/framely-window/main`:null,addresses:interfaces.filter(i=>selected().includes(i.key)&&i.up).flatMap(i=>i.addresses.filter(a=>privateIP(a.address)).flatMap(a=>{const h=a.address.includes(':')?'['+a.address+']':a.address;return [...(config.httpEnabled?[`http://${h}:${config.httpPort}`]:[]),...(config.httpsEnabled?[`https://${h}:${config.httpsPort}`]:[])];})),certificate:certInfo?{fingerprint:certInfo.fingerprint}:null,upstream:'2.9.0'};}
function selectedInterfaces(){return interfaces.map(i=>({...i,enabled:selected().includes(i.key)}));}
async function refreshNetwork(){interfaces=await discoverInterfaces();}
function allowed(s){return phase==='running'&&permitted(s.remoteAddress,s.localAddress,interfaces,selected());}
async function listen(server,port,host){return await new Promise((resolve,reject)=>{const fail=e=>{server.close();reject(e);};server.once('error',fail);server.listen(port,host,()=>{server.removeListener('error',fail);server.on('error',e=>void failService(e));resolve(server.address().port);});});}
async function freePort(){const s=net.createServer();const port=await listen(s,0,'127.0.0.1');await new Promise(r=>s.close(r));return port;}
function recordPids(){const value=JSON.stringify(children.map(c=>({pid:c.pid})));pidWrites=pidWrites.then(async()=>{const file=path.join(data,'processes.json');await writeFile(file+'.tmp',value,{mode:0o600});await rename(file+'.tmp',file);});return pidWrites;}
function addChild(c){children.push(c);c.stdout?.on('data',b=>process.stderr.write(b));c.stderr?.on('data',b=>process.stderr.write(b));void recordPids();c.on('exit',()=>{children=children.filter(x=>x!==c);void recordPids();if(phase==='running')void failService(Error('Termix component exited'));});return c;}
async function failService(e){error=e.message;await stop();phase='failed';}
async function terminate(c){if(c.exitCode!==null||c.signalCode)return;await new Promise(resolve=>{const t=setTimeout(()=>{c.kill('SIGKILL');resolve();},3000);c.once('exit',()=>{clearTimeout(t);resolve();});c.kill('SIGTERM');});}
async function stop(){tickets.clear();phase='stopping';for(const p of proxies)p.disconnect();await Promise.all(servers.map(s=>new Promise(r=>s.close(()=>r()))));servers=[];proxies=[];localPort=0;await Promise.all([...children].map(terminate));children=[];child=null;for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Service stopped'));}pending.clear();await recordPids();phase='stopped';}
function control(method,params){return new Promise((resolve,reject)=>{if(!child?.connected)return reject(Error('Termix is not ready'));const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('Termix control timeout'));},12000);pending.set(id,{resolve,reject,timer});child.send({id,method,params});});}
async function startBackend(){
  if(child)return;
  phase='starting';internalPort=await freePort();const guacdPort=await freePort();
  const g=path.join(runtime,'guacd');
  const library=[g+'/lib',g+'/usr/lib',g+'/usr/lib/pulseaudio',g+'/opt/guacamole/lib'].join(':');
  addChild(spawn(g+'/lib/ld-musl-aarch64.so.1',['--library-path',library,g+'/opt/guacamole/sbin/guacd','-f','-b','127.0.0.1','-l',String(guacdPort)],{env:{...process.env,LD_LIBRARY_PATH:library,OPENSSL_MODULES:g+'/usr/lib/ossl-modules',FONTCONFIG_PATH:g+'/etc/fonts',FONTCONFIG_SYSROOT:g},stdio:['ignore','pipe','pipe']}));
  await mkdir(path.join(data,'termix'),{recursive:true,mode:0o700});
  child=addChild(fork(app+'/dist/backend/backend/starter.js',[],{execPath:node,cwd:app,env:{...process.env,NODE_ENV:'production',DATA_DIR:path.join(data,'termix'),TERMIX_HTTP_PORT:String(internalPort),ALLOW_REGISTRATION:'false',ALLOW_PASSWORD_RESET:'false',ENABLE_SSL:'false',ELECTRON_EMBEDDED:'false',GUACD_URL:`127.0.0.1:${guacdPort}`,GUACD_TUNNEL_HOST:'127.0.0.1',GUACD_RECORDING_PATH:path.join(data,'termix/session_recordings/guacamole'),GUACD_RECORDING_BACKEND_PATH:path.join(data,'termix/session_recordings/guacamole'),GUACD_DRIVE_PATH:path.join(data,'termix/guacd-drives'),OPKSSH_BUNDLED_DIR:app},stdio:['ignore','pipe','pipe','ipc']}));
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('Termix startup timed out')),25000);
    child.once('exit',()=>{clearTimeout(timeout);reject(Error('Termix startup failed'));});
    child.on('message',m=>{if(m.ready){clearTimeout(timeout);resolve();return;}const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.result);}});
  });
}
async function frameKey(){
  const dir=path.join(data,'ssh');await mkdir(dir,{recursive:true,mode:0o700});
  const key=path.join(dir,'frame_ed25519');try{await readFile(key);}catch(e){if(e.code!=='ENOENT')throw e;await exec('ssh-keygen',['-q','-t','ed25519','-N','','-C','framely-tooru.termix','-f',key],{timeout:5000});}
  const pub=(await readFile(key+'.pub','utf8')).trim(),home=process.env.HOME;
  if(!home)throw Error('Missing Steam user home');
  const ssh=path.join(home,'.ssh');await mkdir(ssh,{recursive:true,mode:0o700});
  const file=path.join(ssh,'authorized_keys');let original='';try{original=await readFile(file,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
  const line='from="127.0.0.1,::1" '+pub;
  if(!original.split('\n').includes(line)){await writeFile(file+'.termix.tmp',original+(original&&!original.endsWith('\n')?'\n':'')+line+'\n',{mode:0o600});await rename(file+'.termix.tmp',file);}
  await chmod(file,0o600);return {userId:config.userId,username:os.userInfo().username,key:await readFile(key,'utf8')};
}
async function start(){
  if(!config.configured)throw Error('Set a username and password first');
  await refreshNetwork();await startBackend();
  await control('language.set',{userId:config.userId,language:termixLanguage()});
  if(process.env.TERMIX_SKIP_FRAME_SEED!=='1')await control('frame.seed',await frameKey());
  const proxyOptions={port:internalPort,allowed,languageScript,bootstrap:assets['/framely-bridge.js'],wrapper,assets};
  const lp=createProxy({...proxyOptions,local:true,windowLogin:async ticket=>{if(!tickets.consume(ticket))return null;return control('window.login',{userId:config.userId});}}),local=http.createServer(lp.handle);lp.track(local);local.on('upgrade',lp.upgrade);proxies.push(lp);servers.push(local);localPort=await listen(local,0,'127.0.0.1');
  if(config.httpsEnabled)certInfo=await certificate(path.join(data,'tls'),interfaces.flatMap(i=>i.addresses.filter(a=>privateIP(a.address)).map(a=>a.address)));
  const hosts=[...new Set(['127.0.0.1','::1',...interfaces.filter(i=>selected().includes(i.key)&&i.up).flatMap(i=>i.addresses.filter(a=>privateIP(a.address)).map(a=>a.address.startsWith('fe80:')?a.address+'%'+i.name:a.address))])];
  for(const [enabled,tls,port] of [[config.httpEnabled,false,config.httpPort],[config.httpsEnabled,true,config.httpsPort]]) {
    if(!enabled)continue;
    for(const host of hosts){const p=createProxy(proxyOptions),s=tls?https.createServer(certInfo,p.handle):http.createServer(p.handle);p.track(s);s.on('upgrade',p.upgrade);servers.push(s);proxies.push(p);await listen(s,port,host);}
  }
  phase='running';
}
function operation(fn){if(busy)throw Error('An operation is already running');busy=true;error='';void Promise.resolve().then(fn).catch(async e=>{error=e.message;await stop();phase='failed';}).finally(()=>{busy=false;});return status();}
async function dispatch(method,params={}) {
  if(method==='status.get')return status();
  if(method==='window.get'){if(phase!=='running'||!localPort)throw Error('Enable Termix first');return {url:`http://localhost:${localPort}/framely-window/main`};}
  if(method==='window.login'){if(phase!=='running'||!localPort||busy)throw Error('Enable Termix first');return {url:`http://localhost:${localPort}/framely-window/login?ticket=${tickets.issue()}`};}
  if(method==='certificate.export')return exportCertificate(data,process.env.HOME);
  if(method==='certificate.get'){return {pem:await readFile(path.join(data,'tls/cert.pem'),'utf8')};}
  if(method==='credentials.set') {
    if(typeof params.username!=='string'||!/^[\p{L}\p{N}_.@-]{1,64}$/u.test(params.username))throw Error('Invalid username');
    if(typeof params.password!=='string'||params.password.length<6||!/[a-zA-Z]/.test(params.password)||!/[0-9]/.test(params.password))throw Error('Password must contain at least 6 characters, including letters and numbers');
    return operation(async()=>{await stop();await startBackend();const user=await control('credentials.set',{...params,userId:config.userId});config={...config,...user,configured:true};await saveConfig(data,config);await stop();if(config.enabled)await start();});
  }
  if(method==='settings.save') {
    if(Object.keys(params).some(k=>!settingsFields.includes(k)))throw Error('Unknown setting');
    const next=validateConfig({...config,...params});
    return operation(async()=>{await stop();config=next;await saveConfig(data,config);if(config.enabled)await start();});
  }
  if(method==='service.set') {
    if(typeof params.enabled!=='boolean')throw Error('Invalid enabled');
    if(params.enabled&&!config.configured)throw Error('Set a username and password first');
    return operation(async()=>{await stop();config={...config,enabled:params.enabled};await saveConfig(data,config);if(config.enabled)await start();});
  }
  if(method==='language.sync') {
    if(busy)throw Error('An operation is already running');
    const next=validateConfig({...config,systemLanguage:params.language});config=next;await saveConfig(data,config);
    if(child&&!busy)await control('language.set',{userId:config.userId,language:termixLanguage()});return status();
  }
  if(method==='framely.lifecycle.start')return {ready:true};
  if(method==='framely.lifecycle.stop'){await stop();return {stopped:true};}
  throw Error('Unknown method');
}
await refreshNetwork().catch(e=>{error=e.message;});
if(config.enabled)operation(start);
const networkTimer=setInterval(async()=>{
  if(busy||phase!=='running')return;
  try{const old=JSON.stringify(interfaces);await refreshNetwork();if(old!==JSON.stringify(interfaces))operation(async()=>{await stop();await start();});}catch(e){await failService(e);}
},3000);
let rpc=Promise.resolve();
const lines=createInterface({input:process.stdin});
lines.on('line',line=>{rpc=rpc.then(async()=>{let request;try{if(Buffer.byteLength(line)>65536)throw Error('Request too large');request=JSON.parse(line);const result=await dispatch(request.method,request.params);process.stdout.write(JSON.stringify({id:request.id,result})+'\n');}catch(e){process.stdout.write(JSON.stringify({id:request?.id??null,error:e.message})+'\n');}});});
async function shutdown(){clearInterval(networkTimer);await stop();process.exit(0);}
lines.on('close',()=>void shutdown());process.on('SIGTERM',()=>void shutdown());process.on('SIGINT',()=>void shutdown());
