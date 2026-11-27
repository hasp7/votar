// Teste da página da plateia: 3 telemóveis (Chromium sem janela, 390×844) contra a base real.
// Serve a pasta como o GitHub Pages (/votar/, 404.html para qualquer sala) e abre/fecha perguntas pela API,
// como o deck fará. Uso: node tests/pagina.test.mjs <CHAVE_PUBLICAVEL>   (a correr na raiz do repositório)
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import {spawn} from 'node:child_process';
const KEY = process.argv[2];
const URL_API = 'https://tlqnhpvdzgyqwmextemq.supabase.co';
const ROOT = path.resolve('.'), PORT = 8765, DBG = 9351;
const SALA = 'teste/pagina-' + Date.now().toString(36), CHAVE = 'k' + crypto.randomUUID().replace(/-/g, '');
const TYPES = {'.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.txt': 'text/plain'};
const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!p.startsWith('/votar/')) { res.writeHead(404); return res.end(); }
  let f = path.join(ROOT, p.slice(7)); if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (p.endsWith('/')) f = path.join(f, 'index.html');
  if (fs.existsSync(f) && fs.statSync(f).isFile()) { res.writeHead(200, {'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream'}); return fs.createReadStream(f).pipe(res); }
  res.writeHead(404, {'Content-Type': TYPES['.html']}); fs.createReadStream(path.join(ROOT, '404.html')).pipe(res);
}).listen(PORT);
const rpc = async (fn, body) => (await fetch(`${URL_API}/rest/v1/rpc/${fn}`, {method: 'POST', headers: {apikey: KEY, 'Content-Type': 'application/json'}, body: JSON.stringify(body)})).json();
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, falhas = 0; const t = (c, m) => { c ? ok++ : falhas++; console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); };

const ch = spawn('chromium', ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${DBG}`, 'about:blank'], {stdio: 'ignore'});
for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${DBG}/json/version`); break; } catch { await sleep(250); } }
const erros = [];
const conn = url => new Promise(r => { const ws = new WebSocket(url); let id = 0; const P = {};
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && P[d.id]) { P[d.id](d); delete P[d.id]; }
    if (d.method === 'Runtime.exceptionThrown') erros.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error' && !/404/.test(d.params.entry.text)) erros.push(d.params.entry.text); };
  ws.onopen = () => r({send: (method, params = {}) => new Promise(res => { P[++id] = res; ws.send(JSON.stringify({id, method, params})); }), close: () => ws.close()}); });
const browser = await conn((await (await fetch(`http://127.0.0.1:${DBG}/json/version`)).json()).webSocketDebuggerUrl);
async function telemovel(url) {
  // cada telemóvel num contexto isolado: localStorage próprio, logo código anónimo próprio
  const {result: {browserContextId}} = await browser.send('Target.createBrowserContext');
  const {result: {targetId}} = await browser.send('Target.createTarget', {url: 'about:blank', browserContextId});
  await sleep(300);
  const tg = (await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json()).find(x => x.id === targetId);
  const c = await conn(tg.webSocketDebuggerUrl);
  await c.send('Page.enable'); await c.send('Runtime.enable'); await c.send('Log.enable');
  await c.send('Emulation.setDeviceMetricsOverride', {width: 390, height: 844, deviceScaleFactor: 2, mobile: true});
  // separadores CDP ficam em segundo plano; um telemóvel na sala tem o ecrã ligado
  await c.send('Page.addScriptToEvaluateOnNewDocument', {source: "Object.defineProperty(document,'hidden',{get:()=>false});"});
  await c.send('Page.navigate', {url});
  c.ev = async e => (await c.send('Runtime.evaluate', {expression: e, returnByValue: true, awaitPromise: true})).result?.result?.value;
  return c;
}
const pag = `http://127.0.0.1:${PORT}/votar/${SALA}/`;
const F = [await telemovel(pag), await telemovel(pag), await telemovel(pag)];
await sleep(2500);
t((await F[0].ev(`document.querySelector('.espera')?.textContent||''`)).includes('Ainda não há pergunta aberta'), 'sem pergunta: o telemóvel espera');
t((await F[0].ev(`document.getElementById('sala').textContent`)) === 'Sala ' + SALA, 'a sala vem do endereço (página servida como 404, como no GitHub Pages)');

