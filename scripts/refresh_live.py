"""One ingestion entry point for Actions and the LOCAL preview collector.

The deployed website is still static. No credential or proxy is added to it.
"""
import os
import sys
from utils import DATA, now, read, write, status
import fetch_ipu
import fetch_firms
import archive_data

def main():
    previous=read(DATA/'pipeline.json',{})
    pipeline={'version':1,'event':os.environ.get('GITHUB_EVENT_NAME','local'),'run_url':None,
              'started_at':now(),'finished_at':None,'status':'running','steps':{},
              'last_scheduled_success':previous.get('last_scheduled_success')}
    repo=os.environ.get('GITHUB_REPOSITORY');run=os.environ.get('GITHUB_RUN_ID')
    if repo and run:pipeline['run_url']=f'https://github.com/{repo}/actions/runs/{run}'
    def save():write(DATA/'pipeline.json',pipeline)
    def step(name,operation):
        try:ok=operation() is not False
        except Exception as exc:
            ok=False;print(f'{name}: {type(exc).__name__}; retained good data',flush=True)
        pipeline['steps'][name]='ok' if ok else 'failed';save();return ok
    save()
    step('archive_before',archive_data.capture)
    step('ipu',fetch_ipu.main)
    print('IPU stage completed; browser can already read the atomic snapshot',flush=True)
    step('hotspots',fetch_firms.main)
    step('archive_after',archive_data.capture)
    def context():
        try:import attribute_hotspots
        except ImportError:
            status('land_context',False,message='GIS dependencies unavailable; run SETUP-LOCAL.bat. Raw detections remain available.')
            return False
        return attribute_hotspots.main(archives=True)
    step('land_context',context)
    def validate():
        import validate_data
        validate_data.main()
    step('validate',validate)
    ok=all(v=='ok' for v in pipeline['steps'].values())
    pipeline.update(status='ok' if ok else 'partial_failure',finished_at=now());save()
    if ok and pipeline['event']=='schedule':
        pipeline['last_scheduled_success']=pipeline['finished_at'];save()
    print('Collection complete: '+pipeline['status'],flush=True)
    return ok

if __name__=='__main__':raise SystemExit(0 if main() else 1)
