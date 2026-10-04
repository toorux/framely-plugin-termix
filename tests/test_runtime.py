import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile

spec=importlib.util.spec_from_file_location('launcher',Path(__file__).parents[1]/'backend/launch.py')
launcher=importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)

class RuntimeTest(unittest.TestCase):
    def test_traversal_and_links_rejected(self):
        for name,mode in [('../outside',0o100600),('/absolute',0o100600),('link',0o120777)]:
            with tempfile.TemporaryDirectory() as d:
                archive=Path(d)/'r.zip'
                with zipfile.ZipFile(archive,'w') as z:
                    info=zipfile.ZipInfo(name);info.external_attr=mode<<16;z.writestr(info,'bad')
                with self.assertRaises(ValueError):launcher.extract_runtime(archive,Path(d)/'out')
                self.assertFalse((Path(d)/'out').exists())
    def test_executable_mode_and_files(self):
        with tempfile.TemporaryDirectory() as d:
            archive=Path(d)/'r.zip'
            with zipfile.ZipFile(archive,'w') as z:
                info=zipfile.ZipInfo('runtime/node');info.external_attr=0o100755<<16;z.writestr(info,'runtime')
            out=Path(d)/'out';launcher.extract_runtime(archive,out)
            self.assertEqual((out/'runtime/node').read_text(),'runtime')
            self.assertEqual((out/'runtime/node').stat().st_mode&0o777,0o700)