const P1 = {id: 'q1', tipo: 'unica', texto: 'Já verificou uma referência dada por um chatbot?', opcoes: ['Sim, correta', 'Sim, não existia', 'Nunca verifiquei']};
t((await rpc('votar_abrir', {p_sala: SALA, p_chave: CHAVE, p_pergunta: P1})).ok, 'deck abre q1');
await sleep(5000);
const vistos = await Promise.all(F.map(f => f.ev(`(document.querySelector('h1')?.textContent||'')+'|'+document.querySelectorAll('.op').length`)));
t(vistos.every(v => v === P1.texto + '|3'), `os 3 telemóveis mostram a pergunta sozinhos (${vistos[0]})`);
await F[0].ev(`document.querySelectorAll('.op')[1].click()`); await F[1].ev(`document.querySelectorAll('.op')[1].click()`); await F[2].ev(`document.querySelectorAll('.op')[0].click()`);
await sleep(2000);
t(await F[0].ev(`!document.querySelector('.ok').hidden && document.querySelector('.ok').textContent.startsWith('Voto registado')`), 'confirmação «Voto registado» no telemóvel');
let r = await rpc('votar_resultados', {p_sala: SALA, p_pergunta: 'q1'});
t(JSON.stringify(r.contagens) === '[1,2,0]', `votos tocados contam: ${JSON.stringify(r.contagens)}`);
await F[0].ev(`document.querySelectorAll('.op')[2].click()`); await sleep(1500);
r = await rpc('votar_resultados', {p_sala: SALA, p_pergunta: 'q1'});
t(r.n === 3 && JSON.stringify(r.contagens) === '[1,1,1]', `mudar o voto não duplica: n=${r.n} ${JSON.stringify(r.contagens)}`);
await F[0].send('Page.reload'); await sleep(3500);
t(await F[0].ev(`document.querySelectorAll('.op')[2].getAttribute('aria-pressed')==='true' && !document.querySelector('.ok').hidden`), 'depois de recarregar, o telemóvel mostra o voto que fez');

const P2 = {id: 'q2', tipo: 'multipla', texto: 'Que ferramentas usa?', opcoes: ['ChatGPT', 'Copilot', 'Gemini', 'Claude'], maxEscolhas: 2};
await rpc('votar_abrir', {p_sala: SALA, p_chave: CHAVE, p_pergunta: P2}); await sleep(5000);
t((await F[0].ev(`document.querySelector('.dica').textContent`)) === 'Escolha até 2 opções.', 'múltipla: indica o máximo');
await F[0].ev(`document.querySelectorAll('.op')[0].click()`); await F[0].ev(`document.querySelectorAll('.op')[3].click()`);
t(await F[0].ev(`document.querySelectorAll('.op')[1].disabled && document.querySelectorAll('.op')[2].disabled`), 'múltipla: ao chegar ao máximo, as outras opções bloqueiam');
await F[0].ev(`document.querySelector('.enviar').click()`); await sleep(1500);
r = await rpc('votar_resultados', {p_sala: SALA, p_pergunta: 'q2'});
t(JSON.stringify(r.contagens) === '[1,0,0,1]', `múltipla enviada: ${JSON.stringify(r.contagens)}`);

const P3 = {id: 'q3', tipo: 'escala', texto: 'Confiança nas respostas, de 1 a 5?', opcoes: ['Nenhuma', 'Total'], min: 1, max: 5};
await rpc('votar_abrir', {p_sala: SALA, p_chave: CHAVE, p_pergunta: P3}); await sleep(5000);
t((await F[1].ev(`[...document.querySelectorAll('.op')].map(b=>b.textContent).join('')+'|'+document.querySelector('.legendas')?.textContent`)) === '12345|NenhumaTotal', 'escala: botões 1 a 5 com legendas');
await F[1].ev(`document.querySelectorAll('.op')[3].click()`); await sleep(1500);
r = await rpc('votar_resultados', {p_sala: SALA, p_pergunta: 'q3'});
t(r.contagens[3] === 1 && Number(r.media) === 4, `escala enviada: ${JSON.stringify(r.contagens)} média ${r.media}`);

