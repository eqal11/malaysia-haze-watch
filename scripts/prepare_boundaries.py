"""One-time reproducible source download; simplify with mapshaper before build_grid."""
import json
from utils import DATA, fetch, validate_geojson, write

SOURCES = [('MYS','ADM2','districts'),('MYS','ADM1','states'),('MYS','ADM0','malaysia'),('IDN','ADM0','indonesia')]

def main():
    provenance = []
    for iso,level,name in SOURCES:
        meta = json.loads(fetch(f'https://www.geoboundaries.org/api/current/gbOpen/{iso}/{level}/'))
        doc = json.loads(fetch(meta['gjDownloadURL']))
        doc.pop('crs',None)
        validate_geojson(doc)
        for f in doc['features']:
            p=f['properties']
            label={'Penang':'Pulau Pinang','Malacca':'Melaka'}.get(p['shapeName'],p['shapeName']) if name=='states' else p['shapeName']
            f['properties']={'id':p['shapeID'],'name':label}
        write(DATA/'boundaries'/f'{name}.geojson',doc)
        provenance.append(meta)
        print(name,len(doc['features']))
    write(DATA/'boundaries/sources.json',provenance)

if __name__=='__main__':
    main()
