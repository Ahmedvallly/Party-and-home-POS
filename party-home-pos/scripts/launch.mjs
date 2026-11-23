import {spawn} from 'node:child_process';
import {mkdir,open} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),url='http://localhost:3000';
async function running(){try{const r=await fetch(url+'/api/auth/status',{signal:AbortSignal.timeout(1000)});return r.ok&&(await r.json()).local===true;}catch{return false;}}
if(!await running()){
await mkdir(new URL('../data/',import.meta.url),{recursive:true});const log=await open(new URL('../data/server.log',import.meta.url),'a');
const child=spawn(process.execPath,['server/local.mjs'],{cwd:root,detached:true,windowsHide:true,stdio:['ignore',log.fd,log.fd]});child.unref();await log.close();
for(let i=0;i<30&&!await running();i++)await new Promise(r=>setTimeout(r,200));
if(!await running())throw new Error('The POS could not start. Check data/server.log or whether port 3000 is already in use.');
}
console.log('Party & Home POS: '+url);
if(!process.argv.includes('--no-open')){const child=spawn('powershell.exe',['-NoProfile','-Command',"Start-Process 'http://localhost:3000'"],{windowsHide:true,stdio:'ignore'});child.unref();}
