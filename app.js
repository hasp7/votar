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
  async function aplicarTema() {
    const dir = BASE + 'temas/' + sala.split('/')[0] + '/';
    let t;
    try { const r = await fetch(dir + 'tema.json', {cache: 'no-cache', credentials: 'omit'}); if (!r.ok) return; t = await r.json(); }
    catch (e) { return; }
    if (!t || typeof t !== 'object') return;
    if (t.css) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = dir + String(t.css).replace(/[^a-z0-9._-]/gi, ''); document.head.append(l); }
    document.body.classList.add('com-tema');
    if (t.titulo) { $('titulo').textContent = t.titulo; document.title = t.titulo; }
    if (t.subtitulo) $('subtitulo').textContent = t.subtitulo;
    $('evento').hidden = !(t.titulo || t.subtitulo);
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
  aplicarTema();
  const posicao = q => { const p = q && q.ordem && q.total ? `Pergunta ${q.ordem} de ${q.total}` : ''; $('posicao').textContent = p; if (p) $('rodape').hidden = false; };

  // ---------------------------------------------------------------- com sala
  let ecra = '', tinhaPergunta = false, falhas = 0, timer = null, aEnviar = false;
  const defKey = q => [q.id, q.tipo, q.texto, JSON.stringify(q.opcoes), q.maxEscolhas, q.min, q.max, q.ordem, q.total].join('|');
  const chaveVoto = q => 'votar:' + sala + ':' + defKey(q);

  function mostrarEspera(fechada) {
    posicao(null);
    vista.replaceChildren(el('p', {class: 'espera'},
      el('b', {text: fechada ? 'Votação fechada. Obrigado.' : 'Ainda não há pergunta aberta.'}),
      fechada ? 'A próxima pergunta aparece aqui sozinha.' : 'Mantenha esta página aberta: a pergunta aparece sozinha.'));
  }

  function mostrarPergunta(q) {
    posicao(q);
    const guardado = (() => { try { return JSON.parse(store.get(chaveVoto(q)) || 'null'); } catch (e) { return null; } })();
    const ok = el('p', {class: 'ok', hidden: ''});
    const botoes = [];
    let escolha = new Set(guardado || []);
    const marcar = vals => botoes.forEach(b => b.setAttribute('aria-pressed', String(vals.has(+b.dataset.v))));
    const registado = () => { ok.replaceChildren(el('b', {text: 'Voto registado.'}), ' Pode mudar até a pergunta fechar.'); ok.hidden = false; };

    async function enviar(vals) {
      if (aEnviar) return;
      aEnviar = true; msg('');
      try {
        const r = await rpc('votar_votar', {p_sala: sala, p_pergunta: q.id, p_pid: PID, p_resposta: vals});
        if (r && r.ok) { store.set(chaveVoto(q), JSON.stringify(vals)); registado(); }
        else if (r && r.erro === 'pergunta fechada') { msg('Esta pergunta já fechou.'); ciclo(); }
        else msg('Não foi possível registar o voto. Tente outra vez.');
      } catch (e) {
        msg('Sem ligação. Toque outra vez para tentar.');
      } finally { aEnviar = false; }
    }

    const kids = [el('h1', {text: q.texto})];
    if (q.tipo === 'escala') {
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
    marcar(escolha);
    if (guardado) registado();
  }

  async function ciclo() {
    clearTimeout(timer);
    try {
      const r = await rpc('votar_estado', {p_sala: sala});
      falhas = 0; msg('');
      if (!r || r.ok === false) { vista.replaceChildren(el('p', {class: 'espera', text: 'Endereço de sala inválido.'})); return; }
      const q = r.pergunta;
      if (!q) {
        const alvo = tinhaPergunta ? 'fechada' : 'espera';
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
