#!/usr/bin/env node
// Verifica mirata per Sprint 5.0B — permessi estesi, helper media library,
// campi di pianificazione sul registro CONTENT_TYPES. Stesso pattern di
// scripts/verify-cms-sprint3.mjs: solo logica pura, nessuna rete/DB/browser.
// SettingsSchema (src/lib/admin/settings.ts) non è testato qui perché importa
// 'astro:content' (modulo virtuale risolvibile solo dentro Astro/Vite) — la
// sua validazione è comunque esercitata da `npx astro check` e dal build.

import { hasPermission } from '../src/lib/admin/roles.ts';
import { normalizzaNomeFile, percorsoStorage, isPostgrestTabellaAssente, MIME_CONSENTITI } from '../src/lib/admin/media.ts';
import { CONTENT_TYPES } from '../src/lib/admin/content-types.ts';

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

console.log('== Permessi estesi (Sprint 5.0B) ==');
check('settings.manage concesso solo a super_admin', hasPermission('super_admin', 'settings.manage') === true);
check('settings.manage negato ad admin', hasPermission('admin', 'settings.manage') === false);
check('settings.manage negato a editor', hasPermission('editor', 'settings.manage') === false);
check('media.manage concesso ad admin', hasPermission('admin', 'media.manage') === true);
check('media.manage negato a editor senza permessi_extra', hasPermission('editor', 'media.manage') === false);
check('media.manage concesso a editor CON permessi_extra["media.manage"]', hasPermission('editor', 'media.manage', { 'media.manage': true }) === true);
check('notifications.view concesso a chiunque', hasPermission('editor', 'notifications.view') === true);
check('audit.view ancora negato a editor (invariato)', hasPermission('editor', 'audit.view') === false);

console.log('== Helper media library ==');
check('normalizzaNomeFile minuscolo e trattini', normalizzaNomeFile('Foto Gruppo WhatsApp!.png', 'image/png') === 'foto-gruppo-whatsapp.png');
check('normalizzaNomeFile ignora estensione originale, usa quella dal MIME', normalizzaNomeFile('documento.txt', 'application/pdf') === 'documento.pdf');
check('normalizzaNomeFile con nome vuoto produce "file.<ext>"', normalizzaNomeFile('###', 'image/jpeg') === 'file.jpg');
check('percorsoStorage produce un path anno/mese/prefisso-nome', /^\d{4}\/\d{2}\/[a-z0-9]{8}-foto\.png$/.test(percorsoStorage('foto.png')));
check('MIME_CONSENTITI include image/webp', MIME_CONSENTITI.includes('image/webp'));
check('MIME_CONSENTITI NON include text/html (anti upload di pagine eseguibili)', !MIME_CONSENTITI.includes('text/html'));
check('isPostgrestTabellaAssente riconosce il codice 42P01', isPostgrestTabellaAssente({ code: '42P01' }) === true);
check('isPostgrestTabellaAssente riconosce il messaggio "relation ... does not exist"', isPostgrestTabellaAssente({ message: 'relation "cms_media" does not exist' }) === true);
check('isPostgrestTabellaAssente false per un errore generico', isPostgrestTabellaAssente({ code: '23505', message: 'duplicate key' }) === false);
check('isPostgrestTabellaAssente false per null', isPostgrestTabellaAssente(null) === false);

console.log('== Campi di pianificazione (Fase 7) sul registro CONTENT_TYPES ==');
for (const tipo of ['news', 'guide', 'documenti', 'progetti', 'video', 'gruppi-whatsapp']) {
  const def = CONTENT_TYPES[tipo];
  const chiavi = def.fields.map((f) => f.key);
  check(`${tipo}: ha il campo pubblicaIl`, chiavi.includes('pubblicaIl'));
  check(`${tipo}: ha il campo archiviaIl`, chiavi.includes('archiviaIl'));
  check(`${tipo}: statoField esiste tra i campi (${def.statoField})`, chiavi.includes(def.statoField));
}

console.log(`\n${pass} superati, ${fail} falliti.`);
if (fail > 0) process.exit(1);
