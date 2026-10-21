import copy
import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import fetch_ipu
from fetch_firms import normalize as firms
from utils import validate_geojson,validate_ipu

class IngestionTests(unittest.TestCase):
    def raw(self):
        return {'features':[{'attributes':{'STATION_ID':'CA1','DATETIME':1577905200000,'API':25,'STATION_LOCATION':'X','LONGITUDE':101,'LATITUDE':3,'STATE_NAME':'Selangor'}}]}
    def test_doe_wall_time_epoch_normalizes_eight_hours(self):
        raw=self.raw();station=fetch_ipu.normalize(raw)['stations'][0]
        expected=datetime.fromtimestamp(raw['features'][0]['attributes']['DATETIME']/1000-28800,timezone.utc).isoformat().replace('+00:00','Z')
        self.assertEqual(station['updated_at'],expected)
    def test_missing_and_duplicate_station(self):
        raw=self.raw();raw['features'][0]['attributes']['API']=-1;raw['features']*=2
        doc=fetch_ipu.normalize(raw);self.assertEqual(len(doc['stations']),1);self.assertIsNone(doc['stations'][0]['ipu'])
        raw['features'][0]['attributes'].pop('API')
        with self.assertRaises(ValueError):fetch_ipu.normalize(raw)
    def test_preserve_last_good_on_failure(self):
        scratch=Path(__file__).resolve().parents[1]/'work'
        scratch.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=scratch) as folder:
            target=Path(folder)/'ipu.json';target.write_text('last-good',encoding='utf8')
            with patch.object(fetch_ipu,'DATA',Path(folder)),patch.object(fetch_ipu,'fetch',side_effect=RuntimeError()),patch.object(fetch_ipu,'status') as status:
                self.assertFalse(fetch_ipu.main());self.assertEqual(target.read_text(),'last-good');self.assertFalse(status.call_args.args[1])
    def test_geojson_coordinates_and_closed_rings(self):
        d={'type':'FeatureCollection','features':[{'type':'Feature','geometry':{'type':'Point','coordinates':[101,3]},'properties':{}}]};validate_geojson(d)
        d['features'][0]['geometry']['coordinates']=[3,101]
        with self.assertRaises(ValueError):validate_geojson(d)
        d['crs']={'type':'name'}
        with self.assertRaises(ValueError):validate_geojson(d)
    def test_firms_csv_valid_empty_and_unknown_schema(self):
        header='latitude,longitude,acq_date,acq_time,confidence,frp\n'
        countries={'Malaysia':{'features':[]},'Indonesia':{'features':[]}};states={'features':[]};clock=datetime(2026,1,2,12,tzinfo=timezone.utc)
        doc=firms(header+'3,101,2026-01-02,0100,h,51\n',countries,states,clock)
        self.assertEqual(doc['features'][0]['geometry']['coordinates'],[101.,3.]);self.assertEqual(doc['features'][0]['properties']['confidence'],'high')
        self.assertEqual(firms(header,countries,states,clock)['features'],[])
        with self.assertRaises(ValueError):firms('Invalid MAP_KEY.',countries,states,clock)
        self.assertEqual(firms(header+'3,101,2025-01-01,0100,h,51\n',countries,states,clock)['features'],[])

if __name__=='__main__':unittest.main()
