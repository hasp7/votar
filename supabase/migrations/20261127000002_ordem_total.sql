-- votar · posição da pergunta na sequência («Pergunta 2 de 3» no telemóvel)
-- ordem e total chegam do deck em cada «abrir», opcionais. Não fazem parte da definição da pergunta:
-- mudar a posição não apaga votos.

alter table votar.perguntas add column if not exists ordem int, add column if not exists total int;

create or replace function votar._pergunta_json(q votar.perguntas) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', q.id, 'tipo', q.tipo, 'texto', q.texto, 'opcoes', q.opcoes,
                            'maxEscolhas', q.max_escolhas, 'min', q.escala_min, 'max', q.escala_max,
                            'ordem', q.ordem, 'total', q.total,
                            'aberta', q.aberta, 'abertaEm', q.aberta_em)
$$;

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
  if v_tipo not in ('unica', 'multipla', 'escala') then return votar._erro('tipo inválido'); end if;
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
  insert into votar.perguntas as q (sala, id, tipo, texto, opcoes, max_escolhas, escala_min, escala_max, ordem, total, aberta, aberta_em)
       values (p_sala, v_id, v_tipo, v_texto, v_opcoes, v_maxesc, v_min, v_max, v_ordem, v_total, true, now())
  on conflict (sala, id) do update
     set tipo = excluded.tipo, texto = excluded.texto, opcoes = excluded.opcoes, max_escolhas = excluded.max_escolhas,
         escala_min = excluded.escala_min, escala_max = excluded.escala_max, ordem = excluded.ordem, total = excluded.total,
         aberta = true, aberta_em = case when q.aberta then q.aberta_em else now() end;
  update votar.salas s set atualizada = now() where s.sala = p_sala;
  return jsonb_build_object('ok', true, 'salaNova', v_nova, 'votosApagados', v_reset);
end $$;

revoke execute on function public.votar_abrir(text, text, jsonb) from public;
grant execute on function public.votar_abrir(text, text, jsonb) to anon, authenticated;
