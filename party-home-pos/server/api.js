

import { canSeeCost, integer, price, publicProductFields, textValue, username } from './validation.js';

function json(data         , status = 200) { return Response.json(data, {status, headers:{'Cache-Control':'no-store'}}); }
async function context(env, user) {
 if (!user) throw new Error('AUTH:Please sign in to continue.');
 const db = env.DB;
 if (!db) throw new Error('Database is unavailable.');
 const shop = await db.prepare('SELECT * FROM shop WHERE id=1').first     ();
 const member = await db.prepare('SELECT role FROM members WHERE email=?').bind(user.email.toLowerCase()).first     ();
 const role = shop?.owner === user.userId ? 'owner' : member?.role || 'staff';
 if (shop && shop.owner !== user.userId && !member) throw new Error('DENIED:Ask the shop owner to add your account in Team access.');
 return {db,user,shop,role};
}
function failure(e         ) {
 const m = e instanceof Error ? e.message : 'Request failed.';
 if(m.startsWith('AUTH:')) return json({error:m.slice(5)},401);
 if(m.startsWith('DENIED:')) return json({error:m.slice(7)},403);
 if (/insufficient_stock|CHECK constraint/.test(m)) return json({error:'Not enough stock. Refresh the sale and check the quantities.'},409);
 if (/UNIQUE constraint.*quote_id/.test(m)) return json({error:'This quotation has already been invoiced.'},409);
 if (/UNIQUE constraint.*sku/.test(m)) return json({error:'That SKU already exists. Use a unique item code.'},409);
 if (/UNIQUE constraint.*customers.account/.test(m)) return json({error:'That customer account code already exists. Choose another code.'},409);
 if (/D1_|SQLITE|constraint/i.test(m)) { console.error(m); return json({error:'Could not save this record. Refresh and try again.'},409); }
 return json({error:m},400);
}
export async function GET(env,visitor) {
 try {
 const {db,user,shop,role} = await context(env,visitor);
 if(!shop) return json({setup:true,user:{name:user.displayName,email:user.email},role});
 const [products,documents,lines,movements,members,departments,customers,details,printing] = await Promise.all([
 db.prepare(`SELECT ${publicProductFields}${canSeeCost(role)?',cost':''} FROM products ORDER BY name`).all(),
 db.prepare('SELECT * FROM documents ORDER BY seq DESC').all(),
 db.prepare('SELECT * FROM lines').all(),
 db.prepare('SELECT * FROM movements ORDER BY created DESC LIMIT 200').all(),
 role==='owner'?db.prepare('SELECT * FROM members ORDER BY email').all():Promise.resolve({results:[]}),
 db.prepare('SELECT name FROM departments UNION SELECT category AS name FROM products ORDER BY name COLLATE NOCASE').all(),
 db.prepare('SELECT * FROM customers ORDER BY name COLLATE NOCASE').all(),
 db.prepare('SELECT * FROM document_details').all(),
 db.prepare('SELECT details FROM print_settings WHERE id=1').first()
 ]);
 const snapshots=new Map(details.results.map(d=>[d.document_id,JSON.parse(d.details)]));
 return json({setup:false,shop:{name:shop.name,address:shop.address,contact:shop.contact},printing:printing?JSON.parse(printing.details):{},customers:customers.results,user:{name:user.displayName,email:user.email},role,products:products.results,documents:documents.results.map(d=>({...d,details:snapshots.get(d.id)||{}})),lines:lines.results,movements:movements.results,members:members.results,departments:departments.results.map(d=>d.name)});
 }catch(e){return failure(e);}
}
export async function POST(request         ,env,visitor) {
 try {
 const origin=request.headers.get('origin');
 if(origin && origin!==new URL(request.url).origin) throw new Error('DENIED:Invalid request origin.');
 if(Number(request.headers.get('content-length')||0)>4000000) throw new Error('File is too large.');
 const {db,user,shop,role} = await context(env,visitor);
 const b = await request.json()       ;
 const action=b.action;
 const supervisor=()=>{if(!canSeeCost(role)) throw new Error('DENIED:Supervisor access is required.');};
 const owner=()=>{if(role!=='owner') throw new Error('DENIED:Only the owner can manage access.');};
 if(action==='setup') {
 if(shop) throw new Error('The shop is already set up.');
 await db.prepare('INSERT INTO shop(id,owner,name,address,contact) VALUES(1,?,?,?,?)').bind(user.userId,textValue(b.name,120,true),textValue(b.address||'',500),textValue(b.contact||'',200)).run();
 return json({ok:true});
 }
 if(!shop) throw new Error('Set up your shop first.');
 if(action==='shop') {
 owner(); await db.prepare('UPDATE shop SET name=?,address=?,contact=? WHERE id=1').bind(textValue(b.name,120,true),textValue(b.address||'',500),textValue(b.contact||'',200)).run();
 } else if(action==='printing') {
 owner();
 const settings={};
 for(const key of ['vat','bank','account_name','account_number','branch','footer'])settings[key]=textValue(b[key]||'',key==='footer'?500:160);
 settings.vat_rate=integer(b.vat_rate??0,0,10000);
 if(settings.vat_rate&&!settings.vat)throw new Error('Enter your shop VAT number before enabling VAT on documents.');
 await db.prepare('INSERT INTO print_settings(id,details) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET details=excluded.details').bind(JSON.stringify(settings)).run();
 } else if(action==='customer') {
 const id=textValue(b.id,100,true),name=textValue(b.name,200,true),account=textValue(b.account,60,true);
 const phone=textValue(b.phone||'',100),email=textValue(b.email||'',200),address=textValue(b.address||'',500),delivery=textValue(b.delivery||'',500),vat=textValue(b.vat||'',80),terms=textValue(b.terms||'Cash',80,true),level=textValue(b.level||'p1',2,true);
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Enter a valid customer email address.');
 if(!['p1','p2','p3','p4','p5'].includes(level))throw new Error('Choose P1 to P5.');
 const prior=await db.prepare('SELECT id FROM customers WHERE id=?').bind(id).first();
 if(prior){
 const r=await db.prepare('UPDATE customers SET account=?,name=?,phone=?,email=?,address=?,delivery=?,vat=?,terms=?,level=?,version=version+1 WHERE id=? AND version=?').bind(account,name,phone,email,address,delivery,vat,terms,level,id,integer(b.version,1)).run();
 if(!r.meta.changes)throw new Error('This customer changed since you opened it. Refresh and edit again.');
 }else await db.prepare('INSERT INTO customers(id,account,name,phone,email,address,delivery,vat,terms,level,created) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,account,name,phone,email,address,delivery,vat,terms,level,new Date().toISOString()).run();
 return json({ok:true,id});
 } else if(action==='archiveCustomer') {
 supervisor();await db.prepare('UPDATE customers SET active=?,version=version+1 WHERE id=?').bind(b.active?1:0,textValue(b.id,100,true)).run();
 } else if(action==='member') {
 owner(); let email=user.local?username(b.username??b.email):textValue(b.username??b.email,200,true).toLowerCase();
 if(user.local){
 const existing=await db.prepare('SELECT email FROM members WHERE email=?').bind(email).first();
 if(!existing)email=username(email);
 } else if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
 if(!['staff','supervisor','remove'].includes(b.role)) throw new Error('Choose a valid role.');
 if(b.role==='remove') await db.prepare('DELETE FROM members WHERE email=?').bind(email).run();
 else await db.prepare('INSERT INTO members(email,role) VALUES(?,?) ON CONFLICT(email) DO UPDATE SET role=excluded.role').bind(email,b.role).run();
 } else if(action==='departments') {
 if(!Array.isArray(b.names)||!b.names.length||b.names.length>100) throw new Error('Enter between 1 and 100 department names.');
 const names=[...new Set(b.names.map(n=>textValue(n,80,true)))];
 await db.batch(names.map(n=>db.prepare('INSERT OR IGNORE INTO departments(name) VALUES(?)').bind(n)));
 } else if(action==='removeDepartment') {
 const name=textValue(b.name,80,true);
 const used=await db.prepare('SELECT id FROM products WHERE category=? COLLATE NOCASE LIMIT 1').bind(name).first();
 if(used)throw new Error('Move all products out of this department before removing it, including archived products.');
 await db.prepare('DELETE FROM departments WHERE name=? COLLATE NOCASE').bind(name).run();
 } else if(action==='product') {
 const id=textValue(b.id,100,true), sku=textValue(b.sku,80,true),name=textValue(b.name,160,true), requestedDepartment=textValue(b.category,80,true),unit=textValue(b.unit||'Each',40,true);
 const department=await db.prepare('SELECT name FROM (SELECT name FROM departments UNION SELECT category AS name FROM products) WHERE name=? COLLATE NOCASE LIMIT 1').bind(requestedDepartment).first();
 if(!department)throw new Error('Select an existing department. Add new departments on the Departments page first.');
 const category=department.name;
 const image=textValue(b.image||'',200);
 if(image && !/^\/api\/images\/[a-f0-9-]{36}$/.test(image)) throw new Error('Upload a product picture first.');
 const prices=['p1','p2','p3','p4','p5'].map(k=>price(b[k])); const low=integer(b.low,0,1000000);
 const existing=await db.prepare('SELECT id FROM products WHERE id=?').bind(id).first();
 if(existing) {
 const costSql=canSeeCost(role)?',cost=?':'';
 const params      =[sku,name,category,unit,image,low,...prices];
 if(canSeeCost(role)) params.push(price(b.cost));
 params.push(id,integer(b.version,1));
 const r=await db.prepare(`UPDATE products SET sku=?,name=?,category=?,unit=?,image=?,low=?,p1=?,p2=?,p3=?,p4=?,p5=?${costSql},version=version+1 WHERE id=? AND version=?`).bind(...params).run();
 if(!r.meta.changes) throw new Error('This item changed since you opened it. Refresh and edit again.');
 } else {
 const stock=integer(b.stock,0,1000000),cost=canSeeCost(role)?price(b.cost):0;
 await db.batch([
 db.prepare('INSERT INTO products(id,sku,name,category,unit,image,low,p1,p2,p3,p4,p5,stock,cost) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,sku,name,category,unit,image,low,...prices,stock,cost),
 db.prepare('INSERT INTO movements(id,product_id,delta,reason,created,actor) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),id,stock,'Opening stock',new Date().toISOString(),user.email)
 ]);
 }
 } else if(action==='stock') {
 const id=textValue(b.id,100,true),delta=integer(b.delta,-1000000,1000000),reason=textValue(b.reason,300,true);
 if(!delta) throw new Error('Stock adjustment cannot be zero.');
 await db.batch([
 db.prepare('UPDATE products SET stock=stock+?,version=version+1 WHERE id=?').bind(delta,id),
 db.prepare('INSERT INTO movements(id,product_id,delta,reason,created,actor) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),id,delta,reason,new Date().toISOString(),user.email)
 ]);
 } else if(action==='archive') {
 supervisor(); await db.prepare('UPDATE products SET active=?,version=version+1 WHERE id=?').bind(b.active?1:0,textValue(b.id,100,true)).run();
 } else if(action==='document') {
 const id=textValue(b.id,100,true);
 const prior=await db.prepare('SELECT id FROM documents WHERE id=?').bind(id).first();
 if(prior) return json({ok:true,id});
 if(!['invoice','quote'].includes(b.kind)) throw new Error('Choose invoice or quotation.');
 let input=b.lines;
 let source    =null;
 if(b.quoteId) {
 source=await db.prepare("SELECT * FROM documents WHERE id=? AND kind='quote'").bind(textValue(b.quoteId,100,true)).first     ();
 if(!source || b.kind!=='invoice') throw new Error('Quotation not found.');
 input=(await db.prepare('SELECT product_id AS productId,name,sku,unit,qty,price FROM lines WHERE document_id=?').bind(source.id).all()).results;
 }
 if(!Array.isArray(input)||input.length<1||input.length>100) throw new Error('Add between 1 and 100 line items.');
 const validated=[];
 for(const l of input) {
 const qty=integer(l.qty,1,1000000), amount=price(l.price);
 let product    =null;
 if(l.productId) {
 product=await db.prepare('SELECT id,name,sku,unit,active FROM products WHERE id=?').bind(textValue(l.productId,100,true)).first     ();
 if(!product || !product.active) throw new Error('An item is archived or unavailable. Remove it and try again.');
 }
 validated.push({productId:product?.id||null,name:source?textValue(l.name,160,true):product?.name||textValue(l.name,160,true),sku:source?l.sku:product?.sku||'MANUAL',unit:source?l.unit:product?.unit||textValue(l.unit||'Each',40,true),qty,price:amount});
 }
 const level=source?.level||textValue(b.level,2,true);
 if(!['p1','p2','p3','p4','p5'].includes(level)) throw new Error('Choose P1 to P5.');
 const customer=source?.customer||textValue(b.customer||'Walk-in customer',200,true),contact=source?.contact||textValue(b.contact||'',300),address=source?.address||textValue(b.address||'',500),notes=source?.notes||textValue(b.notes||'',1000);
 const payment=b.kind==='quote'?'Quotation':textValue(b.payment||'Cash',80,true);
 let details;
 if(source){const saved=await db.prepare('SELECT details FROM document_details WHERE document_id=?').bind(source.id).first();details=saved?JSON.parse(saved.details):{};}
 else{
 const customerId=b.customerId?textValue(b.customerId,100,true):null;
 if(customerId&&!await db.prepare('SELECT id FROM customers WHERE id=? AND active=1').bind(customerId).first())throw new Error('This saved customer is unavailable. Choose another customer.');
 const printing=await db.prepare('SELECT details FROM print_settings WHERE id=1').first();
 details={customerId,account:textValue(b.account||'',60),customerVat:textValue(b.customerVat||'',80),delivery:textValue(b.delivery||'',500),orderRef:textValue(b.orderRef||'',100),deliveryDate:textValue(b.deliveryDate||'',10),salesRep:textValue(b.salesRep||user.displayName||user.email,200),shop:{name:shop.name,address:shop.address,contact:shop.contact},printing:printing?JSON.parse(printing.details):{}};
 if(details.deliveryDate){const parsed=new Date(details.deliveryDate+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(details.deliveryDate)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==details.deliveryDate)throw new Error('Enter a valid delivery date.');}
 }
 const statements=[db.prepare('INSERT INTO documents(id,seq,kind,customer,contact,address,notes,created,quote_id,level,payment,actor) VALUES(?,(SELECT COALESCE(MAX(seq),0)+1 FROM documents),?,?,?,?,?,?,?,?,?,?)').bind(id,b.kind,customer,contact,address,notes,new Date().toISOString(),source?.id||null,level,payment,user.email)];
 statements.push(db.prepare('INSERT INTO document_details(document_id,details) VALUES(?,?)').bind(id,JSON.stringify(details)));
 for(const l of validated) statements.push(db.prepare('INSERT INTO lines(id,document_id,product_id,name,sku,unit,qty,price) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,l.productId,l.name,l.sku,l.unit,l.qty,l.price));
 await db.batch(statements);
 return json({ok:true,id});
 } else throw new Error('Unknown action.');
 return json({ok:true});
 }catch(e){return failure(e);}
}
