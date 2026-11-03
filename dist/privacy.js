// Local, advisory detection only. Never mutate clinical text or persist review data.
import { FIELD_LABELS } from './engine.js';

const MARKER = '[已移除]';
const SURNAME = '(?:欧阳|司马|上官|诸葛|夏侯|东方|皇甫|慕容|尉迟|司徒|司空|[赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗方俞任袁柳鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴宋茅庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路江童颜郭梅盛林钟徐邱骆高夏蔡田樊胡凌霍虞万支柯管卢莫房裘缪解应宗丁宣邓郁单杭洪包左石崔吉龚程邢裴陆荣翁荀羊甄封储靳段富巫乌焦巴弓牧隗谷车侯宓蓬全班仰秋仲伊宫宁仇栾甘厉戎祖武符刘景詹龙叶幸司韶黎乔苍双闻党翟谭贡劳姬申扶堵冉宰郦雍桑桂濮牛寿通边燕冀浦尚农温庄晏柴阎连习艾鱼容向古易廖耿文寇广阙东殳沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶空曾沙须丰巢关蒯相查后荆红游竺权逯盖益桓公牟佘佟岳帅缑亢况郈有琴归海晋楚闫法汝鄢涂钦商墨哈谯笪年爱阳佴第五言福])';
const NAME = `${SURNAME}\\p{Script=Han}{1,2}?`;
const NON_NAMES = /^(?:患者|家属|母亲|父亲|姐姐|哥哥|主任|医师|医生|护士|否认|自诉|诉说|无明显|未提供|目前|今日|昨日|近日|近期|临床|病情|查体|查房|建议|考虑|治疗|诊断|多饮|多尿|多汗|心悸|乏力|头痛|甲状腺|糖尿病|高血压|低血糖|精神|意识|神志|双下肢|血常规|血糖|血钙|血钾|黄疸|皮肤|体重|体温|呼吸|肢端|桥本)/u;
const HINTS = {
 name: '可能是人员姓名。核对上下文；医学术语或必要临床事实可以确认保留。',
 contact: '核对是否为联系方式、社交账号或个人链接；通常应屏蔽。',
 identifier: '可能是报告号、档案号或其他混合编号。不要屏蔽检验值、基因名或必要的临床编码。',
 identity: '可能包含具体住址、单位、出生日期或可识别的经历。保留临床必要内容，选择准确的屏蔽词。'
};

// Explicit allowlist: every user-authored string retained by exportCase is covered;
// generated IDs, fixed warnings, numeric lab results and clinical timestamps are not identity guesses.
export function privacySources(c) {
 if (!c) return [];
 const sources = [];
 const add = (id, label, text, target) => { if (typeof text === 'string' && text) sources.push({id,label,text,target}); };
 add('admission','整理后的入院原文',c.admission,'admission-input');
 for (const [key,label] of Object.entries(FIELD_LABELS)) add(`fields.${key}`,`病例事实 · ${label}`,c.fields?.[key],`fact-${key}`);
 for (const key of ['findings','opinion']) add(`round.${key}`,key==='findings'?'查房所见':'查房意见',c.round?.[key],`round-${key}`);
 for (const [i,u] of (c.updates??[]).entries()) {
  for (const [key,label] of Object.entries({subjective:'症状',objective:'客观资料',assessment:'判断',plan:'计划'})) add(`updates.${i}.${key}`,`随访 ${i+1} · ${label}`,u[key]);
  for (const [j,l] of (u.labs??[]).entries()) for (const [key,label] of Object.entries({name:'检验名',unit:'单位',context:'采样条件'})) add(`updates.${i}.labs.${j}.${key}`,`随访 ${i+1} · 检验 ${j+1} · ${label}`,l[key]);
 }
 for (const [i,t] of (c.customTasks??[]).entries()) add(`customTasks.${i}.text`,`补充事项 ${i+1}`,t.text);
 for (const [i,t] of Object.values(c.tasks??{}).entries()) add(`tasks.${i}.note`,`清单备注 ${i+1}`,t?.note);
 return sources;
}

