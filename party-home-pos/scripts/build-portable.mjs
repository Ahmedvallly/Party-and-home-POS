import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const validation=read('server/validation.js').replaceAll('export ','');
const api=read('server/api.js').replace(/^import .* from .*;\r?\n/gm,'').replaceAll('export ','');
const assets=Object.fromEntries(['index.html','style.css','app.js','logo.svg'].map(p=>['/'+(p==='index.html'?'':p),read('web/'+p)]));
const worker=`${validation}\n${api}\nconst assets=${JSON.stringify(assets)};
export default {async fetch(request,env){
const url=new URL(request.url);
const userId=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email');
const user=userId&&email?{userId,email,displayName:email.split('@')[0]}:null;
if(url.pathname==='/api/auth/status')return Response.json({local:false,hasOwner:true});
if(url.pathname==='/api/pos'){if(request.method==='GET')return GET(env,user);if(request.method==='POST')return POST(request,env,user);return new Response(null,{status:405});}
if(url.pathname.startsWith('/api/images')){
 if(!user)return new Response(null,{status:401});
 const shop=await env.DB.prepare('SELECT owner FROM shop WHERE id=1').first();
 const member=await env.DB.prepare('SELECT role FROM members WHERE email=?').bind(email.toLowerCase()).first();
 if(!shop||(shop.owner!==userId&&!member))return new Response(null,{status:403});
 if(request.method==='POST'&&url.pathname==='/api/images'){
  if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return new Response(null,{status:403});
  if(Number(request.headers.get('content-length')||0)>2200000)return Response.json({error:'Choose an image smaller than 2 MB.'},{status:400});
  const f=await request.formData(),file=f.get('file');
  if(!(file instanceof File)||file.size>2000000||!['image/jpeg','image/png','image/webp'].includes(file.type))return Response.json({error:'Use a JPG, PNG or WebP picture smaller than 2 MB.'},{status:400});
  const bytes=new Uint8Array(await file.arrayBuffer());
  const valid=file.type==='image/jpeg'?bytes[0]===255&&bytes[1]===216:file.type==='image/png'?bytes[0]===137&&bytes[1]===80&&bytes[2]===78:bytes[0]===82&&bytes[8]===87&&bytes[9]===69;
  if(!valid)return Response.json({error:'This is not a supported image file.'},{status:400});
  const id=crypto.randomUUID();await env.BUCKET.put(id,bytes,{httpMetadata:{contentType:file.type}});return Response.json({url:'/api/images/'+id});
 }
 const id=url.pathname.split('/').pop();if(request.method!=='GET'||!/^[-a-f0-9]{36}$/.test(id))return new Response(null,{status:404});
 const file=await env.BUCKET.get(id);return file?new Response(file.body,{headers:{'Content-Type':file.httpMetadata?.contentType||'image/jpeg','Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}}):new Response(null,{status:404});
}
if(request.method==='GET'&&Object.hasOwn(assets,url.pathname))return new Response(assets[url.pathname],{headers:{'Content-Type':url.pathname.endsWith('.svg')?'image/svg+xml':url.pathname.endsWith('.css')?'text/css':url.pathname.endsWith('.js')?'text/javascript':'text/html','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"}});
return new Response('Not found',{status:404});}};`;
mkdirSync('dist/server',{recursive:true});mkdirSync('dist/.openai',{recursive:true});mkdirSync('dist/drizzle/meta',{recursive:true});
writeFileSync('dist/server/index.js',worker);writeFileSync('dist/.openai/hosting.json',read('.openai/hosting.json'));
writeFileSync('dist/drizzle/0000_pos.sql',read('server/schema.sql'));
writeFileSync('dist/drizzle/0001_departments.sql',read('server/departments.sql'));
writeFileSync('dist/drizzle/0002_customers.sql',read('server/customers.sql'));
writeFileSync('dist/drizzle/0003_stockmaster.sql',read('server/stockmaster.sql'));
writeFileSync('dist/drizzle/meta/_journal.json',JSON.stringify({version:'7',dialect:'sqlite',entries:[{idx:0,version:'6',when:1795248000000,tag:'0000_pos',breakpoints:false},{idx:1,version:'6',when:1795334400000,tag:'0001_departments',breakpoints:false},{idx:2,version:'6',when:1795428000000,tag:'0002_customers',breakpoints:false},{idx:3,version:'6',when:1795431000000,tag:'0003_stockmaster',breakpoints:false}]},null,2));
console.log('Built dependency-free Worker, web assets and database migration in dist/.');
