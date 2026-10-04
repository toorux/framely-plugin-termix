import 'reflect-metadata';
import {webcrypto,X509Certificate} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {X509CertificateGenerator,SubjectAlternativeNameExtension,BasicConstraintsExtension} from '@peculiar/x509';
export async function certificate(dir,addresses) {
  await mkdir(dir,{recursive:true,mode:0o700});
  const names=[...new Set(['127.0.0.1','::1',...addresses])].sort();
  const keyPath=path.join(dir,'key.pem'),certPath=path.join(dir,'cert.pem');
  try {
    const [cert,key]=await Promise.all([readFile(certPath),readFile(keyPath)]);
    const parsed=new X509Certificate(cert);
    if(names.every(a=>parsed.checkIP(a))&&Date.parse(parsed.validTo)>Date.now()+30*86400000)return {cert,key,fingerprint:parsed.fingerprint256};
  }catch{}
  const algorithm={name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'};
  const keys=await webcrypto.subtle.generateKey(algorithm,true,['sign','verify']);
  const cert=await X509CertificateGenerator.createSelfSigned({serialNumber:Date.now().toString(16),name:'CN=Frame Termix',notBefore:new Date(Date.now()-86400000),notAfter:new Date(Date.now()+365*86400000),signingAlgorithm:algorithm,keys,extensions:[new BasicConstraintsExtension(false),new SubjectAlternativeNameExtension([{type:'dns',value:'localhost'},...names.map(value=>({type:'ip',value}))])]},webcrypto);
  const der=Buffer.from(await webcrypto.subtle.exportKey('pkcs8',keys.privateKey));
  const key='-----BEGIN PRIVATE KEY-----\n'+der.toString('base64').match(/.{1,64}/g).join('\n')+'\n-----END PRIVATE KEY-----\n';
  const pem=cert.toString('pem');await writeFile(keyPath,key,{mode:0o600});await writeFile(certPath,pem,{mode:0o600});
  return {cert:pem,key,fingerprint:new X509Certificate(pem).fingerprint256};
}
