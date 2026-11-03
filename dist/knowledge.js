// Original short review prompts. No source documents or source patient examples are embedded.
export const SOURCES = [
 {id:'nhc2010',title:'病历书写基本规范 · 通用文书结构',year:'2010',url:'https://www.nhc.gov.cn/wjw/gfxwj/201002/79d42b9c8b3f47ee91000d31de116784.shtml',scope:'首次病程与上级查房内容框架；去标识草稿仍须按机构要求补全并签署'},
 {id:'ada2026',title:'ADA · 住院糖尿病管理',year:'2026',url:'https://doi.org/10.2337/dc26-S016',scope:'住院血糖监测、风险评估与出院衔接'},
 {id:'pa2025',title:'Endocrine Society · 原发性醛固酮增多症',year:'2025',url:'https://www.endocrine.org/clinical-practice-guidelines/primary-aldosteronism-2',scope:'肾素、醛固酮及采样干扰因素'},
 {id:'giai2024',title:'ESE / Endocrine Society · 糖皮质激素相关肾上腺功能不全',year:'2024',url:'https://www.endocrine.org/clinical-practice-guidelines/glucocorticoid-induced-adrenal-insufficiency',scope:'激素暴露及停药风险评估'},
 {id:'acro2024',title:'肢端肥大症诊断与缓解共识',year:'2024',url:'https://doi.org/10.1007/s11102-023-01360-1',scope:'IGF-1、GH及临床背景的综合评价'},
 {id:'thy2016',title:'ATA · 甲亢与其他甲状腺毒症',year:'2016',url:'https://doi.org/10.1089/thy.2016.0229',scope:'甲状腺毒症的病因鉴别；非自动处方规则'},
 {id:'nodule2023',title:'ETA · 甲状腺结节管理',year:'2023',url:'https://doi.org/10.1530/ETJ-23-0067',scope:'超声风险、尺寸及细胞学的综合评价'},
 {id:'ai2016',title:'Endocrine Society · 原发性肾上腺功能不全',year:'2016',url:'https://www.endocrine.org/clinical-practice-guidelines/primary-adrenal-insufficiency',scope:'皮质醇与ACTH配对及病因评估'},
 {id:'hcm2023',title:'Endocrine Society · 恶性肿瘤相关高钙血症',year:'2022 / 2023',url:'https://www.endocrine.org/clinical-practice-guidelines/hypercalcemia',scope:'仅适用于相应恶性肿瘤背景，不代表一般高钙治疗方案'}
];
export const PROBLEMS = [
 {id:'thyrotoxicosis',title:'甲状腺毒症',summary:'功能状态与病因分开判断',sourceIds:['thy2016'],labs:/TSH|FT[34]|TT[34]|TRAb|促甲状腺|甲状腺素/i,
 differentials:[
  {title:'激素合成增多与破坏性释放',consider:'在甲状腺毒症方向成立时，讨论 Graves 病、功能自主性结节、破坏性甲状腺炎及外源性激素等可能。',discriminators:'需补充病程、用药/碘暴露、TRAb及适用的影像或摄取资料；不能凭 FT4 升高单独确定病因。'},
  {title:'检测干扰或非典型生化组合',consider:'当临床与甲状腺功能不一致时，先核对检测方法、补充剂及药物影响。',discriminators:'核对生物素等暴露、采样时点与实验室方法；不一致时由医师决定复测。'}],
 tasks:[['检查','核对 TSH、FT4 / FT3 的日期、单位、参考范围及病因证据。'],['治疗评估','结合病因、症状、心血管风险、妊娠可能及既往治疗讨论方案；具体医嘱由医师制定。'],['监测','按实际治疗安排症状、心率和相关实验室复评；如拟抗甲状腺药物，先核对相关安全性资料。']]},
 {id:'thyroid-nodule',title:'甲状腺结节',summary:'风险分层与随访信息',sourceIds:['nodule2023'],labs:/TSH|促甲状腺/i,
 differentials:[{title:'结节风险分层',consider:'结节的存在不能单独说明良恶性或功能状态。',discriminators:'结合超声分级系统、尺寸、淋巴结、TSH和既往细胞学，讨论是否符合穿刺或随访条件。'}],
 tasks:[['检查','记录超声分级名称、结节尺寸、可疑淋巴结和既往细胞学。'],['治疗评估','由医师结合风险及尺寸确定穿刺、观察或进一步处置，不依据“结节”一词自动决定。'],['随访','明确复查项目和时间，由医师填入个体化随访安排。']]},
 {id:'glucose',title:'血糖异常 / 糖尿病',summary:'分型、诱因与住院监测',sourceIds:['ada2026'],labs:/葡萄糖|血糖|HbA1c|糖化|酮体|血酮|尿酮|β[-－]?羟丁酸|3[-－]?羟丁酸|beta-hydroxybutyrate|ketone|glucose/i,
 differentials:[{title:'既往糖尿病、应激或药物相关血糖异常',consider:'先区分既往明确诊断与本次新发现的血糖异常，再结合病程评估分型。',discriminators:'核对近期 HbA1c、进食状态、用药、急性疾病及既往记录；单次非空腹异常不自动转为确诊。'}],
 tasks:[['检查','核对既往分型、近期 HbA1c、住院前用药及肾功能。'],['监测','结合进食、治疗和低血糖风险确定床旁监测安排。'],['治疗评估','由医师制定个体化血糖目标与治疗；若有脱水、呕吐或意识变化，及时床旁评估。'],['随访','核对出院用药、监测教育及复诊安排。']]},
 {id:'aldosteronism',title:'高血压 / 原醛方向',summary:'采样条件与激素证据',sourceIds:['pa2025'],labs:/醛固酮|肾素|aldosterone|renin|血钾|potassium|^K$/i,
 differentials:[{title:'原发性醛固酮增多与其他低肾素状态',consider:'在有相关临床背景时讨论原醛；高血压或低钾本身均不足以确定病因。',discriminators:'需联合肾素、醛固酮、血钾、检测方法、采样姿势、盐摄入及药物影响；不套用统一 ARR 阈值。'}],
 tasks:[['检查','记录血压、血钾、肾素与醛固酮的单位、方法、采样条件及干扰药物。'],['治疗评估','评估是否需要进一步确证或分型；不根据单侧影像结节直接认定功能侧别。'],['监测','如调整治疗，明确血压、血钾、肾功能复查安排；药物调整由医师决策。']]},
 {id:'adrenal',title:'肾上腺功能不全方向',summary:'激素暴露与HPA轴',sourceIds:['ai2016','giai2024'],labs:/皮质醇|ACTH|cortisol|促肾上腺|血钠|sodium|^Na$/i,
 differentials:[{title:'原发性、中枢性与外源激素相关功能不全',consider:'需在临床背景下综合评价肾上腺轴，不能仅因低钠或单次皮质醇偏低确诊。',discriminators:'核对晨皮质醇与同期 ACTH、所有途径的激素暴露、剂量/疗程/停药时间、血压与电解质。'}],
 tasks:[['检查','补充皮质醇采样时点、同期 ACTH、相关药物及血压/容量资料。'],['治疗评估','是否安排动态试验或调整激素需由医师决定；不能按单次结果自动减量或停药。'],['监测','如有低血压、持续呕吐或意识变化，应立即临床评估，不等待本工具给出结论。']]},
 {id:'acromegaly',title:'GH / IGF-1 异常',summary:'生化结果与临床表型',sourceIds:['acro2024'],labs:/IGF.?1|GH|生长激素|胰岛素样生长因子/i,
 differentials:[{title:'持续 GH 过量与不一致/受干扰的生化结果',consider:'以临床表型及可靠生化证据为基础评价肢端肥大症方向；孤立结果不替代完整诊断。',discriminators:'核对年龄适配 IGF-1 上限、检测方法、相关合并症与 GH 采样条件；不一致结果需复核。'}],
 tasks:[['检查','记录 IGF-1 原值、年龄匹配正常上限、方法及 GH / OGTT 各时间点。'],['治疗评估','联合生化、垂体影像、临床症状及既往治疗讨论下一步安排。'],['监测','按实际病情核对代谢、心血管、睡眠呼吸及其他共病评估需求。']]},
 {id:'calcium',title:'高钙血症方向',summary:'复核血钙与病因线索',sourceIds:['hcm2023'],labs:/血钙|总钙|离子钙|白蛋白|PTH|甲状旁腺|calcium|^Ca$/i,
 differentials:[{title:'血钙异常的确认与病因复评',consider:'先核实异常是否可靠，并结合 PTH 及完整病史由医师开展病因鉴别。',discriminators:'核对总钙、白蛋白或离子钙、肾功能、症状与容量状态。所列高钙指南仅适用于恶性肿瘤相关背景。'}],
 tasks:[['检查','补充血钙、白蛋白或离子钙、肾功能及相关病因资料。'],['治疗评估','结合症状、异常程度及病因讨论处置，不套用恶性肿瘤高钙方案于所有患者。'],['监测','如伴神经症状、心律失常或容量异常，应立即床旁评估。']]}
];
export const BASE_TASKS = [
 {id:'base-evidence',category:'资料核对',text:'核对当前症状、生命体征、既往用药及过敏信息，补全未提供项目。',reason:'未输入的信息不能被当作正常或阴性。',sourceIds:[]},
 {id:'base-axis',category:'诊断复评',text:'按功能状态、病因、定位、并发症四个维度梳理现有证据与缺口。',reason:'来自参考资料的抽象框架；不将框架本身当作患者事实。',sourceIds:[]},
 {id:'base-review',category:'文书核签',text:'由接诊/查房医师核对记录、诊疗计划及需追踪结果。',reason:'清单完成状态仅代表使用者标记，不等同于正式医嘱执行。',sourceIds:[]}
];
