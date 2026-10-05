// Termix's frontend restores a session from termix_auth and uses jwt for
// authenticated API/WebSocket requests. A cookie alone does not restore it.
export function windowSessionPage(session) {
  const data=JSON.stringify({token:session.token,username:session.username}).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"></head><body><p id="message">Opening Termix…</p><script type="application/json" id="framely-window-session">'+data+'</script><script src="/framely-language.js"></script><script src="/framely-window/session.js"></script></body></html>';
}
export const windowSessionScript=`(()=>{
  try {
    const node=document.getElementById('framely-window-session');
    const session=JSON.parse(node.textContent);node.remove();
    if(typeof session.token!=='string'||!session.token||typeof session.username!=='string')throw Error('Invalid session');
    localStorage.setItem('jwt',session.token);
    localStorage.setItem('termix_auth',JSON.stringify({loggedIn:true,username:session.username}));
    localStorage.removeItem('termix_desktop_manual_logout');
    location.replace('/');
  } catch {
    try{localStorage.removeItem('jwt');localStorage.removeItem('termix_auth');}catch{}
    let language=navigator.language||'';try{language=localStorage.getItem('i18nextLng')||language;}catch{}
    document.getElementById('message').textContent=language.startsWith('zh')?'无法初始化登录状态，请关闭并重新打开窗口。':'Unable to initialize login. Close and reopen this window.';
  }
})();`;

// The Web build normally relies on cookies for API calls. A localhost iframe
// under Framely's 127.0.0.1 page can have those cookies blocked. Use the same
// bearer session as Termix's desktop client, only for this window's origin.
export const windowSessionAuthScript=`(()=>{
  const token=()=>{try{return localStorage.getItem('jwt');}catch{return null;}};
  const own=url=>{try{return new URL(url,location.href).origin===location.origin;}catch{return false;}};
  const originalFetch=window.fetch.bind(window);
  window.fetch=(input,init)=>{
    const jwt=token();
    if(jwt&&own(typeof input==='string'||input instanceof URL?input:input.url)){
      const headers=new Headers(init?.headers||(input instanceof Request?input.headers:undefined));
      if(!headers.has('Authorization'))headers.set('Authorization','Bearer '+jwt);
      init={...init,headers};
    }
    return originalFetch(input,init);
  };
  const targets=new WeakMap(),authorized=new WeakSet(),proto=XMLHttpRequest.prototype;
  const open=proto.open,send=proto.send,setHeader=proto.setRequestHeader;
  proto.open=function(method,url,...args){targets.set(this,own(url));authorized.delete(this);return open.call(this,method,url,...args);};
  proto.setRequestHeader=function(name,value){if(name.toLowerCase()==='authorization')authorized.add(this);return setHeader.call(this,name,value);};
  proto.send=function(...args){const jwt=token();if(jwt&&targets.get(this)&&!authorized.has(this))setHeader.call(this,'Authorization','Bearer '+jwt);return send.apply(this,args);};
})();`;
