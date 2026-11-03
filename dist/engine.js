import { PROBLEMS, BASE_TASKS, SOURCES } from './knowledge.js';

export const FIELD_LABELS = Object.freeze({demographics:'一般情况',chiefComplaint:'主诉',presentIllness:'现病史',pastHistory:'既往史及相关病史',allergies:'过敏史',examination:'体格检查',investigations:'辅助检查',diagnoses:'入院诊断 / 初步诊断',plan:'入院诊疗计划'});
const MAX_TEXT = 80000;
export const MAX_CASE_BYTES = 5 * 1024 * 1024;
const checkCaseSize=c=>{if(new TextEncoder().encode(JSON.stringify(c,null,2)).byteLength>MAX_CASE_BYTES)throw new Error('病例文件超过 5 MB。请将较早记录另行保存并精简后继续，当前内容仍保留在页面。');return c;};
const EMPTY = '未提供，待补充。';
const safeString = v => typeof v === 'string' ? v : '';
const checkedText=(v,label,max=MAX_TEXT)=>{if(v==null)return '';if(typeof v!=='string'||v.length>max)throw new Error(`${label}须为文本且不超过 ${max.toLocaleString('en-US')} 字符；未截断或替换原内容。`);return v;};
const uid = () => globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
const fmt = x => safeString(x).replace('T',' ');
const termsArray = input => {
 if(input!=null&&!Array.isArray(input)&&typeof input!=='string')throw new Error('补充词表格式无效。');
 const terms=[...new Set((Array.isArray(input)?input:safeString(input).split(/[,，\n]/)).map(x=>checkedText(x,'每个补充词',200).trim()).filter(Boolean))];
 if(terms.length>200)throw new Error('补充词表最多 200 个不同词，每词最多 200 字符；本次操作未应用。');
 return terms;
};

const HEADINGS = [
 ['demographics',['一般情况','一般资料','基本信息']],
 ['chiefComplaint',['主诉']],
 ['presentIllness',['现病史']],
 ['pastHistory',['既往史','个人史','婚育史','月经史','家族史','既往用药','用药史','既往病史']],
 ['allergies',['过敏史','药物过敏史']],
 ['examination',['体格检查','查体','专科检查','专科情况']],
 ['investigations',['辅助检查','实验室检查','入院检查','检验结果','影像检查']],
 ['diagnoses',['入院诊断','初步诊断','初步印象']],
 ['plan',['诊疗计划','诊疗方案','处理计划','入院计划']]
];