const P6 = {id: 'q6', tipo: 'ordenar', ordem: 3, total: 3, texto: 'Ordene por prioridade: o que lhe falta mais?', opcoes: ['Literacia em IA', 'Uso seguro e verificação', 'Co-criação de ferramentas', 'Avaliação e governação']};
await rpc('votar_abrir', {p_sala: SALA, p_chave: CHAVE, p_pergunta: P6}); await sleep(5000);
await F[0].ev(`document.querySelectorAll('.op')[2].click()`); await F[0].ev(`document.querySelectorAll('.op')[0].click()`);
const parcial = await F[0].ev(`[...document.querySelectorAll('.op .letra')].map(x=>x.textContent).join(',')+'|'+document.querySelector('.acoes .enviar').textContent+'|'+document.querySelector('.acoes .enviar').disabled`);
t(parcial === '2.º,B,1.º,D|Faltam 2|true', `ordenar: os toques numeram por ordem (${parcial})`);
await F[0].ev(`document.querySelectorAll('.op')[3].click()`);
const completo = await F[0].ev(`[...document.querySelectorAll('.op .letra')].map(x=>x.textContent).join(',')+'|'+document.querySelector('.acoes .enviar').disabled`);
t(completo === '2.º,4.º,1.º,3.º|false', `ordenar: com 3 escolhidas, a última fica sozinha em 4.º (${completo})`);
await F[0].ev(`document.querySelector('.acoes .enviar').click()`); await sleep(1800);
r = await rpc('votar_resultados', {p_sala: SALA, p_pergunta: 'q6'});
t(JSON.stringify(r.contagens) === '[2,0,3,1]', `ordenar: pontos registados ${JSON.stringify(r.contagens)}`);
await F[0].ev(`document.querySelector('.limpar').click()`);
t((await F[0].ev(`[...document.querySelectorAll('.op .letra')].map(x=>x.textContent).join(',')`)) === 'A,B,C,D', 'ordenar: «Recomeçar» limpa a ordem');
await rpc('votar_fechar', {p_sala: SALA, p_chave: CHAVE}); await sleep(5000);
t((await F[2].ev(`document.querySelector('.espera')?.textContent||''`)).startsWith('Votação fechada'), 'fechar: os telemóveis mostram «Votação fechada»');

t(await F[2].ev(`document.getElementById('evento').hidden && !document.body.classList.contains('com-tema')`), 'sala sem tema: aspeto neutro, sem cabeçalho de evento');

// tema do evento: salas cujo 1.º nível tem pasta em temas/ (aqui spp26/…)
const SALA_T = 'spp26/teste-' + Date.now().toString(36);
const P4 = {id: 'q2', tipo: 'unica', ordem: 2, total: 3, texto: 'O que lhe falta mais?', opcoes: ['Literacia em IA', 'Uso seguro e verificação', 'Co-criação de ferramentas', 'Avaliação e governação']};
t((await rpc('votar_abrir', {p_sala: SALA_T, p_chave: CHAVE, p_pergunta: P4})).ok, 'abrir com ordem e total');
const G = await telemovel(`http://127.0.0.1:${PORT}/votar/${SALA_T}/`); await sleep(3500);
const tema = JSON.parse(await G.ev(`JSON.stringify({t:document.getElementById('titulo').textContent,s:document.getElementById('subtitulo').textContent,
  p:document.getElementById('posicao').textContent,a:document.getElementById('autor').textContent,o:document.getElementById('obrigado').hidden?'':document.getElementById('obrigado').textContent,
  f:getComputedStyle(document.querySelector('h1')).fontFamily,ok:document.fonts.check('600 26px "SPP Jost"'),
  r:document.getElementById('rodape').getBoundingClientRect().bottom<=innerHeight+1})`));
