import {test} from 'node:test';
import assert from 'node:assert/strict';
import {privateIP,inSubnet,permitted,defaultInterfaces} from '../backend/network.mjs';
const physical={key:'wlan0|a',name:'wlan0',physical:true,up:true,addresses:[{address:'192.168.5.67',cidr:'192.168.5.67/24'},{address:'fd01::67',cidr:'fd01::67/64'}]};
const vpn={key:'tun0|',name:'tun0',physical:false,up:true,addresses:[{address:'10.8.0.2',cidr:'10.8.0.2/24'}]};
test('physical private networks are enabled by default; VPN needs opt in',()=>{
 assert.deepEqual(defaultInterfaces([physical,vpn]),[physical.key]);
 assert.equal(permitted('192.168.5.2','192.168.5.67',[physical,vpn],[physical.key]),true);
 assert.equal(permitted('10.8.0.3','10.8.0.2',[physical,vpn],[physical.key]),false);
 assert.equal(permitted('10.8.0.3','10.8.0.2',[physical,vpn],[vpn.key]),true);
});
test('public IPs and unrelated private subnets are denied',()=>{
 for(const peer of ['8.8.8.8','192.168.6.2','10.0.0.2','2001:4860::1'])assert.equal(permitted(peer,'192.168.5.67',[physical],[physical.key]),false);
 assert.equal(privateIP('100.64.1.2'),false);
 assert.equal(privateIP('2001:db8::1'),false);
});
test('IPv6, mapped IPv4 and interface removal apply the same policy',()=>{
 assert.equal(inSubnet('fd01::2','fd01::67/64'),true);
 assert.equal(permitted('fd01::2','fd01::67',[physical],[physical.key]),true);
 assert.equal(permitted('::ffff:192.168.5.2','::ffff:192.168.5.67',[physical],[physical.key]),true);
 assert.equal(permitted('192.168.5.2','192.168.5.67',[],[physical.key]),false);
 assert.equal(permitted('192.168.5.2','192.168.5.67',[{...physical,up:false}],[physical.key]),false);
 assert.equal(permitted('127.0.0.1','127.0.0.1',[],[]),true);
 assert.equal(permitted('127.0.0.1','192.168.5.67',[physical],[physical.key]),false);
});
