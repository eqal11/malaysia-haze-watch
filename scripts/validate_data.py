"""Fail deployment on malformed data; stale but valid last-good snapshots are allowed."""
from datetime import datetime
from utils import DATA, finite, read, validate_geojson, validate_ipu

def main():
    ipu = validate_ipu(read(DATA/'ipu.json'))
    for path in (DATA/'boundaries').glob('*.geojson'):
        validate_geojson(read(path))
    if (DATA/'boundaries/districts.geojson').stat().st_size > 3_000_000:
        raise ValueError('District geometry exceeds 3MB budget')
    hot = validate_geojson(read(DATA/'hotspots.geojson'))
    ids=set()
    for f in hot['features']:
        p=f['properties']
        if p['id'] in ids or not finite(p['frp']) or p['frp']<0 or p['confidence'] not in ('low','nominal','high'):
            raise ValueError('Invalid hotspot properties')
        ids.add(p['id'])
        datetime.fromisoformat(p['time'].replace('Z','+00:00'))
    grid=read(DATA/'sampling-grid.json')
    if not grid['points']:
        raise ValueError('Missing model sampling grid')
    meta=read(DATA/'meta.json')
    if not isinstance(meta.get('sources'),dict):
        raise ValueError('Missing source health metadata')
    print(f"Schemas OK: {len(ipu['stations'])} stations, {len(hot['features'])} hotspots; all geometries WGS84 [lng,lat]")

if __name__=='__main__':
    main()
