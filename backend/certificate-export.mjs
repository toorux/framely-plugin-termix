import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';

export async function exportCertificate(data,home) {
  if(!home||!path.isAbsolute(home))throw Error('Missing Steam user home');
  const pem=await readFile(path.join(data,'tls/cert.pem'),'utf8');
  if(!pem.startsWith('-----BEGIN CERTIFICATE-----'))throw Error('Certificate unavailable');
  const dir=path.join(home,'Downloads');await mkdir(dir,{recursive:true,mode:0o700});
  const file=path.join(dir,`frame-termix-${randomUUID()}.crt`);
  await writeFile(file,pem,{mode:0o600,flag:'wx'});
  return {path:file};
}
