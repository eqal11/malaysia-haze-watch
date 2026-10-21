import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import fetch_ipu
import refresh_live
import attribute_hotspots
import validate_data

class LiveTests(unittest.TestCase):
    def scratch(self):
        base=Path(__file__).resolve().parents[1]/'work';base.mkdir(exist_ok=True)
        return tempfile.TemporaryDirectory(dir=base)

    def test_stale_upstream_does_not_overwrite_last_good_or_claim_success(self):
        raw={'features':[{'attributes':{'STATION_ID':'TEST','DATETIME':1577905200000,'API':25,'STATION_LOCATION':'Fixture','LONGITUDE':101,'LATITUDE':3,'STATE_NAME':'Fixture'}}]}
        with self.scratch() as folder:
            target=Path(folder)/'ipu.json';target.write_text('last good')
            with patch.object(fetch_ipu,'DATA',Path(folder)),patch.object(fetch_ipu,'read',return_value={}),patch.object(fetch_ipu,'fetch',return_value=json.dumps(raw)),patch.object(fetch_ipu,'status') as status:
                self.assertFalse(fetch_ipu.main());self.assertEqual(target.read_text(),'last good');self.assertFalse(status.call_args.args[1])

    def run_pipeline(self,folder,source_ok,event):
        with patch.object(refresh_live,'DATA',Path(folder)),patch.object(refresh_live.archive_data,'capture'),patch.object(refresh_live.fetch_ipu,'main',return_value=source_ok),patch.object(refresh_live.fetch_firms,'main',return_value=True),patch.object(attribute_hotspots,'main',return_value=True),patch.object(validate_data,'main'),patch.dict(os.environ,{'GITHUB_EVENT_NAME':event}):
            return refresh_live.main()

    def test_partial_failure_never_promotes_a_scheduled_success(self):
        with self.scratch() as folder:
            path=Path(folder)/'pipeline.json';previous='2026-10-21T12:00:00Z';path.write_text(json.dumps({'last_scheduled_success':previous}))
            self.assertFalse(self.run_pipeline(folder,False,'schedule'))
            doc=json.loads(path.read_text());self.assertEqual(doc['status'],'partial_failure');self.assertEqual(doc['steps']['ipu'],'failed');self.assertEqual(doc['last_scheduled_success'],previous)

    def test_real_schedule_event_is_distinguished_from_manual_and_retained(self):
        with self.scratch() as folder:
            path=Path(folder)/'pipeline.json';self.assertTrue(self.run_pipeline(folder,True,'schedule'))
            scheduled=json.loads(path.read_text())['last_scheduled_success'];self.assertTrue(scheduled)
            self.assertTrue(self.run_pipeline(folder,True,'workflow_dispatch'))
            doc=json.loads(path.read_text());self.assertEqual(doc['event'],'workflow_dispatch');self.assertEqual(doc['last_scheduled_success'],scheduled)

if __name__=='__main__':unittest.main()
