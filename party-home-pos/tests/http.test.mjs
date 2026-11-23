import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
test('real HTTP owner/staff sessions, uploads, documents and persistence',{timeout:30000},async()=>{
 const dataDir=resolve('.sites-runtime','http-test-'+Date.now());await mkdir(dataDir,{recursive:true});
 const staffName='Cashier !@ '+ 'x'.repeat(210),staffPassword='p'.repeat(250)+'!';
 const port=3100+Math.floor(Math.random()*1000),origin=`http://127.0.0.1:${port}`;
 let server,log='';
 async function start(){server=spawn(process.execPath,['server/local.mjs'],{cwd:resolve('.'),env:{...process.env,PORT:String(port),POS_DATA_DIR:dataDir},windowsHide:true,stdio:'pipe'});server.stderr.on('data',b=>log+=b);server.stdout.on('data',b=>log+=b);for(let i=0;i<50;i++){try{const r=await fetch(origin+'/api/auth/status',{signal:AbortSignal.timeout(500)});if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error(log);}
 async function stop(){if(!server||server.exitCode!==null)return;const closed=new Promise(r=>server.once('exit',r));server.kill();await closed;}
 let cookie='';
 async function call(path,payload,extra={}){const r=await fetch(origin+path,{method:payload===undefined?'GET':'POST',headers:{...payload!==undefined?{'Content-Type':'application/json'}:{},Cookie:cookie,...extra},body:payload===undefined?undefined:JSON.stringify(payload),signal:AbortSignal.timeout(5000)});if(r.headers.has('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:r.status,data};}
 try{
 await start();assert.equal((await call('/api/pos')).status,401);assert.equal((await call('/api/auth/setup',{username:'',password:'1'})).status,400);
 assert.equal((await call('/api/auth/setup',{username:'a',password:'1'})).status,200);const ownerCookie=cookie;
 assert.equal((await call('/api/pos',{action:'setup',name:'Test Shop',address:'Johannesburg',contact:'Test contact'})).status,200);
 assert.equal((await call('/api/auth/setup',{username:'otherowner',password:'Evil-testing-123!'})).status,400);
 const p={action:'product',id:'test-product',sku:'P001',name:'Party packs',category:'Party',unit:'Pack',image:'',stock:10,low:2,cost:1234,p1:2500,p2:2400,p3:2300,p4:2200,p5:2100};
 assert.equal((await call('/api/pos',{action:'departments',names:['Party','Home']})).status,200);
 assert.equal((await call('/api/pos',p)).status,200);
 const imageForm=new FormData();imageForm.append('file',new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')],'tiny.png',{type:'image/png'}));
 const imageResponse=await fetch(origin+'/api/images',{method:'POST',headers:{Cookie:cookie},body:imageForm});assert.equal(imageResponse.status,200);const image=await imageResponse.json();assert.equal((await fetch(origin+image.url,{headers:{Cookie:cookie}})).status,200);
 const q={action:'document',id:'quote-http',kind:'quote',level:'p2',customer:'Alice',payment:'Quotation',lines:[{productId:p.id,qty:3,price:2400}]};
 assert.equal((await call('/api/pos',q)).status,200);assert.equal((await call('/api/pos')).data.products[0].stock,10);
 const invoice={action:'document',id:'invoice-http',kind:'invoice',quoteId:q.id,payment:'EFT'};assert.equal((await call('/api/pos',invoice)).status,200);assert.equal((await call('/api/pos',invoice)).status,200);assert.equal((await call('/api/pos')).data.products[0].stock,7);
 assert.equal((await call('/api/pos',{action:'member',username:staffName,role:'staff',password:staffPassword})).status,200);
 assert.equal((await call('/api/pos',{action:'stock',id:p.id,delta:1,reason:'Malicious request'},{Origin:'https://attacker.example'})).status,400);
 await call('/api/auth/logout',{});assert.equal((await call('/api/pos')).status,401);
 assert.equal((await call('/api/auth/login',{username:staffName,password:staffPassword.slice(0,-1)+'?'})).status,400);
 assert.equal((await call('/api/auth/login',{username:staffName.toUpperCase(),password:staffPassword})).status,200);
 const staff=await call('/api/pos');assert.equal(staff.data.role,'staff');assert.equal(Object.hasOwn(staff.data.products[0],'cost'),false);
 assert.equal((await call('/api/pos',{action:'member',username:staffName,role:'supervisor'})).status,403);
 assert.equal((await call('/')).status,200);assert.equal((await call('/server/schema.sql')).status,404);
 assert.equal((await call('/api/auth/login',{username:'a',password:'1'})).status,200);assert.equal((await call('/api/pos',{action:'member',username:staffName,role:'remove'})).status,200);
 await stop();await start();const persisted=await call('/api/pos');assert.equal(persisted.status,200);assert.equal(persisted.data.products[0].stock,7);assert.equal(persisted.data.documents.length,2);assert.deepEqual(persisted.data.departments,['Home','Party']);
 assert.equal((await call('/api/images/../../data/pos.sqlite')).status,404);
 console.log('HTTP checks: accounts, sessions, images, quotation, invoice, role enforcement, origin checks and restart persistence passed.');
 }finally{await stop();}
});
