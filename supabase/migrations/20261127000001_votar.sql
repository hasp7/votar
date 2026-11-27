-- votar · esquema da votação ao vivo (Supabase, projeto «votacoes», eu-central-1)
--
-- Princípios
--   * As tabelas vivem no esquema privado «votar», que a API pública (PostgREST) não expõe.
--     A plateia e o deck só chegam às funções public.votar_*, todas SECURITY DEFINER e com
--     search_path vazio.
--   * Anónimo: cada telemóvel tem só um código aleatório (pid). Não há nomes, e-mails nem IPs nas tabelas.
--   * A chave do orador nunca é guardada em claro (bcrypt via pgcrypto). Quem abre uma sala nova
--     com uma chave fica dono dela; as chamadas seguintes têm de trazer a mesma chave.
--   * Fonte única: a pergunta chega do deck em cada «abrir». Se a definição mudar, os votos
--     dessa pergunta são apagados (os índices das opções deixariam de bater certo).
--   * Um voto por telemóvel e pergunta; votar outra vez substitui o voto anterior.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists votar;
revoke all on schema votar from public;
revoke all on schema votar from anon, authenticated;

-- ---------------------------------------------------------------- tabelas
create table if not exists votar.salas (
  sala        text primary key,
  chave_hash  text not null,
  criada      timestamptz not null default now(),
  atualizada  timestamptz not null default now()
);

create table if not exists votar.perguntas (
  sala          text not null references votar.salas(sala) on delete cascade,
  id            text not null,
  tipo          text not null check (tipo in ('unica', 'multipla', 'escala')),
  texto         text not null check (char_length(texto) between 1 and 300),
  opcoes        jsonb not null default '[]'::jsonb,   -- unica/multipla: textos das opções; escala: 0 ou 2 legendas
  max_escolhas  int not null default 1,
  escala_min    int,
  escala_max    int,
  aberta        boolean not null default false,
  aberta_em     timestamptz,
  primary key (sala, id)
);

create table if not exists votar.votos (
  sala       text not null,
  pergunta   text not null,
  pid        text not null,
  resposta   jsonb not null,                           -- lista de inteiros: índices das opções ou o valor da escala
  votado_em  timestamptz not null default now(),
  primary key (sala, pergunta, pid),
  foreign key (sala, pergunta) references votar.perguntas(sala, id) on delete cascade
);

alter table votar.salas     enable row level security;
alter table votar.perguntas enable row level security;
alter table votar.votos     enable row level security;
revoke all on all tables in schema votar from public, anon, authenticated;

-- ---------------------------------------------------------------- auxiliares (privadas)
create or replace function votar._sala_ok(p text) returns boolean
language sql immutable set search_path = '' as $$
  select p is not null and p ~ '^[a-z0-9][a-z0-9-]{0,39}(/[a-z0-9][a-z0-9-]{0,39}){0,2}$'
$$;

create or replace function votar._chave_ok(p_sala text, p_chave text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare h text;
begin
  select s.chave_hash into h from votar.salas s where s.sala = p_sala;
  if h is null or p_chave is null then return false; end if;
  return h = extensions.crypt(p_chave, h);
end $$;

create or replace function votar._erro(msg text) returns jsonb
language sql immutable set search_path = '' as $$ select jsonb_build_object('ok', false, 'erro', msg) $$;

create or replace function votar._pergunta_json(q votar.perguntas) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', q.id, 'tipo', q.tipo, 'texto', q.texto, 'opcoes', q.opcoes,
                            'maxEscolhas', q.max_escolhas, 'min', q.escala_min, 'max', q.escala_max,
                            'aberta', q.aberta, 'abertaEm', q.aberta_em)
$$;

