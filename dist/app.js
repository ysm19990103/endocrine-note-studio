import { createCase, sanitize, FIELD_LABELS, validateCase, buildNotes, getGuidance, addUpdate, exportCase } from './engine.js';
import { PROBLEMS, SOURCES } from './knowledge.js';

const $ = id => document.getElementById(id);
const make = (tag, className, text) => {const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=String(text);return element;};
const NOTE_NAMES={initial:'首次病程记录',round:'上级医师查房记录',followup:'后续病程记录',checklist:'后续诊疗核对表'};
const VIEW_NAMES={workspace:['病历工作台','从入院信息，到规范病程。','整理事实、核对依据，让诊疗记录有据可循。'],followup:['检验与随访','每一次变化，都有迹可循。','补充新结果与临床判断，保留各次记录的时间边界。'],checklist:['后续诊疗表','把后续安排，逐项落实。','核对诊疗依据，跟踪待办事项与完成状态。']};
const DEMO='一般情况：女，44岁。以下为完全虚构的教学示例。\n主诉：心悸伴怕热、多汗2个月。\n现病史：2个月来出现心悸、怕热、多汗，食欲增加，体重较前下降约3 kg。尚未提供既往甲状腺功能结果，未提供相关用药和补充剂使用情况。\n既往史：否认已知糖尿病。其他既往病史待补充。\n过敏史：尚未提供。\n体格检查：心率104次/分，律齐，血压128/76 mmHg。其余查体待补充。\n辅助检查：本次FT4 28 pmol/L（参考范围12–22 pmol/L），TSH 0.02 mIU/L（参考范围0.27–4.2 mIU/L）；具体采样时间、检测方法待补充。\n初步诊断：甲状腺毒症待查。\n诊疗计划：核对甲状腺功能结果及病因资料，补充用药史、查体和相关风险评估；治疗方案待医师结合病因确定。';
let currentCase=null;
let currentNote='initial';
let currentView='workspace';
let labIndex=0;
let toastTimer;
let installPrompt=null;
let rawDirty=false;
let termsDirty=false;

