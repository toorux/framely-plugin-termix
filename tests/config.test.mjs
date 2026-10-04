import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaults,validateConfig} from '../backend/config.mjs';
test('default ports and disabled service',()=>{assert.equal(defaults.enabled,false);assert.equal(defaults.httpPort,19627);assert.equal(defaults.httpsPort,19628);assert.equal(defaults.language,'auto');});
test('invalid or duplicate ports and invalid interfaces are rejected',()=>{
 assert.throws(()=>validateConfig({...defaults,httpPort:443}));
 assert.throws(()=>validateConfig({...defaults,httpPort:19628}));
 assert.throws(()=>validateConfig({...defaults,interfaces:['x',12]}));
 assert.throws(()=>validateConfig({...defaults,enabled:true,httpEnabled:false,httpsEnabled:false}));
});
