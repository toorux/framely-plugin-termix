"""Exercise the real offline runtime without changing this machine's SSH keys.
Run after npm run build. Only loopback clients are allowed in this test.
"""
import json
import http.client
from urllib.parse import urlparse
import os
from pathlib import Path
import select
import socket
import ssl
import subprocess
import time
import urllib.request
import urllib.error

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'.cache/integration-data'
DATA.mkdir(parents=True,exist_ok=True)
settings=DATA/'settings.json'
if settings.exists():
    config=json.loads(settings.read_text());config['enabled']=False;config['language']='auto';settings.write_text(json.dumps(config))
log=(DATA/'test.log').open('w')
seed_frame=os.environ.get('TERMIX_TEST_FRAME_SEED')=='1'
test_home=DATA/'isolated-home';test_home.mkdir(exist_ok=True)
test_env={**os.environ,'FRAMELY_DATA_DIR':str(DATA),'TERMIX_SKIP_FRAME_SEED':'0' if seed_frame else '1','HOME':str(test_home)}
if seed_frame:
    test_home=DATA/'isolated-home';test_home.mkdir(exist_ok=True)
    test_env['HOME']=str(test_home)
process=subprocess.Popen(['python3',str(ROOT/'payload/launch.py')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=log,text=True,env=test_env)
sequence=0
def rpc(method,params=None,expect_error=False):
    global sequence
    sequence+=1
    process.stdin.write(json.dumps({'id':sequence,'method':method,'params':params or {}})+'\n');process.stdin.flush()
    if not select.select([process.stdout],[],[],45)[0]:raise AssertionError('RPC timeout')
    line=process.stdout.readline()
    if not line:raise AssertionError('Controller exited; inspect '+str(DATA/'test.log'))
    result=json.loads(line)
    if expect_error:
        assert 'error' in result
        return result['error']
    assert 'error' not in result,result.get('error')
    return result['result']
def finish():
    for _ in range(60):
        status=rpc('status.get')
        if not status['busy']:
            assert not status['error'],status['error']
            return status
        time.sleep(.5)
    raise AssertionError('Operation did not complete')
def free_port():
    with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]
def request(url,data=None,token=None,cookie=None):
    headers={'Content-Type':'application/json','X-Electron-App':'true'}
    if token:headers['Authorization']='Bearer '+token
    if cookie:headers['Cookie']=cookie
    req=urllib.request.Request(url,data=json.dumps(data).encode() if data else None,headers=headers)
    try:
        with urllib.request.urlopen(req,timeout=15,context=ssl._create_unverified_context()) as r:return r.status,r.read()
    except urllib.error.HTTPError as e:return e.code,e.read()
