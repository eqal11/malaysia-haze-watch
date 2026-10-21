import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import attribute_hotspots as module
from archive_data import unpack_hotspots

def detection(lng,lat,id='test'):
    # Explicit test fixture, not an observed FIRMS detection.
    return {'type':'Feature','geometry':{'type':'Point','coordinates':[lng,lat]},'properties':{'id':id,'time':'2026-10-21T12:00:00Z','confidence':'nominal','frp':12,'sensor':'TEST FIXTURE','region':'Sumatra','state':None,'country':'untrusted input'}}

class LandContextTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.context=module.load_context()

    def attribute(self,features):
        peat,admins,raster,bounds,_=self.context
        return module.attribute({'type':'FeatureCollection','features':features},peat,admins,raster,bounds)

    def test_known_land_points_in_real_peatmap(self):
        # Riau peat lowland and central Kuala Lumpur, inspected against downloaded SEA polygons.
        result=self.attribute([detection(102.3,.5,'riau'),detection(101.7,3.15,'kl')])['features']
        a,b=[f['properties'] for f in result]
        self.assertIs(a['on_peat'],True);self.assertEqual(a['country'],'Indonesia');self.assertEqual(a['admin1'],'Riau')
        self.assertIs(b['on_peat'],False);self.assertEqual(b['country'],'Malaysia');self.assertIsInstance(b['admin1'],str)
        self.assertIsInstance(a['landcover'],str);self.assertIsInstance(b['landcover'],str)

    def test_missing_and_outside_coverage_are_null_not_false(self):
        p=self.attribute([detection(0,0)])['features'][0]['properties']
        for key in ('on_peat','landcover','country','admin1'):self.assertIsNone(p[key])
        _,admins,_,bounds,_=self.context
        d=module.attribute({'type':'FeatureCollection','features':[detection(101.7,3.15)]},None,admins,None,bounds)
        self.assertIsNone(d['features'][0]['properties']['on_peat']);self.assertIsNone(d['features'][0]['properties']['landcover'])

    def test_preserves_coordinates_and_detection_fields_without_mutation(self):
        original=detection(102.3,.5);before=copy.deepcopy(original)
        output=self.attribute([original])['features'][0]
        self.assertEqual(original,before);self.assertEqual(output['geometry'],original['geometry'])
        for key in ('id','time','confidence','frp','sensor','region'):self.assertEqual(output['properties'][key],original['properties'][key])

    def test_last_good_output_survives_failure_and_size_limit(self):
        scratch=Path(__file__).resolve().parents[1]/'work';scratch.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=scratch) as folder:
            target=Path(folder)/'hotspots_attributed.geojson';target.write_text('last good')
            with patch.object(module,'DATA',Path(folder)),patch.object(module,'load_context',side_effect=ValueError('broken')),patch.object(module,'status'):
                self.assertFalse(module.main());self.assertEqual(target.read_text(),'last good')
            raw={'type':'FeatureCollection','updated_at':'2026-10-21T12:00:00Z','features':[detection(102.3,.5)]}
            (Path(folder)/'hotspots.geojson').write_text(json.dumps(raw),encoding='utf8')
            with patch.object(module,'DATA',Path(folder)),patch.object(module,'load_context',return_value=self.context),patch.object(module,'attribute_archives',side_effect=ValueError('archive failure')),patch.object(module,'status'):
                self.assertFalse(module.main(archives=True));self.assertEqual(target.read_text(),'last good')
            d=self.attribute([detection(101.7,3.15)]);d['oversize']='x'*5_000_000
            with self.assertRaises(ValueError):module.atomic_output(target,d)
            self.assertEqual(target.read_text(),'last good')

    def test_schema_refuses_invalid_booleans_duplicates_swapped_coordinates(self):
        d=self.attribute([detection(101.7,3.15)])
        for change in ('bool','duplicate','coordinate','missing'):
            bad=copy.deepcopy(d)
            if change=='bool':bad['features'][0]['properties']['on_peat']='false'
            if change=='duplicate':bad['features']*=2
            if change=='coordinate':bad['features'][0]['geometry']['coordinates']=[3,101]
            if change=='missing':del bad['features'][0]['properties']['admin1']
            with self.assertRaises(ValueError):module.validate_attributed(bad)

    def test_compact_archive_retains_false_and_null(self):
        base=[101.7,3.15,1792584000,'nominal',12,'Malaysia','Malaysia','Kuala Lumpur','TEST']
        doc={'format':'daily-firms-v1','readings':[base+[False,None,'Kuala Lumpur']]}
        p=unpack_hotspots(doc)[0]['properties'];self.assertIs(p['on_peat'],False);self.assertIsNone(p['landcover'])
        doc['readings']=[base];self.assertNotIn('on_peat',unpack_hotspots(doc)[0]['properties'])

    def test_bundled_context_checksums_wgs84_valid_and_under_budget(self):
        peat,admins,raster,_,_=self.context
        self.assertTrue(peat.is_valid.all());self.assertTrue(admins.is_valid.all())
        self.assertEqual(peat.crs.to_epsg(),4326)
        for path in (module.DATA/'context').iterdir():self.assertLess(path.stat().st_size,5_000_000)

if __name__=='__main__':unittest.main()
