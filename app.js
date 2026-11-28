'use strict';
/* votar · página da plateia
   A sala vem do endereço (hasp7.github.io/votar/<sala>/ ou ?s=<sala>). A página pergunta ao servidor,
   a cada 3 s, que pergunta está aberta nessa sala e mostra-a. O voto vai com um código aleatório deste
   telemóvel (sem nome nem contacto); votar outra vez substitui o voto anterior. */
(() => {
  const API = 'https://tlqnhpvdzgyqwmextemq.supabase.co/rest/v1/rpc/';
  const KEY = 'sb_publishable_8DC96m7J2Oj_gCCdQt7kqg_otiM_QsE'; // chave publicável: é pública por desenho
  const BASE = '/votar/';
  const SALA_RE = /^[a-z0-9][a-z0-9-]{0,39}(\/[a-z0-9][a-z0-9-]{0,39}){0,2}$/;
  const LETRAS = 'ABCDEFGH';
  const $ = id => document.getElementById(id);
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    kids.forEach(c => { if (c != null) e.append(c); });
    return e;
  };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* modo privado: segue sem memória */ } },
  };

  function lerSala() {
    const q = new URLSearchParams(location.search).get('s');
    let p = q || location.pathname;
    if (!q) { const i = p.indexOf(BASE); p = i >= 0 ? p.slice(i + BASE.length) : ''; }
    try { p = decodeURIComponent(p); } catch (e) { return ''; }
    p = p.toLowerCase().replace(/(index|404)\.html$/, '').replace(/^\/+|\/+$/g, '');
    return SALA_RE.test(p) ? p : '';
  }

  const PID = (() => {
    const k = 'votar-pid', x = store.get(k);
    if (x && /^[A-Za-z0-9_-]{8,64}$/.test(x)) return x;
    const a = new Uint8Array(18); crypto.getRandomValues(a);
    const n = btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    store.set(k, n);
    return n;
  })();

  async function rpc(fn, body) {
    const r = await fetch(API + fn, {method: 'POST', headers: {apikey: KEY, 'Content-Type': 'application/json'},
      body: JSON.stringify(body), cache: 'no-store', credentials: 'omit'});
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  const vista = $('vista');
  const msg = t => { $('estado').textContent = t || ''; };
  const sala = lerSala();

  // ---------------------------------------------------------------- sem sala: escrever o código
  if (!sala) {
    const inp = el('input', {type: 'text', inputmode: 'text', autocapitalize: 'none', autocomplete: 'off', spellcheck: 'false',
      'aria-label': 'Código da sala', placeholder: 'ex.: spp26'});
    vista.replaceChildren(
      el('h1', {text: 'Entrar numa sala'}),
      el('p', {class: 'dica', text: 'Escreva o código que aparece no ecrã, por baixo do código QR.'}),
      el('form', {class: 'entrar', onsubmit: e => {
        e.preventDefault();
        const v = inp.value.trim().toLowerCase().replace(/^\/+|\/+$/g, '');
        if (SALA_RE.test(v)) location.href = BASE + v + '/'; else msg('Código inválido. Confirme o que está no ecrã.');
      }}, inp, el('button', {class: 'enviar', type: 'submit', text: 'Entrar'})));
    return;
  }
  $('sala').textContent = 'Sala ' + sala;

  // ---------------------------------------------------------------- tema do evento (temas/<1.º nível da sala>/)
  // tema.json: titulo, subtitulo, autor, contactos[], agradecimento, css. Tudo entra como texto, nunca como HTML.
  let TEMA = null;
  async function aplicarTema() {
    const dir = BASE + 'temas/' + sala.split('/')[0] + '/';
    let t;
    try { const r = await fetch(dir + 'tema.json', {cache: 'no-cache', credentials: 'omit'}); if (!r.ok) return; t = await r.json(); }
    catch (e) { return; }
    if (!t || typeof t !== 'object') return;
    TEMA = t;
    if (t.css) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = dir + String(t.css).replace(/[^a-z0-9._-]/gi, ''); document.head.append(l); }
    document.body.classList.add('com-tema');
    if (t.titulo) { $('titulo').textContent = t.titulo; document.title = t.titulo; }
    if (t.subtitulo) $('subtitulo').textContent = t.subtitulo;
    $('evento').hidden = !(t.titulo || t.subtitulo);
    if (t.lista) document.querySelector('.privacidade').textContent = 'As respostas são anónimas: este telemóvel tem só um código aleatório. O email da lista de espera é opcional e fica à parte.';
    if (t.agradecimento) { $('obrigado').textContent = t.agradecimento; $('obrigado').hidden = false; }
    const contactos = Array.isArray(t.contactos) ? t.contactos.map(String) : [];
    if (t.autor || contactos.length) {
      const a = $('autor'); a.replaceChildren();
      if (t.autor) a.append(el('b', {text: String(t.autor)}));
      // contactos por baixo do nome, um por linha
      contactos.forEach(c => {
        a.append(el('span', {class: 'contacto'},
          /^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(c) ? el('a', {href: 'mailto:' + c, text: c}) : document.createTextNode(c)));
      });
      $('rodape').hidden = false;
    }
  }
  const temaPronto = aplicarTema();

  // ---------------------------------------------------------------- carimbo «Wild card» e lista de espera
  const esc = x => String(x).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const CARTA = '<g transform="rotate(-10 12 16)"><rect x="1.5" y="1.5" width="21" height="29" rx="3" fill="none" stroke="currentColor" stroke-width="2.4"/>' +
    '<path d="M12 8.5l2.1 4.3 4.7.7-3.4 3.3.8 4.7-4.2-2.2-4.2 2.2.8-4.7-3.4-3.3 4.7-.7z" fill="currentColor"/></g>';
  const selo = txt => { const sp = document.createElement('span'); sp.className = 'selo';
    sp.innerHTML = '<svg viewBox="0 0 176 64" role="img" aria-label="' + esc(txt) + '"><g transform="rotate(-6 88 32)">' +
      '<rect x="3" y="5" width="170" height="54" rx="10" fill="none" stroke="currentColor" stroke-width="3"/>' +
      '<rect x="9" y="11" width="158" height="42" rx="6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="3 3"/>' +
      '<g transform="translate(18 16)">' + CARTA + '</g>' +
      '<text x="104" y="39" text-anchor="middle" font-size="18" font-weight="800" letter-spacing="2" fill="currentColor">' + esc(String(txt).toUpperCase()) + '</text></g></svg>';
    return sp; };
  const icone = () => { const sp = document.createElement('span'); sp.className = 'icone'; sp.innerHTML = '<svg viewBox="0 0 26 34" aria-hidden="true">' + CARTA + '</svg>'; return sp; };
  const kLista = 'votar-lista:' + sala;
  function cartaoLista() {
    const L = TEMA && TEMA.lista; if (!L) return null;
    const caixa = el('div', {class: 'lista'});
    const feito = () => caixa.replaceChildren(selo(L.selo || 'Wild card'), el('b', {class: 'lista-tit', text: 'Está na lista de espera.'}),
      el('p', {text: 'Vai receber o link quando o protótipo estiver pronto.'}));
    if (store.get(kLista)) { feito(); return caixa; }
    const formulario = () => {
      const inp = el('input', {type: 'email', autocomplete: 'email', inputmode: 'email', placeholder: 'nome@exemplo.pt', 'aria-label': 'Email'});
      const chk = el('input', {type: 'checkbox'});
      const bt = el('button', {class: 'enviar', type: 'button', text: 'Inscrever'});
      const msgL = el('p', {class: 'lista-msg', role: 'status'});
      const upd = () => { bt.disabled = !(chk.checked && inp.value.trim()); };
      inp.addEventListener('input', upd); chk.addEventListener('change', upd); upd();
      bt.addEventListener('click', async () => {
        bt.disabled = true; msgL.textContent = '';
        try {
          const r = await rpc('votar_lista_inscrever', {p_sala: sala, p_email: inp.value.trim(), p_aceito: chk.checked});
          if (r && r.ok) { store.set(kLista, '1'); feito(); }
          else { msgL.textContent = r && r.erro === 'email inválido' ? 'Confirme o email.' : 'Não foi possível inscrever. Tente outra vez.'; upd(); }
        } catch (e) { msgL.textContent = 'Sem ligação. Tente outra vez.'; upd(); }
      });
      caixa.replaceChildren(selo(L.selo || 'Wild card'), el('b', {class: 'lista-tit', text: L.titulo || 'Lista de espera'}),
        el('label', {class: 'campo'}, el('span', {class: 'campo-nome', text: 'Email'}), inp),
        el('label', {class: 'aceito'}, chk, el('span', {text: L.consentimento || ''})), bt, msgL);
      setTimeout(() => inp.focus(), 50);
    };
    caixa.replaceChildren(selo(L.selo || 'Wild card'), el('b', {class: 'lista-tit', text: L.titulo || 'Lista de espera'}),
      el('p', {text: L.texto || ''}), el('button', {class: 'enviar lista-bt', type: 'button', onclick: formulario}, icone(), ' ' + (L.botao || 'Entrar na lista de espera')));
    return caixa;
  }
  const posicao = q => { const p = q && q.ordem && q.total ? `Pergunta ${q.ordem} de ${q.total}` : ''; $('posicao').textContent = p; if (p) $('rodape').hidden = false; };

  // ---------------------------------------------------------------- com sala
  let ecra = '', tinhaPergunta = false, falhas = 0, timer = null, aEnviar = false;
  let aviso = null, avisoK = '';
  // aviso da sala (votar_aviso): texto curto e um link opcional, só https; fica por cima da lista de espera
  function pintarAviso() {
    vista.querySelectorAll('.aviso').forEach(x => x.remove());
    const esp = vista.querySelector('.espera');
    if (!aviso || !aviso.texto || !esp) return;
    const caixa = el('div', {class: 'aviso', role: 'status'}, el('p', {text: String(aviso.texto)}));
    if (typeof aviso.link === 'string' && /^https:\/\/[^\s<>"'`]+$/.test(aviso.link))
      caixa.append(el('a', {class: 'enviar aviso-link', href: aviso.link, target: '_blank', rel: 'noopener noreferrer',
        text: aviso.rotulo ? String(aviso.rotulo) : aviso.link.replace(/^https:\/\//, '')}));
    esp.after(caixa);
  }
  const defKey = q => [q.id, q.tipo, q.texto, JSON.stringify(q.opcoes), q.maxEscolhas, q.min, q.max, q.ordem, q.total].join('|');
  const chaveVoto = q => 'votar:' + sala + ':' + defKey(q);

  function mostrarEspera(fechada) {
    posicao(null);
    if (fechada) temaPronto.then(() => { if (ecra === 'fechada' && !vista.querySelector('.lista')) { const c = cartaoLista(); if (c) vista.append(c); } });
    document.querySelectorAll('.ajuda').forEach(x => x.remove());
    document.body.classList.remove('com-pergunta');
    vista.replaceChildren(el('p', {class: 'espera'},
      el('b', {text: fechada ? 'Votação fechada. Obrigado.' : 'Ainda não há pergunta aberta.'}),
      fechada ? 'A próxima pergunta aparece aqui sozinha.' : 'Mantenha esta página aberta: a pergunta aparece sozinha.'));
    pintarAviso();
  }

  function mostrarPergunta(q) {
    posicao(q);
    document.querySelectorAll('.ajuda').forEach(x => x.remove());
    document.body.classList.add('com-pergunta');
    const guardado = (() => { try { return JSON.parse(store.get(chaveVoto(q)) || 'null'); } catch (e) { return null; } })();
    const ok = el('p', {class: 'ok', hidden: ''});
    const botoes = [];
    let escolha = new Set(guardado || []);
    const marcar = vals => botoes.forEach(b => b.setAttribute('aria-pressed', String(vals.has(+b.dataset.v))));
    const registado = () => { ok.replaceChildren(el('b', {text: q.tipo === 'texto' ? 'Resposta enviada.' : 'Voto registado.'}), el('span', {class: 'mudar', text: 'Pode mudar até a pergunta fechar.'})); ok.hidden = false;
      if (aEnviar) ok.scrollIntoView({block: 'center', behavior: 'smooth'}); };

    async function enviar(vals, aoGravar) {
      if (aEnviar) return;
      aEnviar = true; msg('');
      try {
        const r = await rpc('votar_votar', {p_sala: sala, p_pergunta: q.id, p_pid: PID, p_resposta: vals});
        if (r && r.ok) { store.set(chaveVoto(q), JSON.stringify(vals)); if (aoGravar) aoGravar(); else registado(); }
        else if (r && r.erro === 'pergunta fechada') { msg('Esta pergunta já fechou.'); ciclo(); }
        else msg('Não foi possível registar o voto. Tente outra vez.');
      } catch (e) {
        msg('Sem ligação. Toque outra vez para tentar.');
      } finally { aEnviar = false; }
    }

    const kids = [el('h1', {text: q.texto})];
    if (q.tipo === 'texto' && TEMA && TEMA.lista) kids.unshift(selo(TEMA.lista.selo || 'Wild card'));
    let depois = null;
    if (q.tipo === 'texto') {
      // resposta aberta por partes: A. (campo 1) → Submeter A → B. (campo 2) → Submeter B; cada submissão grava logo
      const campos = q.opcoes, n = campos.length, L = 'ABC';
      let vals = campos.map((_, i) => (Array.isArray(guardado) && typeof guardado[i] === 'string') ? guardado[i] : '');
      const proximo = de => { const i = vals.findIndex((v, j) => j >= de && !v.trim()); return i < 0 ? n : i; };
      let k = proximo(0);
      kids.push(el('p', {class: 'dica', text: 'Responda em poucas palavras, uma parte de cada vez.'}));
      const cx = el('div', {class: 'partes'});
      const feito = i => el('div', {class: 'feito'}, el('span', {class: 'letra', text: L[i]}),
        el('div', {class: 'feito-txt'}, el('b', {text: campos[i]}), el('p', {text: vals[i]})),
        el('button', {class: 'alterar', type: 'button', text: 'Alterar', onclick: () => { k = i; passo(); }}));
      const passo = () => {
        ok.hidden = true;
        const antes = vals.map((v, i) => v.trim() && i !== k ? feito(i) : null).filter(Boolean);
        if (k >= n) { cx.replaceChildren(...antes); registado(); return; }
        const ta = el('textarea', {rows: '4', maxlength: '280', 'aria-label': L[k] + '. ' + campos[k]}); ta.value = vals[k];
        const conta = el('span', {class: 'conta'});
        const bt = el('button', {class: 'enviar', type: 'button', text: 'Submeter ' + L[k]});
        const upd = () => { conta.textContent = ta.value.length + '/280'; bt.disabled = !ta.value.trim(); };
        ta.addEventListener('input', upd); upd();
        bt.addEventListener('click', () => {
          const v = ta.value.trim(); if (!v) return;
          const nv = vals.slice(); nv[k] = v;
          if (!nv[0].trim()) return;
          enviar(nv, () => { vals = nv; k = proximo(k + 1); if (k >= n) k = proximo(0); passo(); });
        });
        cx.replaceChildren(...antes, el('label', {class: 'campo'},
          el('span', {class: 'campo-nome'}, el('span', {class: 'letra', text: L[k]}), ' ' + campos[k], n > 1 ? el('small', {text: ` · parte ${k + 1} de ${n}`}) : null),
          ta, conta), bt);
        if (antes.length) setTimeout(() => ta.focus(), 50);
      };
      kids.push(cx);
      depois = passo;
    } else if (q.tipo === 'ordenar') {
      // ordenar a arrastar (rato ou dedo) ou com as setas; ordem inicial baralhada em cada telemóvel (evita o viés da ordem)
      const n = q.opcoes.length;
      const baralhar = a => { const r = new Uint32Array(a.length); crypto.getRandomValues(r); for (let i = a.length - 1; i > 0; i--) { const j = r[i] % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
      let ordem = Array.isArray(guardado) && guardado.length === n ? guardado.slice() : baralhar([...Array(n).keys()]);
      const lista = el('ol', {class: 'ordenar', 'aria-label': q.texto});
      const mover = (a, b) => { if (b < 0 || b >= n || a === b) return; const x = ordem.splice(a, 1)[0]; ordem.splice(b, 0, x); desenhar(); ok.hidden = true; };
      const item = (i, p) => {
        const up = el('button', {class: 'seta', type: 'button', 'aria-label': 'Subir: ' + q.opcoes[i], text: '▲', onclick: () => mover(p, p - 1)});
        const dn = el('button', {class: 'seta', type: 'button', 'aria-label': 'Descer: ' + q.opcoes[i], text: '▼', onclick: () => mover(p, p + 1)});
        up.disabled = p === 0; dn.disabled = p === n - 1;
        const li = el('li', {class: 'ord', 'data-v': String(i)}, el('span', {class: 'pega', 'aria-hidden': 'true', text: '⋮⋮'}),
          el('span', {class: 'pos', text: (p + 1) + '.º'}), el('span', {class: 'txt', text: q.opcoes[i]}), el('span', {class: 'setas'}, up, dn));
        li.addEventListener('pointerdown', e => arrastar(e, li));
        return li;
      };
      const desenhar = () => lista.replaceChildren(...ordem.map((i, p) => item(i, p)));
      function arrastar(e, li) {
        if (e.button > 0 || e.target.closest('button')) return;
        e.preventDefault();
        const itens = [...lista.children], de = itens.indexOf(li);
        const caixas = itens.map(o => o.getBoundingClientRect()), centros = caixas.map(b => b.top + b.height / 2);
        const passo = caixas[de].height + 10, y0 = e.clientY;
        let para = de;
        try { li.setPointerCapture(e.pointerId); } catch (_) {}
        li.classList.add('a-arrastar');
        const mexe = ev => {
          const dy = ev.clientY - y0, c = centros[de] + dy;
          li.style.transform = `translateY(${dy}px)`;
          para = centros.reduce((m, x, k) => Math.abs(x - c) < Math.abs(centros[m] - c) ? k : m, 0);
          itens.forEach((o, k) => { if (o === li) return; const s = de < para && k > de && k <= para ? -passo : de > para && k < de && k >= para ? passo : 0; o.style.transform = s ? `translateY(${s}px)` : ''; });
        };
        const larga = () => {
          li.removeEventListener('pointermove', mexe); li.removeEventListener('pointerup', larga); li.removeEventListener('pointercancel', larga);
          itens.forEach(o => { o.style.transform = ''; }); li.classList.remove('a-arrastar');
          if (para !== de) mover(de, para);
        };
        li.addEventListener('pointermove', mexe); li.addEventListener('pointerup', larga); li.addEventListener('pointercancel', larga);
      }
      desenhar();
      kids.push(lista, el('button', {class: 'enviar', type: 'button', text: 'Enviar esta ordem', onclick: () => enviar(ordem.slice())}));
      // pop-up com as instruções, uma vez por pergunta
      const kAj = 'votar-ajuda:' + sala + ':' + q.id;
      if (!store.get(kAj)) {
        const fechar = () => { aj.remove(); store.set(kAj, '1'); };
        const demo = el('div', {class: 'demo', 'aria-hidden': 'true'}, el('i', {}), el('i', {class: 'sobe'}), el('i', {}));
        const aj = el('div', {class: 'ajuda', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Como ordenar'},
          el('div', {class: 'ajuda-caixa'}, el('b', {text: 'Como ordenar'}), demo,
            el('ol', {}, el('li', {text: 'Toque numa opção, mantenha o dedo e arraste-a para cima ou para baixo.'}),
              el('li', {text: 'Em cima fica a mais importante (1.º).'}),
              el('li', {text: 'Se preferir, use as setas ▲ ▼ ao lado de cada opção.'}),
              el('li', {text: 'No fim, toque em «Enviar esta ordem».'})),
            el('button', {class: 'enviar', type: 'button', text: 'Percebi', onclick: fechar})));
        document.body.append(aj);
      }
    } else if (q.tipo === 'escala') {
      kids.push(el('p', {class: 'dica', text: `Toque num número de ${q.min} a ${q.max}.`}));
      const linha = el('div', {class: 'escala opcoes', role: 'group', 'aria-label': q.texto});
      for (let v = q.min; v <= q.max; v++) {
        const b = el('button', {class: 'op', type: 'button', 'data-v': String(v), 'aria-pressed': 'false', text: String(v),
          onclick: () => { escolha = new Set([v]); marcar(escolha); enviar([v]); }});
        botoes.push(b); linha.append(b);
      }
      kids.push(linha);
      if (q.opcoes && q.opcoes.length === 2) kids.push(el('div', {class: 'legendas'}, el('span', {text: q.opcoes[0]}), el('span', {text: q.opcoes[1]})));
    } else {
      const multi = q.tipo === 'multipla', max = multi ? q.maxEscolhas : 1;
      kids.push(el('p', {class: 'dica', text: !multi ? 'Escolha uma opção.' : max >= q.opcoes.length ? 'Escolha as opções que se aplicam.' : `Escolha até ${max} opções.`}));
      const lista = el('div', {class: 'opcoes', role: 'group', 'aria-label': q.texto});
      const btEnviar = multi ? el('button', {class: 'enviar', type: 'button', text: 'Enviar', onclick: () => enviar([...escolha].sort((a, b) => a - b))}) : null;
      const limitar = () => { if (!multi) return; botoes.forEach(b => { b.disabled = !escolha.has(+b.dataset.v) && escolha.size >= max; }); btEnviar.disabled = escolha.size === 0; };
      q.opcoes.forEach((t, i) => {
        const b = el('button', {class: 'op', type: 'button', 'data-v': String(i), 'aria-pressed': 'false',
          onclick: () => {
            if (multi) { escolha.has(i) ? escolha.delete(i) : escolha.add(i); marcar(escolha); limitar(); ok.hidden = true; }
            else { escolha = new Set([i]); marcar(escolha); enviar([i]); }
          }}, el('span', {class: 'letra', text: LETRAS[i]}), el('span', {text: t}));
        botoes.push(b); lista.append(b);
      });
      kids.push(lista);
      if (btEnviar) kids.push(btEnviar);
      limitar();
    }
    kids.push(ok);
    vista.replaceChildren(...kids);
    if (depois) depois(); else marcar(escolha);
    if (guardado && q.tipo !== 'texto') registado();
  }

  async function ciclo() {
    clearTimeout(timer);
    try {
      const r = await rpc('votar_estado', {p_sala: sala});
      falhas = 0; msg('');
      if (!r || r.ok === false) { vista.replaceChildren(el('p', {class: 'espera', text: 'Endereço de sala inválido.'})); return; }
      const q = r.pergunta;
      const a = r.aviso && typeof r.aviso === 'object' ? r.aviso : null, ak = a ? JSON.stringify(a) : '';
      if (ak !== avisoK) { aviso = a; avisoK = ak; if (!q) pintarAviso(); }
      if (!q) {
        const alvo = tinhaPergunta || r.perguntas > 0 ? 'fechada' : 'espera';
        if (ecra !== alvo) { ecra = alvo; mostrarEspera(alvo === 'fechada'); }
      } else {
        const k = defKey(q);
        if (ecra !== k) { ecra = k; tinhaPergunta = true; mostrarPergunta(q); }
      }
    } catch (e) {
      falhas++; msg('Sem ligação. A tentar outra vez…');
    }
    const t = falhas ? Math.min(20000, 3000 * 2 ** Math.min(falhas, 3)) : (document.hidden ? 15000 : 3000 + Math.random() * 1000);
    timer = setTimeout(ciclo, t);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) ciclo(); });
  ciclo();
})();
