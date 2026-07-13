-- ============================================================
-- HARDENING — limiti bucket alloggi-foto
-- Sprint 2.2 (proposto) → Sprint 2.3 (riconfermato) → Sprint 2.4 (APPLICATO)
--
-- ✅ APPLICATO il 2026-07-12, con autorizzazione esplicita dell'utente
-- limitata a questa sola modifica. Metodo: Supabase Storage Admin API
-- (PUT /storage/v1/bucket/alloggi-foto), non esecuzione diretta di questo
-- file SQL — nessun accesso a un canale di esecuzione SQL diretto era
-- disponibile (nessuna Supabase CLI collegata, nessuna connessione
-- Postgres diretta). L'API Storage produce lo stesso identico effetto
-- sulla stessa riga/colonne di storage.buckets, per costruzione senza
-- possibilità di toccare policy, altre tabelle o altri bucket.
--
-- Verificato dopo l'applicazione: file_size_limit=5242880,
-- allowed_mime_types=[image/jpeg,image/png,image/webp], public invariato
-- (true), 16/16 file in pending/ invariati (stessi nomi, prima e dopo),
-- un solo bucket nel progetto. Dettaglio completo nel report di Sprint 2.4.
--
-- Questo file resta nel repository come registrazione della migration
-- baseline corrispondente allo stato ora reale — utile se il progetto
-- Supabase dovesse mai essere ricreato da zero.
--
-- Riconfermato con una nuova lettura (2026-07-12, sola lettura,
-- GET /storage/v1/bucket/alloggi-foto): il bucket ha ancora
-- file_size_limit=null e allowed_mime_types=null — nessun limite lato
-- server, invariato dallo Sprint 2.2. L'app impone 5MB e
-- image/jpeg|png|webp solo lato client
-- (src/pages/alloggi/pubblica.astro, funzione validaFile()), un
-- controllo bypassabile chiamando l'endpoint di upload direttamente.
-- ============================================================

-- Verifica valori target contro l'app reale (Attività 3, Sprint 2.3):
-- FORMATI_VALIDI in pubblica.astro è ['image/jpeg', 'image/png',
-- 'image/webp'] — il form HTML ha anche accept="image/jpeg,image/png,image/webp"
-- coerente. PNG è quindi realmente supportato dall'interfaccia (non un
-- refuso): nessuna restrizione dell'elenco rispetto allo Sprint 2.2.
--
-- Limite di dimensione: 5MB, identico a MAX_FILE_SIZE in pubblica.astro.
--
-- Nota sui limiti di questo intervento: Supabase Storage applica
-- `allowed_mime_types` confrontando il Content-Type DICHIARATO
-- dall'uploader (lo stesso valore che l'app imposta esplicitamente con
-- `{ contentType: file.type }`), non la firma reale dei byte del file
-- (magic number). Un client che dichiari deliberatamente un
-- Content-Type falso per un file di contenuto diverso non verrebbe
-- fermato da questo controllo — servirebbe una verifica della firma
-- reale, che richiederebbe nuova logica applicativa (edge function o
-- controllo lato client con lettura dei primi byte) e non nuove
-- dipendenze strettamente necessarie: valutata fuori dall'ambito di un
-- hardening minimo, segnalata come limitazione residua in
-- docs/ADMIN_FOUNDATIONS.md.
--
-- Effetto pratico dell'assenza attuale di limiti: chiunque può caricare
-- file di qualunque dimensione o Content-Type dichiarato in un bucket
-- PUBBLICO. Il rischio è mitigato (non eliminato) dal fatto — confermato
-- Sprint 2.2 — che l'elenco del bucket non è enumerabile da un client
-- anonimo: un file caricato resta comunque raggiungibile da chiunque ne
-- conosca l'URL, che finisce comunque pubblicato in un annuncio.

-- Questa è una UPDATE su una riga di configurazione (storage.buckets),
-- non una DROP/ALTER distruttiva, non tocca alcun file già caricato: i
-- limiti si applicano solo ai nuovi upload dal momento dell'applicazione
-- in poi. Verifica esplicita che il bucket esista prima di modificarlo
-- (non lo ricrea, non lo elimina se assente).
do $$
begin
  if exists (select 1 from storage.buckets where id = 'alloggi-foto') then
    update storage.buckets
    set
      file_size_limit = 5242880,  -- 5 MB, in byte (5 * 1024 * 1024)
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
    where id = 'alloggi-foto'
      and file_size_limit is null
      and allowed_mime_types is null;
  else
    raise notice 'Bucket alloggi-foto non trovato — nessuna modifica applicata (il bucket non viene creato da questo file).';
  end if;
end $$;

-- La doppia condizione WHERE (file_size_limit/allowed_mime_types
-- entrambi null) rende l'istruzione un no-op sicuro da rieseguire se
-- qualcuno ha già impostato dei limiti (anche diversi da questi) tra
-- l'audit e l'applicazione: in quel caso non sovrascrive nulla, va
-- confrontato a mano prima di forzare questi valori specifici.

-- ------------------------------------------------------------
-- Query di verifica (sola lettura, da eseguire prima e dopo)
-- ------------------------------------------------------------
-- select id, public, file_size_limit, allowed_mime_types
-- from storage.buckets where id = 'alloggi-foto';
--
-- Atteso PRIMA: file_size_limit = null, allowed_mime_types = null
-- Atteso DOPO:  file_size_limit = 5242880, allowed_mime_types = {image/jpeg,image/png,image/webp}
--
-- Rollback: update storage.buckets set file_size_limit = null,
-- allowed_mime_types = null where id = 'alloggi-foto';
