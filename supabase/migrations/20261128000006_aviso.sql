-- votar · aviso da sala (texto curto e, se houver, um link), mostrado nos telemóveis fora das perguntas
-- Serve para falar com quem ficou com a página aberta depois da sessão: lembrar a lista de espera,
-- dar o link do que se construiu. Só o dono da sala (com a chave) o define ou retira.
-- votar_estado passa a devolver o aviso; a página lê-o a cada ciclo, por isso chega sem recarregar.

alter table votar.salas add column if not exists aviso jsonb;

create or replace function public.votar_estado(p_sala text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare q votar.perguntas; n int; a jsonb;
begin
  if not votar._sala_ok(p_sala) then return votar._erro('sala inválida'); end if;
  select count(*) into n from votar.perguntas p where p.sala = p_sala;
  select s.aviso into a from votar.salas s where s.sala = p_sala;
  select * into q from votar.perguntas p where p.sala = p_sala and p.aberta limit 1;
  if not found then return jsonb_build_object('ok', true, 'pergunta', null, 'perguntas', n, 'aviso', a); end if;
  return jsonb_build_object('ok', true, 'pergunta', votar._pergunta_json(q), 'perguntas', n, 'aviso', a);
end $$;

-- Orador (com chave): definir o aviso. Texto vazio ou nulo retira-o. O link é opcional e só https.
create or replace function public.votar_aviso(p_sala text, p_chave text, p_texto text,
  p_link text default null, p_rotulo text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t text := btrim(coalesce(p_texto, '')); l text := nullif(btrim(coalesce(p_link, '')), '');
        r text := nullif(btrim(coalesce(p_rotulo, '')), ''); a jsonb;
begin
  if not votar._chave_ok(p_sala, p_chave) then return votar._erro('chave errada'); end if;
  if t = '' then
    update votar.salas s set aviso = null, atualizada = now() where s.sala = p_sala;
    return jsonb_build_object('ok', true, 'aviso', null);
  end if;
  if char_length(t) > 280 then return votar._erro('aviso com mais de 280 caracteres'); end if;
  if l is not null and (char_length(l) > 500 or l !~ '^https://[^[:space:]<>"''`]+$') then return votar._erro('link inválido (só https)'); end if;
  if r is not null and char_length(r) > 60 then return votar._erro('rótulo com mais de 60 caracteres'); end if;
  if l is null and r is not null then return votar._erro('rótulo sem link'); end if;
  a := jsonb_strip_nulls(jsonb_build_object('texto', t, 'link', l, 'rotulo', r, 'em', now()));
  update votar.salas s set aviso = a, atualizada = now() where s.sala = p_sala;
  return jsonb_build_object('ok', true, 'aviso', a);
end $$;

revoke execute on function public.votar_estado(text), public.votar_aviso(text, text, text, text, text) from public;
grant execute on function public.votar_estado(text), public.votar_aviso(text, text, text, text, text) to anon, authenticated;
