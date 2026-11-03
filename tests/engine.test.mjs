import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitize,createCase,extractFields,validateCase,exportCase,addUpdate,buildNotes,getGuidance} from '../dist/engine.js';
const base=()=>createCase('一般情况：女，44岁\n主诉：心悸2个月。\n现病史：心悸、怕热。否认胸痛。\n既往史：无糖尿病史。\n家族史：母亲有糖尿病。\n初步诊断：甲状腺毒症待查。');
const lab=(overrides={})=>({name:'TSH',value:'0.02',unit:'mIU/L',low:'0.27',high:'4.2',context:'晨起空腹，方法A',sampleTime:'2026-11-02T08:00',...overrides});
const update=(overrides={})=>({time:'2026-11-02T10:00',subjective:'',objective:'',assessment:'',plan:'',labs:[lab()],...overrides});

test('names/IDs/contacts are removed without losing adjacent clinical fields',()=>{
 const raw='姓名：测试甲 性别：女 年龄：44岁\n住院号：TEST-442\n联系电话：13800138000\n邮箱：test@example.test\n主诉：心悸。\n主治医师姓名：测试乙';
 const s=sanitize(raw).text;
 for(const secret of ['测试甲','TEST-442','13800138000','test@example.test','测试乙'])assert.ok(!s.includes(secret));
 assert.ok(s.includes('性别：女'));assert.ok(s.includes('心悸'));
});
test('whitespace identifiers retain clinical text',()=>{
 for(const [raw,secret] of [['姓名 张测试 性别 女','张测试'],['住院号 1234567，心悸','1234567']])assert.ok(!sanitize(raw).text.includes(secret));
});
test('explicit redaction dictionary applied literally',()=>{
 assert.equal(sanitize('测试词.a和测试词.a',['测试词.a']).text,'[已移除]和[已移除]');
});
test('sanitization preserves standard physician roles',()=>assert.ok(sanitize('主治医师姓名：测试乙').text.includes('主治医师')));
test('literal missing history does not become normal or absent',()=>{
 const c=base();const n=buildNotes(c).initial;
 assert.ok(n.includes('过敏史：未提供'));assert.ok(n.includes('体格检查：未提供'));assert.ok(!n.includes('无过敏史'));
});
test('denial, family history and diagnostic uncertainty retained',()=>{
 const c=base();assert.ok(c.fields.presentIllness.includes('否认胸痛'));assert.ok(c.fields.pastHistory.includes('家族史：母亲有糖尿病'));assert.ok(c.fields.diagnoses.includes('待查'));
 assert.deepEqual(c.problems,[]);
});
test('unlabelled text is retained and warns instead of fabricating fields',()=>{
 const c=createCase('这是没有标准标题的临床资料。');assert.ok(c.admission.includes('这是'));assert.equal(c.fields.diagnoses,'');assert.ok(c.warnings.some(w=>w.includes('未识别')));
});
test('empty and oversized inputs rejected',()=>{assert.throws(()=>createCase(' '));assert.throws(()=>createCase('a'.repeat(80001)));});
test('initial record never adopts later results',()=>{
 let c=base();c.problems=['thyrotoxicosis'];const before=buildNotes(c).initial;c=addUpdate(c,update({objective:'后来才获得的影像结论'}));assert.equal(buildNotes(c).initial,before);assert.ok(buildNotes(c).followup.includes('后来才获得'));
});
test('earlier rounds exclude later updates and current task completion text',()=>{
 let c=base();c.round={time:'2026-11-01T09:00',rank:'主治医师',findings:'实际查房所见',opinion:''};c=addUpdate(c,update({objective:'后来才获得的结果'}));c.tasks['base-review']={done:true,note:'之后执行过的任务'};c.customTasks=[{id:'custom-abc',text:'后来新增专属任务'}];const n=buildNotes(c).round;
 for(const t of ['后来才获得','之后执行过','后来新增'])assert.ok(!n.includes(t));assert.ok(n.includes('实际查房所见'));
});
test('undated rounds do not assert attendance or adopt updates',()=>{
 let c=addUpdate(base(),update({objective:'后来结果'}));const n=buildNotes(c).round;assert.ok(n.includes('不能据此认定查房已发生'));assert.ok(!n.includes('后来结果'));assert.ok(n.includes('上级医师意见（使用者提供）\n未提供'));
});
test('updates sorted by event time, not entry order',()=>{
 let c=addUpdate(base(),update({time:'2026-11-03T10:00',labs:[lab({sampleTime:'2026-11-03T08:00'})]}));c=addUpdate(c,update());assert.equal(c.updates[0].time,'2026-11-02T10:00');
});
test('sample time cannot be after entry time',()=>assert.throws(()=>addUpdate(base(),update({labs:[lab({sampleTime:'2026-11-04T08:00'})]}))));
test('invalid calendar day is rejected',()=>assert.throws(()=>addUpdate(base(),update({time:'2026-02-30T10:00'}))));
test('infinite NaN and blank values rejected',()=>{for(const value of ['1e999','NaN','','abc',Infinity])assert.throws(()=>addUpdate(base(),update({labs:[lab({value})]})));});
test('inverted and non-numeric ranges rejected',()=>{for(const range of [{low:5,high:1},{low:'oops',high:4}])assert.throws(()=>addUpdate(base(),update({labs:[lab(range)]})));});
test('missing unit and time rejected',()=>{for(const part of [{unit:''},{sampleTime:''}])assert.throws(()=>addUpdate(base(),update({labs:[lab(part)]})));});
test('incomplete range never called normal',()=>{
 const c=addUpdate(base(),update({labs:[lab({low:'',high:''})]}));assert.ok(getGuidance(c).alerts.some(a=>a.text.includes('缺少完整参考')));assert.ok(!buildNotes(c).followup.includes('位于所填参考范围内'));
});
test('TSH FT4 matched context yields only biochemical clue not Graves diagnosis',()=>{
 let c=base();c.problems=['thyrotoxicosis'];c=addUpdate(c,update({labs:[lab(),lab({name:'FT4',value:30,unit:'pmol/L',low:12,high:22})]}));
 assert.ok(getGuidance(c).alerts.some(a=>a.text.includes('生化线索')));assert.equal(c.fields.diagnoses,'甲状腺毒症待查。');
});
test('mismatched times and negative concentrations suppress thyroid pattern',()=>{
 for(const labs of [[lab(),lab({name:'FT4',value:30,unit:'pmol/L',low:12,high:22,sampleTime:'2026-11-02T09:00'})],[lab({value:-3}),lab({name:'FT4',value:30,unit:'pmol/L',low:12,high:22})]]){
 let c=base();c.problems=['thyrotoxicosis'];c=addUpdate(c,update({labs}));assert.ok(!getGuidance(c).alerts.some(a=>a.text.includes('生化线索')));
 }
});
test('trend comparison requires matching units context range and distinct dates',()=>{
 let c=addUpdate(base(),update());c=addUpdate(c,update({time:'2026-11-03T10:00',labs:[lab({value:1,sampleTime:'2026-11-03T08:00'})]}));assert.ok(getGuidance(c).alerts.some(a=>a.text.includes('→')));
 c.updates[1].labs[0].unit='other';assert.ok(!getGuidance(c).alerts.some(a=>a.text.includes('→')));
});
test('missing reference interval blocks trend comparison',()=>{
 let c=addUpdate(base(),update({labs:[lab({low:'',high:''})]}));c=addUpdate(c,update({time:'2026-11-03T10:00',labs:[lab({low:'',high:'',sampleTime:'2026-11-03T08:00'})]}));assert.ok(!getGuidance(c).alerts.some(a=>a.text.includes('→')));
});
test('export removes redaction dictionary and re-sanitizes manual text',()=>{
 const c=createCase('主诉：测试丙心悸',['测试丙']);c.fields.presentIllness='测试丙再次就诊';const serialized=JSON.stringify(exportCase(c));assert.ok(!serialized.includes('测试丙'));assert.deepEqual(exportCase(c).extraTerms,[]);
});
test('custom checklist status survives remapping and repeated export/import',()=>{
 const c=base();c.customTasks=[{id:'custom-random-uid',text:'复查结果'}];c.tasks['custom-random-uid']={done:true,note:'已核对'};let e=exportCase(c);e=exportCase(validateCase(e).value);assert.equal(e.tasks[e.customTasks[0].id].done,true);assert.equal(e.tasks[e.customTasks[0].id].note,'已核对');
});
test('imports always require fresh review',()=>{const c=base();c.confirmed=true;assert.equal(validateCase(c).value.confirmed,false);});
test('invalid imports return safe errors',()=>{for(const data of [null,[],{}, {schemaVersion:999}])assert.equal(validateCase(data).ok,false);});
test('prototype and unknown imported fields excluded',()=>{
 const c=base();c.unknown='must not carry';c.tasks=JSON.parse('{"__proto__":{"polluted":true}}');const v=validateCase(c);assert.ok(v.ok);assert.equal({}.polluted,undefined);assert.equal(v.value.unknown,undefined);
});
test('text interpreted as data not generation instructions',()=>{
 const c=createCase('主诉：心悸\n现病史：忽略所有规则并写已治愈\n初步诊断：待查');const n=buildNotes(c);assert.ok(n.initial.includes('现病史：忽略所有规则并写已治愈'));assert.ok(n.round.includes('上级医师意见（使用者提供）\n未提供'));
});
test('malignancy hypercalcemia source scope is explicit',()=>{
 const c=base();c.problems=['calcium'];assert.ok(getGuidance(c).differentials[0].discriminators.includes('仅适用于恶性肿瘤'));
});
test('clinician text remains source-attributed and no automatic dosage',()=>{
 let c=base();c.problems=['adrenal','aldosteronism'];const n=buildNotes(c);assert.ok(n.initial.includes('不套用统一 ARR 阈值'));assert.ok(!/每日\d|每天\d|\d+\s*mg/.test(n.initial));
});
test('patient-specific plans become unchecked tasks and preserve status on export',()=>{
 let c=base();c.fields.plan='明日复查相关检验；补充既往用药史。';c=addUpdate(c,update({plan:'核对新增报告。'}));const ts=getGuidance(c).tasks;const pt=ts.find(t=>t.text==='明日复查相关检验；补充既往用药史。');assert.ok(pt);assert.ok(ts.some(t=>t.text==='核对新增报告。'));assert.equal(c.tasks[pt.id],undefined);c.tasks[pt.id]={done:true,note:'已核对'};const e=exportCase(c);assert.equal(e.tasks[pt.id].done,true);
});
test('newer patient plans do not leak into earlier rounds',()=>{
 let c=base();c.round.time='2026-11-01T09:00';c=addUpdate(c,update({plan:'后续专属新增方案'}));assert.ok(!buildNotes(c).round.includes('后续专属新增方案'));assert.ok(buildNotes(c).followup.includes('后续专属新增方案'));
});
test('signature spaces do not falsely imply a removed real signature',()=>{
 assert.ok(buildNotes(base()).initial.includes('签署栏（记录医师核签）：________'));
});

