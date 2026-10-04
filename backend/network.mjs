import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {access} from 'node:fs/promises';
import net from 'node:net';
const exec = promisify(execFile);

export function normalizeIP(address) {
  const raw = address.split('%')[0];
  return raw.startsWith('::ffff:') && net.isIP(raw.slice(7)) === 4 ? raw.slice(7) : raw;
}
export function ipNumber(address) {
  const ip = normalizeIP(address), version = net.isIP(ip);
  if (version === 4) return {version, value: ip.split('.').reduce((v,x)=>(v<<8n)|BigInt(x),0n), bits:32};
  if (version !== 6) throw Error('Invalid IP');
  let value = ip;
  if (value.includes('.')) {
    const last = value.slice(value.lastIndexOf(':')+1).split('.').map(Number);
    value = value.slice(0,value.lastIndexOf(':')+1)+((last[0]<<8)|last[1]).toString(16)+':'+((last[2]<<8)|last[3]).toString(16);
  }
  const halves=value.split('::'),left=halves[0]?halves[0].split(':'):[],right=halves[1]?halves[1].split(':'):[];
  const groups=halves.length===2?[...left,...Array(8-left.length-right.length).fill('0'),...right]:left;
  return {version,value:groups.reduce((v,x)=>(v<<16n)|BigInt('0x'+x),0n),bits:128};
}
export function inSubnet(address, cidr) {
  try {
    const [ip,prefix]=cidr.split('/'),a=ipNumber(address),b=ipNumber(ip),n=Number(prefix);
    if(a.version!==b.version||!Number.isInteger(n)||n<0||n>a.bits)return false;
    const shift=BigInt(a.bits-n);return a.value>>shift===b.value>>shift;
  } catch {return false;}
}
export function privateIP(address) {
  return ['10.0.0.0/8','172.16.0.0/12','192.168.0.0/16','169.254.0.0/16','fc00::/7','fe80::/10'].some(c=>inSubnet(address,c));
}
export function loopback(address) {return inSubnet(address,'127.0.0.0/8')||normalizeIP(address)==='::1';}
export function permitted(peer,local,interfaces,selected) {
  if(loopback(peer)&&loopback(local))return true;
  if(!privateIP(peer)||!privateIP(local))return false;
  return interfaces.some(i=>selected.includes(i.key)&&i.up&&i.addresses.some(a=>normalizeIP(a.address)===normalizeIP(local)&&privateIP(a.address)&&inSubnet(peer,a.cidr)));
}
export async function discoverInterfaces() {
  const {stdout}=await exec('ip',['-j','address','show'],{timeout:2500,maxBuffer:1024*1024});
  return await Promise.all(JSON.parse(stdout).filter(i=>i.ifname!=='lo').map(async i=>{
    let physical=false;try{await access('/sys/class/net/'+i.ifname+'/device');physical=true;}catch{}
    return {name:i.ifname,key:i.ifname+'|'+(i.address??''),physical,up:i.flags?.includes('UP')??false,
      addresses:(i.addr_info??[]).filter(a=>['inet','inet6'].includes(a.family)).map(a=>({address:a.local,cidr:a.local+'/'+a.prefixlen}))};
  }));
}
export function defaultInterfaces(interfaces) {return interfaces.filter(i=>i.physical&&i.addresses.some(a=>privateIP(a.address))).map(i=>i.key);}
