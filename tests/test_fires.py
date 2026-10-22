import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import classify_fires as fires

def point(x,y=1,time='2026-10-21T00:00:00Z',cover='Tree cover',peat=False,frp=1):
    return {'type':'Feature','geometry':{'type':'Point','coordinates':[x,y]},'properties':{'id':str((x,y,time)),'sensor':'VIIRS S-NPP','time':time,'frp':frp,'confidence':'nominal','landcover':cover,'on_peat':peat,'country':'Indonesia','admin1':'Riau'}}
CONFIG={'dbscan':{'eps_km':3,'min_samples':2,'max_gap_hours':24},'lookback_days':7,'trend_days':30,'pixel_m':375}

class FireTests(unittest.TestCase):
    def test_classes_preserve_unknown_and_peat_overrides_without_changing_cover(self):
        expected={'Tree cover':'forest','Mangroves':'forest','Shrubland':'vegetation','Grassland':'vegetation','Cropland':'cropland','Built-up':'built_up','Permanent water bodies':'other'}
        for cover,kind in expected.items():self.assertEqual(fires.classify({'landcover':cover}),kind)
        self.assertEqual(fires.classify({'landcover':None,'on_peat':None}),'unknown')
        p={'landcover':'Tree cover','on_peat':True};self.assertEqual(fires.classify(p),'peat');self.assertEqual(p['landcover'],'Tree cover')

    def test_known_two_dbscan_clusters_and_noise_with_self_inclusive_density(self):
        rows=[point(101),point(101.005),point(103),point(103.005),point(110)]
        self.assertEqual(fires.dbscan(rows),[0,0,1,1,-1])
        self.assertEqual(fires.dbscan(rows,min_samples=3),[-1]*5)

    def test_time_gate_prevents_unrelated_overpasses_joining(self):
        self.assertEqual(fires.dbscan([point(101),point(101.001,time='2026-10-23T01:00:00Z')]),[-1,-1])

    def test_persistence_days_and_unique_nominal_pixel_not_repeated_area(self):
        rows=[point(101,time='2026-10-20T23:00:00Z'),point(101,time='2026-10-21T23:00:00Z')]
        s=fires.summary(rows,375);self.assertEqual(s['persistence_days'],2);self.assertAlmostEqual(s['estimated_area_km2'],.1406);self.assertEqual(s['total_frp'],2)
        unknown=fires.summary([point(102,peat=None)],375);self.assertIsNone(unknown['peat_share'])

    def test_build_retains_low_frp_peat_and_noise_deduplicates_and_excludes_future(self):
        rows=[point(101,peat=True,frp=.01),point(101.001,peat=True,frp=.02),point(110,cover=None,peat=None)]
        current={'type':'FeatureCollection','updated_at':'2026-10-22T00:00:00Z','features':rows+[point(111,time='2026-10-23T00:00:00Z')]}
        out,events=fires.build(current,[],CONFIG);self.assertEqual(len(events['features']),1);self.assertEqual(events['features'][0]['properties']['hotspot_count'],2);self.assertEqual(len(events['unclustered']),1);self.assertEqual(out['features'][0]['properties']['fire_class'],'peat');self.assertIsNone(out['features'][2]['properties']['on_peat']);self.assertIsNone(out['features'][2]['properties']['event_id'])
        broken=copy.deepcopy(events);broken['unclustered'][0][0]=300
        with self.assertRaises(ValueError):fires.validate_events(broken)

    def test_main_failure_keeps_last_good_products(self):
        base=Path(__file__).resolve().parents[1]/'work';base.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as folder:
            target=Path(folder)
            for name in ['forest_fires.geojson','fire_events.geojson']:(target/name).write_text('last good')
            with patch.object(fires,'DATA',target),patch.object(fires,'status'):
                self.assertFalse(fires.main())
            for name in ['forest_fires.geojson','fire_events.geojson']:self.assertEqual((target/name).read_text(),'last good')

if __name__=='__main__':unittest.main()
