import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
export function createStaticServer({root,collector}){
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.geojson':'application/geo+json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.tif':'image/tiff','.md':'text/plain; charset=utf-8'};
  return http.createServer(async(req,res)=>{
    const json=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    try{
      if(!['127.0.0.1','localhost','[::1]'].includes(new URL('http://'+req.headers.host).hostname))return json(403,{error:'Loopback host required'});
      const url=new URL(req.url,'http://localhost');
      if(url.pathname==='/__local/status'&&req.method==='GET')return json(200,collector.status());
      if(url.pathname==='/__local/refresh'){
        // Only same-origin local controls can request collection. No arbitrary commands/URLs.
        const host=req.headers.host||'';
        if(req.method!=='POST'||req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&req.headers.origin!==`http://${host}`)return json(403,{error:'Local same-origin POST required'});
        if(!collector.status().enabled)return json(503,collector.status());
        if(!collector.status().running&&Date.now()-Date.parse(collector.status().last_attempt||0)<60000)return json(429,{error:'Collection cooldown: 60 seconds'});
        collector.collect();return json(202,collector.status());
      }
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
      let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
      if(file!==root&&!file.startsWith(root+path.sep))throw Error();
      if(path.relative(root,file).split(path.sep).some(p=>p.startsWith('.')||['work','node_modules'].includes(p)))throw Error();
      if((await stat(file)).isDirectory())file=path.join(file,'index.html');
      const data=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:data);
    }catch{res.writeHead(404);res.end('Not found');}
  });
}
