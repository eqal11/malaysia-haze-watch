"""One-time preparation, NOT a cron task. Real source data, clipped to 95,-5,120,8.

python scripts/prepare_land_context.py --cache work/context-sources
WorldCover's categorical overview is retained at ~600 m, not advertised as 10 m.
Set GDAL_HTTP_CAINFO to a trusted CA bundle if required by your environment.
"""
import argparse
import hashlib
import json
import math
import os
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import geopandas as gpd
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from rasterio.warp import reproject
from shapely.geometry import box, mapping
from shapely import make_valid, set_precision
from utils import DATA, ROOT, write, validate_geojson

BOUNDS = (95, -5, 120, 8)
PEAT_URL = 'https://archive.researchdata.leeds.ac.uk/251/5/Asia.zip'
PEAT_MD5 = '8893f779db40ecc53b19e66518230753'
S3 = 'https://esa-worldcover.s3.eu-central-1.amazonaws.com'
GRID_URL = S3 + '/v100/2020/esa_worldcover_2020_grid.geojson'
ADM_URL = 'https://www.geoboundaries.org/api/current/gbOpen/IDN/ADM1/'
LIMIT = 5_000_000
CLASSES = {10:'Tree cover',20:'Shrubland',30:'Grassland',40:'Cropland',50:'Built-up',60:'Bare / sparse vegetation',70:'Snow and ice',80:'Permanent water bodies',90:'Herbaceous wetland',95:'Mangroves',100:'Moss and lichen'}

def download(url, path):
    if path.exists(): return path
    req = urllib.request.Request(url, headers={'User-Agent':'MalaysiaHazeWatch/1.0'})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                content = response.read()
            temp = path.with_suffix(path.suffix+'.tmp')
            temp.write_bytes(content); os.replace(temp, path)
            return path
        except Exception:
            if attempt == 2: raise

def geo_write(path, frame):
    doc = json.loads(frame.to_json(drop_id=True))
    validate_geojson(doc)
    if len(json.dumps(doc,separators=(',',':')).encode()) >= LIMIT:
        raise ValueError(f'{path.name} exceeds 5 MB')
    write(path, doc)

