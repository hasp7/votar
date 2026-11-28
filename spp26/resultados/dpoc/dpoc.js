// Protótipo · Monitorização do doente com DPOC (CAT, mMRC, SGRQ, LCADL).
// Protótipo ilustrativo, gerado com IA generativa, não validado clinicamente. Só casos fictícios.
// Sem rede (CSP fechada) e sem armazenamento: os dados vivem na memória da página até se descarregar o ficheiro.
(() => {
  'use strict';
  const {lista: ESC, porId, REF} = window.ESCALAS;
  const BASE = 'https://hasp7.github.io/votar/spp26/resultados/dpoc';
  const SIS_PSEUD = BASE + '/NamingSystem/pseudonimo';
  const SIS_COD = BASE + '/CodeSystem/escalas-dpoc';
  const SCT = 'http://snomed.info/sct', SCT_INT = 'http://snomed.info/sct/900000000000207008';
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
  const plural = (n, um, varios) => n + ' ' + (n === 1 ? um : varios);

  // Estado: mensagem persistente (sem temporizador), com ação opcional («Anular»)
  function anunciar(txt, acao) {
    const caixa = $('#estado'), t = $('#estado-txt'), bt = $('#estado-acao');
    t.textContent = txt; caixa.hidden = false;
    bt.hidden = !acao; bt.onclick = null;
    if (acao) { bt.textContent = acao.rotulo; bt.onclick = () => { fecharEstado(); acao.fn(); }; }
  }
  const fecharEstado = () => { $('#estado').hidden = true; };

  // Diálogo com verbos explícitos (substitui confirm(), que só tem OK/Cancelar)
  function perguntar({titulo, texto, botoes}) {
    return new Promise(resolve => {
      const d = $('#dialogo');
      $('#dlg-titulo').textContent = titulo; $('#dlg-texto').textContent = texto;
      $('#dlg-bts').replaceChildren(...botoes.map(b => el('button', {type: 'button', class: 'bt ' + (b.estilo || 'sec'),
        onclick: () => { d.close(); resolve(b.valor); }}, b.rotulo)));
      d.onclose = () => resolve(d.returnValue === 'cancel' ? null : undefined);
      d.showModal();
      const pref = $('#dlg-bts .bt.sec'); if (pref) pref.focus();
    });
  }

  // ── código pseudónimo (Crockford base32 + controlo Luhn mod 32) ─────────────────────────
  const ALF = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  function controlo(s) {
    let fator = 2, soma = 0;
    for (let i = s.length - 1; i >= 0; i--) {
      const a = fator * ALF.indexOf(s[i]); fator = fator === 2 ? 1 : 2;
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
  const E = {utente: null, avaliacoes: [], sujo: false, alteracoes: 0, ficticio: false, editando: null};
  window.addEventListener('beforeunload', ev => { if (E.sujo) { ev.preventDefault(); ev.returnValue = ''; } });
  function marcarAlterado() { E.sujo = true; E.alteracoes++; atualizarBarra(); }

  function atualizarBarra() {
    const b = $('#barra'); if (!E.utente) { b.hidden = true; return; }
    b.hidden = false;
    $('#barra-codigo').textContent = E.utente.codigo;
    $('#barra-ficticio').hidden = !E.ficticio;
    const est = $('#barra-estado');
    est.textContent = E.sujo ? plural(E.alteracoes, 'alteração por descarregar', 'alterações por descarregar')
      : E.avaliacoes.length ? 'Sem alterações por descarregar' : 'Sem avaliações';
    est.classList.toggle('pendente', E.sujo);
    $('#barra-descarregar').disabled = !E.avaliacoes.length;
    $('#estado-ficheiro').textContent = est.textContent;
    $('#estado-ficheiro').classList.toggle('pendente', E.sujo);
  }

  // ── utente ─────────────────────────────────────────────────────────────────────────────
  function definirUtente(u, avs = [], ficticio = false) {
    E.utente = u; E.avaliacoes = avs.sort((a, b) => a.data.localeCompare(b.data)); E.ficticio = ficticio;
    E.sujo = false; E.alteracoes = 0;
    $('#codigo').textContent = u.codigo;
    $('#codigo-input').value = ''; $('#codigo-erro').textContent = ''; $('#ficheiro-erro').textContent = '';
    $('#ano').value = u.ano || ''; $('#sexo').value = u.sexo || '';
    for (const s of ['#utente-ativo', '#avaliacao', '#evolucao', '#exportar']) $(s).hidden = false;
    $('#tag-ficticio').hidden = !ficticio;
    sairEdicao(); limparFormulario();
    desenharEvolucao(); atualizarBarra();
  }
  async function trocarUtente(fn) {
    if (E.sujo) {
      const r = await perguntar({titulo: 'Há alterações por descarregar',
        texto: 'Se continuar sem descarregar o ficheiro, as avaliações registadas nesta sessão perdem-se.',
        botoes: [{rotulo: 'Cancelar', valor: null}, {rotulo: 'Continuar sem guardar', estilo: 'destrutivo', valor: 'perder'},
          {rotulo: 'Descarregar primeiro', estilo: 'prim', valor: 'guardar'}]});
      if (!r) return;
      if (r === 'guardar') descarregar();
    }
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
  function segmentos(nome, valores, rotulo, ancoras) {
    return el('div', {class: 'seg-wrap'},
      el('div', {class: 'seg', role: 'radiogroup', 'aria-label': rotulo},
        valores.map(v => el('span', {class: 'op'},
          el('input', {type: 'radio', name: nome, id: nome + '-' + v, value: v}),
          el('label', {for: nome + '-' + v}, el('b', {}, String(v)))))),
      ancoras ? el('div', {class: 'ancoras', 'aria-hidden': 'true'}, el('span', {}, ancoras[0]), el('span', {}, ancoras[1])) : null);
  }
  function itemFs(esc, i, prefixo, ancoras) {
    return el('fieldset', {class: 'item', id: 'it-' + prefixo + '-' + i},
      el('legend', {}, el('span', {class: 'n'}, String(i + 1)), esc.itens[i]),
      segmentos(prefixo + '-' + i, [0, 1, 2, 3, 4, 5], esc.itens[i], ancoras),
      esc.id === 'lcadl' ? el('p', {class: 'significado', id: 'sig-' + prefixo + '-' + i}) : null);
  }
  function cartaoEscala(esc) {
    const corpo = el('div', {class: 'escala-corpo', id: 'corpo-' + esc.id, hidden: true});
    if (esc.verificado === false) corpo.append(el('p', {class: 'nota-info pequeno'}, el('b', {}, 'Texto por verificar. '), esc.notaTexto));
    if (esc.tipo === 'unica') {
      corpo.append(el('fieldset', {class: 'unica', id: 'it-mmrc-0'}, el('legend', {class: 'sr'}, esc.sigla + ': escolha um grau'),
        esc.opcoes.map(o => el('div', {class: 'linha-op'},
          el('input', {type: 'radio', name: esc.id, id: esc.id + '-' + o.v, value: o.v}),
          el('label', {for: esc.id + '-' + o.v}, el('b', {}, 'Grau ' + o.v), el('span', {}, o.txt))))));
    } else if (esc.id === 'cat') {
      corpo.append(el('div', {class: 'itens'}, esc.itens.map((_, i) => itemFs(esc, i, 'cat', ['0 · melhor', 'pior · 5']))));
    } else if (esc.id === 'lcadl') {
      corpo.append(el('details', {class: 'legenda-det'}, el('summary', {}, 'O que quer dizer cada resposta (0 a 5)'),
        el('div', {}, el('ul', {class: 'legenda-lcadl'}, esc.respostas.map(r => el('li', {}, el('b', {}, String(r.v)), ' ' + r.txt))))));
      esc.dominios.forEach(d => {
        corpo.append(el('h4', {class: 'dom'}, d.txt, ' ', el('output', {id: 'lcadl-dom-' + d.id, class: 'subtotal'})));
        corpo.append(el('div', {class: 'itens'}, d.itens.map(i => itemFs(esc, i, 'lcadl'))));
      });
      corpo.append(el('fieldset', {class: 'item global'}, el('legend', {}, esc.global.txt, el('span', {class: 'muted'}, ' (opcional, não conta para o total)')),
        el('div', {class: 'seg largo', role: 'radiogroup', 'aria-label': esc.global.txt}, esc.global.opcoes.map((o, k) => el('span', {class: 'op'},
          el('input', {type: 'radio', name: 'lcadl-global', id: 'lcadl-global-' + k, value: o}),
          el('label', {for: 'lcadl-global-' + k}, el('span', {}, o)))))));
    } else if (esc.tipo === 'componentes') {
      corpo.append(el('div', {class: 'campos'},
        el('label', {class: 'campo'}, el('span', {}, 'Versão'),
          el('select', {id: 'sgrq-versao'}, esc.versoes.map(v => el('option', {value: v.v}, v.txt)))),
        esc.componentes.map(c => el('label', {class: 'campo'}, el('span', {}, c.txt + (c.id === 'total' ? ' (obrigatório)' : '')),
          el('input', {type: 'number', id: 'sgrq-' + c.id, min: 0, max: 100, step: 0.1, inputmode: 'decimal', placeholder: '0 a 100'})))),
        el('p', {class: 'pequeno muted'}, 'Valores da calculadora oficial da SGUL, de 0 a 100, com uma casa decimal.'));
    }
    if (esc.aviso) corpo.append(el('p', {class: 'pequeno muted marca'}, esc.aviso));
    const ref = esc.limiares.concat(esc.mcid ? [esc.mcid] : []).map(l => el('li', {}, l.txt, ' ', el('span', {class: 'muted'}, '(' + citacao(l.ref) + ')')));
    if (ref.length) corpo.append(el('ul', {class: 'limiares pequeno'}, ref));
    corpo.append(el('div', {class: 'bts escala-bts nao-imprimir'}, el('button', {type: 'button', class: 'bt sec pequeno', onclick: () => limparEscala(esc.id)}, 'Limpar ' + esc.sigla)),
      el('div', {class: 'det'}, blocoDetalhes(esc)));
    const abrir = el('button', {type: 'button', class: 'abrir', id: 'tit-' + esc.id, 'aria-expanded': 'false', 'aria-controls': 'corpo-' + esc.id, onclick: () => alternar(esc.id)},
      el('span', {class: 'sigla'}, esc.sigla), el('span', {class: 'nome'}, esc.nome), el('span', {class: 'mede'}, esc.mede + ' · 0 a ' + esc.max));
    return el('article', {class: 'cartao escala', id: 'escala-' + esc.id},
      el('header', {class: 'escala-cab'}, el('h3', {}, abrir),
        el('div', {class: 'res-col'}, el('output', {class: 'resultado', id: 'res-' + esc.id, 'aria-live': 'polite', for: 'corpo-' + esc.id}, 'Por aplicar'),
          el('span', {class: 'lim-nota', id: 'lim-' + esc.id}))),
      corpo);
  }
  function alternar(id, abrir) {
    const bt = $('#tit-' + id), corpo = $('#corpo-' + id);
    const aberto = abrir == null ? bt.getAttribute('aria-expanded') !== 'true' : abrir;
    bt.setAttribute('aria-expanded', String(aberto)); corpo.hidden = !aberto;
    $('#escala-' + id).classList.toggle('aberta', aberto);
  }
  function irPara(id) {
    alternar(id, true);
    $('#escala-' + id).scrollIntoView({block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
    $('#tit-' + id).focus({preventScroll: true});
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
    ESC.forEach(e => limparEscala(e.id, false));
    (a.cat && a.cat.itens || []).forEach((v, i) => marcar('cat-' + i, v));
    marcar('mmrc', a.mmrc ? a.mmrc.grau : null);
    const s = a.sgrq || {};
    $('#sgrq-versao').value = s.versao || 'SGRQ-C';
    ['sintomas', 'atividade', 'impacto', 'total'].forEach(k => { $('#sgrq-' + k).value = s[k] == null ? '' : s[k]; });
    (a.lcadl && a.lcadl.itens || []).forEach((v, i) => marcar('lcadl-' + i, v));
    marcar('lcadl-global', a.lcadl ? a.lcadl.global : null);
    ESC.forEach(e => alternar(e.id, !!a[e.id]));
    atualizarResultados();
  }
  function limparEscala(id, atualizar = true) {
    document.querySelectorAll('#escala-' + id + ' input[type=radio]').forEach(r => { r.checked = false; });
    document.querySelectorAll('#escala-' + id + ' input[type=number]').forEach(r => { r.value = ''; });
    document.querySelectorAll('#escala-' + id + ' .falta').forEach(f => f.classList.remove('falta'));
    if (atualizar) atualizarResultados();
  }
  function limparFormulario() {
    ESC.forEach(e => { limparEscala(e.id, false); alternar(e.id, false); });
    $('#data').value = hojeISO(); $('#sgrq-versao').value = 'SGRQ-C';
    $('#form-msg').textContent = '';
    atualizarResultados();
  }
  function resultados(a) { return Object.fromEntries(ESC.map(e => [e.id, e.calcular(a[e.id])])); }
  // estado de cada escala no formulário: vazia, parcial (n de N), inválida ou completa
  function estadoEscala(e, a, r) {
    if (e.tipo === 'itens') {
      const it = a[e.id].itens, n = it.filter(v => v != null).length;
      if (!n) return {tipo: 'vazia'};
      if (n < it.length) return {tipo: 'parcial', n, N: it.length, faltam: it.map((v, i) => v == null ? i : -1).filter(i => i >= 0)};
      return {tipo: 'completa', r};
    }
    if (e.tipo === 'unica') return a.mmrc.grau == null ? {tipo: 'vazia'} : {tipo: 'completa', r};
    const s = a.sgrq, vals = ['sintomas', 'atividade', 'impacto', 'total'].map(k => s[k]);
    if (vals.every(v => v == null)) return {tipo: 'vazia'};
    if (vals.some(v => v != null && !(v >= 0 && v <= 100))) return {tipo: 'invalida', txt: 'Valor fora de 0–100'};
    if (s.total == null) return {tipo: 'invalida', txt: 'Falta o total'};
    return {tipo: 'completa', r};
  }
  function atualizarResultados() {
    const a = lerFormulario(), r = resultados(a);
    let completas = 0, pendentes = [];
    ESC.forEach(e => {
      const st = estadoEscala(e, a, r[e.id]), o = $('#res-' + e.id), lim = $('#lim-' + e.id), nav = $('#nav-' + e.id);
      let txt = 'Por aplicar', navTxt = 'por aplicar';
      if (st.tipo === 'parcial') { txt = st.n + ' de ' + st.N + ' itens'; navTxt = st.n + '/' + st.N + ' itens'; pendentes.push(e); }
      if (st.tipo === 'invalida') { txt = st.txt; navTxt = 'a corrigir'; pendentes.push(e); }
      if (st.tipo === 'completa') { txt = r[e.id].texto; navTxt = e.id === 'mmrc' ? 'grau ' + r[e.id].total : num(r[e.id].total); completas++; }
      o.textContent = txt; nav.textContent = navTxt;
      o.className = 'resultado ' + st.tipo;
      nav.parentElement.className = 'chip ' + st.tipo;
      const acima = st.tipo === 'completa' && e.limiares.find(l => r[e.id].total >= l.valor);
      o.classList.toggle('acima', !!acima);
      lim.textContent = acima ? '≥ ' + acima.valor + ' · mais sintomas (GOLD)' : '';
      if (st.tipo === 'parcial' || st.tipo === 'completa') document.querySelectorAll('#escala-' + e.id + ' .falta').forEach(f => {
        if (f.querySelector('input:checked')) f.classList.remove('falta'); });
    });
    const it = a.lcadl.itens;
    porId.lcadl.dominios.forEach(d => {
      const vs = d.itens.map(i => it[i]);
      $('#lcadl-dom-' + d.id).textContent = vs.every(v => v != null) ? vs.reduce((s, v) => s + v, 0) + ' / ' + d.itens.length * 5 : vs.filter(v => v != null).length + ' de ' + d.itens.length;
    });
    it.forEach((v, i) => { $('#sig-lcadl-' + i).textContent = v == null ? '' : porId.lcadl.respostas[v].txt; });
    $('#resumo-form').textContent = completas || pendentes.length
      ? [completas ? plural(completas, 'escala completa', 'escalas completas') : '', pendentes.length ? plural(pendentes.length, 'por completar', 'por completar') : ''].filter(Boolean).join(' · ')
      : 'Nenhuma escala preenchida';
    if (!pendentes.length) $('#form-msg').textContent = '';
    return {r, a};
  }

  function sairEdicao() { E.editando = null; $('#modo-edicao').hidden = true; $('#guardar').textContent = 'Registar avaliação'; }
  async function guardar() {
    const {r, a} = atualizarResultados();
    if (!a.data) { $('#form-msg').textContent = 'Indique a data da avaliação.'; $('#data').focus(); return; }
    if (a.data > hojeISO()) { $('#form-msg').textContent = 'A data não pode ser posterior a hoje.'; $('#data').focus(); return; }
    // primeiro problema por resolver, escrito junto ao sítio onde está
    for (const e of ESC) {
      const st = estadoEscala(e, a, r[e.id]);
      if (st.tipo === 'parcial') {
        alternar(e.id, true);
        st.faltam.forEach(i => $('#it-' + e.id + '-' + i).classList.add('falta'));
        const nomes = st.faltam.slice(0, 3).map(i => (i + 1) + ' · ' + e.itens[i]).join(', ') + (st.faltam.length > 3 ? '…' : '');
        $('#form-msg').textContent = e.sigla + ': ' + (st.faltam.length === 1 ? 'falta o item ' : 'faltam ' + st.faltam.length + ' itens: ') + nomes + '. Complete ou use «Limpar ' + e.sigla + '».';
        const alvo = document.querySelector('#it-' + e.id + '-' + st.faltam[0] + ' input');
        alvo.closest('.item').scrollIntoView({block: 'center'}); alvo.focus({preventScroll: true});
        return;
      }
      if (st.tipo === 'invalida') {
        alternar(e.id, true);
        $('#form-msg').textContent = e.sigla + ': ' + st.txt.toLowerCase() + '. Corrija os valores ou use «Limpar ' + e.sigla + '».';
        $('#sgrq-total').focus(); return;
      }
    }
    const comTotal = ESC.filter(e => estadoEscala(e, a, r[e.id]).tipo === 'completa');
    if (!comTotal.length) { $('#form-msg').textContent = 'Preencha pelo menos uma escala antes de registar.'; return; }
    const limpo = {data: a.data};
    comTotal.forEach(e => { limpo[e.id] = a[e.id]; });
    const outra = E.avaliacoes.find(x => x.data === a.data && x.data !== E.editando);
    if (outra) {
      const ok = await perguntar({titulo: 'Já existe uma avaliação a ' + dataPT(a.data),
        texto: 'Quer substituí-la pela que acabou de preencher? A anterior deixa de constar da evolução.',
        botoes: [{rotulo: 'Cancelar', valor: false}, {rotulo: 'Substituir', estilo: 'prim', valor: true}]});
      if (!ok) return;
    }
    E.avaliacoes = E.avaliacoes.filter(x => x.data !== a.data && x.data !== E.editando);
    E.avaliacoes.push(limpo);
    E.avaliacoes.sort((x, y) => x.data.localeCompare(y.data));
    const editou = E.editando;
    sairEdicao(); marcarAlterado(); limparFormulario(); desenharEvolucao();
    anunciar((editou ? 'Avaliação de ' + dataPT(a.data) + ' atualizada' : 'Avaliação de ' + dataPT(a.data) + ' registada') + ' (' + comTotal.map(e => e.sigla).join(', ') + '). Descarregue o ficheiro para a guardar.');
    $('#evolucao').scrollIntoView({block: 'start'});
  }

  // ── evolução ───────────────────────────────────────────────────────────────────────────
  const SERIES = [
    {id: 'cat', rot: 'CAT', max: 40, val: r => r.cat && r.cat.total},
    {id: 'mmrc', rot: 'mMRC', max: 4, val: r => r.mmrc && r.mmrc.total},
    {id: 'sgrq', rot: 'SGRQ (total)', max: 100, val: r => r.sgrq && r.sgrq.total},
    {id: 'lcadl', rot: 'LCADL', max: 75, val: r => r.lcadl && r.lcadl.total},
  ];
  // variação com sentido clínico em palavras (em todas estas escalas, mais alto = pior)
  function variacao(serie, atual, anterior) {
    if (atual == null || anterior == null) return null;
    const d = Math.round((atual - anterior) * 10) / 10;
    const m = porId[serie.id].mcid;
    const relevante = m ? Math.abs(d) >= m.valor : false;
    const sentido = d > 0 ? 'pior' : d < 0 ? 'melhor' : 'igual';
    let txt;
    if (d === 0) txt = 'sem alteração';
    else if (!m) txt = sentido;
    else txt = relevante ? sentido : 'variação abaixo da diferença mínima (' + m.valor + ')';
    return {d, relevante, sentido, txt, classe: d === 0 || (m && !relevante) ? 'neutro' : sentido};
  }
  const sinal = d => (d > 0 ? '▲ +' : d < 0 ? '▼ ' : '= ') + num(d);
  function serieDados(s) {
    return E.avaliacoes.map(a => ({d: a.data, v: s.val(resultados(a)), a})).filter(p => p.v != null);
  }
  function desenharEvolucao() {
    const linhas = E.avaliacoes.map(a => ({a, r: resultados(a)}));
    $('#evolucao-vazia').hidden = linhas.length > 0;
    for (const s of ['#resumo-ultima', '#graficos', '#tabela-wrap']) $(s).hidden = linhas.length === 0;
    $('#n-avaliacoes').textContent = linhas.length ? plural(linhas.length, 'avaliação', 'avaliações') : '';
    // resumo: o último valor de cada escala
    const res = $('#resumo-ultima'); res.replaceChildren();
    SERIES.forEach(s => {
      const pts = serieDados(s); if (!pts.length) return;
      const u = pts[pts.length - 1], p = pts[pts.length - 2], v = variacao(s, u.v, p && p.v);
      const e = porId[s.id], lim = e.limiares.find(l => u.v >= l.valor);
      const extra = s.id === 'lcadl' ? resultados(u.a).lcadl.pct : null;
      res.append(el('article', {class: 'resumo ' + (v ? v.classe : 'neutro')},
        el('header', {}, el('b', {}, e.sigla), el('span', {class: 'muted'}, dataPT(u.d))),
        el('p', {class: 'valor'}, s.id === 'mmrc' ? 'Grau ' + u.v : num(u.v), el('span', {class: 'de'}, s.id === 'mmrc' ? ' de 4' : ' / ' + s.max)),
        extra != null ? el('p', {class: 'pequeno muted'}, num(extra) + ' % do total possível') : null,
        v ? el('p', {class: 'var'}, el('span', {class: 'seta', 'aria-hidden': 'true'}, sinal(v.d)), ' ', v.txt, el('span', {class: 'muted'}, ' · desde ' + dataPT(p.d)))
          : el('p', {class: 'var neutro'}, 'Primeira avaliação desta escala'),
        lim ? el('p', {class: 'chip-lim'}, '≥ ' + lim.valor + ' · mais sintomas (GOLD)') : null));
    });
    // tabela
    const corpo = $('#tabela-evolucao tbody'); corpo.replaceChildren();
    const ultimo = {};
    linhas.forEach(({a, r}) => {
      const tds = SERIES.map(s => {
        const v = s.val(r), dl = variacao(s, v, ultimo[s.id]);
        if (v != null) ultimo[s.id] = v;
        const extra = s.id === 'lcadl' && r.lcadl && r.lcadl.pct != null ? el('span', {class: 'muted pequeno pctl'}, ' (' + num(r.lcadl.pct) + ' %)') : null;
        const sg = s.id === 'sgrq' && a.sgrq ? el('span', {class: 'muted pequeno sg'}, ' ' + a.sgrq.versao) : null;
        return el('td', {class: 'num'}, v == null ? el('span', {class: 'muted', 'aria-label': 'não aplicada'}, '—') : el('span', {}, num(v), extra, sg,
          dl && dl.d !== 0 ? el('span', {class: 'delta ' + dl.classe + (dl.relevante ? ' relevante' : ''), title: dl.txt},
            ' ' + sinal(dl.d) + (dl.relevante || !porId[s.id].mcid ? ' ' + dl.sentido : '')) : null));
      });
      corpo.append(el('tr', {}, el('th', {scope: 'row'}, dataPT(a.data)), tds,
        el('td', {class: 'nao-imprimir acoes'},
          el('button', {type: 'button', class: 'lig', 'aria-label': 'Editar a avaliação de ' + dataPT(a.data), onclick: () => editar(a)}, 'Editar'),
          el('button', {type: 'button', class: 'lig', 'aria-label': 'Remover a avaliação de ' + dataPT(a.data), onclick: () => remover(a)}, 'Remover'))));
    });
    const g = $('#graficos'); g.replaceChildren();
    SERIES.forEach(s => { const pts = serieDados(s); if (pts.length) g.append(grafico(s, pts)); });
    atualizarBarra();
  }
  function editar(a) {
    preencher(a); E.editando = a.data;
    $('#modo-edicao').hidden = false; $('#modo-edicao-data').textContent = dataPT(a.data);
    $('#guardar').textContent = 'Guardar alterações';
    $('#avaliacao').scrollIntoView({block: 'start'});
    $('#data').focus({preventScroll: true});
  }
  function remover(a) {
    const antes = E.avaliacoes.slice();
    E.avaliacoes = E.avaliacoes.filter(x => x !== a);
    if (E.editando === a.data) { sairEdicao(); limparFormulario(); }
    marcarAlterado(); desenharEvolucao();
    anunciar('Avaliação de ' + dataPT(a.data) + ' removida.', {rotulo: 'Anular', fn: () => { E.avaliacoes = antes; marcarAlterado(); desenharEvolucao(); anunciar('Remoção anulada.'); }});
  }
  function grafico(s, pts) {
    const W = 320, H = 160, m = {l: 30, r: 12, t: 20, b: 26}, pad = 20;
    const e = porId[s.id];
    const u = pts[pts.length - 1], p = pts[pts.length - 2], v = variacao(s, u.v, p && p.v);
    const titulo = (s.id === 'mmrc' ? 'Grau ' + u.v : num(u.v)) + (v ? ' · ' + sinal(v.d) + ' ' + v.txt : '');
    const fig = el('figure', {class: 'grafico'});
    const svg = svgEl('svg', {viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': s.rot + ', de ' + dataPT(pts[0].d) + ' a ' + dataPT(u.d) + ': ' + pts.map(q => dataPT(q.d) + ' ' + num(q.v)).join('; ')});
    const x = i => m.l + pad + (pts.length < 2 ? (W - m.l - m.r - 2 * pad) / 2 : i * (W - m.l - m.r - 2 * pad) / (pts.length - 1));
    const y = val => m.t + (1 - val / s.max) * (H - m.t - m.b);
    [0, Math.round(s.max / 2), s.max].forEach(val => {
      svg.append(svgEl('line', {x1: m.l, x2: W - m.r, y1: y(val), y2: y(val), class: 'eixo'}));
      const t = svgEl('text', {x: m.l - 6, y: y(val) + 4, 'text-anchor': 'end', class: 'tick'}); t.textContent = num(val); svg.append(t);
    });
    e.limiares.forEach(l => {
      svg.append(svgEl('line', {x1: m.l, x2: W - m.r, y1: y(l.valor), y2: y(l.valor), class: 'limiar'}));
      const t = svgEl('text', {x: W - m.r, y: y(l.valor) + 13, 'text-anchor': 'end', class: 'tick limiar-t'}); t.textContent = 'GOLD ' + l.valor; svg.append(t);
    });
    if (pts.length > 1) svg.append(svgEl('polyline', {points: pts.map((q, i) => x(i) + ',' + y(q.v)).join(' '), class: 'linha'}));
    pts.forEach((q, i) => {
      svg.append(svgEl('circle', {cx: x(i), cy: y(q.v), r: i === pts.length - 1 ? 6 : 4.5, class: 'ponto' + (i === pts.length - 1 ? ' ultimo' : '')}));
      const t = svgEl('text', {x: x(i), y: y(q.v) - 10, 'text-anchor': 'middle', class: 'val'}); t.textContent = num(q.v); svg.append(t);
      const d = svgEl('text', {x: x(i), y: H - 6, 'text-anchor': 'middle', class: 'tick'}); d.textContent = dataPT(q.d).slice(0, 5); svg.append(d);
    });
    fig.append(el('figcaption', {}, el('b', {}, s.rot), el('span', {class: 'titulo-g ' + (v ? v.classe : 'neutro')}, titulo)), svg);
    return fig;
  }

  // ── FHIR R4 ────────────────────────────────────────────────────────────────────────────
  const meta = () => ({tag: [ETIQ_TESTE]});
  function codigoEscala(e) {
    const c = [];
    if (e.snomed) c.push({system: SCT, version: SCT_INT, code: e.snomed.code, display: e.snomed.display});
    c.push({system: SIS_COD, code: e.id + '-total', display: e.sigla + ' total'});
    return {coding: c, text: e.sigla + ' · ' + e.nome};
  }
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
          code: codigoEscala(e), subject: ref, effectiveDateTime: a.data, derivedFrom: [{reference: 'QuestionnaireResponse/' + qid}]};
        if (e.id === 'sgrq') {
          obs.valueQuantity = {value: x.total, unit: 'pontos'};
          obs.component = e.componentes.filter(c => c.id !== 'total' && a.sgrq[c.id] != null).map(c => ({code: {coding: [{system: SIS_COD, code: 'sgrq-' + c.id, display: 'SGRQ ' + c.txt}]}, valueQuantity: {value: a.sgrq[c.id], unit: 'pontos'}}));
          obs.note = [{text: 'Versão: ' + a.sgrq.versao + '. Pontuações calculadas na calculadora oficial da SGUL.'}];
        } else if (e.id === 'mmrc') {
          // o grau como conceito SNOMED CT (finding), mais o código local
          obs.valueCodeableConcept = {coding: [{system: SCT, version: SCT_INT, code: e.snomedGraus[x.total], display: 'Modified Medical Research Council Dyspnea Scale grade ' + x.total},
            {system: SIS_COD, code: 'mmrc-grau-' + x.total, display: 'mMRC grau ' + x.total}], text: 'Grau ' + x.total};
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
    if (!b || b.resourceType !== 'Bundle' || !Array.isArray(b.entry)) throw new Error('O ficheiro não é um Bundle FHIR. Escolha um ficheiro descarregado por este protótipo.');
    const teste = (b.meta && b.meta.tag || []).some(t => t.code === 'HTEST');
    if (!teste) throw new Error('O ficheiro não tem a etiqueta de dados de teste (HTEST). Este protótipo só abre ficheiros fictícios gerados por ele.');
    const rs = b.entry.map(e => e.resource).filter(Boolean);
    const p = rs.find(r => r.resourceType === 'Patient');
    const id = p && (p.identifier || []).find(i => i.system === SIS_PSEUD);
    const codigo = id && normalizar(id.value);
    if (!codigo) throw new Error('Não há um código pseudónimo válido no ficheiro.');
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
    E.sujo = false; E.alteracoes = 0; atualizarBarra();
    $('#fhir-pre').textContent = txt;
    anunciar('Ficheiro descarregado. Guarde-o onde a sua instituição permitir guardar dados de teste.');
  }
  function abrirFicheiro(f) {
    const erro = $('#ficheiro-erro'); erro.textContent = '';
    if (!f) return;
    if (f.size > 2e6) { erro.textContent = 'O ficheiro tem mais de 2 MB. Escolha o ficheiro do utente descarregado por este protótipo.'; return; }
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const {utente, avaliacoes} = deFHIR(JSON.parse(rd.result));
        trocarUtente(() => { definirUtente(utente, avaliacoes, false); anunciar('Ficheiro aberto: ' + utente.codigo + ', ' + plural(avaliacoes.length, 'avaliação', 'avaliações') + '.'); });
      } catch (e) { erro.textContent = e instanceof SyntaxError ? 'O ficheiro não é JSON válido. Escolha o ficheiro .json descarregado por este protótipo.' : e.message; }
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
    trocarUtente(() => {
      definirUtente({codigo: formatar(s + controlo(s)), ano: 1954, sexo: 'male'}, av, true);
      anunciar('Caso fictício aberto: 4 avaliações mensais, de agosto a novembro de 2026. Veja a evolução ou registe uma avaliação nova.');
      $('#evolucao').scrollIntoView({block: 'start'});
    });
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
      $('#resumo-ultima').cloneNode(true), tabela, $('#graficos').cloneNode(true),
      el('p', {class: 'pequeno muted'}, 'Variações: pior ou melhor quando atingem a diferença mínima importante (CAT 2, Kon 2014; SGRQ 4, Jones 2005; LCADL 3, Gulart 2020). Linhas tracejadas: limiares de sintomas do GOLD (CAT 10, mMRC 2).'));
    window.print();
  }

  // ── arranque ───────────────────────────────────────────────────────────────────────────
  function iniciar() {
    $('#escalas').append(...ESC.map(cartaoEscala));
    $('#navegador').append(...ESC.map(e => el('li', {}, el('a', {href: '#escala-' + e.id, class: 'chip vazia',
      onclick: ev => { ev.preventDefault(); irPara(e.id); }}, el('b', {}, e.sigla), el('span', {id: 'nav-' + e.id}, 'por aplicar')))));
    $('#avaliacao').addEventListener('change', atualizarResultados);
    $('#avaliacao').addEventListener('input', atualizarResultados);
    $('#guardar').addEventListener('click', guardar);
    $('#limpar').addEventListener('click', () => { const ed = E.editando; sairEdicao(); limparFormulario(); anunciar(ed ? 'Edição cancelada.' : 'Formulário limpo.'); });
    $('#cancelar-edicao').addEventListener('click', () => { sairEdicao(); limparFormulario(); anunciar('Edição cancelada: a avaliação ficou como estava.'); });
    $('#gerar').addEventListener('click', () => trocarUtente(() => { definirUtente({codigo: gerarCodigo(), ano: '', sexo: ''}); anunciar('Utente novo: ' + E.utente.codigo + '. Registe a correspondência com a pessoa no sistema do serviço, nunca aqui.'); }));
    $('#usar-codigo').addEventListener('submit', ev => {
      ev.preventDefault();
      const c = normalizar($('#codigo-input').value);
      if (!c) { $('#codigo-erro').textContent = 'Confirme o código: tem 8 caracteres depois de «DPOC» e o último é de controlo. Ex.: DPOC-7K4Q-M2ZT.'; $('#codigo-input').focus(); return; }
      trocarUtente(() => { definirUtente({codigo: c, ano: '', sexo: ''}); anunciar('A trabalhar com ' + c + '. Para ver avaliações anteriores, abra o ficheiro deste utente.'); });
    });
    $('#codigo-input').addEventListener('input', () => { $('#codigo-erro').textContent = ''; });
    $('#ficticio').addEventListener('click', casoFicticio);
    $('#ficheiro').addEventListener('change', ev => abrirFicheiro(ev.target.files[0]));
    $('#descarregar').addEventListener('click', descarregar);
    $('#barra-descarregar').addEventListener('click', descarregar);
    $('#imprimir').addEventListener('click', imprimir);
    $('#estado-fechar').addEventListener('click', fecharEstado);
    for (const s of ['#ano', '#sexo']) $(s).addEventListener('change', () => { lerDadosUtente(); if (E.avaliacoes.length) marcarAlterado(); });
    $('#data').max = hojeISO();
    limparFormulario(); atualizarBarra();
  }
  // exposto só para os testes automáticos
  window.DPOC = {normalizar, gerarCodigo, controlo, paraFHIR, deFHIR, estado: E};
  iniciar();
})();
