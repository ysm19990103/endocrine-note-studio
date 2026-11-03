import {test,expect} from 'playwright/test';
import {readFile} from 'node:fs/promises';
import {createCase,addUpdate} from '../../dist/engine.js';

// Fictional material only, including adversarial HTML. Never use clinical records here.
const raw='一般情况：女，44岁。\n主诉：心悸2个月。\n现病史：患者林星禾由姐姐林月澄陪同就诊，周云舟医师接诊。否认胸痛。\n辅助检查：报告编码 LAB-A7/260031；FT4 28 pmol/L，TSH 0.02 mIU/L。\n诊疗计划：若低钾未纠正，暂不安排动态试验。';
const terms=['林星禾','林月澄','周云舟','LAB-A7/260031'];
const controls=['copy-note','download-txt','download-html','print-note','export-case'];
async function prepare(page,text=raw){await page.locator('#admission-input').fill(text);await page.locator('#prepare-case').click();await expect(page.locator('#review-area')).toBeVisible();}
async function acknowledge(page){while(await page.locator('[data-privacy-id]:not(:checked)').count())await page.locator('[data-privacy-id]:not(:checked)').first().check();}
async function mask(page,items=terms){await page.locator('.redaction-details').evaluate(el=>el.open=true);await page.locator('#extra-terms').fill(items.join('\n'));await page.locator('#apply-extra-terms').click();}
async function confirm(page){await acknowledge(page);await page.locator('#confirm-facts').check();}
async function download(page,id){const done=page.waitForEvent('download');await page.locator('#'+id).click();const d=await done;return readFile(await d.path(),'utf8');}
async function printState(page){await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));await page.emulateMedia({media:'print'});return page.evaluate(()=>({allowed:document.body.classList.contains('privacy-ready'),text:document.querySelector('#print-output').textContent,output:getComputedStyle(document.querySelector('#print-output')).display,blocked:getComputedStyle(document.querySelector('#print-blocked')).display,shell:getComputedStyle(document.querySelector('.app-shell')).display,dialogs:[...document.querySelectorAll('dialog')].every(el=>getComputedStyle(el).display==='none')}));}
test.beforeEach(async({page})=>{page.on('dialog',d=>d.accept());await page.goto('/');});

