import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../server/database.js';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {GET,POST} from '../server/api.js';
const owner={userId:'owner',email:'owner@example.com',displayName:'Owner'},staff={userId:'staff',email:'staff@example.com',displayName:'Staff'},supervisor={userId:'supervisor',email:'supervisor@example.com',displayName:'Supervisor'};
function fixture(){const db=openDatabase(':memory:');return {db,env:{DB:db}};}
async function post(env,payload,user=owner){return POST(new Request('http://localhost/api/pos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),env,user);}
async function setup(env){assert.equal((await post(env,{action:'setup',name:'Test Shop'})).status,200);assert.equal((await post(env,{action:'departments',names:['Party']})).status,200);}
async function product(env,id='plates',stock=10){const r=await post(env,{action:'product',id,sku:id,name:'Paper plates',unit:'Pack',category:'Party',stock,low:3,image:'',cost:500,p1:1000,p2:900,p3:800,p4:700,p5:600});assert.equal(r.status,200,JSON.stringify(await r.json()));}
const doc=(id,kind='invoice',qty=3)=>({action:'document',id,kind,level:'p1',customer:'Customer',payment:'Cash',lines:[{productId:'plates',qty,price:1000}]});
const stock=db=>db.sqlite.prepare("SELECT stock FROM products WHERE id='plates'").get().stock;

test('description and packaging persist, survive older clients, and never change stock units or cost access',async()=>{
 const {db,env}=fixture();try{
 await setup(env);await product(env);await post(env,{action:'member',email:staff.email,role:'staff'});
 let p=(await(await GET(env,owner)).json()).products[0];
 assert.equal((await post(env,{...p,action:'product',description:'White disposable paper plates, 18 cm',packaging:'20 plates per sealed pack'})).status,200);
 p=(await(await GET(env,staff)).json()).products[0];assert.equal(p.description,'White disposable paper plates, 18 cm');assert.equal(p.packaging,'20 plates per sealed pack');assert.equal(Object.hasOwn(p,'cost'),false);
 const legacy={...p,action:'product',name:'Paper plates updated',cost:1};delete legacy.description;delete legacy.packaging;
 assert.equal((await post(env,legacy,staff)).status,200);
 p=(await(await GET(env,owner)).json()).products[0];assert.equal(p.packaging,'20 plates per sealed pack');assert.equal(p.description,'White disposable paper plates, 18 cm');assert.equal(p.cost,500);assert.equal(p.stock,10);assert.equal(p.unit,'Pack');
 assert.equal((await post(env,{...p,action:'product',packaging:'x'.repeat(161)})).status,400);
 assert.equal((await post(env,{...p,action:'product',description:'x'.repeat(1001)})).status,400);
 assert.equal((await post(env,doc('packaging-invoice','invoice',3))).status,200);assert.equal(stock(db),7);
 }finally{db.sqlite.close();}
});

test('Stockmaster migration preserves legacy product data and can reopen repeatedly',()=>{
 mkdirSync('.sites-runtime',{recursive:true});const path=resolve('.sites-runtime','stockmaster-migration-'+crypto.randomUUID()+'.sqlite');
 const legacy=new DatabaseSync(path);legacy.exec(readFileSync('server/schema.sql','utf8'));
 legacy.prepare('INSERT INTO products(id,sku,name,category,unit,stock,cost,p1,p2,p3,p4,p5) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('legacy','OLD-001','Existing product','Home','Carton',17,333,1000,900,800,700,600);legacy.close();
 let db=openDatabase(path);let p=db.sqlite.prepare('SELECT * FROM products').get();assert.equal(p.stock,17);assert.equal(p.cost,333);assert.equal(p.p5,600);assert.equal(p.unit,'Carton');assert.equal(p.description,'');assert.equal(p.packaging,'');
 db.sqlite.prepare('UPDATE products SET description=?,packaging=?').run('Existing product details','12 packs per carton');db.sqlite.close();
 db=openDatabase(path);try{p=db.sqlite.prepare('SELECT * FROM products').get();assert.equal(p.packaging,'12 packs per carton');assert.equal(p.description,'Existing product details');assert.equal(p.stock,17);assert.equal(db.sqlite.prepare('PRAGMA integrity_check').get().integrity_check,'ok');}finally{db.sqlite.close();}
});

test('customers persist with unique account codes, validated details and optimistic updates',async()=>{
 const {db,env}=fixture();try{
 await setup(env);
 const customer={action:'customer',id:'alice',account:'C001',name:'Alice Trading',phone:'032 123 4567',email:'alice@example.com',address:'1 Main Road',delivery:'Warehouse 2',vat:'1234567890',terms:'EFT',level:'p2'};
 assert.equal((await post(env,customer)).status,200);
 let saved=(await(await GET(env,owner)).json()).customers[0];assert.equal(saved.delivery,'Warehouse 2');assert.equal(saved.level,'p2');assert.equal(saved.version,1);
 assert.equal((await post(env,{...customer,id:'duplicate',account:'c001'})).status,409);
 assert.equal((await post(env,{...customer,id:'bad-email',account:'C002',email:'invalid'})).status,400);
 assert.equal((await post(env,{...customer,id:'bad-level',account:'C003',level:'p9'})).status,400);
 assert.equal((await post(env,{...customer,name:'Alice Updated',version:saved.version})).status,200);
 assert.equal((await post(env,{...customer,name:'Stale edit',version:saved.version})).status,400);
 saved=(await(await GET(env,owner)).json()).customers[0];assert.equal(saved.name,'Alice Updated');assert.equal(saved.version,2);
 }finally{db.sqlite.close();}
});

test('document customer and print snapshots survive later edits and quote conversion',async()=>{
 const {db,env}=fixture();try{
 await setup(env);await product(env);
 const customer={action:'customer',id:'alice',account:'C001',name:'Alice',address:'Old address',delivery:'Warehouse',terms:'EFT',level:'p1'};
 await post(env,customer);
 const settings={action:'printing',vat:'VAT-TEST',vat_rate:1500,bank:'Example Bank',account_name:'Test Shop',account_number:'123456',branch:'001',footer:'Use invoice number'};
 assert.equal((await post(env,settings)).status,200);
 const quote={...doc('snapshot','quote'),customer:'Alice',customerId:'alice',account:'C001',address:'Old address',delivery:'Warehouse',customerVat:'CUSTOMER-VAT',orderRef:'PO-22',deliveryDate:'2026-12-01',salesRep:'Shop rep'};
 assert.equal((await post(env,quote)).status,200);assert.equal(stock(db),10);
 await post(env,{...customer,address:'New address',version:1});await post(env,{...settings,bank:'New Bank',vat_rate:0});await post(env,{action:'shop',name:'Renamed shop',address:'New shop address'});
 assert.equal((await post(env,{action:'document',id:'converted-snapshot',kind:'invoice',quoteId:'snapshot',payment:'EFT'})).status,200);
 const state=await(await GET(env,owner)).json(),q=state.documents.find(d=>d.id==='snapshot'),i=state.documents.find(d=>d.id==='converted-snapshot');
 assert.equal(q.address,'Old address');assert.equal(q.details.printing.bank,'Example Bank');assert.equal(q.details.printing.vat_rate,1500);assert.equal(q.details.shop.name,'Test Shop');assert.equal(q.details.orderRef,'PO-22');assert.deepEqual(i.details,q.details);assert.equal(stock(db),7);
 }finally{db.sqlite.close();}
});

test('customer archiving is restricted and keeps historical documents; print settings are owner-only',async()=>{
 const {db,env}=fixture();try{
 await setup(env);await product(env);await post(env,{action:'member',email:staff.email,role:'staff'});
 const c={action:'customer',id:'customer',account:'C01',name:'Customer',level:'p1'};
 assert.equal((await post(env,c,staff)).status,200);
 assert.equal((await post(env,{action:'printing',vat:'TEST',vat_rate:1500},staff)).status,403);
 assert.equal((await post(env,{action:'printing',vat_rate:1500})).status,400);
 assert.equal((await post(env,{action:'archiveCustomer',id:c.id,active:false},staff)).status,403);
 assert.equal((await post(env,{...doc('old-record','quote'),customerId:c.id})).status,200);
 assert.equal((await post(env,{action:'archiveCustomer',id:c.id,active:false})).status,200);
 assert.equal((await post(env,{...doc('new-record'),customerId:c.id})).status,400);
 const state=await(await GET(env,staff)).json();assert.equal(state.customers[0].active,0);assert.equal(state.documents.length,1);assert.equal(stock(db),10);
 }finally{db.sqlite.close();}
});

test('departments can be added before products, reused without case duplicates, and removed only when unused',async()=>{const {db,env}=fixture();try{await setup(env);assert.equal((await post(env,{action:'departments',names:['Home','Cleaning','home']})).status,200);let d=await(await GET(env,owner)).json();assert.deepEqual(d.departments,['Cleaning','Home','Party']);assert.equal(d.products.length,0);await product(env);assert.equal((await post(env,{action:'removeDepartment',name:'party'})).status,400);const p={...(await(await GET(env,owner)).json()).products[0],action:'product',category:'Unknown'};assert.equal((await post(env,p)).status,400);p.category='home';assert.equal((await post(env,p)).status,200);assert.equal(db.sqlite.prepare('SELECT category FROM products').get().category,'Home');assert.equal((await post(env,{action:'removeDepartment',name:'Party'})).status,200);assert.equal((await post(env,{action:'departments',names:['New','  ']})).status,400);d=await(await GET(env,owner)).json();assert.deepEqual(d.departments,['Cleaning','Home']);}finally{db.sqlite.close();}});

test('existing product categories remain available as departments without changing stock',async()=>{const {db,env}=fixture();try{await setup(env);await product(env);db.sqlite.prepare("UPDATE products SET category='Legacy department'").run();const d=await(await GET(env,owner)).json();assert.ok(d.departments.includes('Legacy department'));const p={...d.products[0],action:'product',name:'Still here'};assert.equal((await post(env,p)).status,200);assert.equal(stock(db),10);}finally{db.sqlite.close();}});
test('quotation leaves stock alone; invoice deducts exactly three packs and retry is idempotent',async()=>{const {db,env}=fixture();await setup(env);await product(env);assert.equal((await post(env,doc('q1','quote'))).status,200);assert.equal(stock(db),10);assert.equal((await post(env,doc('i1'))).status,200);assert.equal(stock(db),7);assert.equal((await post(env,doc('i1'))).status,200);assert.equal(stock(db),7);const m=db.sqlite.prepare("SELECT * FROM movements WHERE document_id='i1'").all();assert.equal(m.length,1);assert.equal(m[0].delta,-3);db.sqlite.close();});
test('overselling rolls back every line, document, and stock movement',async()=>{const {db,env}=fixture();await setup(env);await product(env);const payload=doc('bad');payload.lines=[{productId:'plates',qty:3,price:1000},{productId:'plates',qty:8,price:1000}];const r=await post(env,payload);assert.equal(r.status,409);assert.equal(stock(db),10);assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM documents WHERE id='bad'").get().n,0);assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM movements WHERE document_id='bad'").get().n,0);db.sqlite.close();});
test('quote conversion preserves quoted prices, deducts stock once, and cannot be repeated',async()=>{const {db,env}=fixture();await setup(env);await product(env);const q=doc('quote','quote');q.lines[0].price=725;await post(env,q);assert.equal((await post(env,{action:'document',id:'converted',kind:'invoice',quoteId:'quote',payment:'EFT'})).status,200);assert.equal(stock(db),7);assert.equal(db.sqlite.prepare("SELECT price FROM lines WHERE document_id='converted'").get().price,725);assert.equal((await post(env,{action:'document',id:'duplicate',kind:'invoice',quoteId:'quote'})).status,409);assert.equal(stock(db),7);db.sqlite.close();});
test('staff cannot retrieve, change, or grant access to cost; supervisors can edit cost',async()=>{const {db,env}=fixture();await setup(env);await product(env);await post(env,{action:'member',email:staff.email,role:'staff'});await post(env,{action:'member',email:supervisor.email,role:'supervisor'});const d=await (await GET(env,staff)).json();assert.equal(Object.hasOwn(d.products[0],'cost'),false);const p={...d.products[0],action:'product',cost:1};assert.equal((await post(env,p,staff)).status,200);assert.equal(db.sqlite.prepare('SELECT cost FROM products').get().cost,500);assert.equal((await post(env,{action:'member',email:staff.email,role:'supervisor'},staff)).status,403);const sup=await (await GET(env,supervisor)).json();assert.equal(sup.products[0].cost,500);assert.equal((await post(env,{...sup.products[0],action:'product',cost:650},supervisor)).status,200);assert.equal(db.sqlite.prepare('SELECT cost FROM products').get().cost,650);assert.equal((await GET(env,{userId:'intruder',email:'intruder@example.com'})).status,403);assert.equal((await GET(env,null)).status,401);db.sqlite.close();});
test('manual lines do not affect inventory; negative or fractional quantities are rejected',async()=>{const {db,env}=fixture();await setup(env);await product(env);const p=doc('manual');p.lines=[{name:'Delivery',unit:'Each',qty:1,price:5000}];assert.equal((await post(env,p)).status,200);assert.equal(stock(db),10);for(const qty of [-1,0,1.5])assert.equal((await post(env,doc('invalid'+qty,'invoice',qty))).status,400);assert.equal((await post(env,{action:'stock',id:'plates',delta:-11,reason:'Correction'})).status,409);assert.equal(stock(db),10);db.sqlite.close();});
test('concurrent invoices cannot oversell and product edits detect stale versions',async()=>{const {db,env}=fixture();await setup(env);await product(env,'plates',5);const results=await Promise.all([post(env,doc('race1')),post(env,doc('race2'))]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(stock(db),2);const d=await (await GET(env,owner)).json();const p={...d.products[0],action:'product',name:'Updated'};assert.equal((await post(env,p)).status,200);assert.equal((await post(env,p)).status,400);db.sqlite.close();});