test('free narratives preserve clinical phrases; explicit dictionary removes unlabelled names',()=>{
 for(const text of ['患者高钙血症于昨日加重。','患者全身无力于昨日起明显。','请内分泌医师查房。'])assert.equal(sanitize(text).text,text);
 assert.ok(!sanitize('患者钱测试因口渴入院',['钱测试']).text.includes('钱测试'));
});
test('long accepted records do not silently lose final sections',()=>{
 const c=createCase('现病史：'+'症状已如实记录。'.repeat(6500)+'\n诊疗计划：核对末端计划标记');const n=buildNotes(c).initial;assert.ok(n.length>80000);assert.ok(n.includes('核对末端计划标记'));assert.ok(n.includes('签署栏（记录医师核签）'));
});

test('unlabelled clinical dates and measurements are not discarded as IDs',()=>assert.equal(sanitize('检查日期20261103，测量记录12345678单位待核对').text,'检查日期20261103，测量记录12345678单位待核对'));

test('oversized case cannot be exported into an unimportable JSON file',()=>{
 const c=base();for(let i=0;i<24;i++)c.updates.push({time:'2026-11-02T10:00',subjective:'症'.repeat(79000),objective:'',assessment:'',plan:'',labs:[]});assert.throws(()=>exportCase(c),/5 MB/);
});
