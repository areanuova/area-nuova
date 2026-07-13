// Matrice centralizzata di ruoli e permessi del CMS unificato (Sprint 3).
// Nessuna logica di autorizzazione va reimplementata nelle singole pagine
// o route API: tutte devono importare da qui.
//
// MODALITÀ COMPATIBILITÀ: la migration che introduce la colonna `role` su
// `admin_users` (supabase/migrations/20260712000000_cms_roles.sql) è stata
// applicata dallo Sprint 3.1 — i ruoli reali sono attivi. Questo fallback
// resta come difesa per un eventuale ambiente non ancora migrato (es. una
// copia del database antecedente): se la colonna `role` risultasse assente,
// ogni utente in `admin_users` viene trattato come ruolo 'admin' (mai
// 'super_admin' per default, per non concedere implicitamente la gestione
// utenti). Il flag `compatibilityMode` è propagato ovunque serve per
// mostrare questo stato esplicitamente nell'interfaccia, mai nasconderlo.

export type CmsRole = 'super_admin' | 'admin' | 'editor';
export type ContentStato = 'draft' | 'review' | 'published' | 'archived';

export const CMS_ROLES: CmsRole[] = ['super_admin', 'admin', 'editor'];
export const CONTENT_STATI: ContentStato[] = ['draft', 'review', 'published', 'archived'];

/** Ruolo assegnato in modalità compatibilità a ogni riga di admin_users, finché la migration ruoli non è applicata. */
export const COMPATIBILITY_ROLE: CmsRole = 'admin';

export interface AdminUser {
  id: string;
  email: string;
  role: CmsRole;
  attivo: boolean;
  /** true se il ruolo è un default di compatibilità, non un valore reale letto dal database. */
  compatibilityMode: boolean;
  /** Sprint 5.0B — assente (undefined) finché la colonna non esiste sul remoto: mai trattato come true implicito. */
  sospeso?: boolean;
  permessiExtra?: PermessiExtra;
}

const ROLE_RANK: Record<CmsRole, number> = { editor: 0, admin: 1, super_admin: 2 };

/** true se `role` ha privilegi pari o superiori a `minimo`. */
export function hasRole(role: CmsRole, minimo: CmsRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimo];
}

export function canManageUsers(role: CmsRole): boolean {
  return role === 'super_admin';
}

export function canPublishContent(role: CmsRole): boolean {
  return role === 'super_admin' || role === 'admin';
}

/** Tutti i ruoli possono creare/modificare contenuto non pubblicato. */
export function canEditContent(role: CmsRole): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'editor';
}

/**
 * Transizioni di stato ammesse per ruolo. Editor resta confinato a
 * draft/review; admin e super_admin controllano l'intero ciclo di vita.
 * Nessuna operazione di cancellazione reale: "archiviato" è lo stato
 * terminale che sostituisce la delete per contenuto git-backed (coerente
 * con l'architettura approvata in docs/CMS_ARCHITECTURE.md — niente DELETE
 * su file versionati senza un flusso di revisione dedicato, fuori
 * dall'ambito di questo sprint).
 */
const TRANSIZIONI_EDITOR: Record<ContentStato, ContentStato[]> = {
  draft: ['draft', 'review'],
  review: ['review', 'draft'],
  published: [],
  archived: [],
};

const TRANSIZIONI_ADMIN: Record<ContentStato, ContentStato[]> = {
  draft: ['draft', 'review', 'published', 'archived'],
  review: ['draft', 'review', 'published', 'archived'],
  published: ['published', 'archived', 'draft'],
  archived: ['archived', 'draft'],
};

export function canTransition(role: CmsRole, da: ContentStato, a: ContentStato): boolean {
  const tabella = role === 'editor' ? TRANSIZIONI_EDITOR : TRANSIZIONI_ADMIN;
  return tabella[da]?.includes(a) ?? false;
}

/** Permessi generici, per nome, usati dall'interfaccia per mostrare/nascondere azioni. */
export type Permission =
  | 'content.edit'
  | 'content.publish'
  | 'content.manage'
  | 'users.manage'
  | 'audit.view'
  | 'settings.manage'
  | 'media.manage'
  | 'notifications.view';

/**
 * Capacità opzionali oltre al ruolo base (Sprint 5.0B). Layer additivo:
 * amplia sempre e solo, non sostituisce mai il controllo di ruolo — vedi
 * la colonna `permessi_extra` su admin_users (migration
 * 20260714000000_sprint5b_platform.sql). Tenuto deliberatamente minimo
 * (un solo campo jsonb, mai un secondo sistema di ruoli parallelo).
 */
export type PermessiExtra = Partial<Record<'media.manage', boolean>>;

export function hasPermission(role: CmsRole, permission: Permission, extra?: PermessiExtra): boolean {
  switch (permission) {
    case 'content.edit':
      return canEditContent(role);
    case 'content.publish':
    case 'content.manage':
      return canPublishContent(role);
    case 'users.manage':
      return canManageUsers(role);
    case 'audit.view':
      return role === 'super_admin' || role === 'admin';
    case 'settings.manage':
      return role === 'super_admin';
    case 'media.manage':
      return role === 'super_admin' || role === 'admin' || extra?.['media.manage'] === true;
    case 'notifications.view':
      return true;
    default:
      return false;
  }
}

export const ROLE_LABEL: Record<CmsRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  editor: 'Editor',
};

export const STATO_LABEL: Record<ContentStato, string> = {
  draft: 'Bozza',
  review: 'In revisione',
  published: 'Pubblicato',
  archived: 'Archiviato',
};
