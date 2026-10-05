import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {windowSessionPage,windowSessionScript,windowSessionAuthScript} from '../backend/window-session.mjs';

test('window session replaces stale frontend auth before loading Termix',()=>{
 const username='test</script><script>bad()</script>';
 const html=windowSessionPage({token:'new-session',username});
 assert.ok(!html.includes(username));
 const node={textContent:html.match(/id="framely-window-session">(.*?)<\/script>/)[1],remove(){this.textContent='';}};
 const stored=new Map([['jwt','old-session'],['termix_desktop_manual_logout','true']]);let target;
 vm.runInNewContext(windowSessionScript,{document:{getElementById:()=>node},localStorage:{setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)},location:{replace:url=>{target=url;}}});
 assert.equal(target,'/');assert.equal(stored.get('jwt'),'new-session');
 assert.deepEqual(JSON.parse(stored.get('termix_auth')),{loggedIn:true,username});
 assert.equal(stored.has('termix_desktop_manual_logout'),false);assert.equal(node.textContent,'');
});

test('window bearer auth reaches only same-origin fetch/XHR and preserves explicit auth',async()=>{
 const calls=[];
 class XHR {open(method,url){this.url=url;this.headers={};}setRequestHeader(k,v){this.headers[k]=v;}send(){}}
 const window={fetch:async(input,init)=>{calls.push({input,init});}};
 vm.runInNewContext(windowSessionAuthScript,{window,XMLHttpRequest:XHR,Headers,Request,URL,localStorage:{getItem:()=> 'test-session'},location:{href:'http://localhost:1234/',origin:'http://localhost:1234'}});
 await window.fetch('/users/me');assert.equal(calls[0].init.headers.get('Authorization'),'Bearer test-session');
 await window.fetch('https://example.com/');assert.equal(calls[1].init,undefined);
 await window.fetch('/users/me',{headers:{Authorization:'Bearer explicit'}});assert.equal(calls[2].init.headers.get('Authorization'),'Bearer explicit');
 const xhr=new XHR();xhr.open('GET','/host/db/host');xhr.send();assert.equal(xhr.headers.Authorization,'Bearer test-session');
 xhr.open('GET','http://127.0.0.1:1234/users/me');xhr.send();assert.deepEqual(xhr.headers,{});
 xhr.open('GET','/users/me');xhr.setRequestHeader('Authorization','Bearer explicit');xhr.send();assert.equal(xhr.headers.Authorization,'Bearer explicit');
});

test('blocked storage shows an error without navigating to an unauthenticated app',()=>{
 const message={textContent:''};let navigated=false;
 const denied=()=>{throw Error('Storage unavailable');};
 vm.runInNewContext(windowSessionScript,{document:{getElementById:id=>id==='message'?message:{textContent:'{"token":"session","username":"test"}',remove(){}}},localStorage:{setItem:denied,removeItem:denied,getItem:denied},navigator:{language:'zh-CN'},location:{replace:()=>{navigated=true;}}});
 assert.equal(navigated,false);assert.match(message.textContent,/无法初始化登录状态/);
});
