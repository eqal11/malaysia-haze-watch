"""FIRMS VIIRS CSV to WGS84 GeoJSON. MAP_KEY never leaves this process."""
import csv
import io
import os
from datetime import datetime, timedelta, timezone
from urllib.parse import quote
from utils import DATA, contains, fetch, finite, locate, now, read, status, validate_geojson, write

PUBLIC = 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_48h.csv'

def normalize(text, countries, states, clock=None):
    clock = clock or datetime.now(timezone.utc)
    reader = csv.DictReader(io.StringIO(text))
    required = {'latitude', 'longitude', 'acq_date', 'acq_time', 'confidence', 'frp'}
    if not required.issubset(reader.fieldnames or []):
        raise ValueError('Unexpected FIRMS CSV schema')
    features = {}
    for row in reader:
        lng, lat = float(row['longitude']), float(row['latitude'])
        if not (95 <= lng <= 120 and -5 <= lat <= 8):
            continue
        stamp = datetime.strptime(row['acq_date'] + row['acq_time'].zfill(4), '%Y-%m-%d%H%M').replace(tzinfo=timezone.utc)
        if not (clock-timedelta(hours=48) <= stamp <= clock+timedelta(minutes=15)):
            continue
        frp = float(row['frp'])
        if not finite(frp) or frp < 0:
            raise ValueError('Invalid FRP')
        conf = row['confidence'].lower()
        if conf not in ('l', 'n', 'h', 'low', 'nominal', 'high'):
            raise ValueError('Unknown VIIRS confidence')
        conf = {'l':'low','n':'nominal','h':'high'}.get(conf, conf)
        country = next((name for name, fc in countries.items() if locate([lng, lat], fc['features'])), 'Other')
        state = locate([lng, lat], states['features']) if country == 'Malaysia' else None
        region = ('Sumatra' if lng < 106 else 'Kalimantan' if lng >= 108 and lat < 4.3 else 'Other Indonesia') if country == 'Indonesia' else country
        key = f"SNPP:{lng}:{lat}:{stamp.isoformat()}"
        features[key] = {'type':'Feature', 'geometry':{'type':'Point','coordinates':[lng,lat]}, 'properties':{
            'id':key,'time':stamp.isoformat().replace('+00:00','Z'),'confidence':conf,'frp':frp,
            'country':country,'region':region,'state': state['properties']['name'] if state else None, 'sensor':'VIIRS S-NPP'}}
    return validate_geojson({'type':'FeatureCollection','features':list(features.values())})

def main():
    key = os.environ.get('FIRMS_MAP_KEY', '').strip()
    transport = 'FIRMS area API' if key else 'NASA public global 48h CSV (no key configured)'
    url = f'https://firms.modaps.eosdis.nasa.gov/api/area/csv/{quote(key, safe="")}/VIIRS_SNPP_NRT/95,-5,120,8/3' if key else PUBLIC
    try:
        countries = {name: read(DATA / 'boundaries' / file) for name,file in [('Malaysia','malaysia.geojson'),('Indonesia','indonesia.geojson')]}
        doc = normalize(fetch(url), countries, read(DATA/'boundaries/states.geojson'))
        doc.update({'updated_at':now(),'source':transport})
        write(DATA / 'hotspots.geojson', doc)
        status('hotspots', True, doc['updated_at'], transport=transport)
        print(f"FIRMS: {len(doc['features'])} detections in last 48h")
        return True
    except Exception as exc:
        status('hotspots', False, message=f'FIRMS unavailable: {type(exc).__name__}; last good file retained', transport=transport)
        print('FIRMS unavailable; last good file retained')
        return False

if __name__ == '__main__':
    main()
