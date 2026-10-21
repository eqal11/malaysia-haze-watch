import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import archive_data as archive
from utils import read

class ArchiveTests(unittest.TestCase):
    def setUp(self):
        root=Path(__file__).resolve().parents[1]/'work';root.mkdir(exist_ok=True)
        self.temp=tempfile.TemporaryDirectory(dir=root);self.data=Path(self.temp.name)
        self.base=patch.object(archive,'BASE',self.data/'archive');self.base.start()
        self.root=patch.object(archive,'DATA',self.data);self.root.start()
    def tearDown(self):
        self.base.stop();self.root.stop();self.temp.cleanup()
    def station(self,time,value=50):
        return {'id':'A','name':'A','state':'Selangor','lng':101,'lat':3,'ipu':value,'pollutant':None,'updated_at':time}
    def test_daily_partition_deduplication_and_retention(self):
        row=self.station('2025-12-31T16:00:00Z')
        archive.save_ipu([row,row]);archive.save_ipu([self.station('2026-01-02T00:00:00Z',70)])
        first=read(self.data/'archive/ipu/2026-01-01.json')
        self.assertEqual(len(first['readings']),1);self.assertEqual(archive.ipu_records(first)[0]['ipu'],50)
        archive.rebuild_index();self.assertEqual(len(read(self.data/'archive/index.json')['days']),2)
    def test_hotspot_empty_day_retained_and_capture_is_idempotent(self):
        f={'type':'Feature','geometry':{'type':'Point','coordinates':[101,3]},'properties':{'id':'raw-id','time':'2026-01-01T01:00:00Z','confidence':'high','frp':50,'country':'Malaysia','region':'Malaysia','state':'Selangor','sensor':'VIIRS S-NPP'}}
        for _ in range(2):archive.save_hotspots([f],'2026-01-01T00:00:00Z','2026-01-03T00:00:00Z','NASA test fixture')
        self.assertEqual(len(read(self.data/'archive/hotspots/2026-01-01.json')['readings']),1)
        self.assertEqual(read(self.data/'archive/hotspots/2026-01-02.json')['readings'],[])
    def test_ambiguous_naive_timestamp_refused(self):
        with self.assertRaises(ValueError):archive.save_ipu([self.station('2026-01-01T12:00:00')])

if __name__=='__main__':unittest.main()
