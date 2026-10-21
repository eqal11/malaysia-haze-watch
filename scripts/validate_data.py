"""Fail deployment on malformed data; stale but valid last-good snapshots are allowed."""
from datetime import datetime
from utils import DATA, finite, read, validate_geojson, validate_ipu

def main():
    for path in DATA.rglob('*'):
        if path.is_file() and path.stat().st_size>=5_000_000:raise ValueError(f'{path.name} exceeds 5 MB')
    attributed=DATA/'hotspots_attributed.geojson'
    if attributed.exists():
        from attribute_hotspots import validate_attributed
        validate_attributed(read(attributed))
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
    if (DATA/'archive/index.json').exists():
        from archive_data import ipu_records,unpack_hotspots,day,stamp
        index=read(DATA/'archive/index.json')
        for date,kinds in index['days'].items():
            for kind,entry in kinds.items():
                path=(DATA/entry['path']).resolve()
                if not path.is_relative_to((DATA/'archive').resolve()):raise ValueError('Archive path escaped data directory')
                doc=read(path)
                if kind=='ipu':
                    for row in ipu_records(doc):
                        validate_ipu({'version':1,'stations':[row]})
                        if day(stamp(row['updated_at']))!=date:raise ValueError('Wrong MYT day partition')
                else:
                    validate_geojson({'type':'FeatureCollection','features':unpack_hotspots(doc)})
                    for row in doc['readings']:
                        if day(row[2])!=date:raise ValueError('Wrong hotspot day partition')
    print(f"Schemas OK: {len(ipu['stations'])} stations, {len(hot['features'])} hotspots; all geometries WGS84 [lng,lat]")

if __name__=='__main__':
    main()
