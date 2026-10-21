import {spawn,spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';

export function findPython(root){
  const candidates=process.env.MHW_PYTHON?[[process.env.MHW_PYTHON,[]]]:[
    [path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python'),[]],
    ...(process.platform==='win32'?[['py',['-3']]]:[]),['python3',[]],['python',[]]];
  for(const [command,prefix] of candidates){
    if(path.isAbsolute(command)&&!existsSync(command))continue;
    const result=spawnSync(command,[...prefix,'--version'],{timeout:4000,windowsHide:true,encoding:'utf8'});
    if(result.status===0&&/^Python 3\./.test((result.stdout||result.stderr||'').trim()))return {command,prefix};
  }
  return null;
}
export class LocalCollector{
  constructor({root,python,intervalMs=15*60*1000,run}={}){
    this.root=root;this.python=python;this.intervalMs=intervalMs;this.timer=null;this.stopped=false;this.child=null;
    this.run=run||(()=>this.execute());
    this.state={enabled:!!(python||run),running:false,interval_ms:intervalMs,last_attempt:null,last_finished:null,last_success:null,next_attempt:null,error:null};
    if(!this.state.enabled)this.state.error='Python unavailable. Run SETUP-LOCAL.bat.';
  }
  status(){return {...this.state};}
  execute(){return new Promise(resolve=>{
    const env={...process.env,PYTHONUNBUFFERED:'1'};
    // Protected system SSL key-log paths can prevent Python TLS startup.
    // Removing this child-only diagnostic setting does not disable TLS verification.
    delete env.SSLKEYLOGFILE;
    this.child=spawn(this.python.command,[...this.python.prefix,path.join(this.root,'scripts','refresh_live.py')],{cwd:this.root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    const emit=chunk=>process.stdout.write(String(chunk).slice(0,4000));
    this.child.stdout.on('data',emit);this.child.stderr.on('data',emit);
    const timeout=setTimeout(()=>this.child?.kill(),12*60*1000);
    const finish=ok=>{clearTimeout(timeout);this.child=null;resolve(ok);};
    this.child.once('error',()=>finish(false));this.child.once('exit',code=>finish(code===0));
  });}
  async collect(){
    if(this.stopped||!this.state.enabled||this.state.running)return false;
    clearTimeout(this.timer);this.timer=null;
    this.state={...this.state,running:true,last_attempt:new Date().toISOString(),next_attempt:null,error:null};
    let ok=false;
    try{ok=(await this.run())===true;}catch{ok=false;}
    const finished=new Date().toISOString();
    this.state={...this.state,running:false,last_finished:finished,last_success:ok?finished:this.state.last_success,
      error:ok?null:'One or more sources failed. Read per-source status; last good files retained.',
      next_attempt:this.stopped?null:new Date(Date.now()+this.intervalMs).toISOString()};
    if(!this.stopped)this.timer=setTimeout(()=>this.collect(),this.intervalMs);
    return ok;
  }
  stop(){this.stopped=true;clearTimeout(this.timer);this.child?.kill();this.state.next_attempt=null;}
}
