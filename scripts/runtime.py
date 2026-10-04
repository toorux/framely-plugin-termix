"""Assemble a validated upstream Web runtime into the plugin payload.

TERMIX_RUNTIME_SOURCE can point to an independently built full runtime ZIP.
The default reuses the verified ARM64 build experiment in the parent cache.
The ZIP is repacked as regular files; no Electron or development toolchain.
"""
import hashlib
import json
import os
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
local_source = ROOT / '.cache/upstream/runtime-source.zip'
default_source = local_source if local_source.exists() else ROOT.parent / '.cache/termix-size/termix-web-with-guacd-arm64.zip'
source = Path(os.environ.get('TERMIX_RUNTIME_SOURCE', str(default_source)))
if not source.exists():
    raise SystemExit('Missing ARM64 runtime. Run python3 scripts/upstream.py first, or set TERMIX_RUNTIME_SOURCE.')
target = ROOT / 'payload/runtime.zip'
target.parent.mkdir(parents=True, exist_ok=True)
(ROOT / 'dist').mkdir(parents=True, exist_ok=True)
stamp_path = ROOT / '.cache/runtime-input.json'
stamp_path.parent.mkdir(parents=True, exist_ok=True)
stamp = {'source': str(source.resolve()), 'mtime': source.stat().st_mtime_ns, 'size': source.stat().st_size,
         'adapter': hashlib.sha256((ROOT / 'backend/termix-adapter.mjs').read_bytes()).hexdigest(), 'assembler': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
if target.exists() and stamp_path.exists() and json.loads(stamp_path.read_text()) == stamp:
    print('Reusing unchanged offline runtime')
    raise SystemExit(0)
with zipfile.ZipFile(source) as src, zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as dst:
    names = set(src.namelist())
    required = {'runtime/node','termix/dist/backend/backend/starter.js','termix/dist/backend/backend/database/database.js','termix/dist/backend/backend/plugins/assets.js','guacd/opt/guacamole/sbin/guacd'}
    if not required <= names:
        raise SystemExit('Runtime is incomplete')
    for member in src.infolist():
        data = src.read(member)
        if member.filename == 'termix/dist/backend/backend/starter.js':
            text = data.decode()
            env_marker = 'Object.assign(process.env, persistentConfig.parsed);'
            if text.count(env_marker) != 1:
                raise SystemExit('Pinned Termix configuration loader changed')
            locked = ['TERMIX_HTTP_PORT', 'ALLOW_REGISTRATION', 'ALLOW_PASSWORD_RESET', 'ENABLE_SSL', 'ELECTRON_EMBEDDED', 'GUACD_URL', 'GUACD_TUNNEL_HOST', 'GUACD_RECORDING_PATH', 'GUACD_RECORDING_BACKEND_PATH', 'GUACD_DRIVE_PATH', 'OPKSSH_BUNDLED_DIR', 'DATA_DIR']
            text = 'const framelyEnvironment = Object.fromEntries(' + json.dumps(locked) + '.map(k => [k, process.env[k]]));\n' + text
            text = text.replace(env_marker, env_marker + '\n                Object.assign(process.env, framelyEnvironment);')
            marker = 'const gracefulShutdown = async (signal) => {'
            if text.count(marker) != 1:
                raise SystemExit('Pinned Termix starter changed')
            data = text.replace(marker, 'const { install } = await import("./framely-adapter.mjs"); install();\n        ' + marker).encode()
        if member.filename == 'termix/dist/backend/backend/database/database.js':
            text = data.decode()
            if text.count('const HTTP_PORT = 30001;') != 1:
                raise SystemExit('Pinned Termix HTTP listener changed')
            data = text.replace('const HTTP_PORT = 30001;', 'const HTTP_PORT = Number(process.env.TERMIX_HTTP_PORT || 30001);').encode()
        if member.filename == 'termix/dist/backend/backend/plugins/assets.js':
            text = data.decode()
            marker = 'res.sendFile(file);'
            if text.count(marker) != 1:
                raise SystemExit('Pinned Termix plugin asset handler changed')
            # Express otherwise treats hidden ancestors of the install path
            # (such as ~/.local) as dotfiles. Keep the checked plugin directory
            # as the root so dotfile checks apply only to the requested asset.
            data = text.replace(marker, 'res.sendFile(path.relative(plugin.dir, file), { root: plugin.dir });').encode()
        # Compiled guacd plugins load shared libraries by name. Put all runtime
        # library paths on its musl loader search path in the controller.
        dst.writestr(member, data)
        # pathlib.rglob does not traverse workspace directory symlinks. Node
        # needs the SDK at its package resolution path in the offline ZIP.
        if member.filename.startswith('termix/packages/plugin-sdk/'):
            alias = zipfile.ZipInfo(member.filename.replace('termix/packages/plugin-sdk/', 'termix/node_modules/@termix/plugin-sdk/', 1))
            alias.external_attr = member.external_attr
            dst.writestr(alias, data, compress_type=zipfile.ZIP_DEFLATED)
        if member.filename.startswith('termix/vendor/rimraf-compat/'):
            alias = zipfile.ZipInfo(member.filename.replace('termix/vendor/rimraf-compat/', 'termix/node_modules/rimraf/', 1))
            alias.external_attr = member.external_attr
            dst.writestr(alias, data, compress_type=zipfile.ZIP_DEFLATED)
    adapter = zipfile.ZipInfo('termix/dist/backend/backend/framely-adapter.mjs')
    adapter.external_attr = 0o100600 << 16
    dst.writestr(adapter, (ROOT / 'backend/termix-adapter.mjs').read_bytes(), compress_type=zipfile.ZIP_DEFLATED)
digest = hashlib.sha256()
with target.open('rb') as f:
    while chunk := f.read(1024 * 1024):
        digest.update(chunk)
(ROOT / 'payload/runtime.sha256').write_text(digest.hexdigest() + '\n')
with zipfile.ZipFile(target) as z:
    expanded = sum(m.file_size for m in z.infolist())
info = {'runtimeBytes': target.stat().st_size,'expandedBytes': expanded,'sha256': digest.hexdigest(),'sourceCommit':'3643e7af97c6a597ad09db51d12676faa1dfc87c'}
(ROOT / 'dist/runtime-info.json').write_text(json.dumps(info, indent=2) + '\n')
stamp_path.write_text(json.dumps(stamp) + '\n')
print(f'Offline runtime: {target.stat().st_size / 1048576:.2f} MiB ZIP, {expanded / 1048576:.2f} MiB expanded')
