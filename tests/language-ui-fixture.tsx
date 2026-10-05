const wait=(ms=80)=>new Promise(r=>setTimeout(r,ms));
const until=async(f:()=>any)=>{for(let i=0;i<180;i++){if(f())return;await wait(30);}throw Error('Timed out '+document.body.innerText.slice(0,300));};
let busy=false,language='en-US',calls=0,active=0,maxActive=0,failSync=false;
const listeners=new Set<(e:any)=>void>();
const status=()=>({phase:'running',busy,error:'',config:{enabled:true,httpEnabled:true,httpsEnabled:false,httpPort:19627,httpsPort:19628,interfaces:[],language:'auto',systemLanguage:'en-US',username:'test',configured:true},interfaces:[],language:'en-US',localUrl:null,addresses:[],certificate:null,upstream:'2.9.0'});
(window as any).__framelyBridge={subscribe:(f:(e:any)=>void)=>{listeners.add(f);return()=>listeners.delete(f);},request:async(op:string,params:any)=>{
 if(op==='language.get')return {preference:'auto',language};
 if(op==='call'&&params.method==='status.get')return status();
 if(op==='call'&&params.method==='language.sync'){
  calls++;maxActive=Math.max(maxActive,++active);await wait(150);active--;
  if(busy)throw Error('An operation is already running');
  if(failSync)throw Error('Language persistence failed');
  return status();
 }
 return true;
}};
const changed=()=>{for(const f of listeners)f({type:'language.changed'});};
(window as any).runInstallReviewChecks=async()=>{try{
 await until(()=>document.body.textContent?.includes('Settings saved'));
 busy=true;await until(()=>document.body.textContent?.includes('Working…'));
 const initial=calls;changed();changed();await wait(400);
 if(calls!==initial)throw Error('Busy service received language sync');
 busy=false;await until(()=>document.body.textContent?.includes('Settings saved'));
 changed();changed();await until(()=>calls===initial+1);await wait(250);
 if(maxActive!==1)throw Error('Overlapping sync requests');
 language='ja-JP';failSync=true;changed();await until(()=>document.body.textContent?.includes('Language persistence failed'));
 if(document.body.textContent?.includes('language API is unavailable'))throw Error('Backend error mislabeled as missing host API');
 failSync=false;changed();await until(()=>!document.body.textContent?.includes('Language persistence failed'));
 console.log('FRAMELY_BRIDGE_PASS');
 }catch(e){console.error('FRAMELY_BRIDGE_FAIL '+e);}
};
void import('../src/page').then(()=>{
 const style=document.createElement('style');style.textContent='html,body{background:transparent!important;padding:0!important}#root{height:100vh;overflow:auto;background:#101820;border-radius:24px;padding:20px}';document.head.append(style);
 console.log('FRAMELY_VIEW_READY');
});