export function locate(text,start,end) {
 const before=text.slice(0,start), lines=before.split('\n');
 return {start,end,line:lines.length,column:[...lines.at(-1)].length+1,excerpt:text.slice(Math.max(0,start-24),Math.min(text.length,end+24))};
}

export function scanText(text,maxFindings=Infinity) {
 const hits=[],seen=new Set();
 // Preserve offsets: mask known markers in the search copy with the same UTF-16 length.
 const search=text.replaceAll(MARKER,' '.repeat(MARKER.length));
 const add=(kind,start,value)=>{
  if (!value || hits.length>=maxFindings) return;
  // Search markers keep offsets but must never become invented spaces in a mask term.
  value=text.slice(start,start+value.length);
  if(value.includes(MARKER)){
   let offset=start;
   for(const part of value.split(MARKER)){
    const trimmed=part.trim();
    if(trimmed&&!/^(?:医院|实验室|单位|公司|学校)(?:工作|就职)?$/.test(trimmed)&&!/^(?:在|住在|居住于|居住在|家住|住址为?|家庭地址|现居|居所|来自|生于|出生于|出生在|就职于|任职于|工作于|在职于|就读于|供职于|任职|工作单位)[:：]?$/.test(trimmed))add(kind,offset+part.indexOf(trimmed),trimmed);
    offset+=part.length+MARKER.length;
   }
   return;
  }
  if (kind==='name' && NON_NAMES.test(value)) return;
  const end=start+value.length;
  const key=`${start}:${end}`;if(seen.has(key))return;seen.add(key);
  hits.push({kind,text:value,...locate(text,start,end),hint:HINTS[kind]});
 };
 const match=(kind,re,group=0)=>{for(const m of search.matchAll(re)){if(hits.length>=maxFindings)break;const value=m[group];const start=m.indices[group][0];add(kind,start,value);}};
 match('name',new RegExp(`(${NAME})(?=(?:主任医师|副主任医师|主治医师|医师|医生|主任|护士|教授|先生|女士|老师))`,'dgu'),1);
 match('name',new RegExp(`(?:患者|病人|其妻|其夫|丈夫|妻子|父亲|母亲|姐姐|妹妹|哥哥|弟弟|儿子|女儿|朋友|同事|其兄|其姐|其弟|其妹|其父|其母|陪同者|监护人)\\s*(${NAME})(?=由|因|于|诉|称|陪|说|患|就诊|来院|入院|提供|代述|联系|[，,。；;\\s（(]|$)`,'dgu'),1);
 match('name',new RegExp(`(?:^|[\\n，,。；;：:])\\s*(${NAME})(?=因|诉|称|陪同|就诊|入院|[，,]\\s*(?:男|女|\\d{1,3}岁))`,'dgu'),1);
 match('name',new RegExp(`(?:主任医师|副主任医师|主治医师|医师|医生|护士|教授)\\s*(${NAME})(?=查房|说|称|建议|接诊|检查|核对|[，,。；;\\s]|$)`,'dgu'),1);
 match('name',new RegExp(`(?:由|与|告知|联系)\\s*(${NAME})(?=送|陪|提供|交流|联系|[，,。；;\\s]|$)`,'dgu'),1);
 match('contact',/(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d[-\s]?\d{4}[-\s]?\d{4}(?!\d)/dg);
 match('contact',/(?<!\d)0\d{2,3}[-\s]\d{7,8}(?:[-转]\d{1,6})?(?!\d)/dg);
 match('contact',/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/dgi);
 match('contact',/(?:微信(?:号)?|微[信訊]|QQ(?:号)?|手机|座机|电邮|邮箱|联系(?:方式|电话))\s*[:：=]?\s*([A-Za-z0-9_@.+\-][A-Za-z0-9_@.+\- ]{2,60})/dgi,1);
 match('contact',/(?:https?:\/\/|www\.)[^\s，,。；;<>"']+/dgi);
 match('identifier',/(?:报告(?:编号|编码|号)|档案(?:编号|号)?|流水(?:号)?|样本(?:编号|号)|标本(?:编号|号)|检查(?:编号|号)|病案(?:编号|号)|住院(?:编号|号))\s*(?:为|是|[:：=#])?\s*([A-Za-z0-9][A-Za-z0-9_./\- ]{2,60})/dgi,1);
 for (const m of search.matchAll(/(?<![A-Za-z0-9])(?:[A-Za-z0-9]+(?:[-_/.][A-Za-z0-9]+)*)(?![A-Za-z0-9])/dg)) {
  if(hits.length>=maxFindings)break;
  const v=m[0];
  if(/^\d+(?:\.\d+)?(?:mmol|pmol|nmol|umol|mIU|IU|ng|pg|mg|g|mmHg|bpm)(?:\/(?:L|dL|mL))?$/i.test(v))continue;
  if(v.length<6||!/[A-Za-z]/.test(v)||!/[0-9]/.test(v))continue;
  // Frequent clinical tokens; ambiguous unfamiliar codes remain reviewable, never erased.
  if(/^(?:COVID-19|SARS-CoV-2|IGF-?1|HbA1c|IL-\d+|HLA-[A-Z]\d+|25-OH-D\d?|FT[34]|TSH|ACTH|MEN[12]|KCNJ\d+|CYP\d+[A-Z]\d+|p\.[A-Z]\d+[A-Z]|NM_\d+\.\d+|NC_\d+\.\d+)$/i.test(v))continue;
  add('identifier',m.index,v);
 }
 match('identifier',/(?<![\d.])\d{7,18}[Xx]?(?![\d.])/dg);
 match('identity',/(?:生于|出生于|出生在)\s*[^\n，,。；;]{2,45}/dgu);
 match('identity',/(?:住在|居住于|居住在|家住|住址(?:为)?|家庭地址|现居|居所|来自)\s*[:：]?\s*[^\n，,。；;]{2,65}/dgu);
 match('identity',/(?:就职于|任职于|工作于|在职于|就读于|供职于|任职|工作单位)\s*[:：]?\s*[^\n，,。；;]{2,65}/dgu);
 match('identity',/在[^\n，,。；;]{2,35}(?:公司|工厂|学校|大学|医院|研究所|实验室|单位)(?:[^\n，,。；;]{0,25})/dgu);
 match('identity',/(?:唯一|首位|新闻报道|媒体报道|获奖|公众人物)[^\n，,。；;]{2,45}/dgu);
 return hits.sort((a,b)=>a.start-b.start||a.end-b.end);
}

export function scanPrivacy(c,limit=250) {
 const sources=privacySources(c),findings=[];
 let total=0;
 for(const source of sources) for(const hit of scanText(source.text,limit-findings.length+1)) {
  total++;
  if(findings.length<limit)findings.push({...hit,sourceId:source.id,sourceLabel:source.label,target:source.target,id:`${source.id}:${hit.start}:${hit.end}:${hit.kind}`});
  else return {sources,findings,total,overflow:true};
 }
 return {sources,findings,total,overflow:total>limit};
}

// Acknowledgements belong to one exact in-memory snapshot, never a saved case.
export class PrivacyReview {
 constructor(){this.reset();}
 reset(){this.valid=false;this.snapshot=null;this.accepted=new Set();this.report={sources:[],findings:[],total:0,overflow:false};}
 sync(c){
  try{
   const snapshot=JSON.stringify(privacySources(c));
   if(this.valid&&snapshot===this.snapshot)return false;
   this.valid=false;this.accepted.clear();
   const report=scanPrivacy(c);
   this.report=report;this.snapshot=snapshot;this.valid=true;return true;
  }catch(error){this.reset();throw error;}
 }
 acknowledge(id,yes){if(!this.report.findings.some(f=>f.id===id))return;if(yes)this.accepted.add(id);else this.accepted.delete(id);}
 get pending(){return this.report.total-this.accepted.size;}
 get ready(){return this.valid&&!this.report.overflow&&this.pending===0;}
}
