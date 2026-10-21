"""Attach mapped land context, never infer ignition or responsibility.

GeoPandas point-in-polygon joins; Rasterio categorical cell sampling.
All output coordinates and existing detection attributes are preserved.
"""
import argparse
import copy
import hashlib
import json
import os
from datetime import datetime
from pathlib import Path
import geopandas as gpd
import pandas as pd
import rasterio
from shapely.geometry import box
from utils import DATA, read, write, validate_geojson, finite, status

LIMIT=5_000_000
CLASSES={10:'Tree cover',20:'Shrubland',30:'Grassland',40:'Cropland',50:'Built-up',60:'Bare / sparse vegetation',70:'Snow and ice',80:'Permanent water bodies',90:'Herbaceous wetland',95:'Mangroves',100:'Moss and lichen'}

def validate_attributed(doc):
    validate_geojson(doc)
    ids=set()
    for f in doc['features']:
        p=f['properties']
        if f['geometry']['type']!='Point' or not isinstance(p.get('id'),str) or p['id'] in ids:raise ValueError('Invalid or duplicate hotspot')
        ids.add(p['id'])
        timestamp=datetime.fromisoformat(p['time'].replace('Z','+00:00'))
        if timestamp.tzinfo is None:raise ValueError('Timestamp requires timezone')
        if not finite(p.get('frp')) or p['frp']<0 or p.get('confidence') not in ('low','nominal','high'):raise ValueError('Invalid FIRMS detection')
        if p.get('on_peat') is not None and type(p['on_peat']) is not bool:raise ValueError('on_peat must be bool or null')
        for key in ('on_peat','landcover','country','admin1'):
            if key not in p:raise ValueError('Missing context field')
        for key in ('landcover','country','admin1'):
            if p[key] is not None and not isinstance(p[key],str):raise ValueError('Invalid context label')
        if p['landcover'] is not None and p['landcover'] not in CLASSES.values():raise ValueError('Unknown land cover')
    return doc

