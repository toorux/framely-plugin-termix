"""Pack the complete offline payload and generate release checksums."""
from pathlib import Path
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import zipfile
from submit_database import release_url

ROOT = Path(__file__).resolve().parents[1]

def digest(p):
    with p.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def download_url(manifest, root, repository=None):
    if manifest.get('downloadUrl'):
        return manifest['downloadUrl']
    repository = repository or os.environ.get('GITHUB_REPOSITORY')
    if not repository:
        remote = subprocess.check_output(['git', '-C', str(root), 'remote', 'get-url', 'origin'], text=True).strip()
        match = re.fullmatch(r'(?:https://github\.com/|git@github\.com:|ssh://git@github\.com/)([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+?)(?:\.git)?', remote)
        if not match:
            raise ValueError('Cannot infer GitHub repository; set GITHUB_REPOSITORY or downloadUrl')
        repository = match.group(1)
    return release_url(manifest, repository)

def pack(root=ROOT, repository=None):
    root = Path(root)
    manifest = json.loads((root/'manifest.json').read_text())
    manifest['downloadUrl'] = download_url(manifest, root, repository)
    manifest.pop('downloadSha256', None)
    payload = root/'payload'
    if any(p.is_symlink() for p in payload.rglob('*')):
        raise ValueError('Payload symlinks are not allowed')
    files = {p.relative_to(payload).as_posix():p for p in sorted(payload.rglob('*')) if p.is_file()}
    if not files:
        raise ValueError('Missing plugin payload')
    manifest['files'] = {name:digest(p) for name,p in files.items()}
    output = root/'dist'/f'{manifest["id"]}-{manifest["version"]}.framely'
    output.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        def entry(name,mode=0o644):
            info=zipfile.ZipInfo(name,date_time=(1980,1,1,0,0,0));info.create_system=3
            info.external_attr=(stat.S_IFREG|mode)<<16;info.compress_type=zipfile.ZIP_DEFLATED
            return info
        archive.writestr(entry('manifest.json'),json.dumps(manifest,separators=(',',':'),ensure_ascii=False))
        for name,p in files.items():
            mode=0o755 if p.stat().st_mode&0o111 else 0o644
            with p.open('rb') as source,archive.open(entry(name,mode),'w') as target:
                shutil.copyfileobj(source,target,1024*1024)
    checksum=digest(output)
    (output.parent/'SHA256SUMS').write_text(f'{checksum}  {output.name}\n')
    info={'packageBytes':output.stat().st_size,'sha256':checksum}
    runtime_info=root/'dist/runtime-info.json'
    if runtime_info.exists():info['runtime']=json.loads(runtime_info.read_text())
    (output.parent/'package-info.json').write_text(json.dumps(info,indent=2)+'\n')
    print(f'{output}: {output.stat().st_size/1048576:.2f} MiB, SHA256 {checksum}')
    return output

if __name__ == '__main__':
    pack()