t(tema.t.startsWith('A Aplicabilidade da IA') && tema.s.startsWith('Utilizador, co-criador'), 'tema: título e subtítulo da intervenção em cima');
t(tema.p === 'Pergunta 2 de 3', `tema: posição no rodapé (${tema.p})`);
t(tema.a.includes('Hélder Palheira') && tema.a.includes('@nex7.dev') && tema.a.includes('@hc-healthcare.com'), 'tema: nome e os dois emails no rodapé');
t(await G.ev(`(()=>{const b=document.querySelector('#autor b').getBoundingClientRect(),c=[...document.querySelectorAll('#autor .contacto')].map(x=>x.getBoundingClientRect());return c.length===2&&c[0].top>=b.bottom-1&&c[1].top>=c[0].bottom-1})()`), 'tema: cada email numa linha por baixo do nome');
t(tema.o === 'Obrigado por participar', 'tema: «Obrigado por participar» em baixo');
t(tema.f.includes('SPP Jost') && tema.ok, 'tema: títulos em Jost (fonte carregada)');
t(tema.r, 'tema: rodapé visível sem fazer scroll');
t(await G.ev(`getComputedStyle(document.getElementById('titulo')).display==='none' && getComputedStyle(document.getElementById('subtitulo')).display!=='none'`), 'tema: com pergunta no ecrã, o cabeçalho fica só com o subtítulo');
await G.ev(`document.querySelectorAll('.op')[0].click()`); await sleep(1800);
const conf = JSON.parse(await G.ev(`JSON.stringify({ok:getComputedStyle(document.querySelector('.ok')).backgroundColor,op:getComputedStyle(document.querySelector('.op[aria-pressed=true]')).backgroundColor,
  st:getComputedStyle(document.querySelector('.ok .mudar')).fontStyle,fs:parseFloat(getComputedStyle(document.querySelector('.ok .mudar')).fontSize),fb:parseFloat(getComputedStyle(document.querySelector('.ok b')).fontSize),
  linha:document.querySelector('.ok .mudar').getBoundingClientRect().top>=document.querySelector('.ok b').getBoundingClientRect().bottom-1})`));
t(conf.ok !== conf.op, `tema: «Voto registado» com cor diferente da resposta escolhida (${conf.ok} vs ${conf.op})`);
t(conf.st === 'italic' && conf.fs < conf.fb && conf.linha, '«Pode mudar…» na linha de baixo, em itálico e mais pequeno');
await rpc('votar_fechar', {p_sala: SALA_T, p_chave: CHAVE}); await sleep(4500);
t((await G.ev(`document.getElementById('posicao').textContent`)) === '', 'tema: sem pergunta aberta, a posição desaparece');
t(await G.ev(`getComputedStyle(document.getElementById('titulo')).display!=='none'`), 'tema: sem pergunta, o título volta ao cabeçalho');

const E = await telemovel(`http://127.0.0.1:${PORT}/votar/`); await sleep(1500);
t(await E.ev(`!!document.querySelector('form.entrar input')`), 'sem sala no endereço: pede o código');
await E.ev(`(()=>{const i=document.querySelector('form.entrar input');i.value=' TESTE/X ';document.querySelector('form.entrar').requestSubmit();})()`); await sleep(1500);
t((await E.ev('location.pathname')) === '/votar/teste/x/', 'escrever o código leva à sala');
const css = await E.ev(`getComputedStyle(document.querySelector('.marca')).color`);
t(css && css !== 'rgb(0, 0, 0)', 'CSS carregado com a CSP ativa');

t(erros.length === 0, 'sem erros JS nem violações de CSP' + (erros.length ? ': ' + erros.join(' || ') : ''));
console.log(`\n${ok} OK, ${falhas} falhas · sala de teste: ${SALA}`);
ch.kill(); srv.close(); process.exit(falhas ? 1 : 0);
