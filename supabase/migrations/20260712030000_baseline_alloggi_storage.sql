-- ============================================================
-- BASELINE DOCUMENTALE — bucket Storage "alloggi-foto"
-- Sprint 2.1 (bozza) → Sprint 2.2 (corretta contro il remoto reale)
--
-- ⚠️  NON APPLICARE AUTOMATICAMENTE SENZA CONFRONTO CON IL REMOTO.
--
-- Sprint 2.2: introspezione in sola lettura via Storage API
-- (GET /storage/v1/bucket/alloggi-foto e GET /storage/v1/bucket, entrambe
-- con service role key) + un test di enumerazione (POST
-- /storage/v1/object/list, che in Supabase Storage è l'operazione di
-- "list/ls" — semanticamente una lettura, non una scrittura, nonostante
-- il verbo HTTP POST dovuto al bisogno di un body per i parametri di
-- paginazione). Nessun file caricato, spostato o cancellato. Metodo
-- completo in docs/SUPABASE_REMOTE_AUDIT.md.
-- ============================================================

-- VERIFICATO (era "dedotto con alta confidenza" nello Sprint 2.1):
--   - bucket "alloggi-foto" esiste, public: true
--   - è l'UNICO bucket nel progetto (nessun altro bucket dimenticato)
insert into storage.buckets (id, name, public)
values ('alloggi-foto', 'alloggi-foto', true)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- Configurazione bucket — GAP CONFERMATO (non più solo un'ipotesi)
-- ------------------------------------------------------------
--
-- CONFERMATO via GET /storage/v1/bucket/alloggi-foto:
--   file_size_limit:    null   (NESSUN limite lato server)
--   allowed_mime_types: null   (NESSUN filtro MIME lato server)
--
-- L'app limita a 5MB e a image/jpeg|png|webp esclusivamente lato client
-- (src/pages/alloggi/pubblica.astro, funzione validaFile()). Chiunque
-- chiami l'endpoint di upload direttamente (bypassando il form) può
-- caricare file di qualunque dimensione e tipo in un bucket PUBBLICO.
-- Correzione proposta (non applicata) in:
--   supabase/migrations/20260712050000_harden_alloggi_storage_limits.sql
--
-- ------------------------------------------------------------
-- Policy RLS su storage.objects — DEFINITIVAMENTE VERIFICATO (Sprint 2.3)
-- ------------------------------------------------------------
--
-- CONFERMATO leggendo pg_class.relrowsecurity: RLS attiva su
-- storage.objects. CONFERMATO leggendo pg_policies: esiste esattamente
-- UNA policy su questa tabella in tutto il progetto (un solo bucket,
-- alloggi-foto, esiste — vedi sopra), con un nome diverso da quello
-- proposto nello Sprint 2.1/2.2:
--
--   nome reale:   "Upload anonimo in pending"
--   comando:      INSERT
--   ruoli:        {anon,authenticated}
--   WITH CHECK:   (bucket_id = 'alloggi-foto' AND (storage.foldername(name))[1] = 'pending')
--
-- Logica identica a quella proposta — il blocco INSERT sotto NON viene
-- più creato qui, per evitare una seconda policy ridondante con lo
-- stesso identico effetto.
--
-- CONFERMATO ANCHE: un client anonimo non può enumerare il contenuto del
-- bucket (list-test Sprint 2.2: array vuoto per anon, file reali presenti
-- per service role) — coerente con l'assenza di una policy SELECT: senza
-- una policy SELECT esplicita e con RLS attiva, `list`/enumerazione è
-- correttamente negata di default. La lettura diretta by-path resta
-- comunque pubblica perché il bucket ha `public: true` (le richieste su
-- /storage/v1/object/public/... non passano da RLS per design Supabase).
--
-- La policy SELECT proposta sotto NON è ridondante (nessuna policy
-- equivalente esiste sul remoto) ma nemmeno necessaria per il
-- funzionamento attuale — è mantenuta come opzione difensiva esplicita,
-- non come correzione di un gap. Applicarla non cambierebbe il
-- comportamento osservabile dall'esterno (il bucket è già pubblico in
-- lettura by-path), abiliterebbe però l'enumerazione anche per un client
-- autenticato/anonimo che chiami l'endpoint `list` — probabilmente NON
-- desiderato, dato che l'assenza di questa policy è ciò che oggi blocca
-- l'enumerazione. Si raccomanda di NON applicarla.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'alloggi_foto_public_read'
  ) then
    create policy "alloggi_foto_public_read" on storage.objects
      for select
      to anon, authenticated
      using (bucket_id = 'alloggi-foto');
  end if;
end $$;

-- Nessuna policy UPDATE/DELETE proposta: nessun percorso applicativo
-- modifica o cancella oggetti in questo bucket.
--
-- OSSERVAZIONE OPERATIVA (non una policy, un rilievo dai metadati letti
-- durante l'audit): esistono nel bucket file da 0 byte accanto a file di
-- dimensione normale con lo stesso prefisso UUID — probabile upload
-- fallito/parziale che comunque è stato accettato dallo Storage. Le foto
-- di annunci rifiutati o scaduti restano inoltre indefinitamente in
-- Storage — nessun processo di pulizia esiste. Nessuna azione in questo
-- sprint (richiederebbe una policy di retention concordata, fuori
-- mandato). Vedi docs/ADMIN_FOUNDATIONS.md.
