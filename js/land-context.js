import {t,esc} from './i18n.js';
const coverKeys={'Tree cover':'coverTree','Shrubland':'coverShrub','Grassland':'coverGrass','Cropland':'coverCrop','Built-up':'coverBuilt','Bare / sparse vegetation':'coverBare','Snow and ice':'coverSnow','Permanent water bodies':'coverWater','Herbaceous wetland':'coverWetland','Mangroves':'coverMangrove','Moss and lichen':'coverMoss'};
export function peatGroup(value){return value===true?'peat':value===false?'nonPeat':'noContext';}
export function contextPopup(p){return `<p>${t('province')}: ${esc(p.admin1||t('noContext'))}<br>${t('landcover')}: ${esc(coverKeys[p.landcover]?t(coverKeys[p.landcover]):t('noContext'))}<br>${t('onPeat')}: <b>${t(p.on_peat===true?'yes':p.on_peat===false?'no':'noContext')}</b></p><p class="popup-advice">${t('contextDisclaimer')}</p><p class="popup-meta">${t('contextResolution')}</p>`;}
export function summarizeContext(features){
  const rows=new Map(),totals={peat:0,nonPeat:0,noContext:0};
  for(const f of features||[]){const p=f.properties,key=JSON.stringify([p.country||null,p.admin1||null]),group=peatGroup(p.on_peat);if(!rows.has(key))rows.set(key,{country:p.country||null,admin1:p.admin1||null,peat:0,nonPeat:0,noContext:0});rows.get(key)[group]++;totals[group]++;}
  return {totals,rows:[...rows.values()].sort((a,b)=>(b.peat+b.nonPeat+b.noContext)-(a.peat+a.nonPeat+a.noContext)||(a.admin1||'').localeCompare(b.admin1||''))};
}
export function chooseHotspotData(raw,attributed){
  if(!attributed?.land_context?.version)return {...raw,context_error:'missing'};
  if(raw){
    const old=attributed.land_context.source_updated_at!==raw.updated_at||attributed.features.length!==raw.features.length;
    const keyed=new Map(attributed.features.map(f=>[f.properties.id,f]));
    const differs=old||raw.features.some(f=>{const a=keyed.get(f.properties.id);return !a||JSON.stringify(a.geometry)!==JSON.stringify(f.geometry)||['time','frp','confidence','sensor'].some(k=>a.properties[k]!==f.properties[k]);});
    if(differs)return {...raw,context_error:'outdated'};
  }
  return attributed;
}
