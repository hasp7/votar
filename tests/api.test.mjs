// Teste ponta a ponta da API de votação, pela porta pública (chave publicável), como a plateia e o deck a usam.
// Uso: node api.test.mjs <URL> <CHAVE_PUBLICAVEL> [sala]
const [URL, KEY, SALA = 'teste/api-' + Date.now().toString(36)] = process.argv.slice(2);
const H = {apikey: KEY, 'Content-Type': 'application/json'};
const rpc = async (fn, body) => { const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, {method: 'POST', headers: H, body: JSON.stringify(body)}); return {status: r.status, j: await r.json().catch(() => null)}; };
const CHAVE = 'k' + crypto.randomUUID().replace(/-/g, '');
let ok = 0, falhas = 0;
const t = (c, m) => { c ? ok++ : falhas++; console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); };
const pid = i => 'pid' + String(i).padStart(6, '0') + 'x';

const P1 = {id: 'q1', tipo: 'unica', texto: 'Já verificou uma referência dada por um chatbot?', opcoes: ['Sim, correta', 'Sim, não existia', 'Nunca verifiquei']};
const P2 = {id: 'q2', tipo: 'multipla', texto: 'Que ferramentas usa?', opcoes: ['ChatGPT', 'Copilot', 'Gemini', 'Claude'], maxEscolhas: 2};
const P3 = {id: 'q3', tipo: 'escala', texto: 'Confiança, de 1 a 5?', opcoes: ['Nenhuma', 'Total'], min: 1, max: 5};

let r = await rpc('votar_estado', {p_sala: SALA});
t(r.j?.ok && r.j.pergunta === null, `sala nova sem pergunta aberta (${SALA})`);
r = await rpc('votar_abrir', {p_sala: SALA, p_chave: 'curta', p_pergunta: P1});
t(r.j?.ok === false && /curta/.test(r.j.erro), 'chave com menos de 8 caracteres recusada');
r = await rpc('votar_abrir', {p_sala: SALA, p_chave: CHAVE, p_pergunta: P1});
t(r.j?.ok && r.j.salaNova === true, 'primeira abertura cria a sala com a chave');
r = await rpc('votar_abrir', {p_sala: SALA, p_chave: CHAVE + 'x', p_pergunta: P1});
t(r.j?.ok === false && r.j.erro === 'chave errada', 'chave errada não abre');
r = await rpc('votar_estado', {p_sala: SALA});
t(r.j?.pergunta?.id === 'q1' && r.j.pergunta.opcoes.length === 3, 'estado mostra a pergunta aberta aos telemóveis');

// 50 telemóveis: 25 votam 0, 15 votam 1, 10 votam 2
const esperado = [25, 15, 10];
const votos = await Promise.all(Array.from({length: 50}, (_, i) => rpc('votar_votar', {p_sala: SALA, p_pergunta: 'q1', p_pid: pid(i), p_resposta: [i < 25 ? 0 : i < 40 ? 1 : 2]})));
t(votos.every(v => v.j?.ok), '50 votos em simultâneo aceites');
r = await rpc('votar_votar', {p_sala: SALA, p_pergunta: 'q1', p_pid: pid(0), p_resposta: [2]});
t(r.j?.ok, 'um telemóvel muda o voto');
r = await rpc('votar_resultados', {p_sala: SALA, p_pergunta: 'q1'});
t(r.j?.n === 50 && JSON.stringify(r.j.contagens) === JSON.stringify([24, 15, 11]), `resultados certos depois da mudança: n=${r.j?.n} ${JSON.stringify(r.j?.contagens)}`);

for (const [resp, m] of [[[3], 'opção fora do intervalo'], [[0, 1], 'duas escolhas em pergunta única'], [[], 'resposta vazia'], ['0', 'resposta que não é lista'], [['a'], 'texto em vez de número']]) {
  r = await rpc('votar_votar', {p_sala: SALA, p_pergunta: 'q1', p_pid: pid(99), p_resposta: resp});
  t(r.j?.ok === false, `recusado: ${m}`);
}
r = await rpc('votar_votar', {p_sala: SALA, p_pergunta: 'q1', p_pid: 'x', p_resposta: [0]});
t(r.j?.ok === false, 'recusado: identificador de telemóvel inválido');

