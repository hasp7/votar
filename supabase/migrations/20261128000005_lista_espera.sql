-- votar · lista de espera (email opcional, depois das perguntas)
-- Privacidade: o email fica numa tabela à parte, sem o código do telemóvel (não liga a pessoa aos votos);
-- só entra com consentimento explícito; só sai com a chave da sala (exportar) e apaga-se com a chave.
-- votar_estado passa a dizer se a sala já teve perguntas (para o telemóvel mostrar a lista depois do fecho).

create table if not exists votar.lista (
  sala        text not null references votar.salas(sala) on delete cascade,
  email       text not null check (char_length(email) between 5 and 254),
  inscrito_em timestamptz not null default now(),
  primary key (sala, email)
);
alter table votar.lista enable row level security;
revoke all on votar.lista from public, anon, authenticated;

create or replace function public.votar_estado(p_sala text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare q votar.perguntas; n int;
begin
  if not votar._sala_ok(p_sala) then return votar._erro('sala inválida'); end if;
  select count(*) into n from votar.perguntas p where p.sala = p_sala;
  select * into q from votar.perguntas p where p.sala = p_sala and p.aberta limit 1;
  if not found then return jsonb_build_object('ok', true, 'pergunta', null, 'perguntas', n); end if;
  return jsonb_build_object('ok', true, 'pergunta', votar._pergunta_json(q), 'perguntas', n);
end $$;

-- Plateia: inscrever-se na lista de espera (consentimento obrigatório).
create or replace function public.votar_lista_inscrever(p_sala text, p_email text, p_aceito boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e text := lower(btrim(coalesce(p_email, '')));
begin
  if not votar._sala_ok(p_sala) then return votar._erro('sala inválida'); end if;
  if not exists (select 1 from votar.salas s where s.sala = p_sala) then return votar._erro('sala inexistente'); end if;
  if p_aceito is not true then return votar._erro('consentimento em falta'); end if;
  if char_length(e) not between 5 and 254 or e !~ '^[^@[:space:]<>]+@[^@[:space:]<>]+\.[a-z]{2,}$' then return votar._erro('email inválido'); end if;
  if (select count(*) from votar.lista l where l.sala = p_sala) >= 2000 then return votar._erro('lista cheia'); end if;
  insert into votar.lista (sala, email) values (p_sala, e) on conflict (sala, email) do nothing;
  return jsonb_build_object('ok', true);
end $$;

-- Orador (com chave): exportar a lista para enviar o link.
create or replace function public.votar_lista_exportar(p_sala text, p_chave text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not votar._chave_ok(p_sala, p_chave) then return votar._erro('chave errada'); end if;
  return jsonb_build_object('ok', true, 'emails',
    coalesce((select jsonb_agg(l.email order by l.inscrito_em) from votar.lista l where l.sala = p_sala), '[]'::jsonb));
end $$;

-- Orador (com chave): apagar a lista depois do envio.
create or replace function public.votar_lista_apagar(p_sala text, p_chave text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not votar._chave_ok(p_sala, p_chave) then return votar._erro('chave errada'); end if;
  delete from votar.lista l where l.sala = p_sala;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'apagados', n);
end $$;

revoke execute on function public.votar_estado(text), public.votar_lista_inscrever(text, text, boolean),
  public.votar_lista_exportar(text, text), public.votar_lista_apagar(text, text) from public;
grant execute on function public.votar_estado(text), public.votar_lista_inscrever(text, text, boolean),
  public.votar_lista_exportar(text, text), public.votar_lista_apagar(text, text) to anon, authenticated;
