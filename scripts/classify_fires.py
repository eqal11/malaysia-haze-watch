"""Classify real FIRMS observations and DBSCAN spatial/temporal detection groups.

No FRP threshold. Noise is retained separately, never called an event. No new
third-party runtime dependency. All generated products are prepared/validated
before atomic replacement; a failure retains the previous good analysis.
"""
import hashlib
import json
import math
import os
from collections import Counter, defaultdict, deque
from datetime import datetime, timedelta, timezone
from utils import DATA, read, status, validate_geojson, finite
from archive_data import unpack_hotspots, stamp, MYT

CLASSES=('forest','peat','vegetation','cropland','built_up','other','unknown')
COVERS={'Tree cover':'forest','Mangroves':'forest','Shrubland':'vegetation',
        'Grassland':'vegetation','Herbaceous wetland':'vegetation','Moss and lichen':'vegetation',
        'Cropland':'cropland','Built-up':'built_up','Bare / sparse vegetation':'other',
        'Permanent water bodies':'other','Snow and ice':'other'}
LIMIT=5_000_000

def classify(properties):
    # Peat overrides the display group, while the original landcover remains.
    if properties.get('on_peat') is True:return 'peat'
    return COVERS.get(properties.get('landcover'),'unknown')

def haversine(a,b):
    x1,y1=a['geometry']['coordinates'];x2,y2=b['geometry']['coordinates']
    dlat=math.radians(y2-y1);dlon=math.radians(x2-x1)
    h=math.sin(dlat/2)**2+math.cos(math.radians(y1))*math.cos(math.radians(y2))*math.sin(dlon/2)**2
    return 6371.0088*2*math.asin(min(1,math.sqrt(h)))

def identity(f):
    p=f['properties'];x,y=f['geometry']['coordinates']
    return (p.get('sensor'),x,y,stamp(p['time']))

def dbscan(features,eps_km=3,min_samples=2,max_gap_hours=24):
    """DBSCAN with haversine distance, self-inclusive density and a time gate.

    Spatial index uses conservative longitude/latitude cells within study bounds.
    Event membership is deterministic for the same sorted input. Border points
    join the first deterministic cluster. Noise label is -1.
    """
    if not (0<eps_km<=50 and isinstance(min_samples,int) and min_samples>=2 and max_gap_hours>0):raise ValueError('Invalid DBSCAN parameters')
    cell=eps_km/111.32;grid=defaultdict(list);times=[]
    for i,f in enumerate(features):
        x,y=f['geometry']['coordinates'];grid[(math.floor(x/cell),math.floor(y/cell))].append(i);times.append(stamp(f['properties']['time']))
    def neighbours(i):
        x,y=features[i]['geometry']['coordinates'];gx,gy=math.floor(x/cell),math.floor(y/cell)
        reach=math.ceil(1/max(.01,math.cos(math.radians(y))))+1;out=[]
        for dx in range(-reach,reach+1):
            for dy in range(-2,3):
                for j in grid.get((gx+dx,gy+dy),[]):
                    if abs(times[i]-times[j])<=max_gap_hours*3600 and haversine(features[i],features[j])<=eps_km:out.append(j)
        return sorted(out)
    labels=[None]*len(features);cluster=0
    for i in range(len(features)):
        if labels[i] is not None:continue
        ns=neighbours(i)
        if len(ns)<min_samples:labels[i]=-1;continue
        labels[i]=cluster;queue=deque(ns);seen=set(ns)
        while queue:
            j=queue.popleft()
            if labels[j]==-1:labels[j]=cluster
            if labels[j] is not None:continue
            labels[j]=cluster;js=neighbours(j)
            if len(js)>=min_samples:
                for k in js:
                    if k not in seen:seen.add(k);queue.append(k)
        cluster+=1
    return labels

