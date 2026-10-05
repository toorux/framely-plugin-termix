import React,{useEffect,useRef,useState} from 'react';
import {framely,registerPlugin,Toggle,TextField,Select,Button} from '@framely/sdk';
import {css} from './styles';
import languages from '../backend/languages.json';
import {version as pluginVersion} from '../manifest.json';
import termixIcon from '../icon.png';

type Config={enabled:boolean;httpEnabled:boolean;httpsEnabled:boolean;httpPort:number;httpsPort:number;interfaces:string[]|null;language:string;systemLanguage:string;username:string;configured:boolean};
type Interface={key:string;name:string;physical:boolean;up:boolean;enabled:boolean;addresses:{address:string;cidr:string}[]};
type Status={phase:string;busy:boolean;error:string;config:Config;interfaces:Interface[];language:string;localUrl:string|null;addresses:string[];certificate:{fingerprint:string}|null;upstream:string};
const english:Record<string,string>={
  '插件版本':'Plugin version',
  '服务':'Service','已停止':'Stopped','启动中':'Starting','运行中':'Running','停止中':'Stopping','失败':'Failed','打开':'Open','启用 Termix':'Enable Termix','仅通过已选择的内网接口访问。':'Access through selected local network interfaces only.',
  '登录账号':'Login account','用户名':'Username','密码':'Password','输入新密码':'Enter a new password','至少 6 位，包含字母和数字；留空不修改。':'At least 6 characters, including letters and numbers; leave blank to keep unchanged.','保存账号密码':'Save credentials','Web 账号与 Frame 系统密码分开。':'The Web account is separate from the Frame system password.',
  '连接':'Connections','HTTP 端口':'HTTP port','HTTPS 端口':'HTTPS port','HTTP 使用明文连接。':'HTTP connections are unencrypted.','HTTPS 使用本机证书，首次访问需要信任证书。':'HTTPS uses a device certificate. Trust it on first access.','导出证书':'Export certificate','证书已保存到 Frame：':'Certificate saved on Frame:','正在导出…':'Exporting…','证书指纹':'Certificate fingerprint',
  '允许访问的网卡':'Allowed network interfaces','物理网卡':'Physical interface','其他接口':'Other interface','未连接':'Disconnected','暂无 IP 地址':'No IP address','仅允许所选接口的私有内网子网，公网地址始终拒绝。':'Only private local subnets on selected interfaces are allowed. Public addresses are always denied.',
  '语言':'Language','跟随 Framely':'Follow Framely','应用设置':'Apply settings','有未应用的设置':'Unsaved settings','设置已保存':'Settings saved','访问地址':'Access addresses','先设置账号密码，再启用服务。':'Set credentials before enabling the service.','尚未开放内网地址':'No local network addresses enabled','正在处理…':'Working…','服务未开启':'Service is disabled','请在快捷面板中开启服务。':'Enable the service in the quick panel.','正在加载…':'Loading…','关闭窗口':'Close window','重试':'Retry','密码至少 6 位，必须包含字母和数字':'Password must contain at least 6 characters, including letters and numbers','Framely 语言接口不可用，请更新宿主。':'The Framely language API is unavailable. Update the host.',
};
function translate(language:string,key:string){return language.toLowerCase().startsWith('zh')?key:english[key]??key;}
function useStatus(){
  const [status,setStatus]=useState<Status|null>(null),[error,setError]=useState('');
  useEffect(()=>{let live=true,running=false;const poll=async()=>{if(running)return;running=true;try{const s=await framely.call<Status>('status.get');if(live){setStatus(s);setError('');}}catch(e){if(live)setError(String(e));}finally{running=false;}};void poll();const id=setInterval(()=>void poll(),700);return()=>{live=false;clearInterval(id);};},[]);
  return {status,error,setStatus};
}
function QuickPage(){
  const {status,error:pollError,setStatus}=useStatus();
  const [draft,setDraft]=useState<Config|null>(null),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[waiting,setWaiting]=useState(false),[languageError,setLanguageError]=useState(false),[languageSyncError,setLanguageSyncError]=useState('');
  const [certificatePath,setCertificatePath]=useState(''),[exportingCertificate,setExportingCertificate]=useState(false);
  const [systemLanguage,setSystemLanguage]=useState<string|null>(null);
  const dirty=useRef(false),accountDirty=useRef(false),serviceBusy=useRef(false);
  serviceBusy.current=status?.busy===true;
  useEffect(()=>{if(status&&!status.busy&&!dirty.current)setDraft(status.config);if(status&&!status.busy&&!accountDirty.current)setUsername(status.config.username);},[status]);
  useEffect(()=>{
    let live=true,last='',syncing=false;
    const sync=async()=>{
      if(syncing)return;syncing=true;
      try{
        let value;
        try{value=await framely.language.get();}catch{if(live)setLanguageError(true);return;}
        if(!live)return;
        setSystemLanguage(value.language);setLanguageError(false);
        if(serviceBusy.current||value.language===last)return;
        try{const s=await framely.call<Status>('language.sync',{language:value.language});if(!s.busy&&!s.error&&s.config.systemLanguage===value.language)last=value.language;if(live){setStatus(s);setLanguageSyncError('');}}catch(e){if(live)setLanguageSyncError(String(e));}
      }finally{syncing=false;}
    };
    void sync();const id=setInterval(()=>void sync(),2000);
    const off=framely.onEvent(e=>{if((e as {type?:string}).type==='language.changed')void sync();});
    return()=>{live=false;clearInterval(id);off();};
  },[]);
  const language=!draft||draft.language==='auto'?systemLanguage??status?.config.systemLanguage??'en-US':draft.language;const t=(key:string)=>translate(language,key);
  const blocked=waiting||status?.busy===true;
  async function call(method:string,params:unknown={}){setWaiting(true);setError('');try{setStatus(await framely.call<Status>(method,params));}catch(e){setError(String(e));}finally{setWaiting(false);}}
  function change(next:Partial<Config>){if(!draft)return;dirty.current=true;setDraft({...draft,...next});}
  async function save(){if(!draft)return;const {httpEnabled,httpsEnabled,httpPort,httpsPort,language}=draft;const interfaces=draft.interfaces??status?.interfaces.filter(i=>i.enabled).map(i=>i.key)??[];setWaiting(true);setError('');try{const s=await framely.call<Status>('settings.save',{httpEnabled,httpsEnabled,httpPort,httpsPort,language,interfaces});dirty.current=false;setStatus(s);}catch(e){setError(String(e));}finally{setWaiting(false);}}
  async function credentials(){if(password.length<6||!/[a-zA-Z]/.test(password)||!/[0-9]/.test(password)){setError(t('密码至少 6 位，必须包含字母和数字'));return;}await call('credentials.set',{username,password});setPassword('');accountDirty.current=false;}
  async function downloadCert(){setExportingCertificate(true);setCertificatePath('');setError('');try{const result=await framely.call<{path:string}>('certificate.export');setCertificatePath(result.path);}catch(e){setError(String(e));}finally{setExportingCertificate(false);}}
  if(!status||!draft)return <main className="termix-panel panel-loading" role="status"><h1>Termix</h1><p className="muted">{pollError||t('正在加载…')}</p>{!pollError&&<div className="loading-lines" aria-hidden="true"><span/><span/><span/></div>}</main>;
  const phases:Record<string,string>={stopped:'已停止',starting:'启动中',running:'运行中',stopping:'停止中',failed:'失败'};
  return <main className="termix-panel">
    <header><div className="termix-brand"><img src={termixIcon} alt="" width="52" height="52"/><div className="brand-copy"><h1>Termix</h1><p className={'service-status '+status.phase}><i/>{t(phases[status.phase]??status.phase)} · {status.upstream}</p></div></div><Button className="primary open-button" disabled={blocked||status.phase!=='running'} onClick={()=>void framely.windows.open('main').catch(e=>setError(String(e)))}>{t('打开')}</Button></header>
    {(error||pollError||status.error||languageSyncError)&&<div className="notice error" role="alert">{error||pollError||status.error||languageSyncError}</div>}
    {languageError&&<div className="notice" role="status">{t('Framely 语言接口不可用，请更新宿主。')}</div>}
    <section className="service-controls"><Toggle label={t('启用 Termix')} description={t('仅通过已选择的内网接口访问。')} checked={status.config.enabled} disabled={blocked||dirty.current||!status.config.configured} onChange={enabled=>void call('service.set',{enabled})}/>{!status.config.configured&&<p className="muted">{t('先设置账号密码，再启用服务。')}</p>}</section>
    <section className="account-settings"><h2>{t('登录账号')}</h2><p className="section-description">{t('Web 账号与 Frame 系统密码分开。')}</p>
      <div className="credential-fields"><TextField label={t('用户名')} value={username} disabled={blocked} onChange={v=>{accountDirty.current=true;setUsername(v);}}/>
      <TextField label={t('密码')} password value={password} disabled={blocked} placeholder={t('输入新密码')} onChange={setPassword}/></div>
      <div className="account-actions"><p className="field-hint">{t('至少 6 位，包含字母和数字；留空不修改。')}</p><Button disabled={blocked||!username||!password} onClick={()=>void credentials()}>{t('保存账号密码')}</Button></div>
    </section>
    <section className="connection-settings"><h2>{t('连接')}</h2><div className="protocol-row"><Toggle label="HTTP" description={t('HTTP 使用明文连接。')} checked={draft.httpEnabled} disabled={blocked} onChange={httpEnabled=>change({httpEnabled})}/>
      <label className="port-field">{t('HTTP 端口')}<input aria-label={t('HTTP 端口')} inputMode="numeric" type="number" min={1024} max={65535} value={draft.httpPort} disabled={blocked} onChange={e=>change({httpPort:Number(e.target.value)})}/></label></div>
      <div className="protocol-row"><Toggle label="HTTPS" description={t('HTTPS 使用本机证书，首次访问需要信任证书。')} checked={draft.httpsEnabled} disabled={blocked} onChange={httpsEnabled=>change({httpsEnabled})}/>
      <label className="port-field">{t('HTTPS 端口')}<input aria-label={t('HTTPS 端口')} inputMode="numeric" type="number" min={1024} max={65535} value={draft.httpsPort} disabled={blocked} onChange={e=>change({httpsPort:Number(e.target.value)})}/></label></div>
      {status.certificate&&<div className="certificate"><Button disabled={exportingCertificate||blocked} onClick={()=>void downloadCert()}>{t(exportingCertificate?'正在导出…':'导出证书')}</Button><small>{t('证书指纹')}<code>{status.certificate.fingerprint}</code></small></div>}
      {certificatePath&&<p className="certificate-export-result" role="status">{t('证书已保存到 Frame：')}<code>{certificatePath}</code></p>}
    </section>
    <section className="network-settings"><h2>{t('允许访问的网卡')}</h2><p className="section-description">{t('仅允许所选接口的私有内网子网，公网地址始终拒绝。')}</p>
      {status.interfaces.map(i=>{const selected=draft.interfaces??status.interfaces.filter(x=>x.enabled).map(x=>x.key);return <div className="interface" key={i.key}><Toggle label={i.name+' · '+t(i.physical?'物理网卡':'其他接口')} description={i.up?undefined:t('未连接')} checked={selected.includes(i.key)} disabled={blocked} onChange={value=>change({interfaces:value?[...selected,i.key]:selected.filter(x=>x!==i.key)})}/><div className="interface-addresses">{i.addresses.length?i.addresses.map(a=><code key={a.address}>{a.address}</code>):<span>{t('暂无 IP 地址')}</span>}</div></div>;})}
    </section>
    <section className="language-settings"><h2>{t('语言')}</h2><Select label={t('语言')} value={draft.language} disabled={blocked} options={[{value:'auto',label:t('跟随 Framely')},...languages]} onChange={language=>change({language})}/></section>
    <footer><span className="muted" role="status">{t(blocked?'正在处理…':dirty.current?'有未应用的设置':'设置已保存')}</span><Button className="primary" disabled={blocked||!dirty.current} onClick={()=>void save()}>{t('应用设置')}</Button></footer>
    <section className="addresses"><h2>{t('访问地址')}</h2>{status.phase==='running'&&status.addresses.length?status.addresses.map(a=><code key={a}>{a}</code>):<p className="muted">{t('尚未开放内网地址')}</p>}</section>
    <div className="plugin-attribution"><p>{t('插件版本')} {pluginVersion} <span aria-hidden="true">·</span> Termix {status.upstream}</p><a href="https://github.com/Termix-SSH/Termix" target="_blank" rel="noopener noreferrer">Termix <span className="external-arrow" aria-hidden="true">↗</span></a></div>
  </main>;
}
function WindowPage(){
  const {status,error}=useStatus(),ref=useRef<HTMLIFrameElement>(null);
  const [loginUrl,setLoginUrl]=useState(''),[loginError,setLoginError]=useState('');
  useEffect(()=>{let live=true;setLoginUrl('');setLoginError('');if(status?.phase==='running'&&status.localUrl)void framely.call<{url:string}>('window.login').then(result=>{if(live)setLoginUrl(result.url);}).catch(e=>{if(live)setLoginError(String(e));});return()=>{live=false;};},[status?.phase,status?.localUrl]);const t=(key:string)=>translate(status?.language??'en-US',key);
  useEffect(()=>{const relay=async(e:MessageEvent)=>{if(e.source!==ref.current?.contentWindow||e.data?.channel!=='framely.plugin'||!['keyboard','haptic'].includes(e.data.op)||!Number.isSafeInteger(e.data.id))return;try{const bridge=(window as any).__framelyBridge;const result=await bridge.request(e.data.op,e.data.params);ref.current?.contentWindow?.postMessage({channel:'framely.reply',id:e.data.id,result},new URL(ref.current.src).origin);}catch(err){ref.current?.contentWindow?.postMessage({channel:'framely.reply',id:e.data.id,error:String(err)},new URL(ref.current.src).origin);}};window.addEventListener('message',relay);return()=>window.removeEventListener('message',relay);},[]);
  return <main className="termix-window">{status?.phase==='running'&&loginUrl?<iframe ref={ref} title="Termix Web" src={loginUrl} sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox" allow="clipboard-read; clipboard-write; fullscreen"/>:<div className="window-message"><h1>Termix</h1><p>{loginError||error||status?.error||t(status?.phase==='running'?'正在加载…':status?'服务未开启':'正在加载…')}</p><p>{t('请在快捷面板中开启服务。')}</p><Button onClick={()=>void framely.windows.close('main')}>{t('关闭窗口')}</Button></div>}</main>;
}
const style=document.createElement('style');style.textContent=css;document.head.append(style);
registerPlugin({QuickPage,windows:{main:WindowPage}});
