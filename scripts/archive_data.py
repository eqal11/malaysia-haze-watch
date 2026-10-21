"""Durable, compact daily archives; all timestamps UTC, day partitions Malaysia time."""
from datetime import datetime, timedelta, timezone
from collections import defaultdict
from utils import DATA, read, write, validate_ipu, validate_geojson, finite
MYT=timezone(timedelta(hours=8))
BASE=DATA/'archive'

def stamp(value):
    parsed=datetime.fromisoformat(value.replace('Z','+00:00'))
    if parsed.tzinfo is None:raise ValueError('Explicit timestamp offset is required')
    return int(parsed.timestamp())

def day(epoch):
    return datetime.fromtimestamp(epoch,MYT).date().isoformat()

def ipu_records(doc):
    if doc.get('format')!='daily-ipu-v1':return doc.get('records',[])
    records=[]
    for station_id,epoch,value,pollutant in doc.get('readings',[]):
        station=doc['stations'][station_id]
        records.append({'id':station_id,**station,'ipu':value,'pollutant':pollutant,'updated_at':datetime.fromtimestamp(epoch,timezone.utc).isoformat().replace('+00:00','Z')})
    return records

def save_ipu(records,source='DOE snapshots'):
    groups=defaultdict(list)
    for r in records:
        validate_ipu({'version':1,'stations':[r]})
        epoch=stamp(r['updated_at'])
        if datetime.fromtimestamp(epoch,MYT).year<2026:continue
        groups[day(epoch)].append(r)
    for date,rows in groups.items():
        path=BASE/'ipu'/f'{date}.json';old=read(path,{})
        merged={(r['id'],stamp(r['updated_at'])):r for r in ipu_records(old)}
        for r in rows:
            key=(r['id'],stamp(r['updated_at']))
            if key in merged and r.get('pollutant') is None and merged[key].get('pollutant'):
                r={**r,'pollutant':merged[key]['pollutant']}
            merged[key]=r
        stations={r['id']:{k:r[k] for k in ('name','state','lng','lat')} for r in merged.values()}
        readings=[[station_id,epoch,r['ipu'],r.get('pollutant')] for (station_id,epoch),r in sorted(merged.items(),key=lambda item:(item[0][1],item[0][0]))]
        sources=sorted(set(old.get('sources',[])+[source]))
        write(path,{'version':1,'format':'daily-ipu-v1','date':date,'sources':sources,'stations':stations,'readings':readings})

def unpack_hotspots(doc):
    if doc.get('format')!='daily-firms-v1':return doc.get('features',[])
    features=[]
    for row in doc['readings']:
        lng,lat,epoch,confidence,frp,country,region,state,sensor=row[:9]
        context=dict(zip(('on_peat','landcover','admin1'),row[9:12]))
        time=datetime.fromtimestamp(epoch,timezone.utc).isoformat().replace('+00:00','Z')
        features.append({'type':'Feature','geometry':{'type':'Point','coordinates':[lng,lat]},'properties':{'id':f'{sensor}:{lng}:{lat}:{time}','time':time,'confidence':confidence,'frp':frp,'country':country,'region':region,'state':state,'sensor':sensor,**context}})
    return features

def save_hotspots(features,coverage_start,coverage_end,source):
    start,end=stamp(coverage_start),stamp(coverage_end)
    if end<=start:raise ValueError('Invalid coverage interval')
    validate_geojson({'type':'FeatureCollection','features':features})
    groups=defaultdict(list)
    for f in features:
        epoch=stamp(f['properties']['time'])
        if start<=epoch<end:groups[day(epoch)].append(f)
    cursor=datetime.fromtimestamp(start,MYT).replace(hour=0,minute=0,second=0,microsecond=0)
    while cursor.timestamp()<end:
        date=cursor.date().isoformat();path=BASE/'hotspots'/f'{date}.json';old=read(path,{})
        def identity(f):
            p=f['properties'];lng,lat=f['geometry']['coordinates']
            return (p.get('sensor','VIIRS S-NPP'),lng,lat,stamp(p['time']))
        merged={identity(f):f for f in unpack_hotspots(old)}
        for f in groups[date]:
            key=identity(f);previous=merged.get(key)
            if previous and 'on_peat' in previous['properties'] and 'on_peat' not in f['properties']:
                f={**f,'properties':{**f['properties'],**{k:previous['properties'].get(k) for k in ('on_peat','landcover','admin1','country')}}}
            merged[key]=f
        rows=[]
        for f in merged.values():
            p=f['properties'];lng,lat=f['geometry']['coordinates']
            if not finite(p['frp']) or p['frp']<0 or p['confidence'] not in ('low','nominal','high'):raise ValueError('Invalid FIRMS attributes')
            row=[lng,lat,stamp(p['time']),p['confidence'],p['frp'],p.get('country','Other'),p.get('region','Other'),p.get('state'),p.get('sensor','VIIRS S-NPP')]
            if 'on_peat' in p:row.extend([p.get('on_peat'),p.get('landcover'),p.get('admin1')])
            rows.append(row)
        a=max(start,int(cursor.timestamp()));b=min(end,int((cursor+timedelta(days=1)).timestamp()))
        a=min(a,old.get('coverage_start',a));b=max(b,old.get('coverage_end',b))
        write(path,{'version':1,'format':'daily-firms-v1','date':date,'source':source,'coverage_start':a,'coverage_end':b,'readings':sorted(rows,key=lambda r:(r[2],r[0],r[1],r[8])),**({'context_version':old['context_version']} if old.get('context_version') and all(len(row)>=12 for row in rows) else {})})
        cursor+=timedelta(days=1)

def rebuild_index():
    days={}
    for kind in ('ipu','hotspots'):
        for path in sorted((BASE/kind).glob('*.json')):
            doc=read(path);entry={'path':path.relative_to(DATA).as_posix(),'count':len(doc['readings'])}
            if kind=='ipu':entry['hours']=sorted(set(datetime.fromtimestamp(r[1],MYT).hour for r in doc['readings']))
            else:entry.update({'coverage_start':doc['coverage_start'],'coverage_end':doc['coverage_end']})
            days.setdefault(doc['date'],{})[kind]=entry
    write(BASE/'index.json',{'version':1,'timezone':'Asia/Kuala_Lumpur','start_date':'2026-01-01','days':dict(sorted(days.items()))})

def capture():
    ipu=read(DATA/'ipu.json',{});metadata={r['id']:r for r in ipu.get('stations',[])};rows=[]
    for h in ipu.get('history',[]):
        if h['id'] in metadata:rows.append({**metadata[h['id']],'ipu':h['ipu'],'updated_at':h['time'],'pollutant':None})
    rows.extend(ipu.get('stations',[]))
    if rows:save_ipu(rows)
    hot=read(DATA/'hotspots.geojson');health=read(DATA/'meta.json',{}).get('sources',{}).get('hotspots',{})
    if hot and health.get('status')=='ok' and hot.get('updated_at'):
        end=datetime.fromtimestamp(stamp(hot['updated_at']),timezone.utc)
        save_hotspots(hot['features'],(end-timedelta(hours=48)).isoformat(),end.isoformat(),hot.get('source','NASA FIRMS'))
    rebuild_index()
    print('Daily archives retained; existing dates are not trimmed')

if __name__=='__main__':capture()