function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),4600);}
function clean(value){return sanitize(String(value??''),currentCase?.extraTerms??[]).text;}
function acceptEdit(input,previous,assign,max=80000,after=()=>{}){
 try{const text=clean(input.value);if(input.value.length>max||text.length>max)throw new Error(`去标识前后均不得超过 ${max.toLocaleString('en-US')} 字符；本次编辑未应用，之前内容已保留。`);assign(text);invalidate();after();}
 catch(error){input.value=previous;safeError(error);}
}
function invalidate(){if(currentCase)currentCase.confirmed=false;$('confirm-facts').checked=false;refreshPreview();}
function textSummary(value){return typeof value==='string'?value:Array.isArray(value)?value.join('；'):value==null?'':String(value);}
function dateText(value){return String(value??'').replace('T',' ').replace(/Z$/,' UTC');}
function safeError(error){toast(error?.message||'未能完成操作，请检查输入格式。');}
function sourceLinks(ids){const box=make('div','citation-links');for(const id of ids??[]){const source=SOURCES.find(s=>s.id===id);if(!source||!/^https:\/\//.test(source.url??''))continue;const link=make('a','',`${source.title} · ${source.year}`);link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';link.referrerPolicy='no-referrer';box.append(link);}return box;}
function setView(view){currentView=view;for(const key of Object.keys(VIEW_NAMES))$(`${key}-view`).hidden=key!==view;document.querySelectorAll('[data-view]').forEach(button=>{const active=button.dataset.view===view;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});const [crumb,title,desc]=VIEW_NAMES[view];$('breadcrumb-current').textContent=crumb;$('page-title').textContent=title;$('page-description').textContent=desc;if(view==='followup')selectNote('followup');if(view==='checklist'){renderChecklist();selectNote('checklist');}if(view==='workspace'&&currentNote==='checklist')selectNote('initial');}
function selectNote(note){currentNote=note;document.querySelectorAll('[data-note]').forEach(button=>{const active=button.dataset.note===note;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;});refreshPreview();}
function canExport(){if(!currentCase||!currentCase.confirmed||rawDirty||termsDirty){toast('请先完成去标识并核查本次病例，再勾选预览下方的确认项。');return false;}const validated=validateCase(currentCase);if(!validated.ok){currentCase.confirmed=false;refreshPreview();safeError(new Error(validated.errors.join('；')));return false;}return true;}

function refreshPreview(){
 const available=!!currentCase;
 $('preview-empty').hidden=available;$('document-surface').hidden=!available;$('review-area').hidden=!available;$('guidance-panel').hidden=!available;
 $('step-review').classList.toggle('active',available);$('step-output').classList.toggle('active',!!currentCase?.confirmed&&!rawDirty&&!termsDirty);
 $('confirm-facts').checked=!!currentCase?.confirmed&&!rawDirty&&!termsDirty;
 $('confirm-facts').disabled=rawDirty||termsDirty;
 $('apply-extra-terms').disabled=!available||!$('extra-terms').value.trim()||rawDirty;
 const ready=available&&currentCase.confirmed&&!rawDirty&&!termsDirty;
 for(const id of ['copy-note','download-txt','download-html','print-note','export-case'])$(id).disabled=!ready;
 $('draft-status').textContent=!available?'待输入':rawDirty?'入院原文已修改':termsDirty?'补充去标识待应用':ready?'已核对 · 待核签':'草稿 · 待核对';
 $('draft-status').classList.toggle('ready',ready);
 $('review-hint').textContent=rawDirty?'入院原文已修改，请先重新点击“去标识并整理”。':termsDirty?'补充词表已修改，请先点击“应用补充去标识”。':'修改内容后需重新核查。';
 if(!available){$('note-preview').textContent='';return;}
 try{$('note-preview').textContent=buildNotes(currentCase)[currentNote]??'';}catch(error){$('note-preview').textContent='暂时无法生成草稿，请核对输入。';safeError(error);}
 renderGuidance();
}

function renderFacts(){
 $('fact-fields').replaceChildren();
 if(!currentCase)return;
 $('record-time').value=currentCase.recordTime??'';
 for(const [key,labelText] of Object.entries(FIELD_LABELS)){
  const label=make('label','',labelText);const area=make('textarea');area.id=`fact-${key}`;area.rows=key==='demographics'?2:3;area.maxLength=80000;area.value=currentCase.fields[key]??'';area.placeholder='未提供；可补充已核实的信息';area.addEventListener('input',()=>{acceptEdit(area,currentCase.fields[key],text=>{currentCase.fields[key]=text;},80000,()=>{if(key==='plan')renderChecklist();});});area.addEventListener('blur',()=>{area.value=currentCase.fields[key];});label.append(area);$('fact-fields').append(label);
 }
 $('sanitized-admission').textContent=currentCase.admission;
 $('redaction-count').textContent=currentCase.redactions?`已处理 ${currentCase.redactions} 处标识`:'请人工核查标识';
 $('parse-warnings').replaceChildren();for(const warning of currentCase.warnings??[])$('parse-warnings').append(make('div','warning-item',warning));
 $('problem-options').replaceChildren();
 for(const problem of PROBLEMS){const label=make('label','problem-option');const checkbox=make('input');checkbox.type='checkbox';checkbox.value=problem.id;checkbox.checked=currentCase.problems.includes(problem.id);const text=make('span','',problem.title);text.append(make('small','',problem.summary));label.append(checkbox,text);checkbox.addEventListener('change',()=>{currentCase.problems=checkbox.checked?[...new Set([...currentCase.problems,problem.id])]:currentCase.problems.filter(id=>id!==problem.id);invalidate();renderChecklist();});$('problem-options').append(label);}
 for(const key of ['time','rank','findings','opinion'])$(`round-${key}`).value=currentCase.round?.[key]??'';
}

function renderGuidance(){
 $('clinical-alerts').replaceChildren();$('differential-items').replaceChildren();
 if(!currentCase)return;
 const guidance=getGuidance(currentCase);
 for(const alert of guidance.alerts??[]){const severity=['danger','urgent','error'].includes(alert.level)?' danger':'';$('clinical-alerts').append(make('div',`clinical-alert${severity}`,alert.text));}
 if(!guidance.differentials.length){$('differential-items').append(make('div','inline-empty','在病例事实区选择本次临床问题，查看相应鉴别思路与需补充的证据。'));return;}
 for(const item of guidance.differentials){const card=make('article','differential-card');card.append(make('h3','',item.title),make('p','',textSummary(item.consider)),make('p','',textSummary(item.discriminators)));if(item.evidence)card.append(make('p','evidence',textSummary(item.evidence)));card.append(sourceLinks(item.sourceIds));$('differential-items').append(card);}
}

function renderChecklist(){
 $('checklist-items').replaceChildren();
 if(!currentCase){$('checklist-items').append(make('div','inline-empty','整理入院记录并选择临床问题后，可在此逐项核对。'));$('custom-task-form').hidden=true;$('checklist-progress').textContent='0 / 0';$('task-count').textContent='0';$('checklist-bar').style.width='0%';return;}
 $('custom-task-form').hidden=false;
 const tasks=getGuidance(currentCase).tasks;
 const completed=tasks.filter(t=>currentCase.tasks[t.id]?.done).length;
 $('checklist-progress').textContent=`${completed} / ${tasks.length}`;$('task-count').textContent=String(tasks.length-completed);$('checklist-bar').style.width=`${tasks.length?completed/tasks.length*100:0}%`;
 const categories=[...new Set(tasks.map(task=>task.category))];
 for(const category of categories){$('checklist-items').append(make('h3','checklist-category',category));for(const task of tasks.filter(task=>task.category===category)){
  const box=make('div',`checklist-item${currentCase.tasks[task.id]?.done?' checked':''}`);const check=make('input');check.type='checkbox';check.id=`task-${task.id}`;check.checked=!!currentCase.tasks[task.id]?.done;const taskContent=make('div','task-content');const label=make('label');label.htmlFor=check.id;label.append(make('span','',task.text));if(task.reason)label.append(make('small','',task.reason));taskContent.append(label);const noteLabel=make('label','task-note-label','本次安排 / 结果备注');const note=make('textarea','task-note');note.rows=2;note.maxLength=2000;note.placeholder='如复查时间、需要追踪的结果或完成情况';note.value=currentCase.tasks[task.id]?.note??'';note.autocomplete='off';note.spellcheck=false;note.addEventListener('input',()=>{acceptEdit(note,currentCase.tasks[task.id]?.note??'',text=>{currentCase.tasks[task.id]={done:!!currentCase.tasks[task.id]?.done,note:text};},2000);});note.addEventListener('blur',()=>{note.value=currentCase.tasks[task.id]?.note??'';});noteLabel.append(note);taskContent.append(noteLabel);box.append(check,taskContent);check.addEventListener('change',()=>{currentCase.tasks[task.id]={...currentCase.tasks[task.id],done:check.checked,note:currentCase.tasks[task.id]?.note??''};invalidate();renderChecklist();});
  if(category==='用户补充'){const remove=make('button','icon-button','移除');remove.type='button';remove.setAttribute('aria-label',`移除事项：${task.text}`);remove.addEventListener('click',()=>{currentCase.customTasks=currentCase.customTasks.filter(t=>t.id!==task.id);delete currentCase.tasks[task.id];invalidate();renderChecklist();});box.append(remove);}
  $('checklist-items').append(box);
 }}
}

function renderTimeline(){
 const list=$('update-timeline');list.replaceChildren();const updates=currentCase?.updates??[];
 $('update-count').textContent=String(updates.length);$('timeline-count').textContent=updates.length?`${updates.length} 次记录`:'尚无记录';
 if(!updates.length){list.append(make('div','inline-empty','新增的结果与记录将在此保留。'));return;}
 for(const [index,update] of updates.entries()){
  const article=make('article','timeline-item');const head=make('div','timeline-header');head.append(make('strong','',dateText(update.time)));const remove=make('button','text-button','移除');remove.type='button';remove.setAttribute('aria-label',`移除 ${dateText(update.time)} 的随访记录`);remove.addEventListener('click',()=>{if(!window.confirm('移除此条随访记录及所含检验？此操作仅影响当前页面。'))return;currentCase.updates=currentCase.updates.filter((_,i)=>i!==index);invalidate();renderTimeline();renderChecklist();});head.append(remove);article.append(head);
  const captions={subjective:'症状',objective:'客观资料',assessment:'判断',plan:'计划'};
  for(const [key,caption] of Object.entries(captions))if(update[key])article.append(make('p','',`${caption}：${update[key]}`));
  for(const lab of update.labs??[]){const reference=lab.low!=null||lab.high!=null?`；参考 ${lab.low??'未填'}–${lab.high??'未填'}`:'';article.append(make('div','timeline-lab',`${lab.name} ${lab.value} ${lab.unit}${reference} · 采样 ${dateText(lab.sampleTime)}`));}
  list.append(article);
 }
}

function renderCase(){
 const available=!!currentCase;$('facts-panel').hidden=!available;$('round-panel').hidden=!available;$('followup-empty').hidden=available;$('update-form').hidden=!available;
 if(!available){for(const id of ['sanitized-admission','parse-warnings','problem-options','clinical-alerts','differential-items'])$(id).replaceChildren();$('record-time').value='';for(const key of ['time','rank','findings','opinion'])$(`round-${key}`).value='';}
 renderFacts();renderChecklist();renderTimeline();refreshPreview();
}
function updateInputCount(){$('input-count').textContent=`${$('admission-input').value.length.toLocaleString('zh-CN')} 字`;}
function discardCurrent(){return !currentCase||window.confirm('继续将清除当前页面的病例、随访及勾选状态。未导出的工作将丢失，是否继续？');}
function clearCase(){if(!discardCurrent())return;currentCase=null;rawDirty=false;termsDirty=false;$('admission-input').value='';$('extra-terms').value='';$('update-form').reset();$('lab-inputs').replaceChildren();$('custom-task').value='';$('note-preview').textContent='';$('record-time').value='';for(const key of ['time','rank','findings','opinion'])$(`round-${key}`).value='';$('confirm-facts').checked=false;updateInputCount();renderCase();setView('workspace');selectNote('initial');toast('已清除当前病例。');}

function addLab(){
 if($('lab-inputs').children.length>=100){toast('每次最多添加100条检验。');return;}
 const index=++labIndex;const card=make('div','lab-card');card.dataset.lab=String(index);const head=make('div','lab-heading');head.append(make('span','',`检验项目 ${index}`));const remove=make('button','text-button','移除');remove.type='button';remove.addEventListener('click',()=>card.remove());head.append(remove);card.append(head);const grid=make('div','lab-grid');
 const fields=[['name','项目名称','text','如 TSH'],['value','数值','number','0.02'],['unit','单位','text','mIU/L'],['low','参考下限','number','可留空'],['high','参考上限','number','可留空'],['sampleTime','采样日期与时间','datetime-local',''],['context','采样条件 / 方法 / 用药','text','如晨起空腹；方法信息']];
 for(const [key,title,type,placeholder] of fields){const label=make('label',key==='sampleTime'||key==='context'?'wide-field':'',title);const input=make('input');input.type=type;input.name=key;input.placeholder=placeholder;input.dataset.labField=key;input.id=`lab-${index}-${key}`;input.maxLength=500;if(type==='number')input.step='any';if(['name','value','unit','sampleTime'].includes(key))input.required=true;if(type==='datetime-local')input.step='0.001';label.append(input);grid.append(label);}
 card.append(grid);$('lab-inputs').append(card);card.querySelector('input').focus();
}
function download(filename,type,content){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const anchor=make('a');anchor.href=url;anchor.download=filename;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fileName(extension){return `内分泌_${NOTE_NAMES[currentNote]}_${new Date().toISOString().slice(0,10)}.${extension}`;}
function noteText(){return buildNotes(currentCase)[currentNote]??'';}
function htmlDocument(text){return '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><title>'+escapeHtml(NOTE_NAMES[currentNote])+'</title><style>body{max-width:760px;margin:40px auto;padding:0 24px;color:#000;background:white}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-family:"Songti SC",SimSun,serif;font-size:15px;line-height:1.9}@media print{body{margin:0;padding:0}@page{size:A4;margin:20mm}}</style></head><body><pre>'+escapeHtml(text)+'</pre></body></html>';}

$('prepare-case').addEventListener('click',()=>{
 try{if(currentCase&&!window.confirm('重新整理将替换当前病例，清除已编辑的事实、查房意见、随访、清单勾选及备注。未导出的工作将丢失，是否继续？'))return;const terms=$('extra-terms').value.split(/[,，\n]/).map(t=>t.trim()).filter(Boolean);currentCase=createCase($('admission-input').value,terms);$('admission-input').value=currentCase.admission;$('extra-terms').value='';rawDirty=false;termsDirty=false;$('update-form').reset();$('lab-inputs').replaceChildren();$('custom-task').value='';updateInputCount();renderCase();selectNote('initial');toast('已整理为草稿，请核查各字段及去标识结果。');$('facts-panel').scrollIntoView({behavior:'smooth',block:'start'});}catch(error){safeError(error);}
});
$('load-demo').addEventListener('click',()=>{if(!discardCurrent())return;currentCase=null;rawDirty=false;termsDirty=false;$('admission-input').value=DEMO;$('extra-terms').value='';$('update-form').reset();$('lab-inputs').replaceChildren();$('custom-task').value='';updateInputCount();renderCase();selectNote('initial');toast('已载入完全虚构的示例。点击“去标识并整理”开始。');});
$('clear-case').addEventListener('click',clearCase);
$('admission-input').addEventListener('input',()=>{updateInputCount();if(currentCase){rawDirty=true;invalidate();}});
$('extra-terms').addEventListener('input',()=>{termsDirty=!!currentCase&&!!$('extra-terms').value.trim();if(currentCase)invalidate();else refreshPreview();});
$('apply-extra-terms').addEventListener('click',()=>{
 if(!currentCase)return;if(rawDirty){toast('入院原文已修改，请先重新整理，再应用补充去标识。');return;}
 const newTerms=$('extra-terms').value.split(/[,，\n]/).map(t=>t.trim()).filter(Boolean);
 if(!newTerms.length){termsDirty=false;refreshPreview();return;}
 try{
  const combined=[...new Set([...(currentCase.extraTerms??[]),...newTerms])];
  const result=validateCase({...currentCase,extraTerms:combined});
  if(!result.ok)throw new Error(result.errors.join('；'));
  currentCase=result.value;currentCase.confirmed=false;termsDirty=false;
  $('admission-input').value=currentCase.admission;$('extra-terms').value='';
  for(const id of ['update-subjective','update-objective','update-assessment','update-plan','custom-task'])$(id).value=clean($(id).value);
  for(const input of $('lab-inputs').querySelectorAll('input[type="text"]'))input.value=clean(input.value);
  updateInputCount();renderCase();toast('已应用补充去标识，随访已保留；文字改变的计划项会重置完成状态，请核查清单。');
 }catch(error){safeError(error);}
});
$('record-time').addEventListener('input',()=>{if(currentCase){currentCase.recordTime=$('record-time').value;invalidate();}});
for(const key of ['time','rank','findings','opinion'])$(`round-${key}`).addEventListener('input',event=>{if(!currentCase)return;acceptEdit(event.target,currentCase.round[key],text=>{currentCase.round[key]=text;});});
for(const key of ['findings','opinion'])$(`round-${key}`).addEventListener('blur',event=>{if(currentCase)event.target.value=currentCase.round[key];});
$('confirm-facts').addEventListener('change',()=>{if(!currentCase||rawDirty||termsDirty)return;currentCase.confirmed=$('confirm-facts').checked;refreshPreview();});
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));
document.querySelectorAll('[data-note]').forEach(button=>{button.addEventListener('click',()=>selectNote(button.dataset.note));button.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const tabs=[...document.querySelectorAll('[data-note]')];const index=tabs.indexOf(button);const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;selectNote(tabs[next].dataset.note);tabs[next].focus();});});
$('add-lab').addEventListener('click',addLab);
$('update-form').addEventListener('submit',event=>{event.preventDefault();if(!currentCase)return;if(rawDirty||termsDirty){toast('入院原文或补充去标识尚未应用，请先完成整理再补充随访。');return;}const update={time:$('update-time').value,subjective:$('update-subjective').value,objective:$('update-objective').value,assessment:$('update-assessment').value,plan:$('update-plan').value,labs:[...$('lab-inputs').children].map(card=>Object.fromEntries([...card.querySelectorAll('[data-lab-field]')].map(input=>[input.dataset.labField,input.value])))};try{currentCase=addUpdate(currentCase,update);$('update-form').reset();$('lab-inputs').replaceChildren();renderTimeline();renderChecklist();selectNote('followup');toast('已加入随访。请核对新草稿及新增结果的提示。');}catch(error){safeError(error);}});
$('custom-task-form').addEventListener('submit',event=>{event.preventDefault();if(!currentCase)return;const value=clean($('custom-task').value).trim();if(!value)return;if(value.length>2000){toast('去标识后的自定义事项超过 2,000 字符；本次未添加，输入保留。');return;}if(currentCase.customTasks.length>=100){toast('每个病例最多100条自定义事项。');return;}const id=`custom-${globalThis.crypto?.randomUUID?.()??Date.now()}`;currentCase.customTasks.push({id,text:value});$('custom-task').value='';invalidate();renderChecklist();});
$('copy-note').addEventListener('click',async()=>{if(!canExport())return;try{await navigator.clipboard.writeText(noteText());toast('已复制当前病历正文。');}catch{toast('浏览器未允许复制，请下载 TXT，或在预览内选择文字复制。');}});
$('download-txt').addEventListener('click',()=>{if(canExport()){download(fileName('txt'),'text/plain;charset=utf-8','\uFEFF'+noteText());toast('已请求下载当前文书，请在浏览器下载列表确认文件。');}});
$('download-html').addEventListener('click',()=>{if(canExport()){download(fileName('html'),'text/html;charset=utf-8',htmlDocument(noteText()));toast('已请求下载可打印文书，请在浏览器下载列表确认文件。');}});
$('print-note').addEventListener('click',()=>{if(canExport()){document.body.classList.add('printing');window.print();document.body.classList.remove('printing');}});
$('export-case').addEventListener('click',()=>{if(!canExport())return;try{const exported=exportCase(currentCase);download(`内分泌病例工作_${new Date().toISOString().slice(0,10)}.json`,'application/json;charset=utf-8',JSON.stringify(exported,null,2));toast('已保存去标识后的病例工作文件。重新导入时需再次核查。');}catch(error){safeError(error);}});
$('import-case').addEventListener('click',()=>$('import-file').click());
$('import-file').addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file)return;try{if(file.size>5*1024*1024)throw new Error('文件超过5 MB，请选择本应用导出的病例 JSON。');const parsed=JSON.parse(await file.text());const result=validateCase(parsed);if(!result.ok)throw new Error(result.errors.join('；'));if(!discardCurrent())return;currentCase=result.value;currentCase.confirmed=false;rawDirty=false;termsDirty=false;$('admission-input').value=currentCase.admission;$('extra-terms').value='';$('update-form').reset();$('lab-inputs').replaceChildren();$('custom-task').value='';updateInputCount();renderCase();setView('workspace');selectNote('initial');toast('已导入病例，请阅读字段上方的迁移提示，并重新核查去标识与事实。');}catch(error){safeError(error);}finally{event.target.value='';}});

