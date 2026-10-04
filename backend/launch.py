#!/usr/bin/python3
"""Extract the hash-pinned offline runtime and exec the plugin controller."""
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import signal
import sys
import time
import zipfile

ROOT = Path(__file__).resolve().parent

def extract_runtime(archive, destination):
    # Package hash validation comes first, but reject unsafe nested archive
    # members as well. Published bundles materialize all symlinks.
    with zipfile.ZipFile(archive) as z:
        members = z.infolist()
        if len(members) > 25000 or sum(x.file_size for x in members) > 2 * 1024**3:
            raise ValueError('Runtime archive exceeds validated bounds')
        seen = set()
        for m in members:
            p = PurePosixPath(m.filename)
            if (p.is_absolute() or '\\' in m.filename or '..' in p.parts or
                m.filename in seen or m.is_dir() or (m.external_attr >> 16) & 0o170000 == 0o120000):
                raise ValueError('Unsafe runtime archive member')
            seen.add(m.filename)
        destination.mkdir(parents=True, mode=0o700, exist_ok=False)
        try:
            for m in members:
                out = destination / m.filename
                out.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
                with z.open(m) as source, out.open('xb') as target:
                    shutil.copyfileobj(source, target)
                out.chmod(0o700 if (m.external_attr >> 16) & 0o111 else 0o600)
        except BaseException:
            shutil.rmtree(destination)
            raise

def cleanup(data, uninstall=False):
    try:
        records = json.loads((data / 'processes.json').read_text())
    except FileNotFoundError:
        records = []
    for record in records:
        pid = record.get('pid')
        if not isinstance(pid, int) or pid <= 1:
            continue
        proc = Path('/proc') / str(pid)
        try:
            cmd = (proc / 'cmdline').read_bytes().decode(errors='replace')
            if proc.stat().st_uid != os.getuid() or str(data / 'runtimes') not in cmd:
                continue
            os.kill(pid, signal.SIGTERM)
        except (FileNotFoundError, ProcessLookupError):
            continue
    if uninstall:
        pub = data / 'ssh/frame_ed25519.pub'
        authorized = Path(os.environ['HOME']) / '.ssh/authorized_keys'
        if pub.exists() and authorized.exists():
            line = 'from="127.0.0.1,::1" ' + pub.read_text().strip()
            lines = authorized.read_text().splitlines()
            if line in lines:
                temporary = authorized.with_name('authorized_keys.termix.tmp')
                temporary.write_text('\n'.join(x for x in lines if x != line) + '\n')
                temporary.chmod(0o600)
                temporary.replace(authorized)

def main():
    data = Path(os.environ['FRAMELY_DATA_DIR']).resolve()
    data.mkdir(parents=True, mode=0o700, exist_ok=True)
    os.umask(0o077)
    if '--cleanup' in sys.argv or '--crash-cleanup' in sys.argv:
        cleanup(data, '--cleanup' in sys.argv)
        return
    cleanup(data)
    archive = ROOT / 'runtime.zip'
    expected = (ROOT / 'runtime.sha256').read_text().strip()
    destination = data / 'runtimes' / expected
    destination.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    with (data / 'runtime.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if not (destination / '.ready').exists():
            digest = hashlib.sha256()
            with archive.open('rb') as source:
                while chunk := source.read(1024 * 1024):
                    digest.update(chunk)
            if digest.hexdigest() != expected:
                raise ValueError('Offline runtime checksum mismatch')
            staging = destination.with_name(expected + '.staging')
            if staging.exists():
                shutil.rmtree(staging)
            extract_runtime(archive, staging)
            (staging / '.ready').write_text(expected)
            if destination.exists():
                shutil.rmtree(destination)
            staging.replace(destination)
    os.environ['TERMIX_RUNTIME'] = str(destination)
    executable = destination / 'runtime/node'
    os.execv(str(executable), [str(executable), str(ROOT / 'controller.js')])

if __name__ == '__main__':
    main()
