import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deferredLanguageSync} from '../backend/language-sync.mjs';

test('startup defers and coalesces language without overwriting updated settings', async () => {
  let config = {systemLanguage:'en-US', language:'auto', httpPort:19627};
  const writes=[];
  const sync=deferredLanguageSync(async language=>{
    config={...config,systemLanguage:language};writes.push({...config});
  });
  sync.request('zh-CN');sync.request('ja-JP');sync.request('zh-CN');
  assert.equal(writes.length,0);
  config={...config,language:'fr-FR',httpPort:20000};
  await sync.drain();
  assert.deepEqual(writes,[{systemLanguage:'zh-CN',language:'fr-FR',httpPort:20000}]);
  assert.equal(sync.hasPending(),false);
});
test('updates during sync serialize saves and apply the latest language',async()=>{
  const applied=[];let release;
  const gate=new Promise(r=>{release=r;});let active=0;
  const sync=deferredLanguageSync(async language=>{
    assert.equal(active++,0);applied.push(language);
    if(language==='en-US')await gate;
    active--;
  });
  sync.request('en-US');const first=sync.drain();
  sync.request('ja-JP');sync.request('zh-CN');
  assert.equal(sync.drain(),first);release();await first;
  assert.deepEqual(applied,['en-US','zh-CN']);
});
test('failed sync releases its lock for later retries',async()=>{
  let fail=true;const applied=[];
  const sync=deferredLanguageSync(async language=>{if(fail)throw Error('save failed');applied.push(language);});
  sync.request('zh-CN');await assert.rejects(sync.drain(),/save failed/);
  fail=false;sync.request('zh-CN');await sync.drain();
  assert.deepEqual(applied,['zh-CN']);
});
