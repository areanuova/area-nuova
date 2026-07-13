-- ============================================================
-- Bootstrap del primo super_admin — Sprint 3.1
--
-- NON è una migration Supabase CLI: non va messa in supabase/migrations/
-- e non va eseguita da `supabase db push`. È un'operazione manuale, una
-- tantum, da incollare nel SQL Editor di Supabase DOPO aver applicato
-- supabase/migrations/20260712000000_cms_roles.sql.
--
-- SICUREZZA: il placeholder INSERINE_EMAIL_ADMIN_ESISTENTE va sostituito
-- SOLO nel testo incollato nell'SQL Editor del browser. Non modificare e
-- salvare questo file con l'email reale — resterebbe nella cronologia
-- del repository Git anche se poi rimossa in un commit successivo.
--
-- Cosa fa, in ordine:
--   1. Rifiuta di procedere se il placeholder non è stato sostituito.
--   2. Verifica che l'email indicata esista in admin_users e sia
--      esattamente una riga (mai zero, mai più di una).
--   3. Rifiuta di procedere se esiste già un super_admin (evita doppie
--      esecuzioni accidentali — il bootstrap serve solo per il primo).
--   4. Promuove quella sola riga a super_admin, con attivo = true.
--   5. Non crea alcun account Supabase Auth (l'utente deve già poter
--      accedere tramite magic link, come admin_users prevede da sempre).
--   6. Non tocca nessun'altra riga, nessun'altra tabella.
-- ============================================================

do $$
declare
  target_email text := 'INSERINE_EMAIL_ADMIN_ESISTENTE';
  match_count int;
  super_admin_count int;
begin
  if target_email = 'INSERINE_EMAIL_ADMIN_ESISTENTE' then
    raise exception 'Sostituisci il placeholder con l''email reale prima di eseguire — solo nel testo incollato nell''SQL Editor, mai in questo file.';
  end if;

  select count(*) into match_count from admin_users where email = target_email;
  if match_count = 0 then
    raise exception 'Nessuna riga in admin_users con email %', target_email;
  end if;
  if match_count > 1 then
    raise exception 'Trovate % righe con la stessa email in admin_users — atteso esattamente 1, nessuna modifica effettuata', match_count;
  end if;

  select count(*) into super_admin_count from admin_users where role = 'super_admin';
  if super_admin_count > 0 then
    raise exception 'Esiste già almeno un super_admin (% righe) — bootstrap non necessario, nessuna modifica effettuata', super_admin_count;
  end if;

  update admin_users
  set role = 'super_admin', attivo = true
  where email = target_email;
end $$;

-- ============================================================
-- VERIFICA (sola lettura) — conferma che esista ora esattamente un
-- super_admin, con l'email attesa.
-- ============================================================
select id, email, role, attivo from admin_users where role = 'super_admin';
