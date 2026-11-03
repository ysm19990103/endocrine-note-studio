import test from 'node:test';
import assert from 'node:assert/strict';
import {createCase,sanitize,validateCase,exportCase,buildNotes,addUpdate} from '../dist/engine.js';
import {scanText,scanPrivacy,privacySources,PrivacyReview} from '../dist/privacy.js';

// All names, contacts, identifiers, addresses and histories below are fictional.
const narrative='一般情况：女，44岁。\n现病史：患者林星禾由姐姐林月澄陪同就诊，周云舟医师接诊。否认胸痛。\n辅助检查：报告编码 LAB-A7/260031；旧档案 QX_2026-017。FT4 28 pmol/L，TSH 0.02 mIU/L。\n个人史：生于1982年3月4日，住在虚构市云舟路18号3室，在星禾实验室担任唯一夜班检验员。\n诊疗计划：若低钾未纠正，暂不安排动态试验。';
const clinical='主诉：心悸伴怕热。患者否认糖尿病。主治医师查体未见黄疸。甲状腺毒症考虑Graves病、桥本甲状腺炎；ACTH 20 pg/mL，FT4 28 pmol/L，TSH 0.02 mIU/L。COVID-19阴性，HbA1c 6.5%，IGF-1 200 ng/mL。2026-11-03 08:30；血压128/76 mmHg；MEN1 p.A95V；NM_130799.2。';

test('baseline sanitizer boundaries remain explicit for fictional free narrative',()=>{
 for(const x of ['林星禾','林月澄','周云舟','LAB-A7/260031','QX_2026-017','虚构市云舟路'])assert.ok(sanitize(narrative).text.includes(x));
 const c='联系人：虚构家属；手机 139 0000 1234，座机 010-55551234，微信 xinghe_demo26。';
 const s=sanitize(c).text;assert.ok(!s.includes('虚构家属'));assert.ok(s.includes('139 0000 1234'));
 for(const x of ['139 0000 1234','010-55551234','xinghe_demo26'])assert.ok(scanText(s).some(f=>f.text===x));
});
test('unlabelled patient, relative, physician and header names get exact spans',()=>{
 for(const [s,name] of [['患者林星禾因心悸入院。','林星禾'],['姐姐林月澄陪同。','林月澄'],['周云舟医师接诊。','周云舟'],['林星禾，女，44岁。','林星禾'],['欧阳星禾因心悸就诊。','欧阳星禾']]){
  const f=scanText(s).find(f=>f.text===name);assert.ok(f,s);assert.equal(s.slice(f.start,f.end),name);
 }
});
test('mixed identifiers, contacts and narrative identity get review hints',()=>{
 const hits=scanText(narrative);
 for(const term of ['LAB-A7/260031','QX_2026-017','生于1982年3月4日','住在虚构市云舟路18号3室','在星禾实验室担任唯一夜班检验员'])assert.ok(hits.some(h=>h.text===term),term);
 assert.ok(scanText('朋友使用 synthetic@example.invalid，网址 https://example.invalid/profile').some(h=>h.kind==='contact'));
 assert.ok(hits.every(h=>h.hint));
});
test('clinical terminology, negation, units, variants and times are retained unchanged',()=>{
 assert.deepEqual(scanText(clinical),[]);const c=createCase(clinical);const before=structuredClone(c),notes=buildNotes(c);scanPrivacy(c);assert.deepEqual(c,before);assert.deepEqual(buildNotes(c),notes);
});
test('scanner never deletes even ambiguous phrases or unfamiliar clinical codes',()=>{
 const c=createCase('现病史：患者林星禾因乏力就诊。检验特殊项目ABC-1234567。');
 const saved=JSON.stringify(c);assert.ok(scanPrivacy(c).total>0);assert.equal(JSON.stringify(c),saved);
});
test('positions match CRLF, Unicode, repeated occurrences and existing redactions',()=>{
 const s='😀教学\r\n[已移除] 林星禾，女，44岁。\n患者林星禾因心悸入院。';
 const f=scanText(s).filter(h=>h.text==='林星禾');assert.equal(f.length,2);assert.equal(f[0].line,2);assert.equal(f[0].column,7);assert.equal(f[1].line,3);assert.equal(f[1].column,3);for(const h of f)assert.equal(s.slice(h.start,h.end),'林星禾');
 const s2='😀周云舟医师';const h=scanText(s2)[0];assert.equal(h.start,2);assert.equal(h.column,2);
 assert.deepEqual(scanText('[已移除] [已移除]'),[]);
});
test('all exportable free text fields are inspected, including historic lab context and task notes',()=>{
 let c=createCase('主诉：心悸。');c.round.findings='周云舟医师';c.round.opinion='患者林星禾因心悸入院。';
 c=addUpdate(c,{time:'2026-11-03T10:00',subjective:'姐姐林月澄陪同。',objective:'报告号ABC-1234567',assessment:'周云舟医师',plan:'联系微信 demo_test26',labs:[{name:'ABC-1234567',value:1,unit:'ABC-1234567',context:'周云舟医师',sampleTime:'2026-11-03T09:00'}]});
 c.customTasks=[{id:'custom-0',text:'周云舟医师'}];c.tasks={'custom-0':{done:false,note:'周云舟医师'}};
 const r=scanPrivacy(c);
 for(const id of ['round.findings','round.opinion','updates.0.subjective','updates.0.objective','updates.0.assessment','updates.0.plan','updates.0.labs.0.name','updates.0.labs.0.unit','updates.0.labs.0.context','customTasks.0.text','tasks.0.note'])assert.ok(r.findings.some(f=>f.sourceId===id),id);
 assert.ok(privacySources(c).every(s=>typeof s.text==='string'));
});
test('acceptance belongs to exact in-memory source snapshot and cannot be forged by imported case',()=>{
 const c=createCase(narrative);const r=new PrivacyReview();r.sync(c);assert.equal(r.ready,false);
 for(const f of r.report.findings)r.acknowledge(f.id,true);assert.equal(r.ready,true);
 assert.equal(r.sync(c),false);assert.equal(r.ready,true);
 c.fields.presentIllness+=' 仍有心悸。';assert.equal(r.sync(c),true);assert.equal(r.ready,false);
 const imported=validateCase({...c,confirmed:true,privacyReview:{accepted:['all']}}).value;r.reset();r.sync(imported);assert.equal(r.ready,false);assert.equal(imported.confirmed,false);
});
test('single acknowledgment is reversible and unknown IDs cannot unlock export',()=>{
 const r=new PrivacyReview();r.sync(createCase('主诉：周云舟医师接诊。'));r.acknowledge('forged',true);assert.equal(r.accepted.size,0);
 const f=r.report.findings[0];r.acknowledge(f.id,true);assert.equal(r.accepted.size,1);r.acknowledge(f.id,false);assert.equal(r.accepted.size,0);
});
test('literal masking reuses existing sanitizer, preserves facts and omits sensitive review metadata',()=>{
 const c=createCase(narrative);const masked=validateCase({...c,extraTerms:['林星禾','林月澄','周云舟','LAB-A7/260031','QX_2026-017','1982年3月4日','虚构市云舟路18号3室','星禾实验室','唯一夜班检验员']});assert.equal(masked.ok,true);
 const out=exportCase(masked.value);const text=JSON.stringify(out);for(const term of masked.value.extraTerms)assert.ok(!text.includes(term),term);
 assert.ok(text.includes('否认胸痛'));assert.ok(text.includes('FT4 28 pmol/L'));assert.ok(text.includes('若低钾未纠正，暂不安排动态试验'));assert.deepEqual(out.extraTerms,[]);assert.ok(!text.includes('accepted'));assert.ok(!text.includes('sourceLabel'));assert.equal(out.confirmed,false);
});
test('many findings never silently disappear behind a display limit',()=>{
 const c=createCase('主诉：'+Array.from({length:160},(_,i)=>`报告号QX-${100000+i}。`).join(''));
 const r=new PrivacyReview();r.sync(c);assert.ok(r.report.overflow);assert.equal(r.report.findings.length,250);
 for(const f of r.report.findings)r.acknowledge(f.id,true);assert.equal(r.ready,false);assert.ok(r.pending>0);
});
test('an uncontextualized uncommon name is a documented residual limitation',()=>{
 const s='到院前曾与阿依古丽交谈。';assert.equal(sanitize(s).text,s);assert.deepEqual(scanText(s),[]);
 assert.equal(sanitize(s,['阿依古丽']).text,'到院前曾与[已移除]交谈。');
});