test('unresolved findings block all app exports, native copy and browser printing',async({page})=>{
 await prepare(page);await expect(page.locator('#confirm-facts')).toBeDisabled();let downloads=0;page.on('download',()=>downloads++);
 await page.evaluate(()=>{window.copyCalls=0;Object.defineProperty(navigator.clipboard,'writeText',{value:async()=>window.copyCalls++,configurable:true});window.printCalls=0;window.print=()=>window.printCalls++;});
 for(const id of controls){await expect(page.locator('#'+id)).toBeDisabled();await page.locator('#'+id).dispatchEvent('click');}
 expect(downloads).toBe(0);expect(await page.evaluate(()=>[window.copyCalls,window.printCalls])).toEqual([0,0]);
 expect(await page.evaluate(()=>!document.dispatchEvent(new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData:new DataTransfer()})))).toBe(true);
 const p=await printState(page);expect(p).toMatchObject({allowed:false,text:'',output:'none',blocked:'block',shell:'none',dialogs:true});
});
test('each finding requires a decision followed by the original final confirmation',async({page})=>{
 await prepare(page);const original=await page.locator('#note-preview').textContent();
 await page.locator('[data-privacy-id]').first().check();await expect(page.locator('#confirm-facts')).toBeDisabled();
 await acknowledge(page);await expect(page.locator('#confirm-facts')).toBeEnabled();await expect(page.locator('#download-txt')).toBeDisabled();
 await page.locator('#confirm-facts').check();await expect(page.locator('#download-txt')).toBeEnabled();expect(await page.locator('#note-preview').textContent()).toBe(original);
 await page.locator('[data-privacy-id]').first().uncheck();await expect(page.locator('#confirm-facts')).not.toBeChecked();await expect(page.locator('#download-txt')).toBeDisabled();
});
test('finding shows exact source and supports an edited literal masking term',async({page})=>{
 await prepare(page);const first=page.locator('.privacy-finding').filter({has:page.locator('mark',{hasText:'林星禾'})}).first();
 await expect(first).toContainText('第 3 行');await first.getByText('查看所在原文',{exact:true}).click();await expect(page.locator('#privacy-source-text mark')).toHaveText('林星禾');await page.locator('#privacy-source-close').click();
 await first.getByText('补充屏蔽词',{exact:true}).click();await expect(page.locator('#privacy-mask-term')).toHaveValue('林星禾');await page.locator('#privacy-mask-apply').click();
 await expect(page.locator('#note-preview')).not.toContainText('林星禾');await expect(page.locator('#note-preview')).toContainText('否认胸痛');await expect(page.locator('#privacy-mask-term')).toHaveValue('');
});
test('TXT HTML JSON clipboard and app print contain the reviewed text only',async({page,context})=>{
 await prepare(page);await mask(page);await confirm(page);const expected=await page.locator('#note-preview').textContent();
 const txt=await download(page,'download-txt');expect(txt.replace(/^\uFEFF/,'')).toBe(expected);
 const html=await download(page,'download-html');expect(html).toContain('default-src');expect(html).not.toContain('<script');
 const json=JSON.parse(await download(page,'export-case'));expect(json.extraTerms).toEqual([]);expect(json.confirmed).toBe(false);expect(json.privacyReview).toBeUndefined();
 for(const term of terms){expect(txt).not.toContain(term);expect(html).not.toContain(term);expect(JSON.stringify(json)).not.toContain(term);}
 expect(txt).toContain('若低钾未纠正，暂不安排动态试验');expect(txt).toContain('FT4 28 pmol/L');
 await context.grantPermissions(['clipboard-read','clipboard-write']);await page.locator('#copy-note').click();expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(expected);
 await page.evaluate(()=>{window.printCount=0;window.print=()=>{window.printCount++;window.dispatchEvent(new Event('beforeprint'));};});await page.locator('#print-note').click();expect(await page.evaluate(()=>window.printCount)).toBe(1);
 expect(await printState(page)).toMatchObject({allowed:true,text:expected,output:'block',blocked:'none',shell:'none',dialogs:true});
});
test('all four document tabs retain the same export gate and approved text',async({page})=>{
 await prepare(page);await mask(page);await confirm(page);
 for(const name of ['initial','round','followup','checklist']){await page.locator(`[data-note="${name}"]`).click();const note=await page.locator('#note-preview').textContent();expect((await download(page,'download-txt')).replace(/^\uFEFF/,'')).toBe(note);expect(note).not.toContain('林星禾');}
});
test('facts, round edits and pending input revoke approvals including native print',async({page})=>{
 await prepare(page);await confirm(page);await page.locator('#fact-chiefComplaint').fill('心悸3个月。');await expect(page.locator('#confirm-facts')).not.toBeChecked();expect(await page.locator('[data-privacy-id]:checked').count()).toBe(0);
 await confirm(page);await page.locator('#round-opinion').fill('周云舟医师建议核对。');await expect(page.locator('#download-txt')).toBeDisabled();await expect(page.locator('#privacy-findings')).toContainText('查房意见');
 await confirm(page);await page.locator('#admission-input').fill(raw+'\n新增病史。');await expect(page.locator('#confirm-facts')).toBeDisabled();expect((await printState(page)).text).toBe('');
});
test('supplemental terms must be applied and cannot carry old confirmation',async({page})=>{
 await prepare(page);await confirm(page);await page.locator('.redaction-details').evaluate(el=>el.open=true);await page.locator('#extra-terms').fill('林星禾');await expect(page.locator('#download-html')).toBeDisabled();await expect(page.locator('#confirm-facts')).toBeDisabled();
 await page.locator('#apply-extra-terms').click();await expect(page.locator('#confirm-facts')).not.toBeChecked();await expect(page.locator('#note-preview')).not.toContainText('林星禾');
});
test('imported approvals never transfer; historical fields and checklist notes are checked',async({page})=>{
 let c=createCase('主诉：心悸。');c=addUpdate(c,{time:'2026-11-03T10:00',objective:'周云舟医师接诊。',labs:[{name:'TSH',value:0.02,unit:'mIU/L',sampleTime:'2026-11-03T09:00',context:'姐姐林月澄陪同。'}]});c.customTasks=[{id:'custom-0',text:'复核结果'}];c.tasks={'custom-0':{done:false,note:'报告号 QX_2026-017'}};c.confirmed=true;c.privacyReview={ready:true};
 await page.locator('#import-file').setInputFiles({name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(c))});
 await expect(page.locator('#privacy-findings')).toContainText('随访 1 · 客观资料');await expect(page.locator('#privacy-findings')).toContainText('采样条件');await expect(page.locator('#privacy-findings')).toContainText('清单备注');await expect(page.locator('#export-case')).toBeDisabled();
 await mask(page,['周云舟','林月澄','QX_2026-017']);await confirm(page);const json=await download(page,'export-case');for(const term of ['周云舟','林月澄','QX_2026-017'])expect(json).not.toContain(term);expect(JSON.parse(json).updates[0].labs[0].value).toBe(0.02);
 await page.locator('#import-file').setInputFiles({name:'reviewed-synthetic.json',mimeType:'application/json',buffer:Buffer.from(json)});await expect(page.locator('#export-case')).toBeDisabled();await expect(page.locator('#confirm-facts')).not.toBeChecked();
});
test('new followup, new task and task note revoke confirmation',async({page})=>{
 await prepare(page,'主诉：心悸。');await confirm(page);await page.locator('[data-view="followup"]').click();await page.locator('#update-time').fill('2026-11-03T10:00');await page.locator('#update-objective').fill('周云舟医师接诊。');await page.locator('#update-form button[type="submit"]').click();await expect(page.locator('#download-txt')).toBeDisabled();await expect(page.locator('#privacy-findings')).toContainText('随访 1');
 await confirm(page);await page.locator('[data-view="checklist"]').click();await page.locator('#custom-task').fill('周云舟医师核对。');await page.locator('#custom-task-form button').click();await expect(page.locator('#export-case')).toBeDisabled();
 await confirm(page);await page.locator('.task-note').first().fill('报告号QX_2026-017');await expect(page.locator('#export-case')).toBeDisabled();await expect(page.locator('#privacy-findings')).toContainText('清单备注');
});
test('adversarial markup stays text in risk panel, source viewer and HTML download',async({page})=>{
 await prepare(page,'主诉：心悸。\n现病史：患者林星禾因心悸入院。<img src="https://example.invalid/probe" onerror="window.injected=true">');
 expect(await page.locator('#privacy-findings img').count()).toBe(0);await page.locator('.privacy-finding').first().getByText('查看所在原文',{exact:true}).click();expect(await page.locator('#privacy-source-text img').count()).toBe(0);await page.locator('#privacy-source-close').click();expect(await page.evaluate(()=>window.injected)).toBeUndefined();
 await confirm(page);const html=await download(page,'download-html');expect(html).toContain('&lt;img');expect(html).not.toContain('<img');
});
test('synthetic content causes no data requests, storage writes, console output or case caches',async({page,context})=>{
 const requests=[],logs=[];context.on('request',r=>requests.push({url:r.url(),method:r.method(),body:r.postData()}));page.on('console',m=>logs.push(m.text()));page.on('pageerror',e=>logs.push(e.message));
 await prepare(page);await mask(page);await confirm(page);await download(page,'export-case');
 const allow=new Set(['/','/index.html','/styles.css','/app.js','/engine.js','/privacy.js','/knowledge.js','/sw.js','/manifest.webmanifest','/icon.svg','/icon-192.png','/icon-512.png','/favicon.ico']);
 for(const r of requests){const u=new URL(r.url);expect(u.origin).toBe('http://127.0.0.1:4173');expect(allow.has(u.pathname)).toBe(true);expect(u.search).toBe('');expect(r.method).toBe('GET');expect(r.body).toBeNull();}
 expect(await page.evaluate(async()=>({local:localStorage.length,session:sessionStorage.length,dbs:(await indexedDB.databases()).length}))).toEqual({local:0,session:0,dbs:0});
 const cached=await page.evaluate(async()=>{const out=[];for(const k of await caches.keys())for(const r of await(await caches.open(k)).keys())out.push(r.url);return out;});for(const url of cached)expect(allow.has(new URL(url).pathname)).toBe(true);
 expect(logs.filter(m=>terms.some(t=>m.includes(t)))).toEqual([]);expect(await context.cookies()).toEqual([]);
});
test('clear case removes review state, print payload and any source-view content',async({page})=>{
 await prepare(page);await confirm(page);await page.locator('#clear-case').click();await expect(page.locator('#privacy-findings')).toBeEmpty();await expect(page.locator('#print-output')).toBeEmpty();await expect(page.locator('#privacy-source-text')).toBeEmpty();await expect(page.locator('#export-case')).toBeDisabled();
});

