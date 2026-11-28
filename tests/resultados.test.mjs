// Teste das páginas de resultados da spp26 (landing, protótipo DPOC, «Como foi construído»).
// Sem rede nem base de dados: serve a pasta como o GitHub Pages e abre um Chromium sem janela.
// Uso (na raiz do repositório): node tests/resultados.test.mjs [pasta-das-capturas] [--og]
//   --og  gera também spp26/resultados/og.png (1200×630) a partir de tests/og/og-resultados.html
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import {spawn} from 'node:child_process';
const ROOT = path.resolve('.'), PORT = 8766, DBG = 9352;
const OUT = process.argv.slice(2).find(a => !a.startsWith('--')) || null;
const OG = process.argv.includes('--og');
if (OUT) fs.mkdirSync(OUT, {recursive: true});
const TYPES = {'.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.txt': 'text/plain'};
const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!p.startsWith('/votar/')) { res.writeHead(404); return res.end(); }
  let f = path.join(ROOT, p.slice(7)); if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (p.endsWith('/')) f = path.join(f, 'index.html');
  if (fs.existsSync(f) && fs.statSync(f).isFile()) { res.writeHead(200, {'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream'}); return fs.createReadStream(f).pipe(res); }
  res.writeHead(404, {'Content-Type': TYPES['.html']}); fs.createReadStream(path.join(ROOT, '404.html')).pipe(res);
}).listen(PORT);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, falhas = 0; const t = (c, m) => { c ? ok++ : falhas++; console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); };

const ch = spawn('chromium', ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${DBG}`, 'about:blank'], {stdio: 'ignore'});
for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${DBG}/json/version`); break; } catch { await sleep(250); } }
let erros = [];
const conn = url => new Promise(r => { const ws = new WebSocket(url); let id = 0; const P = {};
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && P[d.id]) { P[d.id](d); delete P[d.id]; }
    if (d.method === 'Runtime.exceptionThrown') erros.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') erros.push(d.params.entry.text);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') erros.push(d.params.args.map(a => a.value).join(' ')); };
  ws.onopen = () => r({send: (method, params = {}) => new Promise(res => { P[++id] = res; ws.send(JSON.stringify({id, method, params})); }), close: () => ws.close()}); });
const tg = (await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json()).find(x => x.type === 'page');
const c = await conn(tg.webSocketDebuggerUrl);
await c.send('Page.enable'); await c.send('Runtime.enable'); await c.send('Log.enable');
const ev = async expr => { const r = await c.send('Runtime.evaluate', {expression: expr, awaitPromise: true, returnByValue: true}); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'erro'); return r.result.result.value; };
async function abrir(url, w, h, escuro) {
  await c.send('Emulation.setDeviceMetricsOverride', {width: w, height: h, deviceScaleFactor: w < 600 ? 2 : 1, mobile: w < 600});
  await c.send('Emulation.setEmulatedMedia', {features: [{name: 'prefers-color-scheme', value: escuro ? 'dark' : 'light'}]});
  await c.send('Page.navigate', {url}); await sleep(900);
  await ev('document.fonts.ready.then(() => true)');
}
async function captura(nome, inteira = true) {
  if (!OUT) return;
  const r = await c.send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: inteira});
  fs.writeFileSync(path.join(OUT, nome + '.png'), Buffer.from(r.result.data, 'base64'));
}
const B = `http://127.0.0.1:${PORT}/votar/spp26/resultados/`;
const PAGINAS = [['landing', B], ['dpoc', B + 'dpoc/'], ['processo', B + 'como-foi-construido/']];

