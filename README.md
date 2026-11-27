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
| `tests/api.test.mjs` | 31 verificações da API: votos válidos e inválidos, chave, tabelas fechadas |
| `tests/pagina.test.mjs` | 18 verificações da página com 3 telemóveis simulados contra a base real |

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