test('review fails closed and retries after any scan exception',()=>{
 const r=new PrivacyReview();r.sync(createCase('主诉：心悸。'));assert.equal(r.ready,true);
 const c=createCase('现病史：周云舟医师接诊。');let reads=0;const actual=c.admission;
 Object.defineProperty(c,'admission',{get(){if(++reads===2)throw new Error('synthetic scanner failure');return actual;}});
 assert.throws(()=>r.sync(c),/synthetic scanner failure/);assert.equal(r.ready,false);assert.equal(r.snapshot,null);assert.equal(r.sync(c),true);assert.equal(r.ready,false);assert.ok(r.report.total>0);
});
test('existing redaction markers never become spaces or connective words to mask',()=>{
 for(const s of ['住在[已移除]。','家住[已移除]。','生于[已移除]。','在[已移除]医院工作。'])assert.deepEqual(scanText(s),[]);
 const s='住在[已移除]18号3室。';const findings=scanText(s);assert.equal(findings.length,1);assert.equal(findings[0].text,'18号3室');for(const f of findings)assert.equal(s.slice(f.start,f.end),f.text);
});
test('title before name, affected relatives and escorted arrival are covered',()=>{
 for(const [s,name] of [['主治医师周云舟查房。','周云舟'],['医生张三说。','张三'],['父亲王明华患糖尿病。','王明华'],['由林星禾送至医院。','林星禾'],['其兄林月澄陪同。','林月澄']])assert.ok(scanText(s).some(f=>f.text===name),s);
});
test('common result values joined to units are not identity candidates',()=>{
 assert.deepEqual(scanText('FT4=28pmol/L，25-OH-D3=26ng/mL；IL-6 27pg/mL'),[]);
});
test('dense accepted text is bounded before computing thousands of display positions',()=>{
 const c=createCase('现病史：'+'周云舟医师；'.repeat(6000));const started=performance.now();const r=scanPrivacy(c);assert.equal(r.findings.length,250);assert.equal(r.total,251);assert.equal(r.overflow,true);assert.ok(performance.now()-started<1500);
});

test('narrative marker fragments do not recommend one-character connective words',()=>{
 const s='在[已移除]实验室担任夜班检验员。';const f=scanText(s);assert.ok(f.every(h=>h.text!=='在'));assert.ok(f.every(h=>s.slice(h.start,h.end)===h.text));
});