// 1. Todas as páginas, telemóvel e computador, claro e escuro
for (const [nome, url] of PAGINAS) for (const [w, h] of [[390, 844], [1280, 900]]) for (const escuro of [false, true]) {
  erros = [];
  await abrir(url, w, h, escuro);
  if (nome === 'dpoc') { await ev("document.querySelector('#ficticio').click()"); await sleep(300); }
  const rot = `${nome} ${w}px ${escuro ? 'escuro' : 'claro'}`;
  const larg = await ev('document.documentElement.scrollWidth');
  t(larg <= w, `${rot}: sem scroll horizontal (${larg} ≤ ${w})`);
  t(await ev(`document.fonts.check('600 20px "SPP Jost"') && document.fonts.check('400 16px "IBM Plex Sans"')`), `${rot}: fontes Jost e Plex carregadas`);
  const bg = await ev("getComputedStyle(document.documentElement).getPropertyValue('--bg').trim().toUpperCase()");
  t(bg === (escuro ? '#0A2229' : '#EEF6F4'), `${rot}: tokens do tema ${escuro ? 'escuro' : 'claro'} (${bg})`);
  t(erros.length === 0, `${rot}: sem erros nem violações da CSP${erros.length ? ' → ' + erros.slice(0, 3).join(' | ') : ''}`);
  if (w > 600) {
    const cr = await ev(`(() => { const v = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
      const L = h => { const c = [1,3,5].map(i => parseInt(h.slice(i, i+2), 16) / 255).map(x => x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4); return .2126*c[0] + .7152*c[1] + .0722*c[2]; };
      const r = (a, b) => { const x = L(v(a)), y = L(v(b)); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
      return [r('--ctl', '--bg'), r('--ctl', '--surface'), r('--muted', '--bg'), r('--pior', '--surface'), r('--signal', '--surface')].map(x => Math.round(x * 100) / 100); })()`);
    t(cr[0] >= 3 && cr[1] >= 3, `${rot}: bordas dos controlos ≥ 3:1 (${cr[0]}, ${cr[1]})`);
    t(cr[2] >= 4.5 && cr[3] >= 4.5 && cr[4] >= 4.5, `${rot}: texto secundário, «pior» e ligações ≥ 4,5:1 (${cr.slice(2).join(', ')})`);
  }
  await captura(`${nome}-${w}-${escuro ? 'escuro' : 'claro'}`);
}

// 2. Interruptor de tema
await abrir(B, 1280, 900, false);
await ev("document.querySelector('[data-tema]').click()");
t(await ev("document.documentElement.dataset.theme") === 'dark', 'tema: o interruptor passa a escuro');
t(await ev("getComputedStyle(document.documentElement).getPropertyValue('--bg').trim().toUpperCase()") === '#0A2229', 'tema: tokens escuros aplicados');
t(await ev("document.querySelectorAll('[data-selo] svg').length") === 1, 'landing: carimbo Wild card desenhado');
t(await ev("[...document.querySelectorAll('#votacoes .enche')].some(e => e.style.getPropertyValue('--pct') === '77.8%')") === true, 'landing: barras com largura (CSSOM, sem style inline)');
t(await ev("document.querySelector('meta[property=\"og:image\"]').content") === 'https://hasp7.github.io/votar/spp26/resultados/og.png', 'landing: Open Graph com imagem absoluta');
t(await ev("[...document.querySelectorAll('a[href]')].every(a => !/^https?:/.test(a.getAttribute('href')))") === true, 'landing: só ligações internas');