def atomic_output(path,doc):
    validate_attributed(doc)
    content=json.dumps(doc,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n'
    if len(content.encode('utf8'))>=LIMIT:raise ValueError('Attributed output exceeds 5 MB; last good file retained')
    write(path,doc)

def load_context(base=DATA):
    source=read(base/'context/sources.json')
    for name,digest in source['files'].items():
        path=base/'context'/name
        if path.stat().st_size>=LIMIT or hashlib.sha256(path.read_bytes()).hexdigest()!=digest:raise ValueError('Context file checksum/size mismatch')
    peat=gpd.read_file(base/'context/peat.geojson')
    my=gpd.read_file(base/'boundaries/states.geojson')[['name','geometry']];my['country']='Malaysia'
    idn=gpd.read_file(base/'context/indonesia-admin1.geojson')[['name','country','geometry']]
    admins=gpd.GeoDataFrame(pd.concat([my,idn],ignore_index=True),geometry='geometry',crs=4326).rename(columns={'name':'admin1'})
    for frame in (peat,admins):
        if frame.crs is None or frame.crs.to_epsg()!=4326 or not frame.is_valid.all():raise ValueError('Invalid WGS84 context polygons')
    version=hashlib.sha256(json.dumps(source,sort_keys=True).encode()).hexdigest()[:16]
    return peat,admins,base/'context/worldcover-2021.tif',source['bounds'],version

def attribute(doc,peat,admins,raster_path,bounds):
    validate_geojson(doc);out=copy.deepcopy(doc)
    if not out['features']:return out
    for f in out['features']:
        if f['geometry']['type']!='Point':raise ValueError('Expected point detections')
    coords=[f['geometry']['coordinates'][:2] for f in out['features']]
    points=gpd.GeoDataFrame({'row':range(len(coords))},geometry=gpd.points_from_xy([c[0] for c in coords],[c[1] for c in coords]),crs=4326)
    # Intersects includes exact polygon boundaries. Conflicting ADM1 matches are unknown.
    admin_matches={}
    if admins is not None:
        joined=gpd.sjoin(points,admins[['country','admin1','geometry']],how='left',predicate='intersects')
        for row,group in joined.groupby('row'):
            countries=group.country.dropna().unique();names=group.admin1.dropna().unique()
            admin_matches[row]=(str(countries[0]) if len(countries)==1 else None,str(names[0]) if len(names)==1 else None)
    peat_rows=set()
    if peat is not None:
        joined=gpd.sjoin(points,peat[['geometry']],how='inner',predicate='intersects')
        peat_rows=set(joined.row)
    covers=[None]*len(coords)
    if raster_path is not None:
        with rasterio.open(raster_path) as raster:
            if raster.crs.to_epsg()!=4326:raise ValueError('Land cover raster must be WGS84')
            for i,cell in enumerate(raster.sample(coords,masked=True)):
                if not cell.mask[0]:
                    code=int(cell[0])
                    if code not in {0,*CLASSES}:raise ValueError('Unexpected land cover class')
                    covers[i]=CLASSES.get(code)
    coverage=box(*bounds)
    for i,f in enumerate(out['features']):
        p=f['properties'];country,admin1=admin_matches.get(i,(None,None))
        in_scope=coverage.covers(points.geometry.iloc[i])
        on_peat=None
        if peat is not None and in_scope:
            if i in peat_rows:on_peat=True
            elif country in ('Malaysia','Indonesia'):on_peat=False
        p.update(on_peat=on_peat,landcover=covers[i] if in_scope else None,country=country,admin1=admin1)
        # Keep original region/state so existing filters still work; fill missing MY state only.
        if country=='Malaysia' and not p.get('state'):p['state']=admin1
    return validate_attributed(out)

def attribute_archives(context,base=DATA):
    """Backwards-compatible extension of compact history rows, also for imported dates."""
    from archive_data import unpack_hotspots
    peat,admins,raster,bounds,version=context
    for path in sorted((base/'archive/hotspots').glob('*.json')):
        old=read(path)
        if old.get('context_version')==version and all(len(r)>=12 for r in old['readings']):continue
        attributed=attribute({'type':'FeatureCollection','features':unpack_hotspots(old)},peat,admins,raster,bounds)
        rows=[]
        for f in attributed['features']:
            p=f['properties'];lng,lat=f['geometry']['coordinates']
            from archive_data import stamp
            rows.append([lng,lat,stamp(p['time']),p['confidence'],p['frp'],p['country'],p.get('region'),p.get('state'),p.get('sensor','VIIRS S-NPP'),p['on_peat'],p['landcover'],p['admin1']])
        doc={**old,'readings':rows,'context_version':version}
        if len(json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode())>=LIMIT:raise ValueError('Daily archive exceeds 5 MB')
        write(path,doc)

def main(archives=False):
    try:
        context=load_context();peat,admins,raster,bounds,version=context
        path=DATA/'hotspots.geojson';raw=read(path)
        source_time=datetime.fromisoformat(raw['updated_at'].replace('Z','+00:00'))
        if source_time.tzinfo is None:raise ValueError('Source update timestamp needs timezone')
        out=attribute(raw,peat,admins,raster,bounds)
        out['land_context']={'version':version,'input_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'source_updated_at':raw.get('updated_at'),'peat':'PEATMAP 2017, sources MY 2002-2009 / ID 2005-2010','landcover':'ESA WorldCover 2021 v200, overview resampled to about 667 m','admin1':'geoBoundaries gbOpen 2017, ODbL 1.0','disclaimer':'Land context only, not evidence of fire ignition or responsibility'}
        if archives:attribute_archives(context)
        atomic_output(DATA/'hotspots_attributed.geojson',out)
        status('land_context',True,raw.get('updated_at'),transport='PEATMAP + ESA WorldCover 2021 + geoBoundaries')
        print(f"Land context: {len(out['features'])} detections; measured heat anomalies, not ignition evidence")
        return True
    except Exception as exc:
        status('land_context',False,message=f'Land context failed ({type(exc).__name__}); last good file retained')
        print(f'Land context unavailable ({type(exc).__name__}); last good output retained')
        return False

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--archives',action='store_true')
    raise SystemExit(0 if main(parser.parse_args().archives) else 1)
