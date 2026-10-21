import {numeric,usableStations} from './core.js';
import {CONFIG} from './config.js';
export function stationSummary(stations=[],referenceMs=Date.now()){
  const dated=stations.filter(s=>numeric(s.ipu)&&s.ipu>=0&&Number.isFinite(Date.parse(s.updated_at))&&Date.parse(s.updated_at)<=referenceMs+3600000);
  const fresh=usableStations(stations,referenceMs);
  const latest=dated.length?Math.max(...dated.map(s=>Date.parse(s.updated_at))):null;
  const ageHours=latest===null?null:(referenceMs-latest)/3600000;
  return {fresh:fresh.length,stored:dated.length,expired:dated.length-fresh.length,latest:latest===null?null:new Date(latest).toISOString(),ageHours,
    state:!dated.length?'missing':!fresh.length?'expired':ageHours>CONFIG.staleHours.ipu?'delayed':'fresh'};
}
export function pipelineEventLabel(event){return event==='schedule'?'scheduled':event==='workflow_dispatch'?'manual':event==='local'?'local':event==='push'?'codePush':'notVerified';}