try:
    assert rpc('status.get')['phase']=='stopped'
    for invalid in ['abc12','abcdef','123456']:
        rpc('credentials.set',{'username':'integration','password':invalid},expect_error=True)
    rpc('credentials.set',{'username':'integration','password':'abc123'})
    assert finish()['config']['configured']
    http_port,https_port=free_port(),free_port()
    rpc('settings.save',{'interfaces':[],'httpEnabled':True,'httpsEnabled':True,'httpPort':http_port,'httpsPort':https_port})
    finish();rpc('service.set',{'enabled':True});s=finish();assert s['phase']=='running'
    local=s['localUrl'];assert local.startswith('http://localhost:')
    code,html=request(local);assert code==200 and b'framely-page.js' in html
    code,html=request(f'http://127.0.0.1:{http_port}/');assert code==200 and b'framely-language.js' in html
    code,_=request(f'https://127.0.0.1:{https_port}/');assert code==200
    code,reply=request(f'http://127.0.0.1:{http_port}/users/login',{'username':'integration','password':'abc123'})
    assert code==200,(code,reply.decode()[:120])
    token=json.loads(reply)['token']
    # Only the authenticated plugin RPC issues tickets. Public listeners cannot redeem them.
    login=rpc('window.login')['url'];parsed=urlparse(login)
    assert request(f'http://127.0.0.1:{http_port}'+parsed.path+'?'+parsed.query)[0]==403
    assert request(f'https://127.0.0.1:{https_port}'+parsed.path+'?'+parsed.query)[0]==403
    conn=http.client.HTTPConnection(parsed.hostname,parsed.port,timeout=15)
    conn.request('GET',parsed.path+'?'+parsed.query);reply=conn.getresponse()
    assert reply.status==303,reply.read()
    cookie=reply.getheader('set-cookie');assert 'HttpOnly' in cookie and 'SameSite=Strict' in cookie
    assert reply.getheader('location')=='/'
    cookie=cookie.split(';')[0];reply.read();conn.close()
    conn=http.client.HTTPConnection(parsed.hostname,parsed.port,timeout=15)
    conn.request('GET',parsed.path+'?'+parsed.query);reply=conn.getresponse();assert reply.status==403;reply.read();conn.close()
    window_base=f'http://{parsed.hostname}:{parsed.port}'
    assert request(window_base+'/users/me',cookie=cookie)[0]==200
    assert request(window_base+'/host/db/host',cookie=cookie)[0]==200
    assert request(f'http://127.0.0.1:{http_port}/host/db/host')[0]==401
    assert request(f'https://127.0.0.1:{https_port}/host/db/host')[0]==401
    window_cookie=cookie
    print('PASS: Frame window session, single-use ticket, public login still required',flush=True)
    code,hosts=request(f'http://127.0.0.1:{http_port}/host/db/host',token=token)
    assert code==200
    if seed_frame:
        assert any(h.get('name')=='Frame' and h.get('ip')=='127.0.0.1' and h.get('authType')=='key' for h in json.loads(hosts))
        authorized=(test_home/'.ssh/authorized_keys').read_text()
        assert authorized.startswith('from="127.0.0.1,::1" ssh-ed25519 ')
        print('PASS: Frame connection preset and loopback-only SSH key in isolated test HOME',flush=True)
    if not any(h.get('name')=='Preserved secret' for h in json.loads(hosts)):
        code,_=request(f'http://127.0.0.1:{http_port}/host/db/host',{'name':'Preserved secret','ip':'127.0.0.1','port':65534,'username':'test','authType':'password','password':'preserved-host-password','statusCheckEnabled':False},token)
        assert code==200
    pem=rpc('certificate.get')['pem'];assert pem.startswith('-----BEGIN CERTIFICATE-----')
    exported=Path(rpc('certificate.export')['path']);assert exported.parent==test_home/'Downloads' and exported.read_text()==pem
    exported.unlink()
    print('PASS: certificate export via backend RPC into isolated Downloads',flush=True)
    print('PASS: real offline service, account login, HTTP, HTTPS, certificate and iframe wrapper',flush=True)
    rpc('credentials.set',{'username':'integration','password':'xyz789'});s=finish();assert s['phase']=='running'
    assert request(f'http://127.0.0.1:{http_port}/users/login',{'username':'integration','password':'abc123'})[0]!=200
    code,reply=request(f'http://127.0.0.1:{http_port}/users/login',{'username':'integration','password':'xyz789'})
    assert code==200
    assert request(f'http://127.0.0.1:{http_port}/host/db/host',token=token)[0]==401
    assert request(f'http://127.0.0.1:{http_port}/host/db/host',cookie=window_cookie)[0]==401
    token=json.loads(reply)['token']
    code,hosts=request(f'http://127.0.0.1:{http_port}/host/db/host',token=token)
    assert code==200
    preserved=next(h for h in json.loads(hosts) if h.get('name')=='Preserved secret')
    code,secret=request(f'http://127.0.0.1:{http_port}/host/db/host/{preserved["id"]}/password',token=token)
    assert code==200 and json.loads(secret)['value']=='preserved-host-password'
    rpc('language.sync',{'language':'zh-CN'});assert rpc('status.get')['language']=='zh-CN'
    rpc('settings.save',{'language':'ja-JP'});finish();rpc('language.sync',{'language':'en-US'});assert rpc('status.get')['language']=='ja-JP'
    print('PASS: password change preserves account, old password rejected, language follow and override',flush=True)
    rpc('service.set',{'enabled':False});assert finish()['phase']=='stopped'
    for port in [http_port,https_port]:
        with socket.socket() as sock:assert sock.connect_ex(('127.0.0.1',port))!=0
    print('PASS: disable releases both ports and shuts down child services',flush=True)
finally:
    process.terminate()
    try:process.wait(timeout=15)
    except subprocess.TimeoutExpired:process.kill();process.wait()
    if seed_frame:
        subprocess.run(['python3',str(ROOT/'payload/launch.py'),'--cleanup'],env=test_env,check=True)
        assert 'framely-tooru.termix' not in (test_home/'.ssh/authorized_keys').read_text()
    log.close()
