import http from 'node:http';
import net from 'node:net';

export function forwardHeaders(req) {
  const h={...req.headers};
  for(const key of Object.keys(h))if(key.startsWith('x-forwarded-')||key==='forwarded'||key==='x-real-ip'||key.startsWith('x-termix-'))delete h[key];
  delete h['accept-encoding'];
  h['x-forwarded-for']=req.socket.remoteAddress;
  h['x-forwarded-proto']=req.socket.encrypted?'https':'http';
  h['x-forwarded-host']=req.headers.host;
  return h;
}
export function createProxy({port,allowed,languageScript,local=false,bootstrap,wrapper,assets,windowLogin}) {
  const sockets=new Set();
  function track(server) {server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});}
  async function handle(req,res) {
    if(!validHost(req)){res.writeHead(403);res.end('Use the device IP address');return;}
    if(!allowed(req.socket)){res.writeHead(403);res.end('Local network access only');return;}
    const pathname=req.url.split('?')[0];
    if(pathname==='/framely-window/login'){
      const headers={'cache-control':'no-store','referrer-policy':'no-referrer'};
      if(!local||req.method!=='GET'||!validOrigin(req)){res.writeHead(403,headers);res.end('Window login denied');return;}
      try{
        const ticket=new URL(req.url,'http://localhost').searchParams.get('ticket');
        const session=await windowLogin?.(ticket);
        if(!session){res.writeHead(403,headers);res.end('Window login expired; reopen the window');return;}
        res.writeHead(303,{...headers,location:'/', 'set-cookie':`jwt=${session.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(session.maxAge/1000)}`});res.end();
      }catch{res.writeHead(503,headers);res.end('Window login unavailable; reopen the window');}
      return;
    }
    if(pathname==='/framely-window/main'&&local){res.writeHead(200,{'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-src 'self' http://localhost:*; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'",'cache-control':'no-store'});res.end(wrapper);return;}
    if(pathname==='/framely-language.js'){res.writeHead(200,{'content-type':'text/javascript','cache-control':'no-store'});res.end(languageScript());return;}
    if(local&&pathname==='/framely-bootstrap.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(bootstrap);return;}
    if(local&&assets[pathname]){res.writeHead(200,{'content-type':'text/javascript'});res.end(assets[pathname]);return;}
    const upstream=http.request({host:'127.0.0.1',port,path:req.url,method:req.method,headers:forwardHeaders(req)},response=>{
      const headers={...response.headers};
      if((headers['content-type']??'').includes('text/html')) {
        const chunks=[];let size=0;
        response.on('data',b=>{size+=b.length;if(size>4*1024*1024){upstream.destroy();res.destroy();}else chunks.push(b);});
        response.on('end',()=>{
          const extra='<script src="/framely-language.js"></script>'+(local?'<script src="/framely-bootstrap.js"></script>':'');
          const body=Buffer.from(Buffer.concat(chunks).toString().replace(/<head[^>]*>/i,x=>x+extra));
          delete headers['content-length'];delete headers['etag'];delete headers['content-encoding'];headers['cache-control']='no-store';
          // A nested Framely window has a distinct loopback origin. Its parent
          // bridge only accepts the wrapper's window, never the Termix child.
          headers['x-content-type-options']='nosniff';res.writeHead(response.statusCode,headers);res.end(body);
        });
      }else{res.writeHead(response.statusCode,headers);response.pipe(res);}
    });
    upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('Termix backend unavailable');});
    req.on('aborted',()=>upstream.destroy());res.on('close',()=>upstream.destroy());req.pipe(upstream);
  }
  function upgrade(req,socket,head) {
    if(!validHost(req)||!allowed(socket)||!validOrigin(req)){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
    const upstream=net.connect(port,'127.0.0.1');
    upstream.on('connect',()=>{
      const lines=[`${req.method} ${req.url} HTTP/${req.httpVersion}`];
      for(const [key,value] of Object.entries(forwardHeaders(req)))for(const v of Array.isArray(value)?value:[value])if(v!==undefined)lines.push(key+': '+v);
      upstream.write(lines.join('\r\n')+'\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream).pipe(socket);
    });
    upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());socket.on('close',()=>upstream.destroy());
  }
  return {handle,upgrade,track,disconnect(){for(const s of sockets)s.destroy();}};
}
function validHost(req){
  try{const url=new URL('http://'+req.headers.host),h=url.hostname.replace(/^\[|\]$/g,'');return !url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash&&(net.isIP(h)>0||h==='localhost');}catch{return false;}
}
function validOrigin(req){return !req.headers.origin||req.headers.origin===`${req.socket.encrypted?'https':'http'}://${req.headers.host}`;}
