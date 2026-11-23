import {networkInterfaces} from 'node:os';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve('.'),temp=join(root,'.sites-runtime','browser-'+Date.now());await mkdir(temp,{recursive:true});
const app=spawn(process.execPath,['server/local.mjs'],{cwd:root,env:{...process.env,PORT:'3001',POS_DATA_DIR:join(temp,'data')},windowsHide:true,stdio:'pipe'});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let chrome,ws;
async function ready(fn){for(let i=0;i<100;i++){try{const r=await fn();if(r)return r;}catch{}await pause(100);}throw new Error('Timed out waiting for test service.');}
const messages=[],pending=new Map();let id=0;
function cdp(method,params={}){return new Promise((resolve,reject)=>{const requestId=++id,timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('Browser command timed out: '+method));},10000);pending.set(requestId,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id:requestId,method,params}));});}
async function evaluate(expression){const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result?.value;}
async function waitFor(expression){return ready(()=>evaluate(expression));}
try{
await ready(async()=>{const r=await fetch('http://127.0.0.1:3001/api/auth/status',{signal:AbortSignal.timeout(1000)});return r.ok;});
chrome=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--no-sandbox','--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${join(temp,'chrome')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
const port=await ready(async()=>Number((await readFile(join(temp,'chrome','DevToolsActivePort'),'utf8')).split('\n')[0]));
const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(3000)})).json();const target=targets.find(t=>t.type==='page');ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{const t=setTimeout(()=>j(new Error('Chrome could not start in this environment.')),10000);ws.onopen=()=>{clearTimeout(t);r();};ws.onerror=()=>{clearTimeout(t);j(new Error('Chrome connection failed.'));};});
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p?.reject(new Error(JSON.stringify(m.error)));else p?.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')messages.push(m.params.exceptionDetails);};
await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Emulation.setDeviceMetricsOverride',{width:1480,height:1040,deviceScaleFactor:1,mobile:false});await cdp('Page.navigate',{url:'http://localhost:3001'});
await waitFor("!!document.querySelector('[data-form=login]')");
await evaluate("document.querySelector('[name=username]').value='owner';document.querySelector('[name=password]').value='Testing-owner-123!';document.querySelector('[data-form=login]').requestSubmit();true");
await waitFor("!!document.querySelector('[data-form=setup]')");
await evaluate("document.querySelector('[data-form=setup]').requestSubmit();true");await waitFor("!document.querySelector('[data-form=setup]')&&!!document.querySelector('[data-action=new-product]')");
await evaluate("(async()=>{await fetch('/api/pos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'departments',names:['Party essentials']})});document.querySelector('[data-action=refresh]').click();return true;})()");await pause(250);await evaluate("document.querySelector('[data-action=new-product]').click();true");await waitFor("!!document.querySelector('[data-form=product]')");
await evaluate("(()=>{const f=document.querySelector('[data-form=product]');f.elements.name.value='White paper plates · 20 pack';f.elements.sku.value='PP-001';f.elements.category.value='Party essentials';f.elements.stock.value='10';f.elements.cost.value='12';for(const [i,l]of ['p1','p2','p3','p4','p5'].entries())f.elements[l].value=String(25-i);f.requestSubmit();return true;})()");
await waitFor("!!document.querySelector('.product-card')&&!document.querySelector('[data-form=product]')");
// A real PNG upload verifies the multipart route and picture rendering.
await evaluate("(async()=>{const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='),c=>c.charCodeAt(0));const f=new FormData();f.append('file',new File([bytes],'test.png',{type:'image/png'}));const r=await fetch('/api/images',{method:'POST',body:f});if(!r.ok)throw new Error(await r.text());const {url}=await r.json();const d=await(await fetch('/api/pos')).json();const p=d.products[0];const s=await fetch('/api/pos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...p,action:'product',image:url})});if(!s.ok)throw new Error(await s.text());return true;})()");
await evaluate("document.querySelector('[data-action=refresh]').click();true");await waitFor("!!document.querySelector('.product-card img')");
// Create a reusable customer through the actual UI, and configure the printed footer.
await evaluate("document.querySelector('[data-action=nav][data-page=customers]').click();document.querySelector('[data-action=new-customer]').click();true");
await waitFor("!!document.querySelector('[data-form=customer]')");
await evaluate("(()=>{const f=document.querySelector('[data-form=customer]');for(const [k,v]of Object.entries({name:'Test Customer',account:'C-TEST',phone:'032 000 0000',email:'customer@example.com',address:'1 Test Road\\nTest Town',delivery:'Test warehouse',terms:'EFT',level:'p1'}))f.elements[k].value=v;f.requestSubmit();return true;})()");
await waitFor("!document.querySelector('[data-form=customer]')&&document.querySelector('.table-scroll').innerText.includes('C-TEST')");
await evaluate("document.querySelector('[data-action=nav][data-page=settings]').click();const printForm=document.querySelector('[data-form=printing]');printForm.elements.bank.value='QA Example Bank';printForm.elements.account_name.value='Party and Home';printForm.elements.account_number.value='000-TEST';printForm.elements.branch.value='TEST';printForm.elements.footer.value='Use your invoice number as the reference.';printForm.requestSubmit();true");
await waitFor("document.querySelector('[data-form=printing] [data-save]')&&!document.querySelector('[data-form=printing] [data-save]').disabled");

