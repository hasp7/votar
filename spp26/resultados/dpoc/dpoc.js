// Protótipo · Monitorização do doente com DPOC (CAT, mMRC, SGRQ, LCADL).
// Protótipo ilustrativo, gerado com IA generativa, não validado clinicamente. Só casos fictícios.
// Sem rede (CSP fechada) e sem armazenamento: os dados vivem na memória da página até se descarregar o ficheiro.
(() => {
  'use strict';
  const {lista: ESC, porId, REF} = window.ESCALAS;
  const BASE = 'https://hasp7.github.io/votar/spp26/resultados/dpoc';
  const SIS_PSEUD = BASE + '/NamingSystem/pseudonimo';
  const SIS_COD = BASE + '/CodeSystem/escalas-dpoc';
  const ETIQ_TESTE = {system: 'http://terminology.hl7.org/CodeSystem/v3-ActReason', code: 'HTEST', display: 'test health data'};
  const $ = s => document.querySelector(s);

  // ── utilitários ────────────────────────────────────────────────────────────────────────
  function el(tag, at = {}, ...filhos) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(at)) {
      if (v == null || v === false) continue;
      if (k === 'text') e.textContent = v;
      else if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const f of filhos.flat()) if (f != null && f !== false) e.append(f.nodeType ? f : String(f));
    return e;
  }
  const svgEl = (tag, at = {}) => { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k, v] of Object.entries(at)) e.setAttribute(k, v); return e; };
  const hojeISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const dataPT = iso => iso ? iso.split('-').reverse().join('/') : '';
  const num = v => v == null ? '—' : Number(v).toLocaleString('pt-PT', {maximumFractionDigits: 1});
  let tEstado = 0;
  const anunciar = txt => { const s = $('#estado'); s.textContent = ''; clearTimeout(tEstado);
    setTimeout(() => { s.textContent = txt; }, 30); tEstado = setTimeout(() => { s.textContent = ''; }, 7000); };

  // ── código pseudónimo (Crockford base32 + controlo Luhn mod 32) ─────────────────────────
  const ALF = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  function controlo(s) {
    let fator = 2, soma = 0;
    for (let i = s.length - 1; i >= 0; i--) {
      let a = fator * ALF.indexOf(s[i]); fator = fator === 2 ? 1 : 2;
      soma += Math.floor(a / 32) + (a % 32);
    }
    return ALF[(32 - (soma % 32)) % 32];
  }
  const formatar = s8 => 'DPOC-' + s8.slice(0, 4) + '-' + s8.slice(4);
  function gerarCodigo() {
    const b = new Uint8Array(7); crypto.getRandomValues(b);
    const s = Array.from(b, x => ALF[x % 32]).join('');
    return formatar(s + controlo(s));
  }
  function normalizar(txt) {
    const s = String(txt || '').toUpperCase().replace(/^DPOC/, '').replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
    if (!/^[0-9A-HJKMNP-TV-Z]{8}$/.test(s)) return null;
    return controlo(s.slice(0, 7)) === s[7] ? formatar(s) : null;
  }

  // ── estado ─────────────────────────────────────────────────────────────────────────────
  const E = {utente: null, avaliacoes: [], sujo: false, ficticio: false};
  window.addEventListener('beforeunload', ev => { if (E.sujo) { ev.preventDefault(); ev.returnValue = ''; } });

  // ── utente ─────────────────────────────────────────────────────────────────────────────
  function definirUtente(u, avs = [], ficticio = false) {
    E.utente = u; E.avaliacoes = avs.sort((a, b) => a.data.localeCompare(b.data)); E.ficticio = ficticio;
    E.sujo = false;
    $('#codigo').textContent = u.codigo;
    $('#codigo-input').value = '';
    $('#ano').value = u.ano || ''; $('#sexo').value = u.sexo || '';
    $('#utente-ativo').hidden = false;
    $('#avaliacao').hidden = false; $('#evolucao').hidden = false; $('#exportar').hidden = false;
    $('#tag-ficticio').hidden = !ficticio;
    limparFormulario();
    desenharEvolucao();
  }
  function trocarUtente(fn) {
    if (E.sujo && !confirm('Há avaliações por descarregar. Se continuar, perdem-se. Continuar?')) return;
    fn();
  }

  // ── formulário das escalas ─────────────────────────────────────────────────────────────
  function blocoDetalhes(esc) {
    const refs = el('ol', {class: 'refs'}, esc.refs.map(k => {
      const r = REF[k];
      return el('li', {}, r.txt + ' ',
        r.doi ? el('a', {href: r.doiUrl, rel: 'noopener', target: '_blank'}, 'doi:' + r.doi) : null,
        r.doi && r.pmid ? ' · ' : null,
        r.pmid ? el('a', {href: r.pmidUrl, rel: 'noopener', target: '_blank'}, 'PMID ' + r.pmid) : null,
        r.url ? el('a', {href: r.url, rel: 'noopener', target: '_blank'}, 'página oficial') : null);
    }));
    return [
      el('details', {}, el('summary', {}, 'Descrição'), el('div', {},
        esc.descricao.map(p => el('p', {}, p)),
        el('p', {class: 'pequeno muted'}, el('b', {}, 'Direitos de uso. '), esc.licenca))),
      el('details', {}, el('summary', {}, 'Como usar'), el('div', {}, el('ol', {}, esc.comoUsar.map(p => el('li', {}, p))))),
      el('details', {}, el('summary', {}, 'Bibliografia (' + esc.refs.length + ')'), el('div', {}, refs,
        el('p', {class: 'pequeno muted'}, 'Referências confirmadas no PubMed (PMID e DOI) a 28/11/2026, exceto as páginas oficiais.'))),
    ];
  }
  function grupoRadios(nome, opcoes, rotulo, classe = 'seg') {
    return el('div', {class: classe, role: 'radiogroup', 'aria-label': rotulo},
      opcoes.map(o => {
        const id = nome + '-' + o.v;
        return el('span', {class: 'op'},
          el('input', {type: 'radio', name: nome, id, value: o.v}),
          el('label', {for: id}, el('b', {}, String(o.v)), o.sub ? el('span', {}, o.sub) : null));
      }));
  }
  function cartaoEscala(esc) {
    const corpo = el('div', {class: 'escala-corpo'});
    if (esc.tipo === 'unica') {
      corpo.append(el('fieldset', {class: 'unica'}, el('legend', {class: 'sr'}, esc.sigla + ': escolha um grau'),
        esc.opcoes.map(o => el('div', {class: 'linha-op'},
          el('input', {type: 'radio', name: esc.id, id: esc.id + '-' + o.v, value: o.v}),
          el('label', {for: esc.id + '-' + o.v}, el('b', {}, 'Grau ' + o.v), el('span', {}, o.txt))))));
    } else if (esc.tipo === 'itens' && esc.id === 'cat') {
      corpo.append(el('p', {class: 'pequeno muted ancoras'}, esc.ancora.join(' · ')),
        el('div', {class: 'itens'}, esc.itens.map((t, i) => el('fieldset', {class: 'item'},
          el('legend', {}, el('span', {class: 'n'}, String(i + 1)), t),
          grupoRadios('cat-' + i, esc.respostas, t)))));
    } else if (esc.tipo === 'itens' && esc.id === 'lcadl') {
      const legenda = el('ul', {class: 'legenda-lcadl pequeno'}, esc.respostas.map(r => el('li', {}, el('b', {}, String(r.v)), ' ' + r.txt)));
      corpo.append(el('div', {class: 'pequeno muted'}, 'Respostas:'), legenda);
      esc.dominios.forEach(d => {
        corpo.append(el('h4', {class: 'dom'}, d.txt, ' ', el('output', {id: 'lcadl-dom-' + d.id, class: 'subtotal'})));
        corpo.append(el('div', {class: 'itens'}, d.itens.map(i => el('fieldset', {class: 'item'},
          el('legend', {}, el('span', {class: 'n'}, String(i + 1)), esc.itens[i]),
          grupoRadios('lcadl-' + i, esc.respostas.map(r => ({v: r.v})), esc.itens[i])))));
      });
      corpo.append(el('fieldset', {class: 'item global'}, el('legend', {}, esc.global.txt, el('span', {class: 'muted'}, ' (opcional, não conta para o total)')),
        el('div', {class: 'seg largo', role: 'radiogroup', 'aria-label': esc.global.txt}, esc.global.opcoes.map((o, k) => el('span', {class: 'op'},
          el('input', {type: 'radio', name: 'lcadl-global', id: 'lcadl-global-' + k, value: o}),
          el('label', {for: 'lcadl-global-' + k}, el('span', {}, o)))))));
    } else if (esc.tipo === 'componentes') {
      corpo.append(el('div', {class: 'campos'},
        el('label', {class: 'campo'}, el('span', {}, 'Versão'),
          el('select', {id: 'sgrq-versao'}, esc.versoes.map(v => el('option', {value: v.v}, v.txt)))),
        esc.componentes.map(c => el('label', {class: 'campo'}, el('span', {}, c.txt + (c.id === 'total' ? ' *' : '')),
          el('input', {type: 'number', id: 'sgrq-' + c.id, min: 0, max: 100, step: 0.1, inputmode: 'decimal', placeholder: '0–100'})))));
    }
    const nota = esc.verificado === false ? el('p', {class: 'aviso pequeno'}, el('b', {}, 'Texto por verificar. '), esc.notaTexto) : null;
    const aviso = esc.aviso ? el('p', {class: 'pequeno muted marca'}, esc.aviso) : null;
    const ref = esc.limiares.concat(esc.mcid ? [esc.mcid] : []).map(l => el('li', {}, l.txt, ' ', el('span', {class: 'muted'}, '(' + citacao(l.ref) + ')')));
    return el('article', {class: 'cartao escala', id: 'escala-' + esc.id, 'aria-labelledby': 'tit-' + esc.id},
      el('header', {class: 'escala-cab'},
        el('div', {}, el('h3', {id: 'tit-' + esc.id}, esc.sigla, el('span', {class: 'nome'}, esc.nome)), el('p', {class: 'muted pequeno'}, esc.mede + ' · 0 a ' + esc.max + ' · ' + esc.pior + ' = pior')),
        el('output', {class: 'resultado', id: 'res-' + esc.id, 'aria-live': 'polite'}, '—')),
      nota, corpo, aviso,
      ref.length ? el('ul', {class: 'limiares pequeno'}, ref) : null,
      el('div', {class: 'bts escala-bts nao-imprimir'}, el('button', {type: 'button', class: 'bt sec pequeno', onclick: () => limparEscala(esc.id)}, 'Limpar ' + esc.sigla)),
      el('div', {class: 'det'}, blocoDetalhes(esc)));
  }
  function citacao(k) {
    const r = REF[k]; if (!r) return '';
    const m = r.txt.match(/^([^,]+?)\s[A-Z]{1,3}[,.]/); const ano = (r.txt.match(/\b(19|20)\d{2}\b/) || [''])[0];
    return k === 'gold2025' ? 'GOLD 2025' : k === 'sgul' ? 'SGUL' : (m ? m[1] : k) + ' ' + ano;
  }

  // leitura e escrita do formulário
  const radio = nome => { const r = document.querySelector('input[name="' + nome + '"]:checked'); return r ? r.value : null; };
  const inteiro = v => v == null ? null : Number(v);
  const decimal = id => { const v = $('#' + id).value.trim().replace(',', '.'); return v === '' ? null : Number(v); };
  function lerFormulario() {
    return {
      data: $('#data').value,
      cat: {itens: Array.from({length: 8}, (_, i) => inteiro(radio('cat-' + i)))},
      mmrc: {grau: inteiro(radio('mmrc'))},
      sgrq: {versao: $('#sgrq-versao').value, sintomas: decimal('sgrq-sintomas'), atividade: decimal('sgrq-atividade'), impacto: decimal('sgrq-impacto'), total: decimal('sgrq-total')},
      lcadl: {itens: Array.from({length: 15}, (_, i) => inteiro(radio('lcadl-' + i))), global: radio('lcadl-global')},
    };
  }
  function marcar(nome, v) { document.querySelectorAll('input[name="' + nome + '"]').forEach(r => { r.checked = v != null && String(v) === r.value; }); }
  function preencher(a) {
    $('#data').value = a.data || hojeISO();
    (a.cat && a.cat.itens || []).forEach((v, i) => marcar('cat-' + i, v));
    marcar('mmrc', a.mmrc ? a.mmrc.grau : null);
    const s = a.sgrq || {};
    $('#sgrq-versao').value = s.versao || 'SGRQ-C';
    ['sintomas', 'atividade', 'impacto', 'total'].forEach(k => { $('#sgrq-' + k).value = s[k] == null ? '' : s[k]; });
    (a.lcadl && a.lcadl.itens || []).forEach((v, i) => marcar('lcadl-' + i, v));
    marcar('lcadl-global', a.lcadl ? a.lcadl.global : null);
    atualizarResultados();
  }
  function limparEscala(id) {
    document.querySelectorAll('#escala-' + id + ' input[type=radio]').forEach(r => { r.checked = false; });
    document.querySelectorAll('#escala-' + id + ' input[type=number]').forEach(r => { r.value = ''; });
    atualizarResultados();
  }
  function limparFormulario() {
    ESC.forEach(e => limparEscala(e.id));
    $('#data').value = hojeISO(); $('#sgrq-versao').value = 'SGRQ-C';
    $('#guardar').textContent = 'Juntar à evolução';
  }
  function resultados(a) { return Object.fromEntries(ESC.map(e => [e.id, e.calcular(a[e.id])])); }
  function atualizarResultados() {
    const r = resultados(lerFormulario());
    ESC.forEach(e => {
      const o = $('#res-' + e.id), x = r[e.id];
      o.textContent = x ? (x.total == null ? 'Incompleto' : x.texto) : '—';
      o.classList.toggle('incompleto', !!x && x.total == null);
      o.title = x && x.total == null ? x.texto : '';
      const acima = x && x.total != null && e.limiares.some(l => x.total >= l.valor);
      o.classList.toggle('acima', !!acima);
    });
    const L = r.lcadl;
    porId.lcadl.dominios.forEach(d => {
      const max = d.itens.length * 5;
      const it = lerFormulario().lcadl.itens; const vs = d.itens.map(i => it[i]);
      $('#lcadl-dom-' + d.id).textContent = vs.every(v => v != null) ? vs.reduce((s, v) => s + v, 0) + ' / ' + max : '';
    });
    const msg = ESC.map(e => r[e.id] && r[e.id].total == null ? e.sigla + ': ' + r[e.id].texto : null).filter(Boolean);
    $('#form-msg').textContent = msg.join(' ');
    return {r, L};
  }

  function guardar() {
    const a = lerFormulario();
    if (!a.data) { anunciar('Falta a data da avaliação.'); $('#data').focus(); return; }
    if (a.data > hojeISO()) { anunciar('A data não pode ser futura.'); $('#data').focus(); return; }
    const r = resultados(a);
    const comTotal = ESC.filter(e => r[e.id] && r[e.id].total != null);
    const incompletas = ESC.filter(e => r[e.id] && r[e.id].total == null);
    if (incompletas.length) { anunciar('Complete ou limpe: ' + incompletas.map(e => e.sigla).join(', ') + '.'); document.getElementById('escala-' + incompletas[0].id).scrollIntoView({block: 'start'}); return; }
    if (!comTotal.length) { anunciar('Preencha pelo menos uma escala.'); return; }
    // só se guarda o que foi preenchido
    const limpo = {data: a.data};
    comTotal.forEach(e => { limpo[e.id] = a[e.id]; });
    const i = E.avaliacoes.findIndex(x => x.data === a.data);
    if (i >= 0 && !confirm('Já existe uma avaliação a ' + dataPT(a.data) + '. Substituir?')) return;
    if (i >= 0) E.avaliacoes.splice(i, 1, limpo); else E.avaliacoes.push(limpo);
    E.avaliacoes.sort((x, y) => x.data.localeCompare(y.data));
    E.sujo = true;
    limparFormulario(); desenharEvolucao();
    anunciar('Avaliação de ' + dataPT(a.data) + ' junta à evolução (' + comTotal.map(e => e.sigla).join(', ') + '). Descarregue o ficheiro para a guardar.');
    $('#evolucao').scrollIntoView({block: 'start'});
  }

  // ── evolução ───────────────────────────────────────────────────────────────────────────
  const SERIES = [
    {id: 'cat', rot: 'CAT', max: 40, val: r => r.cat && r.cat.total},
    {id: 'mmrc', rot: 'mMRC', max: 4, val: r => r.mmrc && r.mmrc.total},
    {id: 'sgrq', rot: 'SGRQ (total)', max: 100, val: r => r.sgrq && r.sgrq.total},
    {id: 'lcadl', rot: 'LCADL', max: 75, val: r => r.lcadl && r.lcadl.total},
  ];
  function delta(serie, atual, anterior) {
    if (atual == null || anterior == null) return null;
    const d = Math.round((atual - anterior) * 10) / 10;
    const m = porId[serie.id].mcid;
    return {d, relevante: m ? Math.abs(d) >= m.valor : false};
  }
  function desenharEvolucao() {
    const corpo = $('#tabela-evolucao tbody'); corpo.replaceChildren();
    const linhas = E.avaliacoes.map(a => ({a, r: resultados(a)}));
    $('#evolucao-vazia').hidden = linhas.length > 0;
    $('#tabela-wrap').hidden = linhas.length === 0;
    const ultimo = {};
    linhas.forEach(({a, r}) => {
      const tds = SERIES.map(s => {
        const v = s.val(r); const dl = delta(s, v, ultimo[s.id]);
        if (v != null) ultimo[s.id] = v;
        const extra = s.id === 'lcadl' && r.lcadl && r.lcadl.pct != null ? el('span', {class: 'muted pequeno pctl'}, ' (' + num(r.lcadl.pct) + '\u00A0%)') : null;
        const sg = s.id === 'sgrq' && a.sgrq ? el('span', {class: 'muted pequeno sg'}, ' ' + a.sgrq.versao) : null;
        return el('td', {class: 'num'}, v == null ? el('span', {class: 'muted'}, '—') : el('span', {}, num(v), extra, sg,
          dl ? el('span', {class: 'delta' + (dl.relevante ? ' relevante' : ''), title: dl.relevante ? 'Variação igual ou superior à diferença mínima importante' : 'Variação abaixo da diferença mínima importante'},
            ' ' + (dl.d > 0 ? '▲ +' : dl.d < 0 ? '▼ ' : '= ') + num(dl.d) + (dl.relevante ? ' ●' : '')) : null));
      });
      corpo.append(el('tr', {}, el('th', {scope: 'row'}, dataPT(a.data)), tds,
        el('td', {class: 'nao-imprimir acoes'},
          el('button', {type: 'button', class: 'lig', onclick: () => { preencher(a); $('#guardar').textContent = 'Guardar alterações'; $('#avaliacao').scrollIntoView({block: 'start'}); anunciar('Avaliação de ' + dataPT(a.data) + ' aberta para editar.'); }}, 'Editar'),
          el('button', {type: 'button', class: 'lig', onclick: () => { if (confirm('Remover a avaliação de ' + dataPT(a.data) + '?')) { E.avaliacoes = E.avaliacoes.filter(x => x !== a); E.sujo = true; desenharEvolucao(); anunciar('Avaliação removida.'); } }}, 'Remover'))));
    });
    const g = $('#graficos'); g.replaceChildren();
    if (linhas.length) SERIES.forEach(s => g.append(grafico(s, linhas)));
    $('#n-avaliacoes').textContent = linhas.length === 1 ? '1 avaliação' : linhas.length + ' avaliações';
    $('#estado-ficheiro').textContent = E.sujo ? 'Há alterações por descarregar.' : (linhas.length ? 'Sem alterações por descarregar.' : '');
    $('#estado-ficheiro').classList.toggle('pendente', E.sujo);
  }
  function grafico(s, linhas) {
    const pts = linhas.map(({a, r}) => ({d: a.data, v: s.val(r)})).filter(p => p.v != null);
    const W = 320, H = 156, m = {l: 30, r: 12, t: 18, b: 26}, pad = 20;
    const fig = el('figure', {class: 'grafico'});
    const svg = svgEl('svg', {viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': s.rot + ': ' + (pts.length ? pts.map(p => dataPT(p.d) + ' ' + num(p.v)).join('; ') : 'sem dados')});
    const x = i => m.l + pad + (pts.length < 2 ? (W - m.l - m.r - 2 * pad) / 2 : i * (W - m.l - m.r - 2 * pad) / (pts.length - 1));
    const y = v => m.t + (1 - v / s.max) * (H - m.t - m.b);
    [0, Math.round(s.max / 2), s.max].forEach(v => {
      svg.append(svgEl('line', {x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: 'eixo'}));
      const t = svgEl('text', {x: m.l - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'tick'}); t.textContent = num(v); svg.append(t);
    });
    porId[s.id].limiares.forEach(l => {
      svg.append(svgEl('line', {x1: m.l, x2: W - m.r, y1: y(l.valor), y2: y(l.valor), class: 'limiar'}));
      const t = svgEl('text', {x: W - m.r, y: y(l.valor) + 12, 'text-anchor': 'end', class: 'tick limiar-t'}); t.textContent = 'GOLD ' + l.valor; svg.append(t);
    });
    if (pts.length > 1) svg.append(svgEl('polyline', {points: pts.map((p, i) => x(i) + ',' + y(p.v)).join(' '), class: 'linha'}));
    pts.forEach((p, i) => {
      svg.append(svgEl('circle', {cx: x(i), cy: y(p.v), r: 4.5, class: 'ponto'}));
      const t = svgEl('text', {x: x(i), y: y(p.v) - 9, 'text-anchor': 'middle', class: 'val'}); t.textContent = num(p.v); svg.append(t);
      const d = svgEl('text', {x: x(i), y: H - 6, 'text-anchor': 'middle', class: 'tick'}); d.textContent = dataPT(p.d).slice(0, 5); svg.append(d);
    });
    fig.append(el('figcaption', {}, s.rot), svg);
    return fig;
  }

  // ── FHIR R4 ────────────────────────────────────────────────────────────────────────────
  const meta = () => ({tag: [ETIQ_TESTE]});
  function paraFHIR() {
    const u = E.utente, pid = 'p-' + u.codigo;
    const ref = {reference: 'Patient/' + pid};
    const entrada = r => ({fullUrl: BASE + '/fhir/' + r.resourceType + '/' + r.id, resource: r});
    const paciente = {resourceType: 'Patient', id: pid, meta: meta(), identifier: [{use: 'secondary', system: SIS_PSEUD, value: u.codigo}]};
    if (u.sexo) paciente.gender = u.sexo;
    if (u.ano) paciente.birthDate = String(u.ano);
    const entradas = [entrada(paciente)];
    for (const a of E.avaliacoes) {
      const r = resultados(a);
      for (const e of ESC) {
        const x = r[e.id]; if (!x || x.total == null) continue;
        const qid = 'qr-' + e.id + '-' + a.data, oid = 'obs-' + e.id + '-' + a.data;
        const itens = [];
        if (e.id === 'cat') a.cat.itens.forEach((v, i) => itens.push({linkId: 'cat-' + (i + 1), text: e.itens[i], answer: [{valueInteger: v}]}));
        if (e.id === 'mmrc') itens.push({linkId: 'mmrc', text: 'Grau de dispneia (0–4)', answer: [{valueInteger: a.mmrc.grau}]});
        if (e.id === 'sgrq') {
          itens.push({linkId: 'sgrq-versao', text: 'Versão', answer: [{valueString: a.sgrq.versao}]});
          e.componentes.forEach(c => { if (a.sgrq[c.id] != null) itens.push({linkId: 'sgrq-' + c.id, text: c.txt, answer: [{valueDecimal: a.sgrq[c.id]}]}); });
        }
        if (e.id === 'lcadl') {
          a.lcadl.itens.forEach((v, i) => itens.push({linkId: 'lcadl-' + (i + 1), text: e.itens[i], answer: [{valueInteger: v}]}));
          if (a.lcadl.global) itens.push({linkId: 'lcadl-global', text: e.global.txt, answer: [{valueString: a.lcadl.global}]});
        }
        entradas.push(entrada({resourceType: 'QuestionnaireResponse', id: qid, meta: meta(), questionnaire: BASE + '/Questionnaire/' + e.id,
          status: 'completed', subject: ref, authored: a.data, item: itens}));
        const obs = {resourceType: 'Observation', id: oid, meta: meta(), status: 'final',
          category: [{coding: [{system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'survey', display: 'Survey'}]}],
          code: {coding: [{system: SIS_COD, code: e.id + '-total', display: e.sigla + ' total'}], text: e.sigla + ' · ' + e.nome},
          subject: ref, effectiveDateTime: a.data, derivedFrom: [{reference: 'QuestionnaireResponse/' + qid}]};
        if (e.id === 'sgrq') {
          obs.valueQuantity = {value: x.total, unit: 'pontos'};
          obs.component = e.componentes.filter(c => c.id !== 'total' && a.sgrq[c.id] != null).map(c => ({code: {coding: [{system: SIS_COD, code: 'sgrq-' + c.id, display: 'SGRQ ' + c.txt}]}, valueQuantity: {value: a.sgrq[c.id], unit: 'pontos'}}));
          obs.note = [{text: 'Versão: ' + a.sgrq.versao + '. Pontuações calculadas na calculadora oficial da SGUL.'}];
        } else obs.valueInteger = x.total;
        if (e.id === 'lcadl') {
          obs.component = e.dominios.map(d => ({code: {coding: [{system: SIS_COD, code: 'lcadl-' + d.id, display: 'LCADL ' + d.txt}]}, valueInteger: x.dominios[d.id]}));
          if (x.pct != null) obs.component.push({code: {coding: [{system: SIS_COD, code: 'lcadl-pct', display: 'LCADL %total'}]}, valueQuantity: {value: x.pct, unit: '%', system: 'http://unitsofmeasure.org', code: '%'}});
        }
        entradas.push(entrada(obs));
      }
    }
    return {resourceType: 'Bundle', id: 'dpoc-' + u.codigo, meta: meta(), type: 'collection', timestamp: new Date().toISOString(), entry: entradas};
  }
  function deFHIR(b) {
    if (!b || b.resourceType !== 'Bundle' || !Array.isArray(b.entry)) throw new Error('O ficheiro não é um Bundle FHIR.');
    const teste = (b.meta && b.meta.tag || []).some(t => t.code === 'HTEST');
    if (!teste) throw new Error('O ficheiro não tem a etiqueta de dados de teste (HTEST). Este protótipo só abre ficheiros fictícios gerados por ele.');
    const rs = b.entry.map(e => e.resource).filter(Boolean);
    const p = rs.find(r => r.resourceType === 'Patient');
    const id = p && (p.identifier || []).find(i => i.system === SIS_PSEUD);
    const codigo = id && normalizar(id.value);
    if (!codigo) throw new Error('Não encontrei um código pseudónimo válido no ficheiro.');
    const porData = {};
    for (const q of rs.filter(r => r.resourceType === 'QuestionnaireResponse')) {
      const esc = String(q.questionnaire || '').split('/').pop(); const e = porId[esc];
      if (!e || !/^\d{4}-\d{2}-\d{2}$/.test(q.authored || '')) continue;
      const a = porData[q.authored] = porData[q.authored] || {data: q.authored};
      const val = l => { const it = (q.item || []).find(i => i.linkId === l); const an = it && it.answer && it.answer[0]; return an ? (an.valueInteger ?? an.valueDecimal ?? an.valueString ?? null) : null; };
      const int = v => Number.isInteger(v) && v >= 0 && v <= 5 ? v : null;
      if (esc === 'cat') a.cat = {itens: Array.from({length: 8}, (_, i) => int(val('cat-' + (i + 1))))};
      if (esc === 'mmrc') { const g = val('mmrc'); a.mmrc = {grau: Number.isInteger(g) && g >= 0 && g <= 4 ? g : null}; }
      if (esc === 'sgrq') a.sgrq = {versao: val('sgrq-versao') === 'SGRQ' ? 'SGRQ' : 'SGRQ-C', sintomas: val('sgrq-sintomas'), atividade: val('sgrq-atividade'), impacto: val('sgrq-impacto'), total: val('sgrq-total')};
      if (esc === 'lcadl') { const g = val('lcadl-global'); a.lcadl = {itens: Array.from({length: 15}, (_, i) => int(val('lcadl-' + (i + 1)))), global: porId.lcadl.global.opcoes.includes(g) ? g : null}; }
    }
    const ano = p.birthDate && /^\d{4}/.test(p.birthDate) ? Number(p.birthDate.slice(0, 4)) : '';
    const sexo = ['male', 'female', 'other', 'unknown'].includes(p.gender) ? p.gender : '';
    return {utente: {codigo, ano, sexo}, avaliacoes: Object.values(porData)};
  }
  function descarregar() {
    if (!E.avaliacoes.length) { anunciar('Ainda não há avaliações para descarregar.'); return; }
    lerDadosUtente();
    const txt = JSON.stringify(paraFHIR(), null, 2);
    const url = URL.createObjectURL(new Blob([txt], {type: 'application/fhir+json'}));
    const a = el('a', {href: url, download: 'dpoc_' + E.utente.codigo + '_' + hojeISO() + '.json'});
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    E.sujo = false; desenharEvolucao();
    $('#fhir-pre').textContent = txt;
    anunciar('Ficheiro descarregado. Guarde-o no local que a sua instituição aprovar para dados de teste.');
  }
  function abrirFicheiro(f) {
    if (!f) return;
    if (f.size > 2e6) { anunciar('Ficheiro demasiado grande para este protótipo.'); return; }
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const {utente, avaliacoes} = deFHIR(JSON.parse(rd.result));
        trocarUtente(() => { definirUtente(utente, avaliacoes, false); anunciar('Ficheiro aberto: ' + utente.codigo + ', ' + avaliacoes.length + ' avaliações.'); });
      } catch (e) { anunciar(e instanceof SyntaxError ? 'O ficheiro não é JSON válido.' : e.message); }
      $('#ficheiro').value = '';
    };
    rd.readAsText(f);
  }
  function lerDadosUtente() {
    if (!E.utente) return;
    const ano = Number($('#ano').value); const atual = new Date().getFullYear();
    E.utente.ano = ano >= 1900 && ano <= atual ? ano : '';
    E.utente.sexo = $('#sexo').value;
  }

  // ── caso fictício ──────────────────────────────────────────────────────────────────────
  function casoFicticio() {
    const s = 'F1CT0D1';
    const av = [
      {data: '2026-08-04', cat: {itens: [2, 2, 1, 3, 2, 1, 2, 2]}, mmrc: {grau: 2}, sgrq: {versao: 'SGRQ-C', sintomas: 58.2, atividade: 66.1, impacto: 38.4, total: 49.0}, lcadl: {itens: [1, 2, 1, 1, 0, 0, 0, 2, 1, 2, 3, 3, 1, 2, 1], global: 'Um pouco'}},
      {data: '2026-09-01', cat: {itens: [2, 3, 2, 3, 2, 2, 2, 2]}, mmrc: {grau: 2}, lcadl: {itens: [1, 2, 2, 1, 0, 0, 0, 2, 1, 3, 4, 3, 1, 2, 1], global: 'Um pouco'}},
      {data: '2026-10-06', cat: {itens: [3, 3, 3, 4, 3, 2, 3, 3]}, mmrc: {grau: 3}, sgrq: {versao: 'SGRQ-C', sintomas: 71.5, atividade: 74.8, impacto: 49.9, total: 61.2}, lcadl: {itens: [2, 3, 2, 2, 0, 0, 0, 3, 2, 3, 4, 4, 2, 3, 1], global: 'Muito'}},
      {data: '2026-11-03', cat: {itens: [2, 2, 2, 3, 2, 1, 2, 2]}, mmrc: {grau: 2}, lcadl: {itens: [1, 2, 1, 1, 0, 0, 0, 2, 1, 2, 3, 3, 1, 2, 1], global: 'Um pouco'}},
    ];
    trocarUtente(() => { definirUtente({codigo: formatar(s + controlo(s)), ano: 1954, sexo: 'male'}, av, true); anunciar('Caso fictício carregado: 4 avaliações mensais, de agosto a novembro de 2026.'); });
  }

  // ── impressão ──────────────────────────────────────────────────────────────────────────
  function imprimir() {
    if (!E.avaliacoes.length) { anunciar('Ainda não há avaliações para imprimir.'); return; }
    lerDadosUtente();
    const rel = $('#relatorio');
    const tabela = $('#tabela-evolucao').cloneNode(true); tabela.removeAttribute('id');
    tabela.querySelectorAll('.nao-imprimir').forEach(n => n.remove());
    rel.replaceChildren(
      el('p', {class: 'aviso'}, el('b', {}, 'Protótipo ilustrativo, gerado com IA generativa, não validado clinicamente. '), 'Só casos fictícios.'),
      el('h2', {}, 'Monitorização DPOC · ' + E.utente.codigo),
      el('p', {class: 'muted'}, 'Impresso a ' + dataPT(hojeISO()) + (E.ficticio ? ' · caso fictício' : '') + (E.utente.ano ? ' · ano de nascimento ' + E.utente.ano : '')),
      tabela, $('#graficos').cloneNode(true),
      el('p', {class: 'pequeno muted'}, '● variação igual ou superior à diferença mínima importante: CAT 2 (Kon 2014), SGRQ 4 (Jones 2005), LCADL 3 (Gulart 2020). Linhas tracejadas: limiares de sintomas do GOLD (CAT 10, mMRC 2).'));
    window.print();
  }

  // ── arranque ───────────────────────────────────────────────────────────────────────────
  function iniciar() {
    $('#escalas').append(...ESC.map(cartaoEscala));
    $('#avaliacao').addEventListener('change', atualizarResultados);
    $('#avaliacao').addEventListener('input', atualizarResultados);
    $('#guardar').addEventListener('click', guardar);
    $('#limpar').addEventListener('click', () => { limparFormulario(); anunciar('Formulário limpo.'); });
    $('#gerar').addEventListener('click', () => trocarUtente(() => { definirUtente({codigo: gerarCodigo(), ano: '', sexo: ''}); anunciar('Código gerado: ' + E.utente.codigo + '. Registe a correspondência com o utente no sistema do serviço, nunca aqui.'); }));
    $('#usar-codigo').addEventListener('submit', ev => {
      ev.preventDefault();
      const c = normalizar($('#codigo-input').value);
      if (!c) { anunciar('Código inválido: confirme os caracteres (o último é de controlo).'); $('#codigo-input').focus(); return; }
      trocarUtente(() => { definirUtente({codigo: c, ano: '', sexo: ''}); anunciar('A trabalhar com ' + c + '. Para ver avaliações anteriores, abra o ficheiro deste utente.'); });
    });
    $('#ficticio').addEventListener('click', casoFicticio);
    $('#ficheiro').addEventListener('change', ev => abrirFicheiro(ev.target.files[0]));
    $('#descarregar').addEventListener('click', descarregar);
    $('#imprimir').addEventListener('click', imprimir);
    $('#ano').addEventListener('change', () => { lerDadosUtente(); if (E.avaliacoes.length) { E.sujo = true; desenharEvolucao(); } });
    $('#sexo').addEventListener('change', () => { lerDadosUtente(); if (E.avaliacoes.length) { E.sujo = true; desenharEvolucao(); } });
    $('#data').max = hojeISO();
    limparFormulario();
  }
  // exposto só para os testes automáticos
  window.DPOC = {normalizar, gerarCodigo, controlo, paraFHIR, deFHIR, estado: E};
  iniciar();
})();