def prepare(cache):
    cache.mkdir(parents=True, exist_ok=True); out=DATA/'context';out.mkdir(exist_ok=True)
    archive=download(PEAT_URL,cache/'Asia.zip')
    if hashlib.md5(archive.read_bytes()).hexdigest()!=PEAT_MD5:raise ValueError('PEATMAP checksum mismatch')
    # Actual inspected ZIP member and CRS ESRI:54034; Id / AREA are not categories.
    with zipfile.ZipFile(archive) as z:
        for info in z.infolist():
            target=(cache/info.filename).resolve()
            if not target.is_relative_to(cache.resolve()):raise ValueError('Unsafe archive member')
        z.extractall(cache)
    peat=gpd.read_file(cache/'Asia/SEA_Peatland.shp')
    if list(peat.columns)!=['Id','AREA','geometry'] or peat.crs is None:raise ValueError('PEATMAP schema changed')
    peat=peat.to_crs(4326)
    # The source is one huge MultiPolygon with overlaps between components.
    # Repair components individually, avoiding an unnecessary global overlay.
    pieces=[];extent=box(*BOUNDS)
    for polygon in peat.geometry.iloc[0].geoms:
        if not box(*polygon.bounds).intersects(extent):continue
        geom=(polygon if polygon.is_valid else make_valid(polygon)).intersection(extent)
        for part in getattr(geom,'geoms',[geom]):
            if not part.is_empty and part.geom_type in ('Polygon','MultiPolygon'):pieces.append(part)
    print('Peat polygons clipped:',len(pieces),flush=True)
    frame=gpd.GeoDataFrame({'source':['PEATMAP SEA']*len(pieces)},geometry=pieces,crs=4326).to_crs(6933)
    frame.geometry=frame.simplify(25,preserve_topology=True)
    frame=frame.to_crs(4326);frame.geometry=frame.geometry.map(lambda g:set_precision(g,0.000001))
    geo_write(out/'peat.geojson',frame)
    meta_path=download(ADM_URL,cache/'idn-adm1-meta.json'); adm_meta=json.loads(meta_path.read_text())
    adm=gpd.read_file(download(adm_meta['simplifiedGeometryGeoJSON'],cache/'idn-adm1.geojson'))
    if not {'shapeName','shapeGroup','geometry'}.issubset(adm.columns) or adm.crs is None:raise ValueError('ADM1 schema changed')
    adm=adm.to_crs(4326);adm=adm[adm.intersects(box(*BOUNDS))].copy()
    adm.geometry=adm.geometry.map(make_valid).intersection(box(*BOUNDS))
    adm=adm.rename(columns={'shapeName':'name'})[['name','geometry']];adm['country']='Indonesia'
    geo_write(out/'indonesia-admin1.geojson',adm)
    # Read the official tile grid; do not infer tile existence from filenames.
    grid=gpd.read_file(download(GRID_URL,cache/'worldcover-grid.geojson'))
    tiles=sorted(grid[grid.geometry.map(lambda g:g.intersection(box(*BOUNDS)).area>0)].ll_tile)
    # Exactly 500 cells per 3-degree tile (~667 m), using supplied 1:64 overview.
    width=math.ceil((BOUNDS[2]-BOUNDS[0])/.006);height=math.ceil((BOUNDS[3]-BOUNDS[1])/.006)
    transform=from_bounds(*BOUNDS,width,height);dest=np.zeros((height,width),dtype='uint8')
    def tile(name):
        path=cache/f'{name}-overview.tif'
        url=f'{S3}/v200/2021/map/ESA_WorldCover_10m_2021_v200_{name}_Map.tif'
        if not path.exists():
            with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif',GDAL_HTTP_TIMEOUT='60',GDAL_HTTP_MAX_RETRY='3'):
                with rasterio.open(url,overview_level=5) as src:
                    if src.crs.to_epsg()!=4326 or src.nodata!=0 or src.count!=1:raise ValueError('Unexpected WorldCover raster')
                    values=src.read(1);profile=src.profile.copy();profile.update(driver='GTiff',compress='deflate',tiled=True)
                    with rasterio.open(path,'w',**profile) as dst:dst.write(values,1)
        return name,path,url
    with ThreadPoolExecutor(max_workers=4) as pool:
        results=list(pool.map(tile,tiles))
    for name,path,url in results:
        with rasterio.open(path) as src:
            reproject(rasterio.band(src,1),dest,src_transform=src.transform,src_crs=src.crs,src_nodata=0,dst_transform=transform,dst_crs='EPSG:4326',dst_nodata=0,resampling=Resampling.nearest,init_dest_nodata=False)
        print('WorldCover',name,flush=True)
    if not set(np.unique(dest)).issubset({0,*CLASSES}):raise ValueError('Unknown WorldCover class')
    path=out/'worldcover-2021.tif';temp=path.with_suffix('.tmp.tif')
    with rasterio.open(temp,'w',driver='GTiff',height=height,width=width,count=1,dtype='uint8',crs='EPSG:4326',transform=transform,nodata=0,compress='deflate',tiled=True) as dst:
        dst.write(dest,1);dst.update_tags(source='ESA WorldCover 2021 v200',method='categorical overview 64, nearest resampling; 0.006 degree grid')
    if temp.stat().st_size>=LIMIT:raise ValueError('Land cover exceeds 5 MB')
    os.replace(temp,path)
    write(out/'sources.json',{'version':1,'bounds':BOUNDS,'peat':{'dataset':'PEATMAP SEA','url':PEAT_URL,'md5':PEAT_MD5,'license':'CC BY 4.0','citation':'Xu, Morris, Liu and Holden (2017), doi:10.5518/252','source_years':'Malaysia 2002-2009; Indonesia 2005-2010','method':'repair components, clip, simplify 25 m in EPSG:6933 preserving topology, coordinate precision 0.000001 degrees'},'landcover':{'dataset':'ESA WorldCover 2021 v200','license':'CC BY 4.0','doi':'10.5281/zenodo.7254221','resolution_degrees':.006,'method':'Read supplied level 64 categorical overview, nearest resample to ~667 m; not native 10 m','classes':CLASSES,'tiles':[r[2] for r in results],'grid_url':GRID_URL,'attribution':'© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium'},'indonesia_admin1':adm_meta,'malaysia_admin1':'../boundaries/states.geojson; geoBoundaries gbOpen MYS ADM1, ODbL 1.0','files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [out/'peat.geojson',out/'indonesia-admin1.geojson',path]}})
    print('Prepared land context; every file below 5 MB')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--cache',type=Path,default=ROOT/'work/context-sources')
    prepare(parser.parse_args().cache)
