import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,stat,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {exportCertificate} from '../backend/certificate-export.mjs';
test('certificate export writes a unique readable CRT and excludes private keys',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'termix-cert-'));
 try{
  const data=path.join(root,'data'),home=path.join(root,'home');await mkdir(path.join(data,'tls'),{recursive:true});
  const pem='-----BEGIN CERTIFICATE-----\npublic-certificate\n-----END CERTIFICATE-----\n';
  await writeFile(path.join(data,'tls/cert.pem'),pem);await writeFile(path.join(data,'tls/key.pem'),'private-key');
  const first=await exportCertificate(data,home),second=await exportCertificate(data,home);
  assert.notEqual(first.path,second.path);assert.equal(path.dirname(first.path),path.join(home,'Downloads'));
  assert.equal(await readFile(first.path,'utf8'),pem);assert.equal((await stat(first.path)).mode&0o777,0o600);
  await assert.rejects(exportCertificate(data,''),/Missing Steam user home/);
 }finally{await rm(root,{recursive:true,force:true});}
});