r = await rpc('votar_abrir', {p_sala: SALA, p_chave: CHAVE, p_pergunta: P2});
t(r.j?.ok, 'abrir q2 (múltipla, até 2)');
r = await rpc('votar_votar', {p_sala: SALA, p_pergunta: 'q1', p_pid: pid(1), p_resposta: [0]});
t(r.j?.ok === false && r.j.erro === 'pergunta fechada', 'q1 fechou sozinha ao abrir q2');
r = await rpc('votar_votar', {p_sala: SALA, p_pergunta: 'q2', p_pid: pid(1), p_resposta: [0, 3]});
t(r.j?.ok, 'múltipla com 2 escolhas aceite');
r = await rpc('votar_votar', {p_sala: SALA, p_pergunta: 'q2', p_pid: pid(2), p_resposta: [0, 1, 2]});
t(r.j?.ok === false, 'múltipla com 3 escolhas (máximo 2) recusada');
r = await rpc('votar_votar', {p_sala: SALA, p_pergunta: 'q2', p_pid: pid(3), p_resposta: [1, 1]});
t(r.j?.ok === false, 'escolha repetida recusada');

r = await rpc('votar_abrir', {p_sala: SALA, p_chave: CHAVE, p_pergunta: P3});
await Promise.all([1, 2, 4, 5, 5].map((v, i) => rpc('votar_votar', {p_sala: SALA, p_pergunta: 'q3', p_pid: pid(i), p_resposta: [v]})));
r = await rpc('votar_votar', {p_sala: SALA, p_pergunta: 'q3', p_pid: pid(9), p_resposta: [6]});
t(r.j?.ok === false, 'escala fora de 1 a 5 recusada');
r = await rpc('votar_resultados', {p_sala: SALA, p_pergunta: 'q3'});
t(JSON.stringify(r.j?.contagens) === '[1,1,0,1,2]' && Number(r.j.media) === 3.4, `escala: ${JSON.stringify(r.j?.contagens)} média ${r.j?.media}`);

r = await rpc('votar_abrir', {p_sala: SALA, p_chave: CHAVE, p_pergunta: {...P1, opcoes: ['Sim', 'Não']}});
t(r.j?.ok && r.j.votosApagados === true, 'mudar as opções de q1 apaga os votos antigos dessa pergunta');
r = await rpc('votar_abrir', {p_sala: SALA, p_chave: CHAVE, p_pergunta: {...P1, opcoes: ['Sim', 'Não']}});
t(r.j?.ok && r.j.votosApagados === false, 'reabrir a mesma definição não apaga nada');

r = await rpc('votar_abrir', {p_sala: SALA, p_chave: CHAVE, p_pergunta: {...P2, ordem: 4, total: 3}});
t(r.j?.ok === false, 'ordem maior do que o total recusada');
r = await rpc('votar_abrir', {p_sala: SALA, p_chave: CHAVE, p_pergunta: {...P2, ordem: 2}});
t(r.j?.ok === false, 'ordem sem total recusada');
r = await rpc('votar_abrir', {p_sala: SALA, p_chave: CHAVE, p_pergunta: {...P2, ordem: 2, total: 3}});
const e2 = await rpc('votar_estado', {p_sala: SALA});
t(r.j?.ok && r.j.votosApagados === false && e2.j?.pergunta?.ordem === 2 && e2.j.pergunta.total === 3, 'ordem e total chegam ao telemóvel e não apagam votos');
r = await rpc('votar_fechar', {p_sala: SALA, p_chave: CHAVE + 'x'});
t(r.j?.ok === false, 'fechar com chave errada recusado');
r = await rpc('votar_fechar', {p_sala: SALA, p_chave: CHAVE});
r = await rpc('votar_estado', {p_sala: SALA});
t(r.j?.ok && r.j.pergunta === null, 'depois de fechar, nenhum telemóvel vê pergunta');

r = await rpc('votar_exportar', {p_sala: SALA, p_chave: CHAVE + 'x'});
t(r.j?.ok === false, 'exportar sem a chave recusado');
r = await rpc('votar_exportar', {p_sala: SALA, p_chave: CHAVE});
t(r.j?.ok && r.j.perguntas.length === 3 && !JSON.stringify(r.j).includes('pid0'), 'exportar devolve 3 perguntas agregadas, sem identificadores');

// a porta das tabelas tem de estar fechada
for (const [path, hdr, m] of [['/rest/v1/votos', {}, 'tabela votos pelo esquema público'], ['/rest/v1/votos', {'Accept-Profile': 'votar'}, 'tabela votos pelo esquema votar'], ['/rest/v1/salas?select=chave_hash', {'Accept-Profile': 'votar'}, 'hashes das chaves']]) {
  const x = await fetch(URL + path, {headers: {...H, ...hdr}});
  t(x.status >= 400, `${m} inacessível (HTTP ${x.status})`);
}
r = await rpc('votar_limpar', {p_sala: SALA, p_chave: CHAVE});
t(r.j?.ok && r.j.apagados > 0, `limpar apaga os votos da sala (${r.j?.apagados})`);
console.log(`\n${ok} OK, ${falhas} falhas · sala de teste: ${SALA}`);
process.exit(falhas ? 1 : 0);