test('native copy and cut of raw or uncommitted input cannot reuse approved-case state',async({page})=>{
 const attempt=type=>page.evaluate(type=>!document.dispatchEvent(new ClipboardEvent(type,{bubbles:true,cancelable:true,clipboardData:new DataTransfer()})),type);
 await page.locator('#admission-input').fill(raw);expect(await attempt('copy')).toBe(true);expect(await attempt('cut')).toBe(true);
 await page.locator('#prepare-case').click();await mask(page);await confirm(page);
 await page.locator('[data-view="followup"]').click();await page.locator('#update-subjective').fill('患者林星禾因心悸入院。');await page.locator('#update-subjective').selectText();expect(await attempt('copy')).toBe(true);expect(await attempt('cut')).toBe(true);
 await page.locator('#note-preview').focus();await page.locator('#note-preview').evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);getSelection().removeAllRanges();getSelection().addRange(r);});expect(await attempt('copy')).toBe(false);
});
test('display overflow keeps exports locked after every visible acknowledgment',async({page})=>{
 await prepare(page,'主诉：'+Array.from({length:160},(_,i)=>`报告号QX-${100000+i}。`).join(''));
 await expect(page.locator('#privacy-overflow')).toBeVisible();expect(await page.locator('[data-privacy-id]').count()).toBe(250);
 // Simulate individual checkbox changes without expensive scrolling; still use real event handlers.
 await page.evaluate(()=>{while(document.querySelector('[data-privacy-id]:not(:checked)')){const el=document.querySelector('[data-privacy-id]:not(:checked)');el.checked=true;el.dispatchEvent(new Event('change'));}});
 await expect(page.locator('#confirm-facts')).toBeDisabled();await expect(page.locator('#export-case')).toBeDisabled();
});
