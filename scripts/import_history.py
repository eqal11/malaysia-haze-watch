"""Import actual authorized DOE CSV exports or NASA FIRMS archive CSV files."""
import argparse
import csv
from datetime import datetime,timezone
from pathlib import Path
from utils import DATA,read,locate,finite
from archive_data import MYT,save_ipu,save_hotspots,rebuild_index

def import_ipu(path):
    required={'station_id','name','state','longitude','latitude','ipu','datetime'};records=[]
    with path.open(encoding='utf-8-sig',newline='') as stream:
        rows=csv.DictReader(stream)
        if not required.issubset(rows.fieldnames or []):raise ValueError('Required DOE CSV columns: '+','.join(sorted(required)))
        for row in rows:
            stamp=datetime.fromisoformat(row['datetime'].replace('Z','+00:00'))
            if stamp.tzinfo is None:raise ValueError('datetime must include +08:00 or Z; no guessed timezone')
            raw=row['ipu'].strip();value=float(raw) if raw and raw.lower() not in ('null','na','n/a','-1') else None
            records.append({'id':row['station_id'],'name':row['name'],'state':row['state'],'lng':float(row['longitude']),'lat':float(row['latitude']),'ipu':value,'pollutant':row.get('pollutant') or None,'updated_at':stamp.astimezone(timezone.utc).isoformat().replace('+00:00','Z')})
    save_ipu(records,'User-supplied historical DOE export');return len(records)

def import_firms(path,start,end):
    countries={name:read(DATA/'boundaries'/file) for name,file in [('Malaysia','malaysia.geojson'),('Indonesia','indonesia.geojson')]};states=read(DATA/'boundaries/states.geojson');features=[]
    with path.open(encoding='utf-8-sig',newline='') as stream:
        rows=csv.DictReader(stream)
        if not {'latitude','longitude','acq_date','acq_time','confidence','frp'}.issubset(rows.fieldnames or []):raise ValueError('Unexpected NASA CSV schema')
        for row in rows:
            lng,lat=float(row['longitude']),float(row['latitude'])
            if not (95<=lng<=120 and -5<=lat<=8):continue
            stamp=datetime.strptime(row['acq_date']+row['acq_time'].zfill(4),'%Y-%m-%d%H%M').replace(tzinfo=timezone.utc)
            conf=row['confidence'].lower();conf={'l':'low','n':'nominal','h':'high'}.get(conf,conf)
            if conf not in ('low','nominal','high'):raise ValueError('Only VIIRS confidence supported; use a VIIRS archive export')
            country=next((n for n,fc in countries.items() if locate([lng,lat],fc['features'])),'Other');parent=locate([lng,lat],states['features']) if country=='Malaysia' else None
            region=('Sumatra' if lng<106 else 'Kalimantan' if lng>=108 and lat<4.3 else 'Other Indonesia') if country=='Indonesia' else country
            sensor='VIIRS '+row.get('satellite','unspecified');time=stamp.isoformat().replace('+00:00','Z')
            features.append({'type':'Feature','geometry':{'type':'Point','coordinates':[lng,lat]},'properties':{'id':f'{sensor}:{lng}:{lat}:{time}','time':time,'confidence':conf,'frp':float(row['frp']),'country':country,'region':region,'state':parent['properties']['name'] if parent else None,'sensor':sensor}})
    save_hotspots(features,start,end,'User-supplied NASA FIRMS VIIRS archive CSV');return len(features)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('kind',choices=['ipu','firms']);parser.add_argument('csv',type=Path);parser.add_argument('--coverage-start');parser.add_argument('--coverage-end');args=parser.parse_args()
    if args.kind=='firms' and not (args.coverage_start and args.coverage_end):parser.error('FIRMS import requires exact ISO coverage-start/end, including timezone offsets')
    count=import_ipu(args.csv) if args.kind=='ipu' else import_firms(args.csv,args.coverage_start,args.coverage_end)
    rebuild_index();print('Actual records imported:',count)
