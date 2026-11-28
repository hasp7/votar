// Fonte única das escalas do protótipo DPOC (CAT, mMRC, SGRQ, LCADL).
// Regras desta fonte:
//  - Limiares e diferenças mínimas só de fontes lidas (PubMed ou documento oficial), com a referência ao lado.
//  - Texto de itens só onde o uso é livre (mMRC). CAT e LCADL entram com rótulos curtos, a aplicar com o
//    instrumento oficial; o SGRQ entra só com as pontuações por componente, calculadas na calculadora oficial.
//  - `verificado: false` marca texto de trabalho que ainda tem de ser comparado com o original.
// Protótipo ilustrativo, gerado com IA generativa, não validado clinicamente.
window.ESCALAS = (() => {
  'use strict';
  const doi = d => 'https://doi.org/' + d;
  const pm = p => 'https://pubmed.ncbi.nlm.nih.gov/' + p + '/';

  const REF = {
    jones2009: {txt: 'Jones PW, Harding G, Berry P, Wiklund I, Chen WH, Kline Leidy N. Development and first validation of the COPD Assessment Test. Eur Respir J. 2009;34(3):648-54.', doi: '10.1183/09031936.00102509', pmid: '19720809'},
    kon2014: {txt: 'Kon SSC, Canavan JL, Jones SE, et al. Minimum clinically important difference for the COPD Assessment Test: a prospective analysis. Lancet Respir Med. 2014;2(3):195-203.', doi: '10.1016/S2213-2600(14)70001-3', pmid: '24621681'},
    valerio2022: {txt: 'Pimenta Valério M, Ribeiro S, Seiça Cardoso C, et al. European Portuguese Language and Cultural Validation of the Chronic Obstructive Pulmonary Disease Assessment Test. Acta Med Port. 2022;35(10):738-42.', doi: '10.20344/amp.15343', pmid: '35593649'},
    bestall1999: {txt: 'Bestall JC, Paul EA, Garrod R, Garnham R, Jones PW, Wedzicha JA. Usefulness of the Medical Research Council (MRC) dyspnoea scale as a measure of disability in patients with chronic obstructive pulmonary disease. Thorax. 1999;54(7):581-6.', doi: '10.1136/thx.54.7.581', pmid: '10377201'},
    gold2025: {txt: 'Global Initiative for Chronic Obstructive Lung Disease (GOLD). Guia de bolso para diagnóstico, tratamento e prevenção da DPOC, edição de 2025 (tradução em português do Brasil).', url: 'https://goldcopd.org/translated-gold-pocket-guides/'},
    jones1992: {txt: 'Jones PW, Quirk FH, Baveystock CM, Littlejohns P. A self-complete measure of health status for chronic airflow limitation. The St. George\'s Respiratory Questionnaire. Am Rev Respir Dis. 1992;145(6):1321-7.', doi: '10.1164/ajrccm/145.6.1321', pmid: '1595997'},
    jones2005: {txt: 'Jones PW. St. George\'s Respiratory Questionnaire: MCID. COPD. 2005;2(1):75-9.', doi: '10.1081/copd-200050513', pmid: '17136966'},
    sgul: {txt: 'St George\'s, University of London. St George\'s Respiratory Questionnaire: manuais, calculadora e autorizações de uso.', url: 'https://www.sgul.ac.uk/research/research-operations/research-administration/st-georges-respiratory-questionnaire'},
    garrod2000: {txt: 'Garrod R, Bestall JC, Paul EA, Wedzicha JA, Jones PW. Development and validation of a standardized measure of activity of daily living in patients with severe COPD: the London Chest Activity of Daily Living scale (LCADL). Respir Med. 2000;94(6):589-96.', doi: '10.1053/rmed.2000.0786', pmid: '10921765'},
    garrod2002: {txt: 'Garrod R, Paul EA, Wedzicha JA. An evaluation of the reliability and sensitivity of the London Chest Activity of Daily Living Scale (LCADL). Respir Med. 2002;96(9):725-30.', doi: '10.1053/rmed.2002.1338', pmid: '12243319'},
    pitta2008: {txt: 'Pitta F, Probst VS, Kovelis D, et al. Validation of the Portuguese version of the London Chest Activity of Daily Living Scale (LCADL) in chronic obstructive pulmonary disease patients. Rev Port Pneumol. 2008;14(1):27-47.', pmid: '18265916'},
    carpes2008: {txt: 'Carpes MF, et al. The Brazilian Portuguese version of the London Chest Activity of Daily Living scale for use in patients with chronic obstructive pulmonary disease. J Bras Pneumol. 2008;34(3):143-51.', doi: '10.1590/s1806-37132008000300004', pmid: '18392462'},
    klijn2015: {txt: 'Klijn P, Legemaat M, Beelen A, et al. Validity, Reliability, and Responsiveness of the Dutch Version of the London Chest Activity of Daily Living Scale in Patients With Severe COPD. Medicine (Baltimore). 2015;94(49):e2191.', doi: '10.1097/MD.0000000000002191', pmid: '26656349'},
    gulart2020: {txt: 'Almeida Gulart A, de Araujo CLP, Bauer Munari A, et al. Minimal important difference for London Chest Activity of Daily Living scale in patients with chronic obstructive pulmonary disease. Physiotherapy. 2020;107:28-35.', doi: '10.1016/j.physio.2019.08.007', pmid: '32026830'},
    bisca2014: {txt: 'Bisca GW, Proença M, Salomão A, Hernandes NA, Pitta F. Minimal detectable change of the London chest activity of daily living scale in patients with COPD. J Cardiopulm Rehabil Prev. 2014;34(3):213-6.', doi: '10.1097/HCR.0000000000000047', pmid: '24531202'},
    oliveira2025: {txt: 'Oliveira IJ, et al. London Chest Activity of Daily Living: Reliability and Validity of the European Portuguese Version in Heart Failure Patients. Healthcare (Basel). 2025;13(4):377.', doi: '10.3390/healthcare13040377', pmid: '39997252'},
  };
  for (const r of Object.values(REF)) { if (r.doi) r.doiUrl = doi(r.doi); if (r.pmid) r.pmidUrl = pm(r.pmid); }

  const soma = a => a.reduce((s, v) => s + v, 0);
  const completo = a => a.every(v => Number.isInteger(v));

  // ── CAT ───────────────────────────────────────────────────────────────────────────────
  const cat = {
    id: 'cat', sigla: 'CAT', nome: 'COPD Assessment Test', tipo: 'itens',
    mede: 'Impacto da DPOC no estado de saúde', max: 40, unidade: 'pontos', pior: 'mais alto',
    respostas: [0, 1, 2, 3, 4, 5].map(v => ({v, txt: String(v)})),
    ancora: ['0 = melhor', '5 = pior'],
    // rótulos de domínio (não são o texto do questionário)
    itens: ['Tosse', 'Expetoração', 'Aperto no peito', 'Falta de ar a subir uma ladeira ou um lanço de escadas',
      'Limitação nas atividades em casa', 'Confiança para sair de casa', 'Sono', 'Energia'],
    verificado: true,
    aviso: 'O COPD Assessment Test (CAT) e o logótipo CAT são marcas do grupo de empresas GSK. © 2009 GSK. Esta página não reproduz o questionário: regista só a pontuação de cada item, dada no instrumento oficial.',
    limiares: [{valor: 10, txt: 'CAT ≥ 10: mais sintomas, na avaliação de sintomas do GOLD', ref: 'gold2025'}],
    mcid: {valor: 2, txt: 'Diferença mínima clinicamente importante: 2 pontos', ref: 'kon2014'},
    calcular(v) {
      const it = v && v.itens || [];
      if (!it.length || it.every(x => x == null)) return null;
      if (!completo(it) || it.length !== 8) return {total: null, texto: 'Faltam itens: o total só se calcula com os 8 preenchidos.'};
      const t = soma(it);
      return {total: t, texto: t + ' de 40'};
    },
    descricao: [
      'Questionário de 8 itens preenchido pelo doente. Cada item vai de 0 a 5 e o total de 0 a 40; quanto mais alto, maior o impacto da DPOC no estado de saúde.',
      'No estudo original (Jones 2009) teve consistência interna de 0,88 (alfa de Cronbach), teste-reteste de 0,8 e correlação de 0,80 com o SGRQ-C. Doentes em exacerbação pontuaram 5 unidades acima dos estáveis.',
      'O GOLD usa o CAT (ou o mMRC) para classificar os sintomas: CAT ≥ 10 conta como «mais sintomas». A classificação ABE junta-lhe a história de exacerbações, que este protótipo não avalia.',
      'Há uma versão em português europeu com validação linguística e cultural publicada (Pimenta Valério 2022, 65 doentes, Coimbra).',
    ],
    comoUsar: [
      'Entregar ao doente o questionário oficial em português europeu, antes da consulta ou na visita. O CAT é para autopreenchimento: o profissional não interpreta as perguntas por ele.',
      'Registar aqui o número (0 a 5) que o doente assinalou em cada um dos 8 itens. Se faltar algum, o total fica por calcular. Não se completa com zeros.',
      'Na comparação entre avaliações, uma variação de 2 pontos ou mais é a diferença mínima clinicamente importante descrita (Kon 2014). Uma variação menor pode ser ruído de medição.',
      'Uso clínico gratuito, nos termos da GSK: o instrumento usa-se completo e com os avisos de marca e de direitos de autor. A versão traduzida obtém-se pelo portal eProvide (Mapi Research Trust).',
    ],
    refs: ['jones2009', 'kon2014', 'valerio2022', 'gold2025'],
    licenca: 'Uso clínico gratuito, nos termos da GSK. A tradução oficial vem pelo eProvide. Aqui fica só o registo das pontuações.',
  };

  // ── mMRC ──────────────────────────────────────────────────────────────────────────────
  const mmrc = {
    id: 'mmrc', sigla: 'mMRC', nome: 'Escala de dispneia do Medical Research Council modificada', tipo: 'unica',
    mede: 'Dispneia nas atividades do dia a dia', max: 4, unidade: 'grau', pior: 'mais alto',
    // adaptação de trabalho para português europeu, a partir da tradução do guia de bolso GOLD 2025 (português do Brasil)
    opcoes: [
      {v: 0, txt: 'Só fico com falta de ar com exercício intenso.'},
      {v: 1, txt: 'Fico com falta de ar quando ando depressa em terreno plano ou quando subo uma pequena inclinação.'},
      {v: 2, txt: 'Ando mais devagar do que as pessoas da minha idade em terreno plano por causa da falta de ar, ou tenho de parar para respirar quando ando ao meu passo em terreno plano.'},
      {v: 3, txt: 'Paro para respirar depois de andar cerca de 100 metros ou ao fim de alguns minutos em terreno plano.'},
      {v: 4, txt: 'Tenho demasiada falta de ar para sair de casa, ou fico com falta de ar ao vestir-me ou ao despir-me.'},
    ],
    verificado: false,
    notaTexto: 'Texto de trabalho em português europeu, adaptado da tradução do guia de bolso GOLD 2025 (português do Brasil). Falta compará-lo com uma versão portuguesa de referência.',
    limiares: [{valor: 2, txt: 'mMRC ≥ 2: mais sintomas, na avaliação de sintomas do GOLD', ref: 'gold2025'}],
    mcid: null,
    calcular(v) {
      if (!v || !Number.isInteger(v.grau)) return null;
      return {total: v.grau, texto: 'Grau ' + v.grau};
    },
    descricao: [
      'Uma pergunta, cinco graus (0 a 4), escolhidos pelo doente: descreve a falta de ar nas atividades do dia a dia. É a versão «modificada» da escala MRC, que tinha os mesmos cinco graus numerados de 1 a 5.',
      'Em 100 doentes de reabilitação respiratória, o grau MRC associou-se à distância no teste de marcha, ao SGRQ, ao humor e às atividades instrumentais, e não ao FEV₁ (Bestall 1999). Mede incapacidade, não função pulmonar.',
      'O GOLD usa o mMRC (ou o CAT) para os sintomas: mMRC ≥ 2 conta como «mais sintomas». O mMRC só olha para a dispneia; o CAT cobre mais dimensões do impacto.',
    ],
    comoUsar: [
      'Ler os cinco graus ao doente, ou entregá-los por escrito, e pedir que escolha o que melhor descreve a sua situação. É só um grau.',
      'Registar o grau escolhido. Não há diferença mínima importante estabelecida nas fontes consultadas: mudanças de grau leem-se em contexto, com o CAT e a LCADL ao lado.',
      'Escala de uso livre. O texto aqui é uma adaptação de trabalho (ver aviso) e não substitui uma versão de referência.',
    ],
    refs: ['bestall1999', 'gold2025'],
    licenca: 'Uso livre. O texto é uma adaptação de trabalho e ainda não foi verificado contra uma versão de referência em português europeu.',
  };

  // ── SGRQ ──────────────────────────────────────────────────────────────────────────────
  const sgrq = {
    id: 'sgrq', sigla: 'SGRQ', nome: 'St George\'s Respiratory Questionnaire', tipo: 'componentes',
    mede: 'Qualidade de vida relacionada com a saúde respiratória', max: 100, unidade: 'pontos', pior: 'mais alto',
    versoes: [{v: 'SGRQ', txt: 'SGRQ (original)'}, {v: 'SGRQ-C', txt: 'SGRQ-C (para DPOC)'}],
    componentes: [{id: 'sintomas', txt: 'Sintomas'}, {id: 'atividade', txt: 'Atividade'}, {id: 'impacto', txt: 'Impacto'}, {id: 'total', txt: 'Total'}],
    verificado: true,
    aviso: 'O SGRQ é propriedade da St George\'s, University of London. Esta página não reproduz o questionário nem as ponderações: as pontuações calculam-se com a calculadora oficial e registam-se aqui.',
    limiares: [],
    mcid: {valor: 4, txt: 'Diferença mínima clinicamente importante: 4 pontos (total)', ref: 'jones2005'},
    calcular(v) {
      if (!v) return null;
      const c = ['sintomas', 'atividade', 'impacto', 'total'].map(k => v[k]);
      if (c.every(x => x == null || x === '')) return null;
      const fora = c.some(x => x != null && x !== '' && (!(x >= 0 && x <= 100)));
      if (fora) return {total: null, texto: 'Cada componente vai de 0 a 100.'};
      if (v.total == null || v.total === '') return {total: null, texto: 'Falta o total (dado pela calculadora oficial).'};
      return {total: Number(v.total), texto: Number(v.total).toLocaleString('pt-PT', {maximumFractionDigits: 1}) + ' de 100'};
    },
    descricao: [
      'Questionário de autopreenchimento sobre a saúde nas doenças com limitação crónica do fluxo aéreo. Na versão original tinha 76 itens e três componentes (Sintomas, Atividade, Impacto), mais um total. Todos vão de 0 a 100 e mais alto quer dizer pior (Jones 1992).',
      'Cada resposta tem um peso empírico próprio, por isso o total não é a soma das respostas: calcula-se com a calculadora da SGUL. O SGRQ-C é a versão reduzida para DPOC.',
      'A diferença mínima clinicamente importante, a partir de métodos de âncora e de preferência, anda à volta de 4 unidades, e o autor recomenda usá-la como valor indicativo (Jones 2005).',
    ],
    comoUsar: [
      'Aplicar o questionário oficial na versão traduzida que a SGUL disponibiliza, e calcular as pontuações com a calculadora oficial. Indicar se é o SGRQ ou o SGRQ-C, porque não se comparam diretamente.',
      'Registar aqui as quatro pontuações (0 a 100, com uma casa decimal). O total é obrigatório para entrar na evolução.',
      'É o instrumento mais longo dos quatro: para uma monitorização mensal, a equipa pode aplicá-lo com menos frequência do que o CAT e o mMRC. A cadência é decisão clínica, não do protótipo.',
      'Uso em cuidados clínicos e em estudos académicos sem taxa, com autorização da SGUL. O uso comercial é pago.',
    ],
    refs: ['jones1992', 'jones2005', 'sgul'],
    licenca: 'Gratuito em cuidados clínicos e estudos académicos, com autorização da SGUL. O uso comercial é pago. Aqui ficam só as pontuações.',
  };

  // ── LCADL ─────────────────────────────────────────────────────────────────────────────
  const dominiosLcadl = [
    {id: 'cuidado', txt: 'Cuidado pessoal', itens: [0, 1, 2, 3]},
    {id: 'domestico', txt: 'Atividades domésticas', itens: [4, 5, 6, 7, 8, 9]},
    {id: 'fisico', txt: 'Atividade física', itens: [10, 11]},
    {id: 'lazer', txt: 'Lazer', itens: [12, 13, 14]},
  ];
  const lcadl = {
    id: 'lcadl', sigla: 'LCADL', nome: 'London Chest Activity of Daily Living', tipo: 'itens',
    mede: 'Dispneia e limitação nas atividades de vida diária', max: 75, unidade: 'pontos', pior: 'mais alto',
    respostas: [
      {v: 0, txt: 'Não faria de qualquer forma'}, {v: 1, txt: 'Não fico com falta de ar'}, {v: 2, txt: 'Falta de ar moderada'},
      {v: 3, txt: 'Muita falta de ar'}, {v: 4, txt: 'Já não consigo fazer'}, {v: 5, txt: 'Outra pessoa faz por mim'},
    ],
    // rótulos curtos de trabalho para as 15 atividades (estrutura 4+6+2+3 verificada; nomes por verificar no instrumento)
    itens: ['Secar-se', 'Vestir a parte de cima do corpo', 'Calçar sapatos e meias', 'Lavar a cabeça',
      'Fazer a cama', 'Mudar os lençóis', 'Lavar janelas ou cortinas', 'Limpar o pó e arrumar', 'Lavar a loiça', 'Aspirar ou varrer',
      'Subir escadas', 'Dobrar-se',
      'Andar dentro de casa', 'Sair socialmente', 'Falar'],
    dominios: dominiosLcadl,
    global: {txt: 'Quanto é que a falta de ar afeta as suas atividades habituais do dia a dia?', opcoes: ['Muito', 'Um pouco', 'Nada']},
    verificado: false,
    notaTexto: 'A estrutura (15 atividades em 4 domínios, de 0 a 5) e o significado das respostas estão verificados. Os nomes curtos das atividades e a tradução das respostas são texto de trabalho, a comparar com o instrumento (Garrod 2000) e com a versão portuguesa.',
    limiares: [],
    mcid: {valor: 3, txt: 'Diferença mínima importante: 3 pontos no total (4 pontos no %total)', ref: 'gulart2020'},
    calcular(v) {
      const it = v && v.itens || [];
      if (!it.length || it.every(x => x == null)) return null;
      if (!completo(it) || it.length !== 15) return {total: null, texto: 'Faltam atividades: o total só se calcula com as 15 preenchidas.'};
      const t = soma(it);
      const respondidos = it.filter(x => x > 0).length;
      const pct = respondidos ? Math.round(t / (5 * respondidos) * 1000) / 10 : null;
      const dom = {};
      dominiosLcadl.forEach(d => { dom[d.id] = soma(d.itens.map(i => it[i])); });
      return {total: t, pct, dominios: dom, zeros: 15 - respondidos,
        texto: t + ' de 75' + (pct != null ? ' · ' + pct.toLocaleString('pt-PT') + '\u00A0% do total' : '')};
    },
    descricao: [
      'Escala de 15 atividades de vida diária em quatro domínios: cuidado pessoal (4), atividades domésticas (6), atividade física (2) e lazer (3). Cada atividade vai de 0 a 5 e o total de 0 a 75; mais alto quer dizer mais limitação (Garrod 2000).',
      'O 0 quer dizer «não faria de qualquer forma» e não «sem limitação», que é o 1. Por isso o total baixa quando o doente nunca faz uma atividade, o que acontece sobretudo nas atividades domésticas. Daí o %total, que deixa de fora as atividades com 0 (Carpes 2008, descrito em Klijn 2015).',
      'Consistência interna de 0,98 no estudo original. Depois de reabilitação respiratória o total desceu em média 5,9 pontos (Garrod 2002). A diferença mínima importante é de −3 pontos no total e −4 no %total (Gulart 2020), e a alteração mínima detetável cerca de 4 pontos (Bisca 2014).',
      'Versões em português: Pitta 2008 (DPOC, grupo de Londrina, publicada na Revista Portuguesa de Pneumologia) e Carpes 2008 (português do Brasil). Oliveira 2025 validou a versão em português europeu, mas em insuficiência cardíaca e não em DPOC.',
    ],
    comoUsar: [
      'Aplicar o instrumento em entrevista ou em autopreenchimento, com a versão portuguesa. Para cada atividade, o doente escolhe uma resposta de 0 a 5.',
      'Registar aqui as 15 respostas. O protótipo calcula os subtotais por domínio, o total (0–75) e o %total, que é o total a dividir pelo máximo possível das atividades respondidas com mais de 0 (5 pontos por atividade).',
      'Comparar avaliações pelo %total quando o doente tem muitas atividades com 0. Uma descida de 3 pontos no total, ou de 4 no %total, é a diferença mínima importante descrita.',
      'A pergunta global sobre a falta de ar no dia a dia é opcional e não conta para o total.',
    ],
    refs: ['garrod2000', 'garrod2002', 'pitta2008', 'carpes2008', 'klijn2015', 'gulart2020', 'bisca2014', 'oliveira2025'],
    licenca: 'Não encontrei termos de licença publicados. Os estudos de tradução pediram autorização aos autores. Aqui ficam só rótulos curtos e as respostas.',
  };

  const lista = [cat, mmrc, sgrq, lcadl];
  return {lista, porId: Object.fromEntries(lista.map(e => [e.id, e])), REF};
})();
