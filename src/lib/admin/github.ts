// Scrittura dei contenuti editoriali su GitHub, esclusivamente server-side
// (Sprint 3, architettura approvata in docs/CMS_ARCHITECTURE.md §2.2).
// L'utente del pannello non vede né usa GitHub: compila un form, il server
// committa per suo conto usando un token di servizio.
//
// GITHUB_SERVICE_TOKEN è configurato dallo Sprint 3.1 (diverso da
// GITHUB_CLIENT_ID/SECRET, che sono le credenziali OAuth per il login degli
// utenti di Decap CMS, non un token per commit automatici). Se dovesse
// mancare in un ambiente futuro, ogni chiamata fallisce con un errore
// esplicito — non simula mai un salvataggio riuscito.

const GITHUB_API = 'https://api.github.com';
// Owner/repo/branch configurabili via env (Sprint 3.1), con fallback al
// repository reale su cui gira questo pannello — nessun cambio di
// comportamento se le variabili non sono impostate.
const REPO_OWNER = import.meta.env.GITHUB_REPO_OWNER || 'areanuova';
const REPO_NAME = import.meta.env.GITHUB_REPO_NAME || 'area-nuova';
const REPO_BRANCH = import.meta.env.GITHUB_REPO_BRANCH || 'main';

export class GithubNonConfiguratoError extends Error {
  constructor() {
    super(
      'GITHUB_SERVICE_TOKEN non configurato: il salvataggio su GitHub non è disponibile in questo ambiente. ' +
      'Contenuto validato e pronto, ma non pubblicato sul repository.',
    );
    this.name = 'GithubNonConfiguratoError';
  }
}

export interface CommitContentFileInput {
  /** Percorso relativo alla root del repo, es. "src/content/partnership/nome-slug.md" */
  path: string;
  content: string;
  message: string;
}

export interface CommitContentFileResult {
  commitSha: string;
  htmlUrl: string;
}

// Sprint 5.0B: unica eccezione esplicita a "solo src/content/" — il file
// singleton delle impostazioni del sito (src/data/sito.json, già
// esistente e già letto da Footer/Navbar/BaseLayout). Elencata per intero
// e non come prefisso di directory, per non allargare la superficie di
// scrittura oltre questo singolo file già pubblico e non sensibile.
const PERCORSI_EXTRA_CONSENTITI = new Set<string>(['src/data/sito.json']);

function getToken(): string | undefined {
  return import.meta.env.GITHUB_SERVICE_TOKEN;
}

/** true se il token di servizio è configurato — usato dall'UI per mostrare lo stato esplicito. */
export function isGithubConfigured(): boolean {
  return !!getToken();
}

async function githubRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  if (!token) throw new GithubNonConfiguratoError();

  return fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...init.headers,
    },
  });
}

/**
 * Crea o aggiorna un file nel repository, tramite l'API "Create or update
 * file contents" di GitHub (PUT /repos/{owner}/{repo}/contents/{path}).
 * Gestisce il conflitto di versione: se il file esiste già, recupera prima
 * il suo `sha` corrente (richiesto dall'API per un update) — se il file è
 * stato modificato nel frattempo da qualcun altro, GitHub stesso rifiuta la
 * richiesta con 409/422 se il `sha` non combacia più; propaghiamo l'errore
 * invece di sovrascrivere alla cieca.
 */
export async function commitContentFile(
  input: CommitContentFileInput,
): Promise<CommitContentFileResult> {
  if (!isGithubConfigured()) throw new GithubNonConfiguratoError();

  // Path traversal: il chiamante deve già aver validato/sanitizzato path e
  // slug (vedi validation.ts) — qui aggiungiamo una verifica difensiva
  // indipendente, per non fidarci di un solo livello di controllo.
  const percorsoConsentito =
    input.path.startsWith('src/content/') || PERCORSI_EXTRA_CONSENTITI.has(input.path);
  if (input.path.includes('..') || input.path.startsWith('/') || !percorsoConsentito) {
    throw new Error(`Percorso non consentito: ${input.path}`);
  }

  let sha: string | undefined;
  const existing = await githubRequest(
    `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${input.path}?ref=${REPO_BRANCH}`,
  );
  if (existing.status === 200) {
    const data = (await existing.json()) as { sha: string };
    sha = data.sha;
  } else if (existing.status !== 404) {
    throw new Error(`Impossibile verificare il file esistente su GitHub (HTTP ${existing.status}).`);
  }

  const body = {
    message: input.message,
    content: Buffer.from(input.content, 'utf-8').toString('base64'),
    branch: REPO_BRANCH,
    ...(sha ? { sha } : {}),
  };

  const res = await githubRequest(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${input.path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    if (res.status === 409 || res.status === 422) {
      throw new Error('Conflitto di versione: il file è stato modificato da qualcun altro. Ricarica e riprova.');
    }
    const errBody = await res.text().catch(() => '');
    throw new Error(`Commit GitHub fallito (HTTP ${res.status}): ${errBody.slice(0, 300)}`);
  }

  const result = (await res.json()) as { commit: { sha: string; html_url: string } };
  return { commitSha: result.commit.sha, htmlUrl: result.commit.html_url };
}

export interface FileCommitInfo {
  sha: string;
  message: string;
  author: string;
  date: string;
  htmlUrl: string;
}

/**
 * Cronologia dei commit per un singolo file (Sprint 5.0B, Fase 6 —
 * versioning). Usa direttamente la cronologia Git reale, coerente con
 * l'architettura "ogni salvataggio è un commit" già in uso: nessuna
 * tabella di versioni da mantenere in sincronia.
 */
export async function listFileCommits(path: string, limit = 20): Promise<FileCommitInfo[]> {
  const res = await githubRequest(
    `/repos/${REPO_OWNER}/${REPO_NAME}/commits?path=${encodeURIComponent(path)}&sha=${REPO_BRANCH}&per_page=${limit}`,
  );
  if (!res.ok) {
    throw new Error(`Impossibile leggere la cronologia (HTTP ${res.status}).`);
  }
  const data = (await res.json()) as Array<{
    sha: string;
    html_url: string;
    commit: { message: string; author: { name: string; date: string } };
  }>;
  return data.map((c) => ({
    sha: c.sha,
    message: c.commit.message,
    author: c.commit.author.name,
    date: c.commit.author.date,
    htmlUrl: c.html_url,
  }));
}

/** Contenuto testuale (decodificato da base64) di un file a un dato commit/ref. */
export async function getFileAtRef(path: string, ref: string): Promise<string> {
  const res = await githubRequest(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${ref}`);
  if (!res.ok) {
    throw new Error(`Impossibile leggere il file alla revisione ${ref} (HTTP ${res.status}).`);
  }
  const data = (await res.json()) as { content: string; encoding: string };
  return Buffer.from(data.content, data.encoding as BufferEncoding).toString('utf-8');
}