def summary(features,pixel_m):
    properties=[f['properties'] for f in features];epochs=[stamp(p['time']) for p in properties]
    counts=Counter(classify(p) for p in properties);classes=sorted(counts,key=lambda c:(-counts[c],CLASSES.index(c)))
    peats=[p['on_peat'] for p in properties if p.get('on_peat') is not None]
    # Unique nominal cells, not the sum of repeated overpass detections.
    cells=set()
    for f in features:
        lng,lat=f['geometry']['coordinates'];cells.add((math.floor(math.radians(lng)*6371008.8/pixel_m),math.floor(math.radians(lat)*6371008.8/pixel_m)))
    return {'hotspot_count':len(features),'total_frp':round(sum(p['frp'] for p in properties),2),
            'max_frp':max(p['frp'] for p in properties),'first_seen':datetime.fromtimestamp(min(epochs),timezone.utc).isoformat().replace('+00:00','Z'),
            'last_seen':datetime.fromtimestamp(max(epochs),timezone.utc).isoformat().replace('+00:00','Z'),
            'persistence_days':len({datetime.fromtimestamp(e,MYT).date() for e in epochs}),
            'dominant_class':classes[0],'peat_share':round(sum(v is True for v in peats)/len(peats),4) if peats else None,
            'peat_known_count':len(peats),'estimated_area_km2':round(len(cells)*(pixel_m/1000)**2,4),
            'area_method':'Unique nominal 375 m grid cells, approximate detection footprint, not burned area',
            'burn_confirmed':None}

def validate_events(doc):
    validate_geojson(doc)
    if doc.get('analysis_version')!=1 or not isinstance(doc.get('places'),list):raise ValueError('Invalid analysis schema')
    def check(row):
        if not isinstance(row,list) or len(row)!=7:raise ValueError('Invalid compact detection')
        x,y,epoch,frp,kind,peat,place=row
        if not (finite(x) and 95<=x<=120 and finite(y) and -5<=y<=8 and isinstance(epoch,int) and finite(frp) and frp>=0 and isinstance(kind,int) and 0<=kind<len(CLASSES) and (peat is None or type(peat) is bool) and isinstance(place,int) and 0<=place<len(doc['places'])):raise ValueError('Invalid compact detection values')
    ids=set()
    for feature in doc['features']:
        p=feature['properties']
        if p['id'] in ids or p['dominant_class'] not in CLASSES or p['persistence_days']<1 or p['hotspot_count']!=len(p['detections']) or not p['detections']:raise ValueError('Invalid detection group')
        ids.add(p['id'])
        for row in p['detections']:check(row)
    for row in doc['unclustered']:check(row)
    return doc

def build(current,archive_docs,config):
    validate_geojson(current);end=stamp(current['updated_at']);start=end-config['lookback_days']*86400
    keyed={};daily=[]
    for doc in archive_docs:
        if doc.get('format')!='daily-firms-v1':raise ValueError('Unexpected FIRMS archive format')
        rows=unpack_hotspots(doc);validate_geojson({'type':'FeatureCollection','features':rows})
        daily_counts=Counter()
        for f in rows:
            p=f['properties'];epoch=stamp(p['time'])
            if epoch>end:continue
            if not finite(p.get('frp')) or p['frp']<0:raise ValueError('Invalid FRP')
            daily_counts[(p.get('country'),p.get('admin1'),classify(p))]+=1
            if start<=epoch<=end:keyed[identity(f)]=f
        daily.append({'date':doc['date'],'coverage_start':doc['coverage_start'],'coverage_end':min(end,doc['coverage_end']),
                      'counts':[[*key,value] for key,value in sorted(daily_counts.items(),key=lambda p:str(p[0]))]})
    for f in current['features']:
        p=f['properties'];epoch=stamp(p['time'])
        if not finite(p.get('frp')) or p['frp']<0:raise ValueError('Invalid FRP')
        if start<=epoch<=end:keyed[identity(f)]=f
    features=sorted(keyed.values(),key=lambda f:str(identity(f)));labels=dbscan(features,**config['dbscan']);groups=defaultdict(list)
    places=sorted({(f['properties'].get('country'),f['properties'].get('admin1')) for f in features},key=str);place_ids={p:i for i,p in enumerate(places)}
    def compact(f):
        p=f['properties'];return [*f['geometry']['coordinates'],stamp(p['time']),p['frp'],CLASSES.index(classify(p)),p.get('on_peat'),place_ids[(p.get('country'),p.get('admin1'))]]
    for i,label in enumerate(labels):groups[label].append(features[i])
    events=[];membership={}
    for label,rows in groups.items():
        if label<0:continue
        # Stable for identical inputs. An event can merge or change ID as its rolling window changes.
        event_id='F'+hashlib.sha256(repr(identity(rows[0])).encode()).hexdigest()[:12]
        for f in rows:membership[identity(f)]=event_id
        coords=[f['geometry']['coordinates'] for f in rows]
        provinces=sorted({f['properties'].get('admin1') for f in rows if f['properties'].get('admin1')})
        events.append({'type':'Feature','geometry':{'type':'Point','coordinates':[round(sum(c[0] for c in coords)/len(coords),6),round(sum(c[1] for c in coords)/len(coords),6)]},
                       'properties':{'id':event_id,**summary(rows,config['pixel_m']),'admin1':provinces,'detections':[compact(f) for f in rows]}})
    out={**current,'analysis_version':1,'features':[]}
    for f in current['features']:
        out['features'].append({**f,'properties':{**f['properties'],'fire_class':classify(f['properties']),'event_id':membership.get(identity(f))}})
    events.sort(key=lambda f:f['properties']['id'])
    event_doc={'type':'FeatureCollection','analysis_version':1,'updated_at':current['updated_at'],'config':config,
               'classes':list(CLASSES),'places':[{'country':c,'admin1':a} for c,a in places],
               'coverage':sorted([{'date':d['date'],'start':d['coverage_start'],'end':d['coverage_end']} for d in daily if d['coverage_end']>=start],key=lambda d:d['date']),
               'daily':sorted(daily,key=lambda d:d['date']),'unclustered':[compact(f) for f in groups.get(-1,[])],'features':events}
    validate_geojson(out);validate_events(event_doc)
    return out,event_doc

