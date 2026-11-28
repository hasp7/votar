# votar

Votação ao vivo para apresentações: a plateia lê o código QR do diapositivo, vota no telemóvel e
o orador vê os resultados no ecrã. Sem Google, sem contas e sem nomes.

**Página da plateia:** `https://hasp7.github.io/votar/<sala>/`

## Como funciona

```
 deck (deck-imersivo, a-poll)            telemóveis                      Supabase «votacoes» (UE)
 ─────────────────────────────           ──────────────────              ──────────────────────────
 entra no diapositivo  ── abrir ─────────────────────────────────────▶  guarda a pergunta, abre-a
                                          a cada 3 s: estado ─────────▶  devolve a pergunta aberta
                                          toque numa opção: votar ────▶  conta (1 voto por telemóvel)
 tecla R  ─────────────── resultados ────────────────────────────────▶  devolve só os totais
```

- **Sala** é o que vem no endereço (`spp26`, `egas/m0/t1`): letras minúsculas, algarismos e hífens,
  até três níveis. Quem abre uma sala nova com uma chave (mínimo 8 caracteres) fica dono dela.
- **Fonte única:** a pergunta é enviada pelo deck quando o diapositivo abre. Se o texto ou as opções
  mudarem, os votos antigos dessa pergunta são apagados.
- **Tipos:** escolha única, escolha múltipla (com máximo) e escala de 1 a N com legendas.
- **Votar outra vez** substitui o voto anterior, até a pergunta fechar.

## Tema por evento

Uma sala cujo primeiro nível tem pasta em `temas/` usa o tema dessa pasta (ex.: `spp26` e `spp26/…` usam
`temas/spp26/`). Sem pasta, a página fica com o aspeto neutro.

- `tema.json`: `titulo` e `subtitulo` (em cima), `autor` e `contactos` (rodapé, à esquerda), `agradecimento`
  (em baixo, discreto) e `css`. Tudo entra como texto, nunca como HTML.
- `tema.css`: cores, fontes e marca de água do template da apresentação. Fontes e imagens ficam na própria
  pasta (a CSP só deixa carregar do próprio site); fontes com a licença ao lado (`OFL.txt`).
- «Pergunta x de y» no rodapé, à direita, quando o deck envia `ordem` e `total` ao abrir a pergunta.

## Aviso da sala

Depois da sessão, o dono da sala pode deixar um aviso a quem ainda tem a página aberta: um texto curto
(até 280 caracteres) e, se quiser, um link `https` com rótulo. Aparece fora das perguntas, por cima do
cartão da lista de espera, e chega aos separadores abertos sem recarregar (a página lê-o a cada ciclo).
Separadores carregados antes desta versão só o veem depois de recarregar.

```js
// na consola do browser, com a chave da sala (nunca em ficheiros)
await fetch('https://tlqnhpvdzgyqwmextemq.supabase.co/rest/v1/rpc/votar_aviso', {method: 'POST',
  headers: {apikey: '<chave_publicavel>', 'Content-Type': 'application/json'},
  body: JSON.stringify({p_sala: 'spp26', p_chave: '<chave da sala>', p_texto: 'O protótipo está pronto.',
    p_link: 'https://…', p_rotulo: 'Ver o protótipo'})}).then(r => r.json());
// p_texto vazio retira o aviso
```

## Privacidade

- Cada telemóvel tem só um código aleatório guardado no próprio telemóvel. Não se pede nome,
  e-mail nem contacto, e as tabelas não guardam IPs.
- A página só fala com o Supabase (política de segurança no próprio HTML), não carrega fontes,
  bibliotecas nem estatísticas de terceiros.
- A chave do orador é guardada só em hash (bcrypt). Os votos individuais nunca saem da base de
  dados: a API só devolve totais.
- O Supabase e o GitHub registam IPs nos seus registos de acesso, como qualquer site.

## Ficheiros

| Ficheiro | O quê |
|---|---|
| `index.html`, `404.html` | A página (iguais: o GitHub Pages serve o `404.html` para qualquer `/votar/<sala>/`) |
| `app.js`, `app.css` | Lógica e estilo; sem dependências |
| `supabase/migrations/` | Esquema da base de dados (fonte de verdade) |
| `temas/<evento>/` | Tema de um evento (ver acima) |
| `tests/api.test.mjs` | 66 verificações da API: votos válidos e inválidos, chave, tabelas fechadas |
| `tests/pagina.test.mjs` | 58 verificações da página, com tema e sem tema, com 3 telemóveis simulados contra a base real |

```bash
node tests/api.test.mjs https://tlqnhpvdzgyqwmextemq.supabase.co <chave_publicavel>
node tests/pagina.test.mjs <chave_publicavel>     # precisa do chromium
```

Os testes usam salas `teste/…`; apagar no fim com `delete from votar.salas where sala like 'teste/%';`.

## Base de dados

Projeto Supabase `votacoes` (`tlqnhpvdzgyqwmextemq`, eu-central-1, plano gratuito). A chave
publicável em `app.js` é pública por desenho; não dá acesso às tabelas.

- Alterações ao esquema: nova migração em `supabase/migrations/`, aplicada depois ao projeto.
- O plano gratuito pausa o projeto ao fim de cerca de uma semana sem uso. Antes de uma sessão,
  abrir a página de uma sala qualquer (ou o painel do Supabase) para o acordar.

## Resultados da spp26 (páginas estáticas)

`spp26/resultados/` é a página da sessão do 42.º Congresso de Pneumologia (28/11/2026): votações agregadas, ideias
Wild card e os protótipos construídos a partir delas. Não fala com o Supabase: CSP com `connect-src 'none'`.

- `index.html`: landing (resultados q1–q3, temas da q4, protótipos). Dados copiados à mão do CSV agregado, sem emails.
- `dpoc/`: protótipo de monitorização DPOC (CAT, mMRC, SGRQ, LCADL). `escalas.js` é a fonte única das escalas
  (cotação, limiares só de fontes verificadas, descrição, modo de usar, bibliografia com PMID/DOI); `dpoc.js` trata do
  código pseudónimo, da evolução e do ficheiro FHIR R4 (etiqueta `HTEST`, recusa ficheiros sem ela; SNOMED CT
  internacional no CAT, SGRQ e graus do mMRC, confirmados no Ontoserver; LCADL só com código local). Nada é guardado.
  Interface revista pelas HIG da Apple e WCAG: utente sempre à vista, escalas que abrem, erros junto ao item, «pior»/«melhor»
  em palavras, sem mensagens com temporizador; bordas de controlo ≥ 3:1 e texto ≥ 4,5:1 (verificado no teste).
- `como-foi-construido/`: processo, prompts, ferramentas, o que foi verificado e por quem, riscos.
- `comum/`: identidade SPP (as fontes e as velas vêm de `temas/spp26/`).
- Teste: `node tests/resultados.test.mjs [pasta-capturas] [--og]` (Chromium sem janela, sem rede; `--og` refaz `og.png`).

