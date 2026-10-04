import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import zipfile

ROOT=Path(__file__).parents[1]

class RuntimeAssembly(unittest.TestCase):
    def test_first_build_creates_payload_and_dist_and_reuses_runtime(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)
            (root/'scripts').mkdir();(root/'backend').mkdir()
            shutil.copy2(ROOT/'scripts/runtime.py',root/'scripts/runtime.py')
            (root/'backend/termix-adapter.mjs').write_text('export function install(){}')
            source=root/'source.zip'
            with zipfile.ZipFile(source,'w') as z:
                z.writestr('runtime/node',b'fixture')
                z.writestr('guacd/opt/guacamole/sbin/guacd',b'fixture')
                z.writestr('termix/dist/backend/backend/starter.js',
                    'Object.assign(process.env, persistentConfig.parsed);\nconst gracefulShutdown = async (signal) => {')
                z.writestr('termix/dist/backend/backend/database/database.js','const HTTP_PORT = 30001;')
            env={**os.environ,'TERMIX_RUNTIME_SOURCE':str(source)}
            self.assertFalse((root/'payload').exists());self.assertFalse((root/'dist').exists())
            subprocess.run(['python3','scripts/runtime.py'],cwd=root,env=env,check=True,capture_output=True)
            output=root/'payload/runtime.zip'
            checksum=hashlib.sha256(output.read_bytes()).hexdigest()
            self.assertEqual((root/'payload/runtime.sha256').read_text().strip(),checksum)
            self.assertEqual(json.loads((root/'dist/runtime-info.json').read_text())['sha256'],checksum)
            with zipfile.ZipFile(output) as z:
                self.assertIn('termix/dist/backend/backend/framely-adapter.mjs',z.namelist())
                self.assertIn(b'TERMIX_HTTP_PORT',z.read('termix/dist/backend/backend/database/database.js'))
            second=subprocess.run(['python3','scripts/runtime.py'],cwd=root,env=env,check=True,capture_output=True,text=True)
            self.assertIn('Reusing unchanged offline runtime',second.stdout)
