import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {peatGroup,summarizeContext,chooseHotspotData,contextPopup} from '../js/land-context.js';
import {hotspotFilter} from '../js/layers.js';
import {validateStatic,staticData} from '../js/data.js';
import {CONFIG} from '../js/config.js';
import {unpackHotspots} from '../js/history.js';
let count=0;function test(name,fn){fn();count++;console.log('✓ '+name);}
const now=Date.parse('2026-10-21T12:30:00Z');
const feature=(id,on_peat,country='Indonesia',admin1='Riau')=>({type:'Feature',geometry:{type:'Point',coordinates:[102.3,.5]},properties:{id,time:'2026-10-21T12:00:00Z',frp:12,confidence:'nominal',sensor:'TEST',region:'Sumatra',state:null,on_peat,landcover:null,country,admin1}});
test('Unknown is not counted as non-peat',()=>{assert.equal(peatGroup(null),'noContext');assert.equal(peatGroup(undefined),'noContext');assert.equal(peatGroup(false),'nonPeat');const s=summarizeContext([feature('a',true),feature('b',false),feature('c',null),feature('d',true,'Malaysia','Sarawak')]);assert.deepEqual(s.totals,{peat:2,nonPeat:1,noContext:1});assert.equal(s.rows.length,2);assert.equal(s.rows[0].admin1,'Riau');});
test('Peat-only toggle includes strictly true and respects region/time',()=>{const f=[feature('a',true),feature('b',false),feature('c',null)];assert.equal(hotspotFilter(f,{hours:6,peatOnly:true},now).length,1);assert.equal(hotspotFilter(f,{hours:6,peatOnly:false},now).length,3);assert.equal(hotspotFilter(f,{hours:6,peatOnly:true,region:'Malaysia'},now).length,0);});
const raw={type:'FeatureCollection',updated_at:'2026-10-21T12:00:00Z',features:[feature('a',true)]};
const attributed={...raw,land_context:{version:'real-source-version',source_updated_at:raw.updated_at}};
test('Prefer matching attributed data, fall back on missing or outdated context',()=>{assert.equal(chooseHotspotData(raw,attributed),attributed);assert.equal(chooseHotspotData(raw,null).context_error,'missing');assert.equal(chooseHotspotData({...raw,updated_at:'later'},attributed).context_error,'outdated');assert.equal(chooseHotspotData({...raw,features:[feature('different',true)]},attributed).context_error,'outdated');});
test('Context schema validates booleans and nullable fields',()=>{validateStatic('hotspots',attributed);assert.throws(()=>validateStatic('hotspots',{...attributed,features:[feature('x','false')]}));validateStatic('hotspots',{...attributed,features:[feature('x',null,null,null)]});});
test('BM popup gives required warning, null and false are distinct, escapes labels',()=>{assert.ok(contextPopup(feature('a',null).properties).includes('Atas gambut: <b>Tiada data'));assert.ok(contextPopup(feature('a',false).properties).includes('Atas gambut: <b>Tidak'));assert.ok(contextPopup(feature('a',true).properties).includes('Konteks tanah sahaja, bukan bukti punca kebakaran'));assert.ok(!contextPopup(feature('a',true,'Indonesia','<script>').properties).includes('<script>'));assert.ok(!contextPopup(feature('a',true).properties).includes('—'));});
test('Historical compact rows preserve context and old rows remain unknown',()=>{const row=[102.3,.5,Math.floor(now/1000),'nominal',12,'Indonesia','Sumatra',null,'TEST'];const d={format:'daily-firms-v1',readings:[row.concat([false,'Tree cover','Riau'])],coverage_start:0,coverage_end:1};assert.equal(unpackHotspots(d).features[0].properties.on_peat,false);assert.equal(unpackHotspots({...d,readings:[row]}).features[0].properties.on_peat,null);});
test('Real attributed file passes schema and stays below 5 MB',()=>{const bytes=readFileSync(new URL('../data/hotspots_attributed.geojson',import.meta.url));assert.ok(bytes.length<5_000_000);const doc=validateStatic('hotspots',JSON.parse(bytes));assert.ok(doc.features.length>0);for(const f of doc.features)assert.ok('admin1' in f.properties);});
{
  const originalFetch=globalThis.fetch;
  try{
    for(const failure of ['missing','malformed']){
      globalThis.fetch=async url=>url===CONFIG.endpoints.hotspotsAttributed?(failure==='missing'?{ok:false,status:404}:{ok:true,json:async()=>({invalid:true})}):{ok:true,json:async()=>JSON.parse(readFileSync(new URL('../'+url,import.meta.url),'utf8'))};
      const loaded=await staticData();assert.ok(!loaded.hotspots.error);assert.equal(loaded.hotspots.data.context_error,'missing');assert.ok(loaded.hotspots.data.features.length>0);
    }
    console.log('✓ Static loader falls back to real raw file on missing or malformed attributed response');count++;
  }finally{globalThis.fetch=originalFetch;}
}
console.log(`${count} land context test groups passed`);
