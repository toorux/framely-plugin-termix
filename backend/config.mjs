import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import path from 'node:path';
export const defaults={enabled:false,httpEnabled:false,httpsEnabled:true,httpPort:19627,httpsPort:19628,interfaces:null,language:'auto',systemLanguage:'en-US',username:'',userId:null,configured:false};
export function validateConfig(next) {
  for(const key of ['enabled','httpEnabled','httpsEnabled'])if(typeof next[key]!=='boolean')throw Error('Invalid '+key);
  for(const key of ['httpPort','httpsPort'])if(!Number.isInteger(next[key])||next[key]<1024||next[key]>65535)throw Error('Port must be 1024–65535');
  if(next.httpPort===next.httpsPort)throw Error('HTTP and HTTPS ports must differ');
  if(next.enabled&&!next.httpEnabled&&!next.httpsEnabled)throw Error('Enable HTTP or HTTPS first');
  if(next.interfaces!==null&&(!Array.isArray(next.interfaces)||next.interfaces.length>64||next.interfaces.some(x=>typeof x!=='string'||x.length>160)))throw Error('Invalid interfaces');
  for(const key of ['language','systemLanguage'])if(typeof next[key]!=='string'||!/^(auto|[A-Za-z]{2,8}(?:[-_][A-Za-z0-9]{2,8})*)$/.test(next[key]))throw Error('Invalid language');
  return next;
}
export async function loadConfig(dir) {
  try{return validateConfig({...defaults,...JSON.parse(await readFile(path.join(dir,'settings.json'),'utf8'))});}
  catch(e){if(e.code==='ENOENT')return {...defaults};throw e;}
}
export async function saveConfig(dir,config) {
  await mkdir(dir,{recursive:true,mode:0o700});const file=path.join(dir,'settings.json');
  await writeFile(file+'.tmp',JSON.stringify(config,null,2)+'\n',{mode:0o600});await rename(file+'.tmp',file);
}
