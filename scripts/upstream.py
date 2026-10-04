"""Rebuild the pinned ARM64 Termix Web distribution without Docker.

Requires ARM64 Linux, Node >=22.12, npm, Python, make and a C++ compiler.
Downloads are confined to .cache; device installs never run this script.
"""
import hashlib
import json
import os
from pathlib import Path
import posixpath
import shutil
import subprocess
import tarfile
import urllib.request
import zipfile

ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'.cache/upstream'
CACHE.mkdir(parents=True,exist_ok=True)
COMMIT='3643e7af97c6a597ad09db51d12676faa1dfc87c'
NODE='26.10.0'
GUACD='sha256:769987c20e99f59578305505ffa23418c24da73d579364f097cdf01d9866e5e5'

def fetch(url,target,headers=None,digest=None):
    if not target.exists():
        print('Downloading',target.name,flush=True)
        with urllib.request.urlopen(urllib.request.Request(url,headers=headers or {}),timeout=60) as r,target.with_suffix(target.suffix+'.part').open('wb') as f:
            shutil.copyfileobj(r,f)
        target.with_suffix(target.suffix+'.part').replace(target)
    if digest:
        h=hashlib.sha256()
        with target.open('rb') as f:
            while b:=f.read(1024*1024):h.update(b)
        if h.hexdigest()!=digest.removeprefix('sha256:'):raise RuntimeError('Checksum mismatch: '+target.name)
    return target

def extract(archive,target,oci=False):
    with tarfile.open(archive) as t:
        for m in t:
            if oci and ('.wh.' in m.name or not (m.isfile() or m.isdir() or m.issym() or m.islnk())):continue
            if m.issym() and m.linkname.startswith('/'):
                m.linkname=posixpath.relpath(m.linkname.lstrip('/'),posixpath.dirname(m.name) or '.')
            t.extract(m,target,filter='data')

def run(args,cwd,env=None):
    subprocess.run(args,cwd=cwd,env=env,check=True)

if os.uname().machine not in ('aarch64','arm64'):
    raise SystemExit('Build on ARM64 Linux to produce native modules for Frame')
source_archive=fetch('https://codeload.github.com/Termix-SSH/Termix/tar.gz/'+COMMIT,CACHE/'source.tar.gz')
source=CACHE/('Termix-'+COMMIT)
if not source.exists():extract(source_archive,CACHE)
env={**os.environ,'npm_config_cache':str(CACHE/'npm-cache')}
run(['npm','ci','--ignore-scripts'],source,env)
run(['node','scripts/patch-ssh2-agent.cjs'],source,env)
run(['node','scripts/apply-plugin-patches.cjs'],source,env)
run(['npm','run','build'],source,env)

checks=urllib.request.urlopen(f'https://nodejs.org/dist/v{NODE}/SHASUMS256.txt',timeout=30).read().decode()
node_name=f'node-v{NODE}-linux-arm64.tar.xz'
node_hash=next(line.split()[0] for line in checks.splitlines() if line.split()[-1]==node_name)
node_archive=fetch(f'https://nodejs.org/dist/v{NODE}/'+node_name,CACHE/node_name,digest=node_hash)
node_root=CACHE/f'node-v{NODE}-linux-arm64'
if not node_root.exists():extract(node_archive,CACHE)

prod=CACHE/'production'
if prod.exists():shutil.rmtree(prod)
prod.mkdir()
for name in ['package.json','package-lock.json','.npmrc','LICENSE']:shutil.copy2(source/name,prod/name)
for name in ['vendor','dist','drizzle']:shutil.copytree(source/name,prod/name)
sdk=prod/'packages/plugin-sdk';sdk.mkdir(parents=True)
shutil.copy2(source/'packages/plugin-sdk/package.json',sdk/'package.json')
shutil.copytree(source/'packages/plugin-sdk/dist',sdk/'dist')
run(['npm','ci','--omit=dev','--ignore-scripts'],prod,env)
native_env={**env,'PATH':str(node_root/'bin')+':'+os.environ['PATH'],'npm_config_nodedir':str(node_root),'npm_config_devdir':str(CACHE/'node-gyp')}
run(['npm','rebuild','better-sqlite3','node-pty','ssh2','@serialport/bindings-cpp','sharp'],prod,native_env)
run([str(node_root/'bin/node'),'--input-type=module','-e','import Database from "better-sqlite3"; new Database(":memory:").close();'],prod,native_env)
fetch('https://github.com/openpubkey/opkssh/releases/download/v0.16.0/opkssh-linux-arm64',prod/'opkssh-linux-arm64',digest='9dd10c2b6ce99cde18e52c054877ca014134b291fd82afe71741c68db4f83d44')
(prod/'opkssh-linux-arm64').chmod(0o755)

token=json.loads(urllib.request.urlopen('https://auth.docker.io/token?service=registry.docker.io&scope=repository:guacamole/guacd:pull',timeout=30).read())['token']
headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json'}
registry='https://registry-1.docker.io/v2/guacamole/guacd/'
raw=urllib.request.urlopen(urllib.request.Request(registry+'manifests/'+GUACD,headers=headers),timeout=30).read()
if hashlib.sha256(raw).hexdigest()!=GUACD.split(':')[1]:raise RuntimeError('Guacd manifest checksum mismatch')
manifest=json.loads(raw)
guacd=CACHE/'guacd'
if guacd.exists():shutil.rmtree(guacd)
guacd.mkdir()
for index,layer in enumerate(manifest['layers']):
    archive=fetch(registry+'blobs/'+layer['digest'],CACHE/f'guacd-layer-{index}.tar.gz',headers,layer['digest'])
    extract(archive,guacd,oci=True)

output=CACHE/'runtime-source.zip'
with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for directory,prefix in [(prod,'termix'),(guacd,'guacd')]:
        for p in directory.rglob('*'):
            if not p.is_file():continue
            rel=p.relative_to(directory)
            if directory==prod:
                if p.suffix=='.map' or any(x in rel.parts for x in ['.bin','.cache']):continue
                if 'prebuilds' in rel.parts:
                    variant=rel.parts[rel.parts.index('prebuilds')+1]
                    if not (variant.startswith('linux-arm64') and 'musl' not in variant):continue
                if '@img' in rel.parts and any(x.startswith(('sharp-','sharp-libvips-')) and 'linux-arm64' not in x for x in rel.parts):continue
            z.write(p,prefix+'/'+rel.as_posix())
    z.write(node_root/'bin/node','runtime/node')
    z.write(node_root/'LICENSE','runtime/NODE-LICENSE')
print('Runtime source:',output,flush=True)
run(['python3','scripts/runtime.py'],ROOT,{**os.environ,'TERMIX_RUNTIME_SOURCE':str(output)})