def main():
    temps=[]
    try:
        current=read(DATA/'hotspots_attributed.geojson');raw=read(DATA/'hotspots.geojson')
        if not current or current.get('land_context',{}).get('source_updated_at')!=raw.get('updated_at'):raise ValueError('Attribution is not current')
        if current['land_context'].get('input_sha256')!=hashlib.sha256((DATA/'hotspots.geojson').read_bytes()).hexdigest():raise ValueError('Attribution input mismatch')
        config=read(DATA/'fire-config.json');latest=datetime.fromtimestamp(stamp(current['updated_at']),MYT).date();docs=[]
        for path in sorted((DATA/'archive/hotspots').glob('*.json')):
            date=datetime.fromisoformat(path.stem).date()
            if 0<=(latest-date).days<config['trend_days']:docs.append(read(path))
        classified,events=build(current,docs,config)
        # Preflight both sizes/schema before replacing either member of the pair.
        pair=hashlib.sha256((json.dumps(events,separators=(',',':'),ensure_ascii=False)+current['land_context']['input_sha256']).encode()).hexdigest()[:20]
        for name,doc in [('forest_fires.geojson',classified),('fire_events.geojson',events)]:
            doc['analysis_id']=pair;content=json.dumps(doc,separators=(',',':'),ensure_ascii=False,allow_nan=False)+'\n'
            if len(content.encode())>=LIMIT:raise ValueError('Fire analysis exceeds 5 MB')
            target=DATA/name;temp=target.with_suffix('.tmp');temps.append(temp);temp.write_text(content,encoding='utf-8')
        for temp,name in zip(temps,['forest_fires.geojson','fire_events.geojson']):
            target=DATA/name
            if target.exists() and target.read_bytes()==temp.read_bytes():temp.unlink()
            else:os.replace(temp,target)
        status('fires',True,current['updated_at'],transport='FIRMS land context + DBSCAN; detection groups, not confirmed fire perimeters')
        print(f"Fire analysis: {len(classified['features'])} current detections, {len(events['features'])} groups; noise retained")
        return True
    except Exception as exc:
        status('fires',False,message=f'Fire analysis failed ({type(exc).__name__}); last good analysis retained')
        print('Fire analysis failed:',type(exc).__name__,'last good files retained')
        return False
    finally:
        for temp in temps:
            if temp.exists():temp.unlink()

if __name__=='__main__':raise SystemExit(0 if main() else 1)