// Heuristic assistance, never a claim of exhaustive de-identification.
// Labels use lookahead boundaries so adjacent clinical fields are retained.
export function sanitize(input, extraTerms = []) {
 let text = typeof input==='string'?input:''; let redactions=0;
 const replace=(re,by='[已移除]')=>{text=text.replace(re,(...args)=>{const result=typeof by==='function'?by(...args):by;if(result!==args[0])redactions++;return result;});};
 replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi);
 replace(/(?<!\d)\d{17}[\dXx](?!\d)/g);
 replace(/(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/g);
 const labels='患者姓名|病人姓名|姓名|联系人|家属姓名|家属电话|联系电话|电话号码|电话|手机号|身份证号|身份证号码|身份证|住院号|门诊号|病案号|病历号|就诊号|医保号|床号|登记号|患者ID|病人ID|patient\\s*id|MRN|ID号|ID|家庭住址|现住址|通讯地址|详细地址|工作单位|出生日期|出生年月|主治医师姓名|查房医师姓名|记录医师姓名|医生姓名|医师姓名|医师签名|签名';
 const clinicalLabels=[...HEADINGS.flatMap(([,names])=>names),'性别','年龄','患者性别','患者年龄','民族','婚姻','职业','入院日期','入院时间'];
 const end=String.raw`(?=\s*(?:${clinicalLabels.join('|')}|${labels})\s*[:：]|\s+(?:患者性别|患者年龄|性别|年龄)\s+(?:男|女|\d)|[\n，,；;。]|$)`;
 replace(new RegExp(String.raw`(^|[\s，,；;。:：（(])(${labels})\s*[:：]\s*([^\n，,；;。]*?)${end}`,'gi'),(m,boundary,label,value)=>value.trim()==='[已移除]'||/^[_＿]+$/.test(value.trim())?m:`${boundary}${label}：[已移除]`);
 replace(/(^|[\s，,；;。:：（(])(患者姓名|病人姓名|姓名|住院号|门诊号|病案号|病历号|就诊号|医保号|床号|登记号|患者ID|病人ID|身份证号码|身份证号|联系电话|电话|MRN|ID号)\s+([^\s，,；;。]+)/gi,(_m,boundary,label)=>`${boundary}${label}：[已移除]`);
 // Physician ranks and narrative words are not name labels. Ask for exact terms instead.
 // Do not guess names from a surname plus a clinical narrative: that can erase symptoms.
 // Unlabelled numbers may be dates or clinical measurements; do not guess their meaning.
 for(const term of termsArray(extraTerms).sort((a,b)=>b.length-a.length)) {
   text=text.split('[已移除]').map(part=>{const pieces=part.split(term);redactions+=pieces.length-1;return pieces.join('[已移除]');}).join('[已移除]');
 }
 return {text,redactions,warnings:['自动去标识可能遗漏自由文本中的姓名、地址或罕见事件；请逐项核对，并用补充词表移除剩余标识。']};
}
const cleanClinicalText=(value,label,terms,max=MAX_TEXT)=>checkedText(sanitize(checkedText(value,label,max),terms).text,`去标识后的${label}`,max);
const headingMap = new Map(HEADINGS.flatMap(([key,labels])=>labels.map(label=>[label,key])));
const headerRe = new RegExp('(?:^|\\n|[；;。]|\\s)('+[...headingMap.keys()].sort((a,b)=>b.length-a.length).join('|')+')\\s*[:：]','g');
export function extractFields(text) {
 const fields=Object.fromEntries(Object.keys(FIELD_LABELS).map(k=>[k,'']));
 const matches=[...text.matchAll(headerRe)];
 for(let i=0;i<matches.length;i++){
  const m=matches[i];const key=headingMap.get(m[1]);const value=text.slice(m.index+m[0].length,matches[i+1]?.index??text.length).trim();
  fields[key]+=(fields[key]?'\n':'')+(key==='pastHistory'?`${m[1]}：`:'')+value;
 }
 const prefix=text.slice(0,matches[0]?.index??text.length).trim();
 // Explicit patient labels outrank generic labels. Generic fields must belong to a header line.
 const patientSex=prefix.match(/(?:^|[\s，,；;。])患者性别\s*(?:[:：]\s*|\s+)(男|女)(?=[性\s，,；;。]|$)/)?.[1];
 const patientAge=prefix.match(/(?:^|[\s，,；;。])患者年龄\s*(?:[:：]\s*|\s+)(\d{1,3})\s*岁/)?.[1];
 const patientHeader=prefix.split('\n').filter(line=>/^\s*(?:患者姓名|病人姓名|姓名|性别|年龄|住院号|患者ID)\s*[:：\s]/.test(line)&&!/(?:陪诊|家属|母亲|父亲|监护人|联系人)/.test(line)).join('\n');
 const sex=patientSex??patientHeader.match(/(?:^|[\s，,；;。])性别\s*(?:[:：]\s*|\s+)(男|女)(?=[性\s，,；;。]|$)/)?.[1];
 const age=patientAge??patientHeader.match(/(?:^|[\s，,；;。])年龄\s*(?:[:：]\s*|\s+)(\d{1,3})\s*岁/)?.[1];
 if(!fields.demographics)fields.demographics=[sex,age?`${age}岁`:''].filter(Boolean).join('，');
 const warnings=[];
 if(!matches.length)warnings.push('未识别到标准标题。请在下方人工整理各字段；原文仍完整保留。');
 if(!fields.chiefComplaint)warnings.push('主诉未提取，请补充或保留“未提供”。');
 return {fields,warnings,unmapped:prefix};
}
export function createCase(raw,extraTerms=[]) {
 if(typeof raw!=='string'||!raw.trim())throw new Error('请先输入入院记录。');
 if(raw.length>MAX_TEXT)throw new Error('入院记录超过 80,000 字符，请分段整理。');
 const clean=sanitize(raw,extraTerms);checkedText(clean.text,'去标识后的入院记录');const extracted=extractFields(clean.text);
 for(const [key,value] of Object.entries(extracted.fields))checkedText(value,`去标识后的${FIELD_LABELS[key]}`);
 return {schemaVersion:1,planFormat:'whole-passage-v2',id:uid(),createdAt:new Date().toISOString(),recordTime:'',admission:clean.text,redactions:clean.redactions,warnings:[...clean.warnings,...extracted.warnings],fields:extracted.fields,problems:[],updates:[],tasks:{},customTasks:[],round:{time:'',rank:'',findings:'',opinion:''},confirmed:false,extraTerms:termsArray(extraTerms)};
}
// Clinical times are wall-clock times at the patient's care site, with no timezone conversion.
// Reject offsets explicitly: interpreting a mixed timezone file silently is unsafe.
export function normalizeClinicalTime(t){
 if(typeof t!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(t))throw new Error('临床时间须使用患者就诊地本地时间，不带 Z 或时区偏移；请按原始记录核对后重新填写。');
 const [y,m,d,h,min,sec=0]=t.split(/[.]/)[0].split(/[-T:]/).map(Number);
 const ms=Number((t.split('.')[1]??'').padEnd(3,'0'));
 if(!(y>=1900&&y<=2200&&m>=1&&m<=12&&d>=1&&d<=new Date(Date.UTC(y,m,0)).getUTCDate()&&h<=23&&min<=59&&sec<=59))throw new Error('临床日期或时间无效。');
 return t.slice(0,16)+(sec||ms?':'+String(sec).padStart(2,'0')+(ms?'.'+String(ms).padStart(3,'0'):''):'');
}
const timeValue=t=>{const [y,m,d,h,min,sec=0,ms=0]=normalizeClinicalTime(t).split(/[-T:.]/).map(Number);return Date.UTC(y,m-1,d,h,min,sec,ms);};
const num = x => (typeof x==='number'&&Number.isFinite(x))?x:(typeof x==='string'&&/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(x.trim())&&Number.isFinite(Number(x))?Number(x):null);
function cleanLab(l,extraTerms,updateTime){
 if(!l||typeof l!=='object')throw new Error('检验条目格式错误。');
 const value=num(l.value),low=l.low===''||l.low==null?null:num(l.low),high=l.high===''||l.high==null?null:num(l.high);
 if(!safeString(l.name).trim()||!safeString(l.unit).trim()||value===null)throw new Error('检验必须包含项目名、有效数值和单位；定性结果请填入客观资料。');
 if(!l.sampleTime)throw new Error('每条检验需要实际采样日期和时间，不自动代填。');
 const sampleTime=normalizeClinicalTime(l.sampleTime);
 if(timeValue(l.sampleTime)>timeValue(updateTime))throw new Error('采样时间不能晚于本次记录时间。');
 if((l.low!==''&&l.low!=null&&low===null)||(l.high!==''&&l.high!=null&&high===null)||(low!==null&&high!==null&&low>high))throw new Error('参考范围无效：请输入数值且下限不大于上限。');
 return {id:uid(),name:cleanClinicalText(l.name,'检验项目名',extraTerms,500).trim(),value,unit:cleanClinicalText(l.unit,'检验单位',extraTerms,500).trim(),low,high,context:cleanClinicalText(l.context,'采样条件',extraTerms,500).trim(),sampleTime};
}
export function addUpdate(c,update) {
 const updateTime=normalizeClinicalTime(update?.time);
 if(c.updates.length>=200)throw new Error('每个病例最多保存 200 次复评。');
 if(!Array.isArray(update.labs??[]))throw new Error('检验列表格式错误。');
 if((update.labs??[]).length>100)throw new Error('每次最多 100 条检验。');
 const u={id:uid(),time:updateTime};
 for(const k of ['subjective','objective','assessment','plan']){if(update[k]!=null&&(typeof update[k]!=='string'||update[k].length>MAX_TEXT))throw new Error('复评文本格式错误或超过 80,000 字符。');u[k]=cleanClinicalText(update[k],'复评文本',c.extraTerms);}
 u.labs=(update.labs??[]).map(l=>cleanLab(l,c.extraTerms,u.time));
 if(!u.labs.length&&!['subjective','objective','assessment','plan'].some(k=>u[k].trim()))throw new Error('请至少填写一项复评内容或检验结果。');
 return checkCaseSize({...c,confirmed:false,updates:[...c.updates,u].sort((a,b)=>timeValue(a.time)-timeValue(b.time))});
}
export function validateCase(o) {
 try {
  if(!o||typeof o!=='object'||Array.isArray(o)||o.schemaVersion!==1)throw new Error('不支持的病例文件格式或版本。');
  if(typeof o.admission!=='string'||!o.admission.trim()||o.admission.length>MAX_TEXT)throw new Error('入院记录缺失或过长。');
  if(!o.fields||typeof o.fields!=='object'||!Array.isArray(o.problems)||!Array.isArray(o.updates))throw new Error('病例字段不完整。');
  const c=createCase(o.admission,termsArray(o.extraTerms));
  for(const k of Object.keys(FIELD_LABELS)){if(typeof o.fields[k]!=='string'||o.fields[k].length>MAX_TEXT)throw new Error(`字段 ${FIELD_LABELS[k]} 格式无效。`);c.fields[k]=cleanClinicalText(o.fields[k],FIELD_LABELS[k],c.extraTerms);}
  c.recordTime=o.recordTime?normalizeClinicalTime(o.recordTime):'';
  c.problems=[...new Set(o.problems.filter(id=>PROBLEMS.some(p=>p.id===id)))];
  if(o.updates.length>200)throw new Error('复评记录过多。');
  let working=c;
  for(const u of o.updates)working=addUpdate(working,u);
  if(o.round&&typeof o.round==='object'){
   if(o.round.time)normalizeClinicalTime(o.round.time);
   working.round={time:o.round.time?normalizeClinicalTime(o.round.time):'',rank:['主治医师','副主任医师','主任医师','主治','副主任','主任'].includes(o.round.rank)?o.round.rank:'',findings:cleanClinicalText(o.round.findings,'查房所见',c.extraTerms),opinion:cleanClinicalText(o.round.opinion,'查房意见',c.extraTerms)};
  }
  if(o.customTasks!=null&&!Array.isArray(o.customTasks))throw new Error('自定义事项格式无效。');
  if((o.customTasks??[]).length>100)throw new Error('每个病例最多 100 条自定义事项；未删除任何条目。');
  for(const state of Object.values(o.tasks??{}))if(state&&typeof state==='object')checkedText(state.note,'事项备注',2000);
  const customMap=new Map();
  working.customTasks=Array.isArray(o.customTasks)?o.customTasks.map((t,i)=>{const id=`custom-${i}`;customMap.set(id,checkedText(t?.id,'事项编号',200));return {id,text:cleanClinicalText(t?.text,'自定义事项',c.extraTerms,2000)};}).filter(t=>t.text):[];
  working.tasks={};
  // Retain only registered IDs, never untrusted object keys or prototype properties.
  for(const task of getGuidance(working).tasks){const oldId=customMap.get(task.id)??task.id;const s=o.tasks&&own(o.tasks,oldId)?o.tasks[oldId]:null;if(s&&typeof s==='object')working.tasks[task.id]={done:s.done===true,note:cleanClinicalText(s.note,'事项备注',c.extraTerms,2000)};}
  if(o.planFormat!=='whole-passage-v2'&&Object.keys(o.tasks??{}).some(id=>id.startsWith('plan-'))){
   working.warnings.push('已升级为整段计划核对：旧版拆分计划的勾选和备注未沿用，请对照原工作文件重新核查。旧文件未被修改。');
  }
  working.confirmed=false;
  checkCaseSize(working);
  return {ok:true,errors:[],value:working};
 } catch(e){return {ok:false,errors:[e.message],value:null};}
}
export function exportCase(c){
 const validated=validateCase(c);
 if(!validated.ok)throw new Error(validated.errors.join('；'));
 // A reload is a fresh clinical review; confirmation never crosses an export/import boundary.
 return checkCaseSize({...validated.value,extraTerms:[]});
}
const refStatus=l=>l.low!==null&&l.value<l.low?'低于所填参考范围':l.high!==null&&l.value>l.high?'高于所填参考范围':l.low!==null&&l.high!==null?'位于所填参考范围内':'参考范围不完整，不能判定正常';
const labLine=l=>`${fmt(l.sampleTime)}｜${l.name} ${l.value} ${l.unit}｜参考 ${l.low??'未填'}–${l.high??'未填'}｜${refStatus(l)}${l.context?`｜条件：${l.context}`:'｜采样条件未提供'}`;
const labsOf=c=>c.updates.flatMap(u=>u.labs).sort((a,b)=>timeValue(a.sampleTime)-timeValue(b.sampleTime));
const latestUpdates=c=>[...c.updates].sort((a,b)=>timeValue(a.time)-timeValue(b.time));
const pickTime=(c,time)=>time?{...c,updates:c.updates.filter(u=>timeValue(u.time)<=timeValue(time))}:c;
function thyroidPattern(c){
 const labs=labsOf(c);const norm=n=>n.toUpperCase().replace(/\s/g,'');
 const tsh=labs.filter(l=>norm(l.name)==='TSH').at(-1);
 const ft4=labs.filter(l=>norm(l.name)==='FT4').at(-1);
 if(!tsh||!ft4||tsh.low===null||ft4.high===null)return '';
 const conflicting=selected=>new Set(labs.filter(l=>norm(l.name)===norm(selected.name)&&timeValue(l.sampleTime)===timeValue(selected.sampleTime)).map(l=>JSON.stringify([l.value,l.unit,l.low,l.high,l.context]))).size>1;
 if(conflicting(tsh)||conflicting(ft4))return '同一采样时点存在冲突的 TSH / FT4 结果，暂停组合解释；请核对原始报告并解决重复记录。';
 if([tsh.value,ft4.value,tsh.low,tsh.high,ft4.low,ft4.high].filter(v=>v!==null).some(v=>v<0)||tsh.low===0||ft4.high===0)return 'TSH / FT4 存在不合理的负值或参考界值，暂停组合解释，请复核原始报告。';
 if(timeValue(tsh.sampleTime)!==timeValue(ft4.sampleTime)||tsh.context!==ft4.context||!tsh.context.trim())return 'TSH 与 FT4 的采样时点或条件不一致 / 未提供，暂不合并判读；请核对。';
 if(!/^(?:mIU\/L|uIU\/mL|μIU\/mL|µIU\/mL)$/.test(tsh.unit)||!/^(?:pmol\/L|ng\/dL)$/.test(ft4.unit))return 'TSH / FT4 单位不在本版支持范围，保留原值供医师解释。';
 if(tsh.value<tsh.low&&ft4.value>ft4.high)return '新录入的同一采样时点 TSH 低于所填下限、FT4 高于所填上限，提供甲状腺毒症方向的生化线索；不能据此区分 Graves 病、甲状腺炎或外源激素。';
 return 'TSH / FT4 已按所填参考范围列示；本版不自动判定病因或治疗反应。';
}
const planHash=s=>{let h=2166136261;for(const ch of s){h^=ch.codePointAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(16);};
export function getGuidance(c){
 const differentials=[],tasks=BASE_TASKS.map(t=>({...t})),alerts=[];
 if(!c.confirmed)alerts.push({level:'info',text:'当前内容尚未完成事实与隐私核对，导出前请确认。'});
 const planEntries=[{text:c.fields.plan,time:'入院资料',category:'入院计划（原文）'},...c.updates.map(u=>({text:u.plan,time:u.time,category:'复评计划（原文）'}))];
 const seenPlans=new Set();
 for(const entry of planEntries){
  const text=sanitize(entry.text||'',c.extraTerms).text.trim();if(!text)continue;
  const id='plan-v2-'+planHash(entry.time+'|'+text);
  if(!seenPlans.has(id)){tasks.push({id,category:entry.category,text,reason:`整段保留原计划的否定、前提和先后关系。来源：${fmt(entry.time)}；勾选表示已核对整段，不代表其中各项获准或已执行。可另行添加经确认的独立事项。`,sourceIds:[]});seenPlans.add(id);}
 }
 const labs=labsOf(c);
 if(c.recordTime&&c.round.time&&timeValue(c.round.time)<timeValue(c.recordTime))alerts.push({level:'warning',text:'查房时间早于首次记录时间，请核对临床事件与补记时间，避免误用时间线。'});
 for(const p of PROBLEMS.filter(p=>c.problems.includes(p.id))){
  const related=labs.filter(l=>p.labs.test(l.name));
  const evidence=related.length?related.slice(-8).map(labLine).join('\n'):'尚无本模块的结构化新检验。入院原文及人工判断请在事实区核对。';
  for(const d of p.differentials)differentials.push({...d,problem:p.title,evidence,sourceIds:p.sourceIds});
  p.tasks.forEach(([category,text],i)=>tasks.push({id:`${p.id}-${i}`,category,text,reason:`使用者选择「${p.title}」后显示，需结合实际病情确认适用性。`,sourceIds:p.sourceIds}));
 }
 if(c.problems.includes('thyrotoxicosis')){const pattern=thyroidPattern(c);if(pattern)alerts.push({level:'info',text:pattern});}
 if(labs.some(l=>l.low===null||l.high===null))alerts.push({level:'warning',text:'部分新检验缺少完整参考范围，不能被自动解释为正常。'});
 if(labs.some(l=>!l.context.trim()))alerts.push({level:'info',text:'部分新检验未填写采样条件。激素结果及动态试验需结合时间点、用药和检测方法复评。'});
 // Comparisons are allowed only for exact matching analyte, unit, context and reference range.
 const groups=new Map();for(const l of labs){const key=l.name.trim().toLowerCase();if(!groups.has(key))groups.set(key,[]);groups.get(key).push(l);}
 for(const [name,group] of groups){
  if(group.length<2)continue;const a=group.at(-2),b=group.at(-1);
  if(a.unit!==b.unit||a.context!==b.context||!a.context.trim()||a.low===null||a.high===null||b.low===null||b.high===null||a.low!==b.low||a.high!==b.high||timeValue(a.sampleTime)===timeValue(b.sampleTime)){alerts.push({level:'info',text:`${b.name} 有多次结果，但单位、条件、参考范围缺失/不一致或采样时间重复；不自动比较趋势。`});}
  else alerts.push({level:'info',text:`${b.name}：${fmt(a.sampleTime)} ${a.value} → ${fmt(b.sampleTime)} ${b.value} ${b.unit}；仅为数值变化，不等同于病情改善或恶化。`});
 }
 for(const t of c.customTasks??[])if(t&&typeof t.id==='string'&&typeof t.text==='string')tasks.push({id:t.id,category:'用户补充',text:sanitize(t.text,c.extraTerms).text,reason:'由使用者自行添加，需确认临床适用性。',sourceIds:[]});
 return {differentials,tasks,alerts};
}
const content=(c,value)=>sanitize(safeString(value),c.extraTerms).text.trim()||EMPTY;
function diffText(g){return g.differentials.length?g.differentials.map((d,i)=>`${i+1}. ${d.title}〔讨论方向，非确诊〕\n${d.consider}\n需区分的证据：${d.discriminators}\n新检验依据：${d.evidence}\n参考：${d.sourceIds.map(id=>{const r=SOURCES.find(s=>s.id===id);return r?`${r.title}（${r.year}）`:id;}).join('、')}`).join('\n\n'):'未选择鉴别模块。请由医师结合实际病例补充；不自动推断诊断。';}
function taskText(c,g){return g.tasks.map(t=>`${c.tasks?.[t.id]?.done?'☑':'☐'} ${t.category}｜${t.text}${c.tasks?.[t.id]?.note?`\n备注：${content(c,c.tasks[t.id].note)}`:''}`).join('\n');}
function updateText(c,updates){return updates.length?updates.map(u=>`记录时间：${fmt(u.time)}\n主观变化：${content(c,u.subjective)}\n客观资料：${content(c,u.objective)}\n${u.labs.length?u.labs.map(labLine).join('\n'):'无新增结构化检验。'}\n使用者补充的诊断评价：${content(c,u.assessment)}\n使用者补充的计划：${content(c,u.plan)}`).join('\n\n'):'未录入新结果或病情变化。';}
export function buildNotes(c){
 const f=c.fields,base={...c,updates:[],customTasks:[],tasks:{}},initialGuidance=getGuidance(base),current=getGuidance(c);
 const notice='【待核签草稿】仅据使用者输入整理；未提供项不代表正常。参考建议须经医师确认，不能作为已执行医嘱。';
 const features=Object.entries(FIELD_LABELS).filter(([key])=>!['diagnoses','plan'].includes(key)).map(([key,label])=>`${label}：${content(c,f[key])}`).join('\n');
 const initial=`首次病程记录\n${notice}\n记录时间：${c.recordTime?fmt(c.recordTime):'未提供，待填写'}\n\n一、病例特点\n${features}\n\n二、初步诊断\n入院资料记载：${content(c,f.diagnoses)}\n\n三、诊断依据\n病史依据（原文整理）：${content(c,f.presentIllness)}\n体征依据（原文整理）：${content(c,f.examination)}\n检查依据（原文整理）：${content(c,f.investigations)}\n各诊断与上述证据的对应关系需由接诊医师核定；本版不自动将待排、家族史或否定陈述转为确诊。\n\n四、鉴别诊断讨论\n${diffText(initialGuidance)}\n\n五、诊疗计划\n入院资料中的计划：${content(c,f.plan)}\n\n待确认的评估与监测事项：\n${taskText(base,initialGuidance)}\n\n签署栏（记录医师核签）：________`;
 const roundCase={...pickTime(c,c.round.time),tasks:{},customTasks:[]},roundGuidance=getGuidance(roundCase);
 const round=`上级医师查房记录\n${notice}\n查房时间：${c.round.time?fmt(c.round.time):'未提供，不能据此认定查房已发生'}\n查房级别：${content(c,c.round.rank)}\n\n一、入院问题摘要\n主诉：${content(c,f.chiefComplaint)}\n入院资料中的诊断：${content(c,f.diagnoses)}\n\n二、本次查房所见（使用者提供）\n${content(c,c.round.findings)}\n\n三、截至查房时点已录入的新资料\n${c.round.time?updateText(c,latestUpdates(roundCase)):'查房时间未填，未将随访结果自动纳入查房记录。'}\n\n四、上级医师意见（使用者提供）\n${content(c,c.round.opinion)}\n\n五、待上级确认的鉴别讨论\n${diffText(c.round.time?roundGuidance:initialGuidance)}\n\n六、待确认的计划事项（不纳入当前清单勾选状态）\n${taskText({...c,tasks:{}},c.round.time?roundGuidance:initialGuidance)}\n\n查房医师：________　签署栏（记录医师核签）：________`;
 const followup=`后续病程与诊断复评\n${notice}\n\n一、原入院诊断\n${content(c,f.diagnoses)}\n\n二、新增资料（按记录时间排序）\n${updateText(c,latestUpdates(c))}\n\n三、新检验的有限解释\n${current.alerts.filter(a=>!a.text.includes('隐私核对')).map(a=>a.text).join('\n')||'暂无可自动解释的结构化新检验。'}\n\n四、鉴别诊断复评\n${diffText(current)}\n\n五、后续诊疗核对表\n${taskText(c,current)}\n\n清单状态是使用者的工作标记，不代表处置已经实施或经医师签署。\n签署栏（记录医师核签）：________`;
 const checklist=`后续诊疗核对表\n${notice}\n\n${taskText(c,current)}\n\n勾选状态仅表示使用者标记。请在正式病历及医嘱系统中记录实际执行情况。`;
 return Object.fromEntries(Object.entries({initial,round,followup,checklist}).map(([k,v])=>[k,sanitize(v,c.extraTerms).text]));
}
