import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {sanitize,createCase,validateCase,exportCase,addUpdate,buildNotes,getGuidance,normalizeClinicalTime} from '../dist/engine.js';
const base=()=>createCase('主诉：乏力。');
const lab=(overrides={})=>({name:'TSH',value:0.02,unit:'mIU/L',low:0.27,high:4.2,context:'晨起空腹，方法A',sampleTime:'2026-11-02T08:00',...overrides});
const ft4=()=>lab({name:'FT4',value:30,unit:'pmol/L',low:12,high:22});
const update=(overrides={})=>({time:'2026-11-02T10:00',objective:'复核报告',labs:[],...overrides});
const clue=c=>getGuidance(c).alerts.some(a=>a.text.includes('生化线索'));

test('rank-adjacent clinical prose and negation are never guessed to be names',()=>{
 for(const raw of ['主治医师：患者否认胸痛。','主治医师：建议复查血钾。','主治医师：暂无意见。','请主治医师查房。','患者全身无力，女，44岁。'])assert.equal(sanitize(raw).text,raw);
 assert.equal(sanitize('赵测试 主任医师查房',['赵测试']).text,'[已移除] 主任医师查房');
 assert.equal(sanitize('主治医师姓名：测试乙').text,'主治医师姓名：[已移除]');
});
test('all recognized clinical headings form redaction boundaries',()=>{
 for(const field of ['查体','既往用药','诊疗方案','专科情况','影像检查','用药史','药物过敏史','一般资料']){
  const clean=sanitize(`姓名：测试甲 ${field}：保留临床事实。`).text;
  assert.equal(clean,`姓名：[已移除] ${field}：保留临床事实。`);
  assert.equal(sanitize(clean).text,clean);
 }
});
test('repeated sanitize and export retain whitespace-delimited demographics',()=>{
 const raw='姓名 张测试 性别 女 年龄 44岁\n主诉：乏力。';
 const c=createCase(raw);assert.equal(c.fields.demographics,'女，44岁');
 const e=exportCase(exportCase(c));assert.equal(e.admission,c.admission);assert.equal(e.fields.demographics,'女，44岁');
});
test('family and companion descriptions never supply missing patient demographics',()=>{
 for(const raw of ['陪诊者：女，70岁。\n主诉：乏力。','患者年龄未提供。母亲70岁。\n主诉：乏力。','家属：女，66岁。\n主诉：乏力。'])assert.equal(createCase(raw).fields.demographics,'');
 assert.equal(createCase('患者性别：女 患者年龄：44岁\n主诉：乏力').fields.demographics,'女，44岁');
});
test('plan checklist preserves whole negation and conditional scopes',()=>{
 for(const text of ['暂不执行以下项目：\n复查检查A\n复查检查B','若出现症状：\n先核对检查A；再讨论检查B。']){
  const c=base();c.fields.plan=text;const ts=getGuidance(c).tasks.filter(t=>t.id.startsWith('plan-'));
  assert.equal(ts.length,1);assert.equal(ts[0].text,text);assert.ok(buildNotes(c).checklist.includes(text));
 }
});
test('plans with more than forty lines remain complete',()=>{
 const c=base();c.fields.plan=Array.from({length:45},(_,i)=>`核对第${i+1}项`).join('\n');
 assert.equal(getGuidance(c).tasks.find(t=>t.id.startsWith('plan-')).text,c.fields.plan);
});
test('legacy split-plan states reset with an explicit migration notice',()=>{
 const c=base();delete c.planFormat;c.fields.plan='暂不执行检查A；检查B';c.tasks['plan-legacy']={done:true,note:'旧备注'};
 const v=validateCase(c);assert.ok(v.ok);assert.ok(v.value.warnings.some(w=>w.includes('旧版拆分计划')));
 assert.ok(getGuidance(v.value).tasks.filter(t=>t.id.startsWith('plan-')).every(t=>!v.value.tasks[t.id]?.done));
 assert.equal(c.tasks['plan-legacy'].note,'旧备注');
});
test('missing sample times are rejected without making up timestamps',()=>assert.throws(()=>addUpdate(base(),update({labs:[lab({sampleTime:''})]})),/实际采样/));
test('clinical timestamp contract rejects offsets and normalizes equivalent seconds',()=>{
 assert.equal(normalizeClinicalTime('2026-11-02T08:00:00.000'),'2026-11-02T08:00');
 assert.equal(normalizeClinicalTime('2026-11-02T08:00:01.001'),'2026-11-02T08:00:01.001');
 for(const time of ['2026-11-02T08:00Z','2026-11-02T08:00+08:00','2026-02-30T08:00','2026-11-02T08:00:60'])assert.throws(()=>normalizeClinicalTime(time));
 const c=base();c.round.time='2026-11-02T04:00Z';assert.match(validateCase(c).errors[0],/时区/);
});
test('same wall-clock records are identical on UTC, Shanghai and New York devices',()=>{
 const code=`import {createCase,addUpdate,buildNotes,validateCase} from './dist/engine.js';let c=createCase('主诉：乏力');c.round.time='2026-11-02T09:00';c=addUpdate(c,{time:'2026-11-02T08:00',objective:'此前结果'});c=addUpdate(c,{time:'2026-11-02T10:00',objective:'此后结果'});console.log(buildNotes(c).round);c.round.time='2026-11-02T04:00Z';console.log(validateCase(c).errors);`;
 const results=['UTC','Asia/Shanghai','America/New_York'].map(TZ=>{const r=spawnSync(process.execPath,['--input-type=module','-e',code],{cwd:new URL('..',import.meta.url),env:{...process.env,TZ},encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout;});
 assert.equal(new Set(results).size,1);assert.ok(results[0].includes('此前结果'));assert.ok(!results[0].includes('此后结果'));
});
test('equivalent sample strings cannot create an artificial trend',()=>{
 let c=addUpdate(base(),update({labs:[lab()]}));c=addUpdate(c,update({labs:[lab({value:1,sampleTime:'2026-11-02T08:00:00'})]}));
 assert.ok(!getGuidance(c).alerts.some(a=>a.text.includes('→')));
});
test('equivalent sample strings pair and conflicting thyroid results never depend on order',()=>{
 let c=base();c.problems=['thyrotoxicosis'];assert.ok(clue(addUpdate(c,update({labs:[lab({sampleTime:'2026-11-02T08:00:00'}),ft4()]}))));
 for(const labs of [[lab(),lab({value:5}),ft4()],[lab({value:5}),lab(),ft4()]]){
  const d=addUpdate(c,update({labs}));assert.ok(!clue(d));assert.ok(getGuidance(d).alerts.some(a=>a.text.includes('冲突')));
 }
 assert.ok(clue(addUpdate(c,update({labs:[lab(),lab(),ft4()]}))));
});
test('thyroid combination requires nonempty context and supported case-sensitive SI prefixes',()=>{
 let c=base();c.problems=['thyrotoxicosis'];
 for(const labs of [[lab({context:''}),ft4()],[lab({unit:'MIU/L'}),ft4()]])assert.ok(!clue(addUpdate(c,update({labs}))));
});
test('aldosterone and testosterone are not glucose evidence; ketones are',()=>{
 let c=base();c.problems=['glucose'];c=addUpdate(c,update({labs:[lab({name:'醛固酮'}),lab({name:'睾酮'})]}));
 const d=getGuidance(c).differentials;assert.ok(d.length);assert.ok(d.every(x=>!x.evidence.includes('醛固酮')&&!x.evidence.includes('睾酮')));
 c=addUpdate(c,update({labs:[lab({name:'血酮'})]}));assert.ok(getGuidance(c).differentials.some(x=>x.evidence.includes('血酮')));
});
test('oversized clinical fields and arrays reject rather than silently clip',()=>{
 for(const field of ['findings','opinion']){const c=base();c.round[field]='甲'.repeat(80000)+'停止用药';const v=validateCase(c);assert.equal(v.ok,false);assert.match(v.errors[0],/80,000/);assert.ok(buildNotes(c).round.includes('停止用药'));assert.throws(()=>exportCase(c));}
 const custom=base();custom.customTasks=[{id:'custom-a',text:'甲'.repeat(2001)}];assert.equal(validateCase(custom).ok,false);
 const note=base();note.tasks['base-review']={done:false,note:'甲'.repeat(2001)};assert.equal(validateCase(note).ok,false);
 const many=base();many.customTasks=Array.from({length:101},(_,i)=>({id:`custom-${i}`,text:'核对'}));assert.equal(validateCase(many).ok,false);
 assert.throws(()=>addUpdate(base(),update({labs:[lab({context:'甲'.repeat(501)})]})),/500/);
});
test('accepted long clinical fields retain their final meaning across export and generation',()=>{
 const c=base();c.round.opinion='甲'.repeat(79996)+'停止用药';const e=exportCase(c);assert.equal(e.round.opinion,c.round.opinion);assert.ok(buildNotes(e).round.includes('停止用药'));
});
test('every accepted redaction term applies and excess terms fail visibly',()=>{
 const terms=Array.from({length:200},(_,i)=>`屏蔽${String(i).padStart(3,'0')}词`);
 const text=terms.join('，');assert.ok(terms.every(t=>!sanitize(text,terms).text.includes(t)));
 assert.throws(()=>createCase(text,[...terms,'第201项']),/200/);assert.throws(()=>sanitize('文本',['甲'.repeat(201)]),/200/);
 const c=base();c.extraTerms=[...terms,'第201项'];assert.equal(validateCase(c).ok,false);
});

test('fractional times from native controls normalize without changing the instant',()=>{
 assert.equal(normalizeClinicalTime('2026-11-02T08:00:00.1'),'2026-11-02T08:00:00.100');
 assert.equal(normalizeClinicalTime('2026-11-02T08:00:00.01'),'2026-11-02T08:00:00.010');
 assert.throws(()=>addUpdate(base(),update({time:'2026-11-02T08:00:00.01',labs:[lab({sampleTime:'2026-11-02T08:00:00.1'})]})),/晚于/);
});
test('alpha hydroxybutyrate dehydrogenase is not ketone evidence',()=>{
 let c=base();c.problems=['glucose'];c=addUpdate(c,update({labs:[lab({name:'α-羟丁酸脱氢酶'})]}));assert.ok(getGuidance(c).differentials.every(d=>!d.evidence.includes('脱氢酶')));
 c=addUpdate(c,update({labs:[lab({name:'β-羟丁酸'})]}));assert.ok(getGuidance(c).differentials.some(d=>d.evidence.includes('β-羟丁酸')));
});

test('ASCII identity labels require boundaries and do not erase COVID results',()=>{
 assert.equal(sanitize('辅助检查：COVID：阴性。').text,'辅助检查：COVID：阴性。');
 assert.equal(sanitize('ID：TEST-123').text,'ID：[已移除]');
 assert.equal(sanitize('姓名：[已移除]（测试甲） 性别：女').text,'姓名：[已移除] 性别：女');
});
test('explicit patient demographics outrank caregiver labels',()=>{
 assert.equal(createCase('陪诊者 性别：女 年龄：70岁；患者性别：男 患者年龄：44岁\n主诉：乏力。').fields.demographics,'男，44岁');
 assert.equal(createCase('陪诊者 性别：女 年龄：70岁\n主诉：乏力。').fields.demographics,'');
});
test('blank sampling context never permits a trend',()=>{
 let c=addUpdate(base(),update({labs:[lab({context:'   '})]}));c=addUpdate(c,update({time:'2026-11-03T10:00',labs:[lab({context:'   ',sampleTime:'2026-11-03T08:00'})]}));
 assert.ok(!getGuidance(c).alerts.some(a=>a.text.includes('→')));assert.ok(getGuidance(c).alerts.some(a=>a.text.includes('未填写采样条件')));
});
test('transformation size limits reject before creating an unexportable case',()=>{
 assert.throws(()=>createCase('主诉：'+'A'.repeat(16000),['A']),/去标识后的入院记录/);
 const c=createCase('主诉：乏力',['A']);assert.throws(()=>addUpdate(c,update({plan:'A'.repeat(16001)})),/去标识后的复评/);assert.equal(c.updates.length,0);
 const accepted=createCase('主诉：'+'A'.repeat(1000),['A']);assert.ok(validateCase(accepted).ok);
});
test('redaction markers remain idempotent even when a term matches their characters',()=>{
 const once=sanitize('移除甲',['移除']).text;assert.equal(sanitize(once,['移除']).text,once);
});

test('explicit identity labels nested after headers or opening delimiters are redacted',()=>{
 for(const raw of ['一般情况：姓名：测试甲，性别：女，年龄：44岁。','一般资料：住院号：TEST-123','（姓名：测试甲）','(姓名 张测试)']){const out=sanitize(raw).text;for(const secret of ['测试甲','TEST-123','张测试'])assert.ok(!out.includes(secret));}
 assert.equal(sanitize('辅助检查：COVID：阴性。').text,'辅助检查：COVID：阴性。');
});
