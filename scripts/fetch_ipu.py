"""Read the public DOE ArcGIS feed; preserve last good snapshot on any failure."""
import json
from datetime import datetime, timedelta, timezone
from utils import DATA, fetch, finite, now, read, status, validate_ipu, write

ENDPOINT = 'https://eqms.doe.gov.my/api3/publicmapproxy/PUBLIC_DISPLAY/CAQM_MCAQM_Current_Reading/MapServer/0/query?f=json&outFields=*&returnGeometry=false&where=1%3D1'

def normalize(raw):
    if raw.get('error') or not isinstance(raw.get('features'), list) or raw.get('exceededTransferLimit'):
        raise ValueError('DOE returned an error, incomplete or unexpected schema')
    stations = {}
    for feature in raw['features']:
        a = feature['attributes']
        for field in ('STATION_ID', 'DATETIME', 'API', 'STATION_LOCATION', 'LONGITUDE', 'LATITUDE', 'STATE_NAME'):
            if field not in a:
                raise ValueError('DOE station schema changed')
        if not finite(a['DATETIME']):
            continue  # A station without an observation time cannot be safely dated.
        # This legacy publicmapproxy feed encodes Malaysian wall time as epoch ms.
        # DOE's legacy popup uses getUTCHours on it. Normalize explicitly to UTC;
        # do not infer offsets from age, which would silently shift stale data.
        stamp = datetime.fromtimestamp(a['DATETIME']/1000, timezone.utc) - timedelta(hours=8)
        if stamp > datetime.now(timezone.utc) + timedelta(hours=1):
            raise ValueError('Future observation time')
        value = a['API']
        # -1 is an upstream missing-value sentinel; never cast None to zero.
        value = value if finite(value) and 0 <= value <= 1000 else None
        s = {'id': str(a['STATION_ID']), 'name': a['STATION_LOCATION'], 'state': a['STATE_NAME'],
             'lng': a['LONGITUDE'], 'lat': a['LATITUDE'], 'ipu': value,
             'pollutant': a.get('PARAM_SELECTED') or None,
             'updated_at': stamp.isoformat().replace('+00:00', 'Z')}
        old = stations.get(s['id'])
        if old is None or s['updated_at'] > old['updated_at']:
            stations[s['id']] = s
    return validate_ipu({'version': 1, 'source': 'DOE MyEQMS', 'timestamp_basis':'publicmapproxy Malaysian wall-time epoch; minus 8h normalized to UTC', 'stations': sorted(stations.values(), key=lambda s: s['id'])})

def main():
    try:
        doc = normalize(json.loads(fetch(ENDPOINT)))
        previous = read(DATA / 'ipu.json', {})
        # During the hourly update some feed rows have null DATETIME. Retain
        # the earlier dated station record, with its original time, if present.
        merged = {s['id']:s for s in previous.get('stations',[])}
        for s in doc['stations']:
            if s['id'] not in merged or s['updated_at'] >= merged[s['id']]['updated_at']:
                merged[s['id']] = s
        doc['stations'] = sorted(merged.values(),key=lambda s:s['id'])
        validate_ipu(doc)
        observed = max(s['updated_at'] for s in doc['stations'])
        doc['updated_at'] = observed
        history = previous.get('history', [])
        cutoff = datetime.now(timezone.utc) - timedelta(hours=48)
        history = [h for h in history if datetime.fromisoformat(h['time'].replace('Z', '+00:00')) >= cutoff]
        keyed = {(h['id'], h['time']): h for h in history}
        for s in doc['stations']:
            if s['ipu'] is not None:
                keyed[(s['id'], s['updated_at'])] = {'id': s['id'], 'time': s['updated_at'], 'ipu': s['ipu'], 'state': s['state']}
        doc['history'] = sorted(keyed.values(), key=lambda h: (h['time'], h['id']))
        write(DATA / 'ipu.json', doc)
        status('ipu', True, observed, transport='DOE public ArcGIS JSON')
        print(f"IPU: {len(doc['stations'])} stations; valid snapshot saved")
        return True
    except Exception as exc:
        status('ipu', False, message=f'IPU unavailable: {type(exc).__name__}; last good file retained')
        print('IPU unavailable; last good file retained')
        return False

if __name__ == '__main__':
    main()
