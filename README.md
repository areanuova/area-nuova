# Sito Area Nuova

Sito dell'associazione studentesca **Area Nuova** (Università di Foggia).
Costruito con **Astro** + **Tailwind CSS**. Contenuti modificabili a mano tramite file.
Pubblicazione gratuita su **Vercel**, codice su **GitHub**, segnalazioni con **Google Form**.

---

## 1. Cosa ti serve installare (una volta sola)

1. **Node.js** (versione 18 o superiore) → https://nodejs.org → scarica la versione "LTS" e installa.
2. **Un editor di testo**: consigliato **Visual Studio Code** → https://code.visualstudio.com
3. (Per dopo) un account gratuito su **GitHub** e uno su **Vercel**.

Per verificare che Node sia installato, apri il Terminale (su Windows: "Prompt dei comandi") e scrivi:
```
node -v
```
Se vedi un numero (es. v20.x) sei a posto.

---

## 2. Avviare il sito sul tuo computer

Apri il Terminale **dentro la cartella del progetto** ed esegui, una riga alla volta:

```
npm install        # scarica tutto il necessario (solo la prima volta, ci mette un po')
npm run dev        # avvia il sito in locale
```

Poi apri il browser su **http://localhost:4321** : vedrai il sito.
Ogni modifica ai file si aggiorna da sola nel browser. Per fermare il server premi `Ctrl + C`.

---

## 3. Come modificare i contenuti (senza programmare)

Tutti i contenuti sono semplici file nella cartella `src/content/`.
Per **aggiungere** una voce, copia un file esistente, rinominalo e cambia il testo.
La parte tra i `---` in alto sono le "informazioni" (titolo, data...), sotto c'è il testo libero.

| Cosa vuoi modificare        | Cartella                       |
|-----------------------------|--------------------------------|
| Rappresentanti              | `src/content/rappresentanti/`  |
| Progetti                    | `src/content/progetti/`        |
| Risultati ottenuti          | `src/content/risultati/`       |
| News                        | `src/content/news/`            |
| Eventi                      | `src/content/eventi/`          |
| Guide utili                 | `src/content/guide/`           |
| Moduli e mozioni            | `src/content/documenti/`       |

Altri file utili:
- **Numeri della homepage** → `src/data/statistiche.json`
- **Email, social, link dei form** → `src/data/sito.json`

### Aggiungere una foto a un rappresentante
1. Metti la foto (es. `giulia.jpg`) nella cartella `src/content/rappresentanti/`.
2. Nel file della persona aggiungi sotto i dati: `foto: ./giulia.jpg`

### Aggiungere un'immagine di copertina a progetto/news
Stessa cosa: metti il file accanto al `.md` e scrivi `copertina: ./nome-file.jpg`.

### Caricare un modulo PDF
Metti il PDF nella cartella `public/documenti/` e indica il percorso nel file dentro
`src/content/documenti/` così: `file: /documenti/nome-file.pdf`

---

## 4. Collegare i Google Form (segnalazioni e iscrizioni)

1. Crea il modulo su **Google Form** (https://forms.google.com).
2. In alto a destra clicca **Invia** → icona **`< >`** (incorpora HTML).
3. Copia **solo l'indirizzo** che sta dentro `src="..."` (inizia con `https://docs.google.com/forms/...`).
4. Incollalo dentro `src/data/sito.json` al posto del testo `INCOLLA_QUI_...`:
   - `"segnalazioni"` → modulo segnalazioni
   - `"entra"` → modulo iscrizione
5. Per raccogliere le risposte in un foglio: nel Google Form vai su **Risposte** → **Collega a Fogli**.

---

## 5. Comandi utili

| Comando          | Cosa fa                                   |
|------------------|-------------------------------------------|
| `npm run dev`    | Avvia il sito in locale (sviluppo)        |
| `npm run build`  | Crea la versione finale (cartella `dist/`)|
| `npm run preview`| Mostra la versione finale in locale       |

> Le istruzioni dettagliate per **GitHub** e **Vercel** te le ha fornite a parte chi ti ha
> preparato il progetto. In sintesi: il codice va caricato su GitHub, poi Vercel si collega
> al repository e pubblica il sito gratis ad ogni modifica.
