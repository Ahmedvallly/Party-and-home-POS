import http from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {networkInterfaces} from 'node:os';
import {openDatabase} from './database.js';
import {GET,POST} from './api.js';
import {username} from './validation.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const dataDir=process.env.POS_DATA_DIR||join(root,'data');await mkdir(join(dataDir,'images'),{recursive:true});
const db=openDatabase(join(dataDir,'pos.sqlite'));
db.sqlite.exec('CREATE TABLE IF NOT EXISTS credentials(email TEXT PRIMARY KEY,user_id TEXT NOT NULL UNIQUE,salt TEXT NOT NULL,hash TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,email TEXT NOT NULL,expires INTEGER NOT NULL);');
const env={DB:db,BUCKET:{async put(id,bytes,meta){await writeFile(join(dataDir,'images',id),Buffer.from(bytes));await writeFile(join(dataDir,'images',id+'.json'),JSON.stringify(meta));},async get(id){try{return {body:await readFile(join(dataDir,'images',id)),...JSON.parse(await readFile(join(dataDir,'images',id+'.json'),'utf8'))};}catch{return null;}}}};
const sessions=db.sqlite;
function makePassword(email,password){if(typeof password!=='string'||!password.length)throw new Error('Enter a password.');const salt=randomBytes(16).toString('hex');const hash=scryptSync(password,salt,64).toString('hex');const prior=sessions.prepare('SELECT user_id FROM credentials WHERE email=?').get(email);sessions.prepare('INSERT INTO credentials(email,user_id,salt,hash) VALUES(?,?,?,?) ON CONFLICT(email) DO UPDATE SET salt=excluded.salt,hash=excluded.hash').run(email,prior?.user_id||crypto.randomUUID(),salt,hash);}
function identity(req){const cookie=req.headers.cookie||'';const token=cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith('pos_session='))?.slice(12);if(!token)return null;const session=sessions.prepare('SELECT c.email,c.user_id FROM sessions s JOIN credentials c ON c.email=s.email WHERE s.hash=? AND s.expires>?').get(createHash('sha256').update(token).digest('hex'),Date.now());return session?{userId:session.user_id,email:session.email,displayName:session.email,local:true}:null;}
async function body(req,max=2300000){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>max)throw new Error('Request is too large.');chunks.push(chunk);}return Buffer.concat(chunks);}
function json(data,status=200,headers={}){return Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});}
function loginSession(email){const token=randomBytes(32).toString('hex');sessions.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());sessions.prepare('INSERT INTO sessions(hash,email,expires) VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'),email,Date.now()+8*60*60*1000);return `pos_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`;}
const attempts=new Map();
const lanAddresses=()=>Object.values(networkInterfaces()).flat().filter(n=>n.family==='IPv4'&&!n.internal&&/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(n.address)).map(n=>n.address);
const server=http.createServer(async(req,res)=>{
 let response;
 try{
 const host=req.headers.host||'';
 const hostname=host.replace(/:\d+$/,'');
 if(!['localhost','127.0.0.1',...lanAddresses()].includes(hostname))throw new Error('Open this app using localhost or this computer\'s local network address.');
 const origin=`http://${host}`,url=new URL(req.url,origin),user=identity(req);
 if(!['GET','HEAD'].includes(req.method)&&req.headers.origin&&req.headers.origin!==origin)throw new Error('Invalid request origin.');
 if(url.pathname==='/api/auth/status')response=json({local:true,hasOwner:!!sessions.prepare('SELECT email FROM credentials LIMIT 1').get(),signedIn:!!user});
 else if(url.pathname==='/api/auth/logout'&&req.method==='POST'){
 const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('pos_session='))?.slice(12);
 if(token)sessions.prepare('DELETE FROM sessions WHERE hash=?').run(createHash('sha256').update(token).digest('hex'));
 response=json({ok:true},200,{'Set-Cookie':'pos_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});
 }else if((url.pathname==='/api/auth/login'||url.pathname==='/api/auth/setup')&&req.method==='POST'){
 const key=req.socket.remoteAddress;const attempt=attempts.get(key)||{count:0,until:Date.now()+900000};if(Date.now()>attempt.until){attempt.count=0;attempt.until=Date.now()+900000;}if(attempt.count>=10)throw new Error('Too many attempts. Try again in 15 minutes.');
 const b=JSON.parse((await body(req,20000)).toString());let email=String(b.username??b.email??'').trim().toLowerCase();
 // Existing email-based accounts keep their sign-in and password.
 const existingAccount=url.pathname.endsWith('login')&&sessions.prepare('SELECT email FROM credentials WHERE email=?').get(email);
 if(!existingAccount)email=username(email);
 if(url.pathname.endsWith('setup')){if(sessions.prepare('SELECT email FROM credentials LIMIT 1').get())throw new Error('The owner account already exists. Sign in.');makePassword(email,b.password);}
 const credential=sessions.prepare('SELECT * FROM credentials WHERE email=?').get(email);const salt=credential?.salt||'00000000000000000000000000000000';const hash=scryptSync(String(b.password||''),salt,64);
 if(!credential||!timingSafeEqual(Buffer.from(credential.hash,'hex'),hash)){attempt.count++;attempts.set(key,attempt);throw new Error('Username or password is incorrect.');}
 attempts.delete(key);response=json({ok:true},200,{'Set-Cookie':loginSession(email)});
 }else if(url.pathname==='/api/pos'){
 if(req.method==='GET')response=await GET(env,user);
 else if(req.method==='POST'){
 const bytes=await body(req,4000000);const b=JSON.parse(bytes.toString());
 if(b.action==='member'&&b.role!=='remove'&&b.password){const shop=await db.prepare('SELECT owner FROM shop WHERE id=1').first();if(!user||shop?.owner!==user.userId)throw new Error('Only the owner can set team passwords.');if(typeof b.password!=='string')throw new Error('Enter a password.');}
 response=await POST(new Request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:bytes}),env,user);
 if(response.ok&&b.action==='member'&&b.role!=='remove'&&b.password)makePassword(String(b.username??b.email).trim().toLowerCase(),b.password);
 }else response=json({error:'Method not allowed.'},405);
 }else if(url.pathname==='/api/images'&&req.method==='POST'){
 if(!user)response=json({error:'Please sign in.'},401);
 else{
 const shop=await db.prepare('SELECT owner FROM shop WHERE id=1').first(),member=await db.prepare('SELECT role FROM members WHERE email=?').bind(user.email).first();if(!shop||(shop.owner!==user.userId&&!member))throw new Error('Access denied.');
 const bytes=await body(req);const f=await new Request(url,{method:'POST',headers:{'Content-Type':req.headers['content-type']},body:bytes}).formData();const file=f.get('file');
 if(!(file instanceof File)||file.size>2000000||!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Use a JPG, PNG or WebP picture smaller than 2 MB.');
 const image=new Uint8Array(await file.arrayBuffer());const valid=file.type==='image/jpeg'?image[0]===255&&image[1]===216:file.type==='image/png'?image[0]===137&&image[1]===80&&image[2]===78:image[0]===82&&image[8]===87&&image[9]===69;if(!valid)throw new Error('This is not a supported image file.');
 const id=crypto.randomUUID();await env.BUCKET.put(id,image,{httpMetadata:{contentType:file.type}});response=json({url:`/api/images/${id}`});
 }
 }else if(/^\/api\/images\/[a-f0-9-]{36}$/.test(url.pathname)){
 const shop=await db.prepare('SELECT owner FROM shop WHERE id=1').first(),member=user&&await db.prepare('SELECT role FROM members WHERE email=?').bind(user.email).first();
 if(!user||!shop||(shop.owner!==user.userId&&!member))response=new Response(null,{status:403});
 else{const file=await env.BUCKET.get(url.pathname.split('/').pop());response=file?new Response(file.body,{headers:{'Content-Type':file.httpMetadata.contentType,'Cache-Control':'private, max-age=3600'}}):new Response(null,{status:404});}
 }else if(req.method==='GET'&&['/','/style.css','/app.js','/logo.svg'].includes(url.pathname)){
 const path=url.pathname==='/'?'index.html':url.pathname.slice(1);response=new Response(await readFile(join(root,'web',path)),{headers:{'Content-Type':path.endsWith('.svg')?'image/svg+xml':path.endsWith('.css')?'text/css':path.endsWith('.js')?'text/javascript':'text/html','Cache-Control':'no-cache'}});
 }else response=new Response('Not found',{status:404});
 }catch(e){response=json({error:e.message||'Request failed.'},400);}
 res.writeHead(response.status,{'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",...Object.fromEntries(response.headers)});res.end(Buffer.from(await response.arrayBuffer()));
});
const port=Number(process.env.PORT||3000),bindHost=process.env.POS_HOST||'0.0.0.0';server.listen(port,bindHost,()=>{console.log(`Party & Home POS is ready at http://localhost:${port}`);if(bindHost==='0.0.0.0')for(const address of lanAddresses())console.log(`Phone / shop Wi-Fi: http://${address}:${port}`);console.log(`Records are stored in ${dataDir}`);});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>{db.sqlite.close();process.exit(0);}));
