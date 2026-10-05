import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {once} from 'node:events';
import {build} from 'esbuild';
import {defaults} from '../backend/config.mjs';

test('real controller accepts language updates during startup and settings restart', {timeout:15000},async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'termix-concurrency-'));
  let child;
  try{
    const runtime=path.join(root,'runtime'),data=path.join(root,'data'),tools=path.join(root,'tools');
    const app=path.join(runtime,'termix/dist/backend/backend');
    for(const dir of [app,data,tools,path.join(runtime,'runtime'),path.join(runtime,'guacd/lib')])await mkdir(dir,{recursive:true});
    await symlink(process.execPath,path.join(runtime,'runtime/node'));
    await writeFile(path.join(tools,'ip'),'#!/bin/sh\nprintf "[]"\n',{mode:0o755});
    await writeFile(path.join(runtime,'guacd/lib/ld-musl-aarch64.so.1'),'#!/bin/sh\nexec sleep 60\n',{mode:0o755});
    await writeFile(path.join(app,'starter.js'),`const fs=require('node:fs');
setTimeout(()=>process.send({ready:true}),250);
process.on('message',m=>{fs.appendFileSync(process.env.FRAMELY_DATA_DIR+'/controls.log',JSON.stringify(m)+'\\n');process.send({id:m.id,result:true});});
setInterval(()=>{},1000);`);
    const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));
    const port=listener.address().port;await new Promise(r=>listener.close(r));
    await writeFile(path.join(data,'settings.json'),JSON.stringify({...defaults,enabled:true,configured:true,userId:'test',httpEnabled:true,httpsEnabled:false,httpPort:port,httpsPort:port===65535?port-1:port+1,interfaces:[]}));
    await build({entryPoints:['backend/controller.mjs'],bundle:true,platform:'node',format:'esm',outfile:path.join(root,'controller.mjs')});
    await writeFile(path.join(root,'page.js'),'');await writeFile(path.join(root,'bridge.js'),'');
    child=spawn(process.execPath,[path.join(root,'controller.mjs')],{env:{...process.env,PATH:tools+':'+process.env.PATH,FRAMELY_DATA_DIR:data,TERMIX_RUNTIME:runtime,TERMIX_SKIP_FRAME_SEED:'1'},stdio:['pipe','pipe','pipe']});
    let sequence=0,errors='';const pending=new Map();
    child.stderr.on('data',b=>{errors+=b;});
    createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line);pending.get(reply.id)?.(reply);pending.delete(reply.id);});
    const rpc=async(method,params={})=>{
      const id=++sequence;const reply=await new Promise(resolve=>{pending.set(id,resolve);child.stdin.write(JSON.stringify({id,method,params})+'\n');});
      assert.equal(reply.error,undefined,errors+' '+JSON.stringify(reply));return reply.result;
    };
    const finish=async()=>{for(let i=0;i<150;i++){const s=await rpc('status.get');if(!s.busy){assert.equal(s.error,'');return s;}await new Promise(r=>setTimeout(r,20));}throw Error('Controller remained busy: '+errors);};
    assert.equal((await rpc('status.get')).busy,true);
    await rpc('language.sync',{language:'ja-JP'});await rpc('language.sync',{language:'zh-CN'});
    assert.equal((await finish()).config.systemLanguage,'zh-CN');
    await rpc('settings.save',{language:'fr-FR'});
    await rpc('language.sync',{language:'en-US'});await rpc('language.sync',{language:'ja-JP'});
    const final=await finish();assert.equal(final.config.language,'fr-FR');assert.equal(final.config.systemLanguage,'ja-JP');
    const saved=JSON.parse(await readFile(path.join(data,'settings.json'),'utf8'));
    assert.equal(saved.systemLanguage,'ja-JP');assert.equal(saved.language,'fr-FR');
    const controls=(await readFile(path.join(data,'controls.log'),'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(controls.at(-1).method,'language.set');assert.equal(controls.at(-1).params.language,'fr');
    assert.equal((await rpc('language.sync',{language:'ja-JP'})).busy,false);
    const after=(await readFile(path.join(data,'controls.log'),'utf8')).trim().split('\n');
    assert.equal(after.length,controls.length);
  }finally{
    if(child&&child.exitCode===null){const exited=once(child,'exit');child.stdin.end();await exited;}
    await rm(root,{recursive:true,force:true});
  }
});
