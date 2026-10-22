import {stateMatches} from './core.js';
export const FIRE_CLASSES=['forest','peat','vegetation','cropland','built_up','other','unknown'];
export const COVER_CLASS={'Tree cover':'forest',Mangroves:'forest',Shrubland:'vegetation',Grassland:'vegetation','Herbaceous wetland':'vegetation','Moss and lichen':'vegetation',Cropland:'cropland','Built-up':'built_up','Bare / sparse vegetation':'other','Permanent water bodies':'other','Snow and ice':'other'};
export function fireClass(p){return p.on_peat===true?'peat':COVER_CLASS[p.landcover]||'unknown';}
export function dayMYT(epoch){return new Date(epoch*1000+28800000).toISOString().slice(0,10);}
export function validCompact(r,doc){return Array.isArray(r)&&r.length===7&&Number.isFinite(r[0])&&r[0]>=95&&r[0]<=120&&Number.isFinite(r[1])&&r[1]>=-5&&r[1]<=8&&Number.isInteger(r[2])&&Number.isFinite(r[3])&&r[3]>=0&&Number.isInteger(r[4])&&r[4]>=0&&r[4]<7&&(r[5]===null||typeof r[5]==='boolean')&&Number.isInteger(r[6])&&!!doc.places[r[6]];}
export function validateEvents(doc){
  if(doc?.type!=='FeatureCollection'||doc.analysis_version!==1||!Array.isArray(doc.places)||!Array.isArray(doc.features)||!Array.isArray(doc.unclustered)||!Array.isArray(doc.daily)||!Array.isArray(doc.coverage)||!Number.isFinite(Date.parse(doc.updated_at))||!doc.analysis_id)throw Error('Invalid fire analysis');
  if(!doc.places.every(p=>(p.country===null||typeof p.country==='string')&&(p.admin1===null||typeof p.admin1==='string')))throw Error('Invalid places');
  const ids=new Set();for(const f of doc.features){if(!f.properties?.id||ids.has(f.properties.id)||f.geometry?.type!=='Point'||!Array.isArray(f.properties.detections)||!f.properties.detections.length||!f.geometry.coordinates.every(Number.isFinite)||Math.abs(f.geometry.coordinates[0])>180||Math.abs(f.geometry.coordinates[1])>90)throw Error('Invalid event');ids.add(f.properties.id);if(!f.properties.detections.every(r=>validCompact(r,doc)))throw Error('Invalid member');}
  if(!doc.unclustered.every(r=>validCompact(r,doc)))throw Error('Invalid noise');
  for(const d of doc.daily)if(!/^\d{4}-\d{2}-\d{2}$/.test(d.date)||!Number.isFinite(d.coverage_start)||!Number.isFinite(d.coverage_end)||!Array.isArray(d.counts)||!d.counts.every(r=>r.length===4&&FIRE_CLASSES.includes(r[2])&&Number.isInteger(r[3])&&r[3]>=0))throw Error('Invalid trend');
  return doc;
}
export function classMatches(c,selected){return !selected||selected==='other'?(!selected||!['forest','peat'].includes(c)):c===selected;}
export function rowMatches(row,doc,filter){const place=doc.places[row[6]],c=FIRE_CLASSES[row[4]];return (!filter.country||place.country===filter.country)&&(!filter.province||place.admin1===filter.province)&&(!filter.state||place.country==='Malaysia'&&stateMatches(place.admin1,filter.state))&&classMatches(c,filter.class);}
export function aggregateRows(rows,doc){
  if(!rows.length)return null;const counts=FIRE_CLASSES.map(c=>rows.filter(r=>FIRE_CLASSES[r[4]]===c).length),known=rows.filter(r=>r[5]!==null),cells=new Set(rows.map(r=>`${Math.floor(r[0]*Math.PI/180*6371008.8/375)}:${Math.floor(r[1]*Math.PI/180*6371008.8/375)}`));
  return {count:rows.length,total:rows.reduce((s,r)=>s+r[3],0),max:Math.max(...rows.map(r=>r[3])),first:Math.min(...rows.map(r=>r[2])),last:Math.max(...rows.map(r=>r[2])),persistence:new Set(rows.map(r=>dayMYT(r[2]))).size,class:FIRE_CLASSES[counts.indexOf(Math.max(...counts))],peatShare:known.length?known.filter(r=>r[5]).length/known.length:null,peatKnown:known.length,area:cells.size*.375*.375,center:[rows.reduce((s,r)=>s+r[1],0)/rows.length,rows.reduce((s,r)=>s+r[0],0)/rows.length],provinces:[...new Set(rows.map(r=>doc.places[r[6]].admin1))],countries:[...new Set(rows.map(r=>doc.places[r[6]].country))]};
}
export function fireView(doc,filter,referenceMs){
  const end=Math.min(Math.floor(referenceMs/1000),Math.floor(Date.parse(doc.updated_at)/1000)),start=end-filter.hours*3600,events=[],points=[];
  const select=rows=>rows.filter(r=>r[2]>=start&&r[2]<=end&&rowMatches(r,doc,filter));
  for(const f of doc.features){const rows=select(f.properties.detections),s=aggregateRows(rows,doc);if(!s||s.persistence<filter.persistence)continue;events.push({...s,id:f.properties.id,rows});points.push(...rows);}
  const noise=filter.persistence<=1?select(doc.unclustered):[];points.push(...noise);
  // Missing days are not zero detections; coverage also remains visible.
  const coverage=doc.coverage.filter(d=>d.end>=start&&d.start<=end);let cursor=start;
  for(const c of [...coverage].sort((a,b)=>a.start-b.start)){if(c.start>cursor+1)break;cursor=Math.max(cursor,c.end);}
  return {events,points,noise,start,end,complete:cursor>=end,counts:FIRE_CLASSES.map(c=>points.filter(r=>FIRE_CLASSES[r[4]]===c).length)};
}
export function dailyTrend(doc,filter,referenceMs,days=7){
  const end=Math.min(Math.floor(referenceMs/1000),Math.floor(Date.parse(doc.updated_at)/1000)),last=dayMYT(end),anchor=Date.parse(last+'T12:00:00+08:00');
  return Array.from({length:days},(_,i)=>{const date=new Date(anchor-(days-1-i)*86400000+28800000).toISOString().slice(0,10),d=doc.daily.find(r=>r.date===date),start=Date.parse(date+'T00:00:00+08:00')/1000,finish=Math.min(start+86400,end);const available=!!d&&d.coverage_start<=start&&d.coverage_end>=finish;
    // Daily totals cannot be safely split to an earlier hour; no future-day leakage.
    const safe=d&&d.coverage_end<=end;const counts=safe?d.counts.filter(([country,province,c])=>(!filter.country||country===filter.country)&&(!filter.province||province===filter.province)&&(!filter.state||country==='Malaysia'&&stateMatches(province,filter.state))&&classMatches(c,filter.class)):null;
    return {date,count:counts?counts.reduce((s,r)=>s+r[3],0):null,complete:available&&safe};});
}
export function sortEvents(events,key='total',direction=-1){return [...events].sort((a,b)=>direction*(key==='province'?(a.provinces.join(',')||'').localeCompare(b.provinces.join(',')||''):key==='class'?a.class.localeCompare(b.class):a[key]-b[key])||a.id.localeCompare(b.id));}
