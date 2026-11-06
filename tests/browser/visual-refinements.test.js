import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';
let server, browser, base;
const root=resolve('src');
before(async()=>{
 server=createServer(async(req,res)=>{
  const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if(!path.startsWith(root+'/')){res.writeHead(403).end();return;}
  try{const bytes=await readFile(path);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(path)]||'application/octet-stream');res.end(bytes);}catch{res.writeHead(404).end();}
 });
 await new Promise(done=>server.listen(0,'127.0.0.1',done));base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({args:['--no-sandbox']});await mkdir('.review',{recursive:true});
});
after(async()=>{await browser?.close();await new Promise(done=>server.close(done));});
async function pageFor(t,options={}){
 const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'dark',...options});
 const page=await context.newPage();
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 t.after(async()=>{await context.close();assert.deepEqual(errors,[]);});
 await page.route('https://fonts.googleapis.com/**',r=>r.abort());
 await page.route('https://*.supabase.co/**',r=>r.abort());
 await page.goto(base);await page.locator('.auth-theme [role="combobox"]').waitFor();return page;
}
async function renderFixture(page){
 await page.evaluate(async()=>{
  const {state}=await import('/js/state.js');
  state.currentMonth=10;state.currentYear=2026;
  state.sections=[{id:'home',title:'Casa',color:'#3D5A80',bg:'#E8F0FA',items:[{id:'bed',label:'Cama do quarto (1/12)',val:'141.62',source:'nubank',merchant:'Blue instituição de pag',merchantKey:'BLUE',sourceCardLast4:'1111',originalAmountCents:14162,parcelNumber:1,parcelCount:12,invoiceId:'fixture',invoicePosition:1}]},{id:'transport',title:'Transporte',color:'#6B3594',bg:'#F3ECF9',items:[{id:'ride',label:'Uber – NuPay',val:'14.35',source:'nubank',invoiceId:'fixture',invoicePosition:2},{id:'refund',label:'Estorno de Uber – NuPay',val:'-8.91',source:'nubank',invoiceId:'fixture',invoicePosition:3,originalAmountCents:-891}]}];
  state.incomes=[{id:'main',label:'Renda principal',val:'0.00'}];
  document.getElementById('authScreen').style.display='none';document.getElementById('appScreen').style.display='block';document.body.style.overflow='auto';
  document.getElementById('monthChipValue').textContent='Novembro 2026';document.getElementById('headerGreeting').textContent='Olá, André';
  (await import('/js/ui/income.js')).renderIncomes();(await import('/js/ui/sections.js')).renderSections();(await import('/js/ui/recalc.js')).recalc(false);
 });
}
const menu=page=>page.locator('.select-menu:not([hidden])');
test('theme menu supports mouse, keyboard, cancel, persistence and system changes',async t=>{
 const page=await pageFor(t);const trigger=page.locator('.auth-theme [role="combobox"]');
 await page.locator('.auth-theme .theme-picker>span').first().click();assert.equal(await menu(page).count(),1);
 await menu(page).getByRole('option',{name:'Claro',exact:true}).click();assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light');
 await trigger.click();await page.screenshot({path:'.review/seletor-tema-claro-ajustado.png'});await trigger.press('Escape');
 await trigger.press('Enter');await trigger.press('End');await trigger.press('Escape');assert.equal(await menu(page).count(),0);assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light');
 await trigger.press('Enter');await trigger.press('End');await trigger.press('Enter');assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');
 await page.reload();assert.equal(await trigger.locator('.select-value').textContent(),'Escuro');
 await trigger.press('s');await trigger.press('Tab');assert.equal(await page.locator('[data-theme-select]').first().inputValue(),'system');
 await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
 await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
 const second=await page.context().newPage();await second.route('https://fonts.googleapis.com/**',r=>r.abort());await second.goto(base);
 await second.locator('.auth-theme [role="combobox"]').click();await menu(second).getByRole('option',{name:'Claro',exact:true}).click();
 await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');assert.equal(await trigger.locator('.select-value').textContent(),'Claro');
 await second.locator('.auth-theme [role="combobox"]').click();await menu(second).getByRole('option',{name:'Sistema',exact:true}).click();
 await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');await second.close();
 await trigger.click();await menu(page).getByRole('option',{name:'Escuro',exact:true}).hover();
 await page.screenshot({path:'.review/seletor-tema-ajustado.png'});
 assert.equal(await menu(page).evaluate(el=>getComputedStyle(el).borderRadius),'10px');
});
test('only the pencil opens naming; scope menu stays within the dialog and Escape preserves it',async t=>{
 const page=await pageFor(t);await renderFixture(page);
 const row=page.locator('.item-row[data-iid="bed"]');
 await row.locator('.label-input').click();assert.equal(await page.locator('#invoiceNameModal').evaluate(el=>el.classList.contains('open')),false);
 await row.getByRole('button',{name:'Editar nome de'}).click();
 const scope=page.locator('#invoiceNameForm [role="combobox"]');
 await page.locator('#invoiceNameForm').screenshot({path:'.review/seletor-nome-icone.svg.png',animations:'disabled'});
 await scope.click();
 assert.equal(await page.locator('#invoiceNameModal .select-menu:not([hidden])').count(),1);
 await scope.press('Escape');assert.equal(await menu(page).count(),0);assert.equal(await page.locator('#invoiceNameModal').evaluate(el=>el.classList.contains('open')),true);
 await scope.click();await menu(page).getByRole('option',{name:'Só neste lançamento',exact:true}).click();assert.equal(await page.locator('#invoiceNameScope').inputValue(),'once');
 await scope.click();await page.screenshot({path:'.review/seletor-nome-ajustado.png'});
 await scope.press('Escape');await page.locator('#invoiceNameModal .modal-close').click();
 await page.evaluate(async()=>{
  const {state}=await import('/js/state.js');state.sections[0].items.push({...state.sections[0].items[0],id:'duplicate',invoicePosition:4});
 });
 await row.locator('.invoice-name-btn').click();await scope.click();
 assert.equal(await menu(page).getByRole('option',{name:'Nesta compra e nas próximas parcelas',exact:true}).getAttribute('aria-disabled'),'true');
 await scope.press('Home');await scope.press('ArrowDown');await scope.press('Enter');assert.equal(await page.locator('#invoiceNameScope').inputValue(),'merchant');
});
test('amount hierarchy has readable contrast and distinguishes refund from a negative balance',async t=>{
 const page=await pageFor(t);await renderFixture(page);
 await page.locator('.header-right').screenshot({path:'.review/seletor-tema-icone.svg.png',animations:'disabled'});
 const styles=await page.evaluate(()=>{
  const css=el=>getComputedStyle(el),q=selector=>document.querySelector(selector);
  const normal=css(q('[data-iid="bed"] .amount-input')).color;
  return {normal,total:css(q('.section-total')).color,text:css(document.documentElement).getPropertyValue('--text').trim(),background:css(q('.section')).backgroundColor,
   credit:css(q('[data-iid="refund"] .amount-input')).color,balance:css(q('#stat-saldo')).color,creditTitle:q('[data-iid="refund"] .amount-input').title};
 });
 function rgb(s){return s.match(/\d+/g).slice(0,3).map(Number)}
 function luminance(s){return rgb(s).map(n=>{const v=n/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0)}
 function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
 assert.equal(styles.normal,styles.total);assert.notEqual(styles.normal,styles.credit);assert.notEqual(styles.credit,styles.balance);assert.match(styles.creditTitle,/reduz as despesas/);
 assert.ok(contrast(styles.normal,styles.background)>=4.5);assert.ok(contrast(styles.credit,styles.background)>=4.5);
 console.log('Contrast ratios:',{amount:contrast(styles.normal,styles.background).toFixed(2),refund:contrast(styles.credit,styles.background).toFixed(2)});
 await page.screenshot({path:'.review/hierarquia-valores-ajustada.png',fullPage:true});
});
test('scope popover fits mobile, updates dynamically and frees itself when its field is removed',async t=>{
 const page=await pageFor(t,{viewport:{width:390,height:844},isMobile:true,hasTouch:true});await renderFixture(page);
 const theme=page.locator('.header [role="combobox"]');assert.equal(await theme.isVisible(),true);
 await theme.click();assert.equal(await menu(page).evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth}),true);
 await theme.press('Escape');
 await page.locator('[data-iid="bed"] .invoice-name-btn').click();const scope=page.locator('#invoiceNameForm [role="combobox"]');await scope.click();
 assert.equal(await menu(page).evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight}),true);
 await page.screenshot({path:'.review/menu-celular-ajustado.png'});
 await scope.press('Escape');await page.locator('#invoiceNameModal .modal-close').click();
 await page.evaluate(()=>{const s=document.createElement('select');s.id='dynamic-test';s.setAttribute('aria-label','Categoria');s.innerHTML='<option>Casa</option><option>Transporte</option>';document.querySelector('.main').prepend(s)});
 const dynamic=page.getByRole('combobox',{name:'Categoria: Casa'});await dynamic.click();
 await page.evaluate(()=>document.getElementById('dynamic-test').closest('.select-control').remove());
 await page.waitForFunction(()=>!document.querySelector('.select-menu:not([hidden])'));
 assert.equal(await page.locator('html').evaluate(el=>el.scrollWidth<=innerWidth),true);
});
