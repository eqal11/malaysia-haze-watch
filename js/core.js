import {CONFIG} from './config.js';
export const numeric = v => typeof v==='number' && Number.isFinite(v);
export function category(v){return numeric(v)&&v>=0 ? CONFIG.categories.find(c=>v<=c.max) : null;}
export function distance(a,b){const rad=Math.PI/180, dy=(b.lat-a.lat)*rad,dx=(b.lng-a.lng)*rad;const h=Math.sin(dy/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dx/2)**2;return 12742*Math.asin(Math.min(1,Math.sqrt(h)));}
export function stateKey(s){const key=String(s||'').toLowerCase().replace(/wilayah persekutuan|w\.?\s*p\.?/g,'').replace(/[^a-z]/g,'');return ({penang:'pulaupinang',malacca:'melaka'})[key]||key;}
export function stateMatches(a,b){return !b||stateKey(a)===stateKey(b);}
export function validStation(s){return s && typeof s.id==='string' && typeof s.name==='string' && typeof s.state==='string' && numeric(s.lng)&&numeric(s.lat)&&s.lng>=98&&s.lng<=120&&s.lat>=0&&s.lat<=8 && (s.ipu===null || numeric(s.ipu)&&s.ipu>=0&&s.ipu<=1000) && Number.isFinite(Date.parse(s.updated_at));}
export function validateIPU(d){if(d?.version!==1||!Array.isArray(d.stations)||!d.stations.length||!d.stations.every(validStation)||new Set(d.stations.map(s=>s.id)).size!==d.stations.length)throw Error('Invalid station schema');return d;}
export function windUV(speed,from){const r=from*Math.PI/180;return {u:-speed*Math.sin(r),v:-speed*Math.cos(r)};}
export function meanWind(points){const ps=points.filter(p=>numeric(p.u)&&numeric(p.v));if(!ps.length)return null;const u=ps.reduce((s,p)=>s+p.u,0)/ps.length,v=ps.reduce((s,p)=>s+p.v,0)/ps.length;return {u,v,speed:ps.reduce((s,p)=>s+Math.hypot(p.u,p.v),0)/ps.length,from:(Math.atan2(-u,-v)*180/Math.PI+360)%360};}
export function risk(p){return p.confidence===CONFIG.risk.highConfidence||p.frp>=CONFIG.risk.highFrp?'high':p.confidence===CONFIG.risk.mediumConfidence||p.frp>=CONFIG.risk.mediumFrp?'medium':'low';}
export function usableStations(stations,now=Date.now()){return stations.filter(s=>numeric(s.ipu)&&s.ipu>=0&&Date.parse(s.updated_at)<=now+3600000&&now-Date.parse(s.updated_at)<=CONFIG.stationMaxAgeHours*3600000);}