// The transaction editor preserves customer data and recalculates totals without rerendering the focused input.
await evaluate("document.querySelector('[data-action=nav][data-page=invoices]').click();document.querySelector('[data-action=pick-customer]').click();true");
await waitFor("!!document.querySelector('[data-action=use-customer]')");
await evaluate("document.querySelector('[data-action=use-customer]').click();document.querySelector('[data-customer=orderRef]').value='PO-TEST-100';document.querySelector('[data-customer=orderRef]').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-customer=deliveryDate]').value='2026-12-01';document.querySelector('[data-customer=deliveryDate]').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-action=pick-stock]').click();true");
await waitFor("!!document.querySelector('[data-action=pick-product]')");
await evaluate("document.querySelector('[data-action=pick-product]').click();const q=document.querySelector('[data-cart-qty]');q.value='3';q.dispatchEvent(new Event('change',{bubbles:true}));const p=document.querySelector('[data-cart-price]');p.focus();p.value='27.50';p.dispatchEvent(new Event('change',{bubbles:true}));true");
assert.match(await evaluate("document.querySelector('[data-transaction-total]').textContent"),/82[,.]50/);
assert.equal(await evaluate("document.activeElement===document.querySelector('[data-cart-price]')"),true);
await evaluate("const resetPrice=document.querySelector('[data-cart-price]');resetPrice.value='25.00';resetPrice.dispatchEvent(new Event('change',{bubbles:true}));true");
await cdp('Page.reload');await waitFor("performance.getEntriesByType('navigation')[0]?.type==='reload'&&!!document.querySelector('[data-customer=orderRef]')&&!!document.querySelector('[data-cart-qty]')");
assert.equal(await evaluate("document.querySelector('[data-cart-qty]').value"),'3');
assert.equal(await evaluate("document.querySelector('[data-customer=orderRef]').value"),'PO-TEST-100');
await evaluate("const scan=document.querySelector('[data-form=scan]');scan.elements.sku.value='PP-001';scan.elements.qty.value='1';scan.requestSubmit();true");
assert.equal(await evaluate("document.querySelector('[data-cart-qty]').value"),'4');
await evaluate("const editQuantity=document.querySelector('[data-cart-qty]');editQuantity.value='3';editQuantity.dispatchEvent(new Event('change',{bubbles:true}));true");
await mkdir(join(root,'outputs'),{recursive:true});
await writeFile(join(root,'outputs','invoice-editor-desktop.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
await evaluate("document.querySelector('[data-action=nav][data-page=orders]').click();true");
assert.equal(await evaluate("document.querySelector('[data-customer=customer]').value"),'Test Customer');
await writeFile(join(root,'outputs','sales-order-desktop.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
for(const width of [390,360]){
 await cdp('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});await pause(300);
 assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true,'transaction editor overflows on phone');
 if(width===390)await writeFile(join(root,'outputs','sales-order-mobile.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
}
await cdp('Emulation.setDeviceMetricsOverride',{width:1480,height:1040,deviceScaleFactor:1,mobile:false});
await evaluate("document.querySelector('[data-action=checkout]').click();true");
await waitFor("!!document.querySelector('[data-form=checkout]')");await evaluate("document.querySelector('[name=customer]').value='Test Customer';window.__printCount=0;window.print=()=>{window.__printCount++;};const saveForm=document.querySelector('[data-form=checkout]');saveForm.requestSubmit(saveForm.querySelector('[data-print-after]'));true");
await waitFor("!!document.querySelector('.print-document')&&!document.querySelector('[data-form=checkout]')");
assert.equal(await evaluate("(async()=>{const d=await(await fetch('/api/pos')).json();return d.products[0].stock;})()"),10);
await waitFor("window.__printCount===1");
assert.match(await evaluate("document.querySelector('.business-document').innerText"),/PO-TEST-100/);
assert.match(await evaluate("document.querySelector('.business-document').innerText"),/Test warehouse/);
assert.match(await evaluate("document.querySelector('.business-document').innerText"),/QA Example Bank/);
const orderPdf=await cdp('Page.printToPDF',{printBackground:true,preferCSSPageSize:true});await writeFile(join(root,'outputs','sales-order-example.pdf'),Buffer.from(orderPdf.data,'base64'));
assert.equal((Buffer.from(orderPdf.data,'base64').toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,1,'single-page order PDF should contain one page');
await writeFile(join(root,'outputs','sales-order-print-preview.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));

await evaluate("document.querySelector('[data-action=convert]').click();true");await waitFor("!!document.querySelector('[data-form=convert]')");await evaluate("document.querySelector('[data-form=convert]').requestSubmit();true");
await waitFor("!!document.querySelector('.print-document')&&document.querySelector('.document-meta').innerText.includes('INVOICE')&&!document.querySelector('[data-form=convert]')");
assert.equal(await evaluate("(async()=>{const d=await(await fetch('/api/pos')).json();return d.products[0].stock;})()"),7);
const pdf=await cdp('Page.printToPDF',{printBackground:true,preferCSSPageSize:true});assert.equal((Buffer.from(pdf.data,'base64').toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,1,'single-page invoice PDF should contain one page');await mkdir(join(root,'outputs'),{recursive:true});await writeFile(join(root,'outputs','invoice-example.pdf'),Buffer.from(pdf.data,'base64'));
await evaluate("document.querySelector('[data-action=close-doc]').click();document.querySelector('[data-action=nav][data-page=sale]').click();document.querySelector('.product-card').click();true");
let shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile(join(root,'outputs','pos-desktop.png'),Buffer.from(shot.data,'base64'));
await evaluate("document.querySelector('[data-action=nav][data-page=reports]').click();true");assert.match(await evaluate("document.querySelector('.report-stats').innerText"),/75/);
shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile(join(root,'outputs','reports-desktop.png'),Buffer.from(shot.data,'base64'));
await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await evaluate("document.querySelector('[data-action=nav][data-page=sale]').click();true");
assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true,'mobile layout overflows');
shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile(join(root,'outputs','pos-mobile.png'),Buffer.from(shot.data,'base64'));
await evaluate("document.querySelector('[data-action=clear]').click();document.querySelector('[data-action=confirm-clear]').click();document.querySelector('[data-action=nav][data-page=customers]').click();document.querySelector('[data-action=customer-history]').click();true");
assert.equal(await evaluate("document.querySelectorAll('.table-scroll tbody tr').length"),2,'customer history should show order and converted invoice');
await evaluate("document.querySelector('[data-action=copy-order]').click();true");assert.equal(await evaluate("document.querySelector('[data-cart-qty]').value"),'3');
assert.equal(await evaluate("document.querySelector('[data-customer=orderRef]').value"),'');
await evaluate("document.querySelector('[data-action=clear]').click();document.querySelector('[data-action=confirm-clear]').click();true");
// Create staff through the actual settings UI, then check server-side cost redaction.
await evaluate("document.querySelector('[data-action=nav][data-page=settings]').click();const f=document.querySelector('[data-form=member]');f.elements.username.value='cashier1';f.elements.password.value='Testing-staff-123!';f.requestSubmit();true");
await waitFor("document.querySelectorAll('.member-row').length===2");
const staffCheck=await evaluate("(async()=>{await fetch('/api/auth/logout',{method:'POST'});const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'cashier1',password:'Testing-staff-123!'})});if(!r.ok)throw new Error(await r.text());const d=await(await fetch('/api/pos')).json();return {role:d.role,hasCost:Object.hasOwn(d.products[0],'cost')};})()");assert.deepEqual(staffCheck,{role:'staff',hasCost:false});
const lanAddress=Object.values(networkInterfaces()).flat().find(n=>n.family==='IPv4'&&!n.internal&&/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(n.address))?.address;
if(lanAddress){
 await cdp('Page.navigate',{url:'http://'+lanAddress+':3001'});await waitFor("!!document.querySelector('[data-form=login]')");
 await evaluate("document.querySelector('[name=username]').value='owner';document.querySelector('[name=password]').value='Testing-owner-123!';document.querySelector('[data-form=login]').requestSubmit();true");
 await waitFor("!!document.querySelector('[data-action=nav][data-page=orders]')");
 await evaluate("document.querySelector('[data-action=nav][data-page=orders]').click();document.querySelector('[data-action=pick-stock]').click();true");
 await waitFor("!!document.querySelector('[data-action=pick-product]')");await evaluate("document.querySelector('[data-action=pick-product]').click();true");
 assert.match(await evaluate("document.querySelector('[data-transaction-line]').dataset.transactionLine"),/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 console.log('Phone network origin: sign-in and adding stock passed, including UUID creation without a secure browser origin.');
 await evaluate("(async()=>{const d=await(await fetch('/api/pos')).json();const r=await fetch('/api/pos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'document',id:'long-print-test',kind:'quote',customer:'Multi-page Test Customer',level:'p1',payment:'Quotation',lines:Array.from({length:45},(_,i)=>({name:'Manual product '+(i+1),sku:'MANUAL',unit:'Each',qty:1,price:1000}))})});if(!r.ok)throw new Error(await r.text());document.querySelector('[data-action=refresh]').click();return true;})()");
 await waitFor("!document.querySelector('[data-action=refresh]').disabled");await pause(300);
 await evaluate("document.querySelector('[data-action=nav][data-page=documents]').click();document.querySelector('[data-action=view-document][data-id=long-print-test]').click();true");
 assert.equal(await evaluate("document.querySelectorAll('.business-document').length"),3);
 const longPdf=await cdp('Page.printToPDF',{printBackground:true,preferCSSPageSize:true});await writeFile(join(root,'outputs','multi-page-order-example.pdf'),Buffer.from(longPdf.data,'base64'));
 assert.equal((Buffer.from(longPdf.data,'base64').toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,3,'45-line order should print exactly three pages');

}
assert.equal(messages.length,0,JSON.stringify(messages));
console.log('Browser checks passed: owner setup, product creation, image upload, 3-pack quotation, invoice conversion, stock 10 → 7, printable PDF, sales report, mobile layout, and staff cost protection.');
console.log('QA artifacts: outputs/pos-desktop.png, outputs/reports-desktop.png, outputs/pos-mobile.png, outputs/invoice-example.pdf');
}finally{ws?.close();chrome?.kill();app.kill();}
