"""Verify bundled native protocol modules load, without remote connections."""
from pathlib import Path
import os
import socket
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
digest = (ROOT/'payload/runtime.sha256').read_text().strip()
runtime = ROOT/'.cache/integration-data/runtimes'/digest
base = runtime/'guacd'
assert base.exists(), 'Run tests/integration.py first to extract the runtime'
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
libraries = ':'.join(str(base/p) for p in ['lib', 'usr/lib', 'usr/lib/pulseaudio', 'opt/guacamole/lib'])
log = (ROOT/'.cache/guacd-smoke.log').open('w')
process = subprocess.Popen([str(base/'lib/ld-musl-aarch64.so.1'), '--library-path', libraries, str(base/'opt/guacamole/sbin/guacd'), '-f', '-b', '127.0.0.1', '-l', str(port)], stdout=subprocess.DEVNULL, stderr=log, env={**os.environ, 'LD_LIBRARY_PATH':libraries, 'OPENSSL_MODULES':str(base/'usr/lib/ossl-modules')})
try:
    for attempt in range(100):
        try:
            connection = socket.create_connection(('127.0.0.1', port), timeout=1)
            connection.close()
            break
        except OSError:
            if process.poll() is not None: raise AssertionError('guacd exited; inspect .cache/guacd-smoke.log')
            time.sleep(.05)
    for protocol in ['rdp', 'vnc', 'telnet', 'ssh']:
        with socket.create_connection(('127.0.0.1', port), timeout=30) as connection:
            connection.sendall(f'6.select,{len(protocol)}.{protocol};'.encode())
            response = connection.recv(65536)
            assert response.startswith(b'4.args,'), (protocol, response)
        print(f'PASS: bundled guacd {protocol} native module loaded', flush=True)
finally:
    process.terminate()
    try: process.wait(timeout=5)
    except subprocess.TimeoutExpired: process.kill(); process.wait()
    log.close()
