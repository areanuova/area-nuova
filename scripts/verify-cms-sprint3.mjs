#!/usr/bin/env node
// Verifica mirata per il pannello CMS (Sprint 3) — matrice permessi,
// transizioni di stato, validazione slug/URL, generazione frontmatter.
// Nessun nuovo framework di test introdotto: pattern coerente con gli
// script già esistenti in questa cartella (scripts/test-aris-*.mjs),
// semplici assertion + process.exit(1) sul primo fallimento.
//
// Esegue solo la logica pura (nessuna rete, nessun database, nessun
// browser) — ciò che richiede un ambiente reale (redirect non
// autenticato, blocco ruolo lato server, assenza di secret nel bundle
// client) è verificato separatamente e documentato in docs/CMS_SPRINT_3.md.

import { hasRole, canManageUsers, canPublishContent, canEditContent, canTransition, hasPermission } from '../src/lib/admin/roles.ts';
import { isSafeUrl, slugify, isSafeSlug, contentFilePath, generateFrontmatter } from '../src/lib/admin/content-utils.ts';

let pass = 0;
let fail = 0;

function check(descrizione, condizione) {
  if (condizione) {
    pass++;
    console.log(`  ok  ${descrizione}`);
  } else {
    fail++;
    console.error(`  FAIL  ${descrizione}`);
  }
}

console.log('== Matrice ruoli ==');
check('super_admin gestisce utenti', canManageUsers('super_admin') === true);
check('admin NON gestisce utenti', canManageUsers('admin') === false);
check('editor NON gestisce utenti', canManageUsers('editor') === false);
check('super_admin pubblica', canPublishContent('super_admin') === true);
check('admin pubblica', canPublishContent('admin') === true);
check('editor NON pubblica', canPublishContent('editor') === false);
check('editor modifica contenuto', canEditContent('editor') === true);
check('hasRole: admin >= editor', hasRole('admin', 'editor') === true);
check('hasRole: editor NON >= admin', hasRole('editor', 'admin') === false);
check('hasPermission content.publish nega editor', hasPermission('editor', 'content.publish') === false);
check('hasPermission users.manage nega admin', hasPermission('admin', 'users.manage') === false);

console.log('== Transizioni di stato ==');
check('editor: draft -> review permesso', canTransition('editor', 'draft', 'review') === true);
check('editor: draft -> published VIETATO', canTransition('editor', 'draft', 'published') === false);
check('editor: review -> published VIETATO', canTransition('editor', 'review', 'published') === false);
check('editor: published -> archived VIETATO (editor non tocca il pubblicato)', canTransition('editor', 'published', 'archived') === false);
check('admin: draft -> published permesso', canTransition('admin', 'draft', 'published') === true);
check('admin: published -> archived permesso', canTransition('admin', 'published', 'archived') === true);
check('super_admin: archived -> draft permesso (riapertura)', canTransition('super_admin', 'archived', 'draft') === true);
check('admin: archived -> published VIETATO (deve ripassare da draft/review)', canTransition('admin', 'archived', 'published') === false);

console.log('== Validazione URL/slug (anti path-traversal, anti XSS-scheme) ==');
check('https valido accettato', isSafeUrl('https://example.com') === true);
check('http rifiutato (solo https)', isSafeUrl('http://example.com') === false);
check('javascript: rifiutato', isSafeUrl('javascript:alert(1)') === false);
check('data: rifiutato', isSafeUrl('data:text/html,<script>alert(1)</script>') === false);
check('stringa non-URL rifiutata', isSafeUrl('non-una-url') === false);

check('slugify normalizza correttamente', slugify('Libreria Universo!') === 'libreria-universo');
check('slugify rimuove accenti', slugify('Città è bella') === 'citta-e-bella');
check('isSafeSlug accetta slug valido', isSafeSlug('officina-studenti') === true);
check('isSafeSlug rifiuta maiuscole', isSafeSlug('Officina-Studenti') === false);
check('isSafeSlug rifiuta path traversal ..', isSafeSlug('../../etc/passwd') === false);
check('isSafeSlug rifiuta slash', isSafeSlug('a/b') === false);
check('isSafeSlug rifiuta stringa vuota', isSafeSlug('') === false);
check('isSafeSlug rifiuta doppio trattino ambiguo iniziale', isSafeSlug('-abc') === false);

console.log('== Path file (anti path-traversal) ==');
check('path valido dentro la collection', contentFilePath('officina-studenti') === 'src/content/partnership/officina-studenti.md');
let pathTraversalBloccato = false;
try {
  contentFilePath('../../etc/passwd');
} catch {
  pathTraversalBloccato = true;
}
check('contentFilePath lancia eccezione su slug pericoloso', pathTraversalBloccato === true);

console.log('== Generazione frontmatter (determinismo) ==');
const formEsempio = {
  nome: 'Libreria Universo',
  categoria: 'Libreria e cartoleria',
  descrizione: 'Descrizione di prova per il test.',
  codice: 'STUDENTI10',
  vantaggi: ['Sconto 10%', 'Spedizione gratuita'],
  validita: 'A.A. 2026/2027',
  spedizione: '',
  link: 'https://example.com',
  logo: '',
  ordine: 1,
  stato: 'draft',
  corpo: 'Testo libero.',
};
const out1 = generateFrontmatter(formEsempio);
const out2 = generateFrontmatter(formEsempio);
check('stesso input produce stesso output (determinismo)', out1 === out2);
check('frontmatter inizia e finisce con ---', out1.startsWith('---\n') && out1.includes('\n---\n'));
check('campo vuoto (spedizione) omesso dal frontmatter', !out1.includes('spedizione:'));
check('campo valorizzato (codice) presente', out1.includes('codice: STUDENTI10'));
// "%" fa scattare la quotatura conservativa di yamlString (scelta voluta:
// meglio quotare in più che rischiare YAML ambiguo) — il valore atteso è
// quindi tra virgolette, non in stile plain scalar.
check('vantaggi in stile lista YAML', out1.includes('  - "Sconto 10%"') && out1.includes('  - Spedizione gratuita'));
check('stato presente e corretto', out1.includes('stato: draft'));

const formConCaratteriSpeciali = { ...formEsempio, nome: 'Nome: con due punti' };
const outSpeciale = generateFrontmatter(formConCaratteriSpeciali);
check('valore con ":" viene quotato per restare YAML valido', outSpeciale.includes('nome: "Nome: con due punti"'));

console.log(`\n${pass} superati, ${fail} falliti.`);
if (fail > 0) process.exit(1);