create or replace function votar._resultados(p_sala text, p_pergunta text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare q votar.perguntas; n int; cont jsonb; media numeric;
begin
  select * into q from votar.perguntas p where p.sala = p_sala and p.id = p_pergunta;
  if not found then return votar._erro('pergunta inexistente'); end if;
  select count(*) into n from votar.votos v where v.sala = p_sala and v.pergunta = p_pergunta;
  if q.tipo in ('unica', 'multipla') then
    select coalesce(jsonb_agg(coalesce(t.c, 0) order by g.i), '[]'::jsonb) into cont
      from generate_series(0, jsonb_array_length(q.opcoes) - 1) as g(i)
      left join (select e::int as k, count(*) as c
                   from votar.votos v, jsonb_array_elements_text(v.resposta) as e
                  where v.sala = p_sala and v.pergunta = p_pergunta group by 1) t on t.k = g.i;
  else
    select coalesce(jsonb_agg(coalesce(t.c, 0) order by g.i), '[]'::jsonb) into cont
      from generate_series(q.escala_min, q.escala_max) as g(i)
      left join (select (v.resposta->>0)::int as k, count(*) as c
                   from votar.votos v where v.sala = p_sala and v.pergunta = p_pergunta group by 1) t on t.k = g.i;
    select round(avg((v.resposta->>0)::numeric), 2) into media
      from votar.votos v where v.sala = p_sala and v.pergunta = p_pergunta;
  end if;
  return jsonb_build_object('ok', true, 'pergunta', votar._pergunta_json(q), 'n', n, 'contagens', cont, 'media', media);
end $$;

-- ---------------------------------------------------------------- API pública
-- Plateia: que pergunta está aberta nesta sala?
create or replace function public.votar_estado(p_sala text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare q votar.perguntas;
begin
  if not votar._sala_ok(p_sala) then return votar._erro('sala inválida'); end if;
  select * into q from votar.perguntas p where p.sala = p_sala and p.aberta limit 1;
  if not found then return jsonb_build_object('ok', true, 'pergunta', null); end if;
  return jsonb_build_object('ok', true, 'pergunta', votar._pergunta_json(q));
end $$;

-- Plateia: votar (ou mudar o voto) na pergunta aberta.
create or replace function public.votar_votar(p_sala text, p_pergunta text, p_pid text, p_resposta jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare q votar.perguntas; vals int[]; nopc int; total int;
begin
  if not votar._sala_ok(p_sala) then return votar._erro('sala inválida'); end if;
  if p_pid is null or p_pid !~ '^[A-Za-z0-9_-]{8,64}$' then return votar._erro('identificador inválido'); end if;
  select * into q from votar.perguntas p where p.sala = p_sala and p.id = p_pergunta;
  if not found or not q.aberta then return votar._erro('pergunta fechada'); end if;
  if p_resposta is null or jsonb_typeof(p_resposta) <> 'array' or jsonb_array_length(p_resposta) = 0
     or jsonb_array_length(p_resposta) > 10 then
    return votar._erro('resposta inválida');
  end if;
  select array_agg(e::int) into vals from jsonb_array_elements_text(p_resposta) as e where e ~ '^-?[0-9]{1,3}$';
  if vals is null or cardinality(vals) <> jsonb_array_length(p_resposta)
     or cardinality(vals) <> (select count(distinct u) from unnest(vals) as u) then
    return votar._erro('resposta inválida');
  end if;
  nopc := jsonb_array_length(q.opcoes);
  if q.tipo = 'unica' and not (cardinality(vals) = 1 and vals[1] between 0 and nopc - 1) then
    return votar._erro('resposta inválida');
  elsif q.tipo = 'multipla' and not (cardinality(vals) between 1 and q.max_escolhas
        and (select bool_and(u between 0 and nopc - 1) from unnest(vals) as u)) then
    return votar._erro('resposta inválida');
  elsif q.tipo = 'escala' and not (cardinality(vals) = 1 and vals[1] between q.escala_min and q.escala_max) then
    return votar._erro('resposta inválida');
  end if;
  select count(*) into total from votar.votos v where v.sala = p_sala and v.pergunta = p_pergunta;
  if total >= 3000 and not exists (select 1 from votar.votos v where v.sala = p_sala and v.pergunta = p_pergunta and v.pid = p_pid) then
    return votar._erro('limite de votos atingido');
  end if;
  insert into votar.votos (sala, pergunta, pid, resposta)
       values (p_sala, p_pergunta, p_pid, to_jsonb(vals))
  on conflict (sala, pergunta, pid) do update set resposta = excluded.resposta, votado_em = now();
  return jsonb_build_object('ok', true);
end $$;

-- Deck e plateia: resultados agregados de uma pergunta (nunca votos individuais).
create or replace function public.votar_resultados(p_sala text, p_pergunta text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not votar._sala_ok(p_sala) then return votar._erro('sala inválida'); end if;
  return votar._resultados(p_sala, p_pergunta);
end $$;

-- Deck (com chave): abre uma pergunta, enviando a definição que está no diapositivo.
-- Cria a sala na primeira vez; fecha as outras perguntas da sala.
create or replace function public.votar_abrir(p_sala text, p_chave text, p_pergunta jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id text := p_pergunta->>'id';
  v_tipo text := p_pergunta->>'tipo';
  v_texto text := btrim(p_pergunta->>'texto');
  v_opcoes jsonb := coalesce(p_pergunta->'opcoes', '[]'::jsonb);
  v_maxesc int; v_min int; v_max int; v_nova boolean := false; v_reset boolean := false;
  a votar.perguntas;
begin
  if not votar._sala_ok(p_sala) then return votar._erro('sala inválida'); end if;
  if p_chave is null or char_length(p_chave) < 8 then return votar._erro('chave curta: mínimo 8 caracteres'); end if;
  if v_id is null or v_id !~ '^[a-z0-9][a-z0-9-]{0,39}$' then return votar._erro('id da pergunta inválido'); end if;
  if v_tipo not in ('unica', 'multipla', 'escala') then return votar._erro('tipo inválido'); end if;
  if v_texto is null or char_length(v_texto) not between 1 and 300 then return votar._erro('texto inválido'); end if;
  if jsonb_typeof(v_opcoes) <> 'array'
     or exists (select 1 from jsonb_array_elements(v_opcoes) e where jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') not between 1 and 120) then
    return votar._erro('opções inválidas');
  end if;
  if v_tipo in ('unica', 'multipla') then
    if jsonb_array_length(v_opcoes) not between 2 and 8 then return votar._erro('entre 2 e 8 opções'); end if;
    v_maxesc := case when v_tipo = 'unica' then 1 else coalesce((p_pergunta->>'maxEscolhas')::int, jsonb_array_length(v_opcoes)) end;
    if v_maxesc not between 1 and jsonb_array_length(v_opcoes) then return votar._erro('maxEscolhas inválido'); end if;
  else
    v_maxesc := 1; v_min := coalesce((p_pergunta->>'min')::int, 1); v_max := coalesce((p_pergunta->>'max')::int, 5);
    if v_min >= v_max or v_max - v_min > 10 or jsonb_array_length(v_opcoes) not in (0, 2) then return votar._erro('escala inválida'); end if;
  end if;

  if not exists (select 1 from votar.salas s where s.sala = p_sala) then
    insert into votar.salas (sala, chave_hash) values (p_sala, extensions.crypt(p_chave, extensions.gen_salt('bf', 10)));
    v_nova := true;
  elsif not votar._chave_ok(p_sala, p_chave) then
    return votar._erro('chave errada');
  end if;

  select * into a from votar.perguntas p where p.sala = p_sala and p.id = v_id;
  if found and (a.tipo, a.texto, a.opcoes, a.max_escolhas, a.escala_min, a.escala_max)
               is distinct from (v_tipo, v_texto, v_opcoes, v_maxesc, v_min, v_max) then
    delete from votar.votos v where v.sala = p_sala and v.pergunta = v_id;
    v_reset := true;
  end if;
  update votar.perguntas p set aberta = false where p.sala = p_sala and p.aberta and p.id <> v_id;
  insert into votar.perguntas as q (sala, id, tipo, texto, opcoes, max_escolhas, escala_min, escala_max, aberta, aberta_em)
       values (p_sala, v_id, v_tipo, v_texto, v_opcoes, v_maxesc, v_min, v_max, true, now())
  on conflict (sala, id) do update
     set tipo = excluded.tipo, texto = excluded.texto, opcoes = excluded.opcoes, max_escolhas = excluded.max_escolhas,
         escala_min = excluded.escala_min, escala_max = excluded.escala_max, aberta = true,
         aberta_em = case when q.aberta then q.aberta_em else now() end;
  update votar.salas s set atualizada = now() where s.sala = p_sala;
  return jsonb_build_object('ok', true, 'salaNova', v_nova, 'votosApagados', v_reset);
end $$;

-- Deck (com chave): fecha a pergunta aberta (os telemóveis deixam de poder votar).
create or replace function public.votar_fechar(p_sala text, p_chave text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not votar._chave_ok(p_sala, p_chave) then return votar._erro('chave errada'); end if;
  update votar.perguntas p set aberta = false where p.sala = p_sala and p.aberta;
  return jsonb_build_object('ok', true);
end $$;

-- Deck (com chave): apaga os votos da sala, ou só de uma pergunta (ensaio antes da sessão real).
create or replace function public.votar_limpar(p_sala text, p_chave text, p_pergunta text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not votar._chave_ok(p_sala, p_chave) then return votar._erro('chave errada'); end if;
  delete from votar.votos v where v.sala = p_sala and (p_pergunta is null or v.pergunta = p_pergunta);
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'apagados', n);
end $$;

-- Deck (com chave): resultados agregados de todas as perguntas da sala, para o CSV.
create or replace function public.votar_exportar(p_sala text, p_chave text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not votar._chave_ok(p_sala, p_chave) then return votar._erro('chave errada'); end if;
  return jsonb_build_object('ok', true, 'sala', p_sala, 'perguntas',
    coalesce((select jsonb_agg(votar._resultados(p_sala, p.id) order by p.aberta_em nulls last, p.id)
                from votar.perguntas p where p.sala = p_sala), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- permissões
revoke execute on all functions in schema votar from public, anon, authenticated;
revoke execute on function public.votar_estado(text), public.votar_votar(text, text, text, jsonb),
  public.votar_resultados(text, text), public.votar_abrir(text, text, jsonb), public.votar_fechar(text, text),
  public.votar_limpar(text, text, text), public.votar_exportar(text, text) from public;
grant execute on function public.votar_estado(text), public.votar_votar(text, text, text, jsonb),
  public.votar_resultados(text, text), public.votar_abrir(text, text, jsonb), public.votar_fechar(text, text),
  public.votar_limpar(text, text, text), public.votar_exportar(text, text) to anon, authenticated;
