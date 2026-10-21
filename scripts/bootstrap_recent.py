"""One-time import of the public DOE 24h table, all official state IDs."""
import argparse
import json
import time
from datetime import datetime,timezone
from urllib.parse import urlencode
from utils import fetch,finite,DATA,write
from archive_data import MYT,save_ipu,rebuild_index

def normalize_table(raw,state):
    values=raw.get('api_table_hourly')
    if not isinstance(values,list):raise ValueError('Unexpected DOE hourly-table schema')
    records=[]
    for a in values:
        if not isinstance(a.get('DATETIME'),str):continue
        local=datetime.fromisoformat(a['DATETIME']).replace(tzinfo=MYT)
        value=a.get('API');value=value if finite(value) and value>=0 else None
        records.append({'id':str(a['STATION_ID']),'name':a['STATION_LOCATION'],'state':state,'lng':a['LONGITUDE'],'lat':a['LATITUDE'],'ipu':value,'pollutant':None,'updated_at':local.astimezone(timezone.utc).isoformat().replace('+00:00','Z')})
    return records

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--date',default=datetime.now(MYT).date().isoformat());args=parser.parse_args()
    base='https://eqms.doe.gov.my/api3/publicportalapims/'
    states=json.loads(fetch(base+'statelist'));total=0
    for state in states:
        query=urlencode({'stateid':state['STATE_ID'],'datetime':args.date+'T23:00:00'})
        raw=json.loads(fetch(base+'apitablehourly?'+query));records=normalize_table(raw,state['STATE_NAME'])
        save_ipu(records,'DOE public hourly table; original pollutant not supplied')
        total+=len(records);print(state['STATE_NAME'],len(records));time.sleep(.25)
    rebuild_index();print('Imported real DOE hourly records:',total)
    if not total:raise SystemExit('No archived records returned for requested date; nothing fabricated')

if __name__=='__main__':main()
