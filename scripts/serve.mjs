import {findPython,LocalCollector} from './local-collector.mjs';
import {createStaticServer} from './static-server.mjs';
const root=process.cwd(),port=Number(process.env.PORT||4177);
const collector=new LocalCollector({root,python:findPython(root)});
const server=createStaticServer({root,collector});
server.listen(port,'127.0.0.1',()=>{
  console.log(`Local: http://127.0.0.1:${port}`);
  console.log(collector.status().enabled?'Automatic collection: now, then every 15 minutes while this server is open.':'Collection disabled: install Python/GIS packages with SETUP-LOCAL.bat.');
  collector.collect();
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Port ${port} already in use; no second collector started.`:error.message);collector.stop();process.exitCode=1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{collector.stop();server.close(()=>process.exit());});
