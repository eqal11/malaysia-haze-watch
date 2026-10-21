import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir,mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {stationSummary,pipelineEventLabel} from '../js/freshness.js';
import {LocalCollector} from '../scripts/local-collector.mjs';
import {createStaticServer} from '../scripts/static-server.mjs';
let count=0;async function test(name,fn){await fn();count++;console.log('✓ '+name);}
const now=Date.parse('2026-10-22T00:00:00Z'),station=(hours,ipu=80)=>({ipu,updated_at:new Date(now-hours*3600000).toISOString()});
await test('Expired observations are stale, not zero station measurements',()=>{
  const h=stationSummary([station(8),station(9)],now);assert.equal(h.state,'expired');assert.equal(h.stored,2);assert.equal(h.fresh,0);assert.equal(h.latest,'2026-10-21T16:00:00.000Z');
  assert.equal(stationSummary([],now).state,'missing');assert.equal(stationSummary([station(0,0)],now).fresh,1);
});
await test('Freshness uses observation time, and future/null values do not mask staleness',()=>{
  assert.equal(stationSummary([station(1)],now).state,'fresh');assert.equal(stationSummary([station(4)],now).state,'delayed');
  assert.equal(stationSummary([station(8),station(-8),station(0,null)],now).state,'expired');
  assert.equal(pipelineEventLabel('workflow_dispatch'),'manual');assert.equal(pipelineEventLabel('schedule'),'scheduled');assert.equal(pipelineEventLabel('bundled'),'notVerified');
});
await test('Collector repeats automatically without user action and stops cleanly',async()=>{
  let runs=0;let wake;const repeated=new Promise(resolve=>wake=resolve);
  const collector=new LocalCollector({intervalMs:15,run:async()=>{runs++;if(runs===2)wake();return true;}});
  await collector.collect();await Promise.race([repeated,new Promise((_,reject)=>setTimeout(()=>reject(Error('No automatic repeat')),1000))]);collector.stop();
  assert.ok(runs>=2);assert.ok(collector.status().last_success);assert.equal(collector.status().next_attempt,null);
});
await test('Collector excludes overlapping runs and does not mark failed attempts successful',async()=>{
  let release;let runs=0;const held=new Promise(resolve=>release=resolve);
  const collector=new LocalCollector({run:async()=>{runs++;await held;return false;}});
  const first=collector.collect();await collector.collect();assert.equal(runs,1);release();await first;collector.stop();
  assert.equal(collector.status().last_success,null);assert.ok(collector.status().error);
});
await test('Local refresh updates served files; cross-origin requests cannot start collection',async()=>{
  // Disposable transport fixture, not an observed IPU record.
  const scratch=path.resolve('work/live-tests');await mkdir(scratch,{recursive:true});const root=await mkdtemp(path.join(scratch,'case-'));
  let runs=0;let server;const collector=new LocalCollector({root,run:async()=>{runs++;await writeFile(path.join(root,'sample.json'),JSON.stringify({testRevision:runs}));return true;}});
  try{
    await writeFile(path.join(root,'index.html'),'<p>Transport test only</p>');await writeFile(path.join(root,'.env'),'test-only');
    server=createStaticServer({root,collector});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base='http://127.0.0.1:'+server.address().port;
    assert.equal((await fetch(base+'/__local/status')).status,200);
    assert.equal((await fetch(base+'/__local/refresh',{method:'POST',headers:{Origin:'https://external.invalid'}})).status,403);assert.equal(runs,0);
    assert.equal((await fetch(base+'/.env')).status,404);
    assert.equal((await fetch(base+'/__local/refresh',{method:'POST',headers:{Origin:base}})).status,202);
    for(let i=0;i<40&&collector.status().running;i++)await new Promise(resolve=>setTimeout(resolve,5));
    assert.deepEqual(await (await fetch(base+'/sample.json')).json(),{testRevision:1});
    assert.equal((await fetch(base+'/__local/refresh',{method:'POST',headers:{Origin:base}})).status,429);
  }finally{
    collector.stop();if(server)await new Promise(resolve=>server.close(resolve));
    assert.ok(root.startsWith(scratch+path.sep));await rm(root,{recursive:true,force:true});
  }
});
console.log(`${count} live collection test groups passed`);