function showSources(){if(!$('sources-dialog').open)$('sources-dialog').showModal();}
$('sources-open').addEventListener('click',showSources);$('guidance-sources').addEventListener('click',showSources);$('sources-close').addEventListener('click',()=>$('sources-dialog').close());
for(const source of SOURCES){const block=make('article','source-reference');const title=/^https:\/\//.test(source.url??'')?make('a','',source.title):make('strong','',source.title);if(title.tagName==='A'){title.href=source.url;title.target='_blank';title.rel='noopener noreferrer';title.referrerPolicy='no-referrer';}block.append(title,make('small','',`版本 / 年份：${source.year}`),make('p','',source.scope));$('source-list').append(block);}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;});
$('install-app').addEventListener('click',async()=>{if(installPrompt){await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;}else $('install-dialog').showModal();});$('install-close').addEventListener('click',()=>$('install-dialog').close());
$('mobile-install').addEventListener('click',()=>$('install-app').click());
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('click',event=>{if(event.target===dialog){const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();}});
window.addEventListener('beforeunload',event=>{if(currentCase||$('admission-input').value.trim()){event.preventDefault();event.returnValue='';}});
if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{/* The application remains usable online if caching is unavailable. */});
for(const input of document.querySelectorAll('textarea,input[type="text"]')){input.setAttribute('autocomplete','off');input.spellcheck=false;}
renderCase();selectNote('initial');updateInputCount();