// 3. Protótipo DPOC: funções e fluxo
await abrir(B + 'dpoc/', 390, 844, false);
t(await ev("DPOC.normalizar(DPOC.gerarCodigo()) !== null"), 'código: gerado passa a validação');
t(await ev("[...Array(200)].every(() => { const c = DPOC.gerarCodigo(); return /^DPOC-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/.test(c) && DPOC.normalizar(c) === c; })"), 'código: 200 códigos no formato e com controlo certo');
t(await ev("(() => { const c = DPOC.gerarCodigo(); const s = c.replace(/-/g,'').slice(4); const troca = s.slice(0,7) + (s[7] === '0' ? '1' : '0'); return DPOC.normalizar(troca) === null; })()"), 'código: carácter de controlo errado é recusado');
t(await ev("(() => { const c = DPOC.gerarCodigo(); const s = c.replace(/-/g,'').slice(4); const t = s[1] + s[0] + s.slice(2); return t === s || DPOC.normalizar(t) === null; })()"), 'código: troca de dois caracteres vizinhos é apanhada');
t(await ev("DPOC.normalizar('dpoc f1ct 0d1' + DPOC.controlo('F1CT0D1').toLowerCase()) === 'DPOC-F1CT-0D1' + DPOC.controlo('F1CT0D1')"), 'código: aceita minúsculas e espaços');
await ev("document.querySelector('#ficticio').click()"); await sleep(200);
t(await ev("document.querySelectorAll('#tabela-evolucao tbody tr').length") === 4, 'fictício: 4 avaliações na evolução');
const totais = await ev("[...document.querySelectorAll('#tabela-evolucao tbody tr')].map(tr => [...tr.querySelectorAll('td.num')].map(td => td.textContent.trim().split(' ')[0]))");
t(JSON.stringify(totais.map(l => l[0])) === '["15","18","24","16"]', 'fictício: CAT 15, 18, 24, 16 → ' + totais.map(l => l[0]));
t(JSON.stringify(totais.map(l => l[3])) === '["20","23","31","20"]', 'fictício: LCADL 20, 23, 31, 20 → ' + totais.map(l => l[3]));
t(await ev("document.querySelectorAll('.delta.relevante').length") >= 4, 'fictício: variações acima da diferença mínima marcadas');
t(await ev("document.querySelectorAll('#graficos figure').length") === 4, 'fictício: 4 gráficos');
// preencher uma avaliação nova com cliques
await ev("for (let i = 0; i < 8; i++) document.querySelector('#cat-' + i + '-3').click(); document.querySelector('#mmrc-1').click(); true");
t((await ev("document.querySelector('#res-cat').textContent")) === '24 de 40', 'formulário: CAT com 8 × 3 = 24 de 40');
t(await ev("document.querySelector('#res-cat').classList.contains('acima')"), 'formulário: CAT ≥ 10 assinalado');
await ev("document.querySelector('#cat-7-3').checked = false; document.querySelector('#avaliacao').dispatchEvent(new Event('change')); true");
t((await ev("document.querySelector('#res-cat').textContent")) === '7 de 8 itens', 'formulário: CAT com item em falta mostra 7 de 8 itens');
t((await ev("document.querySelector('#nav-cat').textContent")) === '7/8 itens', 'navegador: chip do CAT com 7/8 itens');
await ev("document.querySelector('#guardar').click(); true"); await sleep(250);
t(/falta o item 8/.test(await ev("document.querySelector('#form-msg').textContent")), 'validação: diz que falta o item 8 (Energia)');
t(await ev("document.querySelectorAll('#escala-cat .item.falta').length") === 1 && await ev("document.activeElement.name") === 'cat-7', 'validação: item em falta assinalado e com o foco');
await ev("const lc=[1,2,1,0,0,0,0,2,1,3,4,3,1,2,1]; lc.forEach((v,i)=>document.querySelector('#lcadl-'+i+'-'+v).click()); true");
t((await ev("document.querySelector('#res-lcadl').textContent")) === '21 de 75 · 38,2\u00A0% do total', 'formulário: LCADL 21 e %total 38,2 (21 ÷ 55)');
t((await ev("document.querySelector('#lcadl-dom-fisico').textContent")) === '7 / 10', 'formulário: subtotal físico 7 / 10');
await ev("document.querySelector('#sgrq-total').value = '120'; document.querySelector('#avaliacao').dispatchEvent(new Event('input')); true");
t((await ev("document.querySelector('#res-sgrq').textContent")) === 'Valor fora de 0–100', 'formulário: SGRQ fora de 0–100 recusado');
await ev("document.querySelector('#sgrq-total').value = ''; document.querySelector('#cat-7-3').click(); document.querySelector('#data').value = '2026-11-27'; document.querySelector('#guardar').click(); true");
await sleep(200);
t(await ev("document.querySelectorAll('#tabela-evolucao tbody tr').length") === 5, 'formulário: avaliação nova junta à evolução');
t(await ev("DPOC.estado.sujo") === true, 'formulário: há alterações por descarregar');
t(/1 alteração por descarregar/.test(await ev("document.querySelector('#barra-estado').textContent")), 'barra: mostra 1 alteração por descarregar');
t(!(await ev("document.querySelector('#barra').hidden")) && (await ev("document.querySelector('#barra-codigo').textContent")) === await ev("DPOC.estado.utente.codigo"), 'barra: código do utente sempre à vista');
// remover e anular, sem alerta
await ev("document.querySelector('#tabela-evolucao tbody tr:first-child .acoes .lig:last-child').click(); true"); await sleep(150);
t(await ev("document.querySelectorAll('#tabela-evolucao tbody tr').length") === 4 && /removida/.test(await ev("document.querySelector('#estado-txt').textContent")), 'remover: sai da evolução e avisa');
await ev("document.querySelector('#estado-acao').click(); true"); await sleep(150);
t(await ev("document.querySelectorAll('#tabela-evolucao tbody tr').length") === 5, 'remover: «Anular» repõe a avaliação');
// trocar de utente com alterações pendentes abre um diálogo com verbos explícitos
await ev("document.querySelector('#gerar').click(); true"); await sleep(200);
t(await ev("document.querySelector('#dialogo').open") === true && /Continuar sem guardar/.test(await ev("document.querySelector('#dlg-bts').textContent")), 'diálogo: avisa antes de perder alterações');
const antes = await ev("DPOC.estado.utente.codigo");
await ev("document.querySelector('#dlg-bts .bt.sec').click(); true"); await sleep(150);
t(await ev("DPOC.estado.utente.codigo") === antes && !(await ev("document.querySelector('#dialogo').open")), 'diálogo: «Cancelar» mantém o utente');
// FHIR ida e volta
const ida = await ev("JSON.stringify(DPOC.paraFHIR())");
const b = JSON.parse(ida);
t(b.resourceType === 'Bundle' && b.type === 'collection' && b.meta.tag[0].code === 'HTEST', 'FHIR: Bundle collection com etiqueta HTEST');
const tipos = b.entry.map(e => e.resource.resourceType);
t(tipos.filter(x => x === 'Patient').length === 1 && tipos.includes('QuestionnaireResponse') && tipos.includes('Observation'), 'FHIR: Patient, QuestionnaireResponse e Observation');
const pac = b.entry[0].resource;
t(!pac.name && !pac.telecom && !pac.address && pac.identifier.length === 1, 'FHIR: Patient sem nome, contactos nem morada, só o pseudónimo');
t(b.entry.every(e => /^[A-Za-z0-9\-.]{1,64}$/.test(e.resource.id)), 'FHIR: ids válidos');
const obsCat = b.entry.map(e => e.resource).find(r => r.resourceType === 'Observation' && r.id.startsWith('obs-cat-'));
t(obsCat.code.coding.some(c => c.system === 'http://snomed.info/sct' && c.code === '446660005'), 'FHIR: CAT com SNOMED CT 446660005');
const obsM = b.entry.map(e => e.resource).find(r => r.resourceType === 'Observation' && r.id.startsWith('obs-mmrc-'));
t(obsM.valueCodeableConcept.coding.some(c => c.system === 'http://snomed.info/sct' && ['1386307008', '1386308003', '1386309006', '1386310001', '1386311002'].includes(c.code)), 'FHIR: grau do mMRC como conceito SNOMED CT');
const obsS = b.entry.map(e => e.resource).find(r => r.resourceType === 'Observation' && r.id.startsWith('obs-sgrq-'));
t(obsS.code.coding.some(c => c.code === '450747009'), 'FHIR: SGRQ com SNOMED CT 450747009');
const refs = new Set(b.entry.map(e => e.resource.resourceType + '/' + e.resource.id));
t(b.entry.every(e => [e.resource.subject, ...(e.resource.derivedFrom || [])].filter(Boolean).every(r => refs.has(r.reference))), 'FHIR: todas as referências resolvem dentro do Bundle');
const volta = await ev(`(() => { const r = DPOC.deFHIR(${ida}); return JSON.stringify(r.avaliacoes.sort((a,b)=>a.data.localeCompare(b.data)).map(a => [a.data, a.cat && a.cat.itens.join(''), a.lcadl && a.lcadl.itens.join('')])); })()`);
const orig = await ev("JSON.stringify(DPOC.estado.avaliacoes.map(a => [a.data, a.cat && a.cat.itens.join(''), a.lcadl && a.lcadl.itens.join('')]))");
t(volta === orig, 'FHIR: ida e volta devolve as mesmas avaliações');
t(await ev(`(() => { const b = ${ida}; b.meta.tag = []; try { DPOC.deFHIR(b); return false; } catch (e) { return /HTEST/.test(e.message); } })()`), 'FHIR: ficheiro sem HTEST recusado');
await captura('dpoc-390-formulario');
// teclado: o primeiro Tab vai ao «Saltar para o conteúdo»
await abrir(B + 'dpoc/', 390, 844, false);
await c.send('Input.dispatchKeyEvent', {type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9});
await c.send('Input.dispatchKeyEvent', {type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9});
t(await ev("document.activeElement.classList.contains('salto')"), 'teclado: primeiro Tab no «Saltar para o conteúdo»');
t(await ev("[...document.querySelectorAll('input:not([type=hidden]), select')].every(i => i.labels && i.labels.length || i.getAttribute('aria-label'))"), 'acessibilidade: todos os campos têm rótulo');
// detalhes abrem
t(await ev("document.querySelectorAll('#escala-cat details').length") === 3, 'escalas: descrição, como usar e bibliografia em cada escala');
t(await ev("document.querySelectorAll('.refs li a[href^=\"https://doi.org/\"]').length") >= 13, 'escalas: bibliografia com ligações DOI');

// 4. Imagem Open Graph
if (OG) {
  await c.send('Emulation.setDeviceMetricsOverride', {width: 1200, height: 630, deviceScaleFactor: 1, mobile: false});
  await c.send('Emulation.setEmulatedMedia', {features: [{name: 'prefers-color-scheme', value: 'light'}]});
  await c.send('Page.navigate', {url: `http://127.0.0.1:${PORT}/votar/tests/og/og-resultados.html`}); await sleep(900);
  await ev('document.fonts.ready.then(() => true)');
  const r = await c.send('Page.captureScreenshot', {format: 'png', clip: {x: 0, y: 0, width: 1200, height: 630, scale: 1}});
  fs.writeFileSync(path.join(ROOT, 'spp26/resultados/og.png'), Buffer.from(r.result.data, 'base64'));
  console.log('og.png gerado');
}

c.close(); ch.kill(); srv.close();
console.log(`\n${ok} OK, ${falhas} falhas`);
process.exit(falhas ? 1 : 0);
