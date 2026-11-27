-- votar · tipo «texto»: resposta aberta em 1 a 3 campos (as opções da pergunta são os nomes dos campos).
-- Privacidade: os textos nunca saem pela API pública. votar_resultados só dá o número de respostas;
-- os textos só chegam a quem tem a chave da sala (votar_textos e votar_exportar).

alter table votar.perguntas drop constraint if exists perguntas_tipo_check;
alter table votar.perguntas add constraint perguntas_tipo_check check (tipo in ('unica', 'multipla', 'escala', 'ordenar', 'texto'));

create or replace function votar._resultados(p_sala text, p_pergunta text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare q votar.perguntas; n int; nopc int; cont jsonb; prim jsonb; media numeric;
begin
  select * into q from votar.perguntas p where p.sala = p_sala and p.id = p_pergunta;
  if not found then return votar._erro('pergunta inexistente'); end if;
  select count(*) into n from votar.votos v where v.sala = p_sala and v.pergunta = p_pergunta;
  nopc := jsonb_array_length(q.opcoes);
  if q.tipo = 'texto' then
    cont := jsonb_build_array(n);
  elsif q.tipo in ('unica', 'multipla') then
    select coalesce(jsonb_agg(coalesce(t.c, 0) order by g.i), '[]'::jsonb) into cont
      from generate_series(0, nopc - 1) as g(i)
      left join (select e::int as k, count(*) as c
                   from votar.votos v, jsonb_array_elements_text(v.resposta) as e
                  where v.sala = p_sala and v.pergunta = p_pergunta group by 1) t on t.k = g.i;
  elsif q.tipo = 'ordenar' then
    select coalesce(jsonb_agg(coalesce(t.c, 0) order by g.i), '[]'::jsonb) into cont
      from generate_series(0, nopc - 1) as g(i)
      left join (select e.val::int as k, sum(jsonb_array_length(v.resposta) - e.pos)::int as c
                   from votar.votos v, jsonb_array_elements_text(v.resposta) with ordinality as e(val, pos)
                  where v.sala = p_sala and v.pergunta = p_pergunta group by 1) t on t.k = g.i;
    select coalesce(jsonb_agg(coalesce(t.c, 0) order by g.i), '[]'::jsonb) into prim
      from generate_series(0, nopc - 1) as g(i)
      left join (select (v.resposta->>0)::int as k, count(*)::int as c
                   from votar.votos v where v.sala = p_sala and v.pergunta = p_pergunta group by 1) t on t.k = g.i;
  else
    select coalesce(jsonb_agg(coalesce(t.c, 0) order by g.i), '[]'::jsonb) into cont
      from generate_series(q.escala_min, q.escala_max) as g(i)
      left join (select (v.resposta->>0)::int as k, count(*) as c
                   from votar.votos v where v.sala = p_sala and v.pergunta = p_pergunta group by 1) t on t.k = g.i;
    select round(avg((v.resposta->>0)::numeric), 2) into media
      from votar.votos v where v.sala = p_sala and v.pergunta = p_pergunta;
  end if;
  return jsonb_build_object('ok', true, 'pergunta', votar._pergunta_json(q), 'n', n, 'contagens', cont, 'media', media, 'primeiros', prim);
end $$;

create or replace function public.votar_votar(p_sala text, p_pergunta text, p_pid text, p_resposta jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare q votar.perguntas; vals int[]; nopc int; total int; txt jsonb;
begin
  if not votar._sala_ok(p_sala) then return votar._erro('sala inválida'); end if;
  if p_pid is null or p_pid !~ '^[A-Za-z0-9_-]{8,64}$' then return votar._erro('identificador inválido'); end if;
  select * into q from votar.perguntas p where p.sala = p_sala and p.id = p_pergunta;
  if not found or not q.aberta then return votar._erro('pergunta fechada'); end if;
  if p_resposta is null or jsonb_typeof(p_resposta) <> 'array' or jsonb_array_length(p_resposta) = 0
     or jsonb_array_length(p_resposta) > 10 then
    return votar._erro('resposta inválida');
  end if;
  nopc := jsonb_array_length(q.opcoes);
  select count(*) into total from votar.votos v where v.sala = p_sala and v.pergunta = p_pergunta;
  if total >= 3000 and not exists (select 1 from votar.votos v where v.sala = p_sala and v.pergunta = p_pergunta and v.pid = p_pid) then
    return votar._erro('limite de votos atingido');
  end if;

  if q.tipo = 'texto' then
    -- um texto por campo, até 280 caracteres; o primeiro campo é obrigatório
    if jsonb_array_length(p_resposta) <> nopc
       or exists (select 1 from jsonb_array_elements(p_resposta) e where jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') > 280)
       or btrim(p_resposta->>0) = '' then
      return votar._erro('resposta inválida');
    end if;
    select jsonb_agg(to_jsonb(btrim(regexp_replace(e, '[[:cntrl:]]+', ' ', 'g'))) order by o) into txt
      from jsonb_array_elements_text(p_resposta) with ordinality as x(e, o);
    insert into votar.votos (sala, pergunta, pid, resposta) values (p_sala, p_pergunta, p_pid, txt)
    on conflict (sala, pergunta, pid) do update set resposta = excluded.resposta, votado_em = now();
    return jsonb_build_object('ok', true);
  end if;

  select array_agg(e::int) into vals from jsonb_array_elements_text(p_resposta) as e where e ~ '^-?[0-9]{1,3}$';
  if vals is null or cardinality(vals) <> jsonb_array_length(p_resposta)
     or cardinality(vals) <> (select count(distinct u) from unnest(vals) as u) then
    return votar._erro('resposta inválida');
  end if;
  if q.tipo = 'unica' and not (cardinality(vals) = 1 and vals[1] between 0 and nopc - 1) then
    return votar._erro('resposta inválida');
  elsif q.tipo = 'multipla' and not (cardinality(vals) between 1 and q.max_escolhas
        and (select bool_and(u between 0 and nopc - 1) from unnest(vals) as u)) then
    return votar._erro('resposta inválida');
  elsif q.tipo = 'ordenar' and not (cardinality(vals) = nopc
        and (select bool_and(u between 0 and nopc - 1) from unnest(vals) as u)) then
    return votar._erro('resposta inválida');
  elsif q.tipo = 'escala' and not (cardinality(vals) = 1 and vals[1] between q.escala_min and q.escala_max) then
    return votar._erro('resposta inválida');
  end if;
  insert into votar.votos (sala, pergunta, pid, resposta)
       values (p_sala, p_pergunta, p_pid, to_jsonb(vals))
  on conflict (sala, pergunta, pid) do update set resposta = excluded.resposta, votado_em = now();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.votar_abrir(p_sala text, p_chave text, p_pergunta jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id text := p_pergunta->>'id';
  v_tipo text := p_pergunta->>'tipo';
  v_texto text := btrim(p_pergunta->>'texto');
  v_opcoes jsonb := coalesce(p_pergunta->'opcoes', '[]'::jsonb);
  v_ordem int; v_total int;
  v_maxesc int; v_min int; v_max int; v_nova boolean := false; v_reset boolean := false;
  a votar.perguntas;
begin
  if not votar._sala_ok(p_sala) then return votar._erro('sala inválida'); end if;
  if p_chave is null or char_length(p_chave) < 8 then return votar._erro('chave curta: mínimo 8 caracteres'); end if;
  if v_id is null or v_id !~ '^[a-z0-9][a-z0-9-]{0,39}$' then return votar._erro('id da pergunta inválido'); end if;
  if v_tipo not in ('unica', 'multipla', 'escala', 'ordenar', 'texto') then return votar._erro('tipo inválido'); end if;
  if v_texto is null or char_length(v_texto) not between 1 and 300 then return votar._erro('texto inválido'); end if;
  if jsonb_typeof(v_opcoes) <> 'array'
     or exists (select 1 from jsonb_array_elements(v_opcoes) e where jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') not between 1 and 120) then
    return votar._erro('opções inválidas');
  end if;
  if (p_pergunta ? 'ordem') or (p_pergunta ? 'total') then
    if coalesce(p_pergunta->>'ordem', '') !~ '^[0-9]{1,2}$' or coalesce(p_pergunta->>'total', '') !~ '^[0-9]{1,2}$' then
      return votar._erro('ordem e total: os dois, inteiros');
    end if;
    v_ordem := (p_pergunta->>'ordem')::int; v_total := (p_pergunta->>'total')::int;
    if v_ordem < 1 or v_ordem > v_total then return votar._erro('ordem fora do total'); end if;
  end if;
  if v_tipo = 'texto' then
    if jsonb_array_length(v_opcoes) not between 1 and 3 then return votar._erro('texto: 1 a 3 campos'); end if;
    v_maxesc := jsonb_array_length(v_opcoes);
  elsif v_tipo in ('unica', 'multipla', 'ordenar') then
    if jsonb_array_length(v_opcoes) not between 2 and 8 then return votar._erro('entre 2 e 8 opções'); end if;
    v_maxesc := case when v_tipo = 'unica' then 1 when v_tipo = 'ordenar' then jsonb_array_length(v_opcoes)
                     else coalesce((p_pergunta->>'maxEscolhas')::int, jsonb_array_length(v_opcoes)) end;
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
  insert into votar.perguntas as q (sala, id, tipo, texto, opcoes, max_escolhas, escala_min, escala_max, ordem, total, aberta, aberta_em)
       values (p_sala, v_id, v_tipo, v_texto, v_opcoes, v_maxesc, v_min, v_max, v_ordem, v_total, true, now())
  on conflict (sala, id) do update
     set tipo = excluded.tipo, texto = excluded.texto, opcoes = excluded.opcoes, max_escolhas = excluded.max_escolhas,
         escala_min = excluded.escala_min, escala_max = excluded.escala_max, ordem = excluded.ordem, total = excluded.total,
         aberta = true, aberta_em = case when q.aberta then q.aberta_em else now() end;
  update votar.salas s set atualizada = now() where s.sala = p_sala;
  return jsonb_build_object('ok', true, 'salaNova', v_nova, 'votosApagados', v_reset);
end $$;

-- Deck (com chave): textos mais recentes de uma pergunta aberta («texto»).
create or replace function public.votar_textos(p_sala text, p_chave text, p_pergunta text, p_limite int default 40) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not votar._chave_ok(p_sala, p_chave) then return votar._erro('chave errada'); end if;
  return jsonb_build_object('ok', true, 'n', (select count(*) from votar.votos v where v.sala = p_sala and v.pergunta = p_pergunta),
    'textos', coalesce((select jsonb_agg(t.resposta order by t.votado_em desc) from (
        select v.resposta, v.votado_em from votar.votos v join votar.perguntas p on p.sala = v.sala and p.id = v.pergunta
         where v.sala = p_sala and v.pergunta = p_pergunta and p.tipo = 'texto'
         order by v.votado_em desc limit least(greatest(coalesce(p_limite, 40), 1), 500)) t), '[]'::jsonb));
end $$;

-- Deck (com chave): exportar inclui os textos das perguntas «texto».
create or replace function public.votar_exportar(p_sala text, p_chave text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not votar._chave_ok(p_sala, p_chave) then return votar._erro('chave errada'); end if;
  return jsonb_build_object('ok', true, 'sala', p_sala, 'perguntas',
    coalesce((select jsonb_agg(votar._resultados(p_sala, p.id)
                 || case when p.tipo = 'texto' then jsonb_build_object('textos',
                      coalesce((select jsonb_agg(v.resposta order by v.votado_em) from votar.votos v where v.sala = p_sala and v.pergunta = p.id), '[]'::jsonb))
                    else '{}'::jsonb end
               order by p.ordem nulls last, p.aberta_em nulls last, p.id)
                from votar.perguntas p where p.sala = p_sala), '[]'::jsonb));
end $$;

revoke execute on function public.votar_votar(text, text, text, jsonb), public.votar_abrir(text, text, jsonb),
  public.votar_textos(text, text, text, int), public.votar_exportar(text, text) from public;
grant execute on function public.votar_votar(text, text, text, jsonb), public.votar_abrir(text, text, jsonb),
  public.votar_textos(text, text, text, int), public.votar_exportar(text, text) to anon, authenticated;
