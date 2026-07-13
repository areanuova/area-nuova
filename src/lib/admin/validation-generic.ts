// Costruttore generico di schema Zod a partire da un ContentTypeDef
// (Sprint 4.0). Stesso principio di validation.ts (Partnership): il form
// invia `slug` a parte (non è un campo di frontmatter, determina il nome
// del file) e ogni campo URL passa da isSafeUrl (solo https://).
import { z } from 'astro:content';
import { isSafeUrl } from './content-utils';
import { isSafeWhatsappLink } from './whatsapp';
import type { ContentTypeDef, FieldDef } from './content-types';

function schemaForField(field: FieldDef): z.ZodTypeAny {
  switch (field.type) {
    case 'number': {
      let s = z.coerce.number();
      return field.required ? s : s.optional();
    }
    case 'boolean':
      return z.boolean().default(false);
    case 'stringArray':
      return z.array(z.string().max(300)).max(50).default([]);
    case 'url': {
      const base = z.string().max(field.maxLength ?? 300);
      const refined = base.refine((v) => !v || isSafeUrl(v), 'URL non valido: deve iniziare con https://');
      return field.required ? refined : refined.or(z.literal(''));
    }
    case 'whatsapp-link': {
      const base = z.string().max(field.maxLength ?? 300);
      const refined = base.refine(
        (v) => !v || isSafeWhatsappLink(v),
        'Link non valido: deve essere un formato chat.whatsapp.com o whatsapp.com/channel riconosciuto.',
      );
      return field.required ? refined.refine((v) => v.length > 0, `${field.label} è obbligatorio`) : refined.or(z.literal(''));
    }
    case 'select': {
      const values = (field.options ?? []).map((o) => o.value);
      if (values.length === 0) return z.string();
      const schema = z.enum(values as [string, ...string[]]);
      return field.default !== undefined ? schema.default(String(field.default)) : schema;
    }
    case 'date':
    case 'text':
    case 'textarea':
    default: {
      const max = field.maxLength ?? 500;
      const base = z.string().max(max);
      if (field.required) return base.min(1, `${field.label} è obbligatorio`);
      return base.optional().or(z.literal(''));
    }
  }
}

export function buildContentSchema(typeDef: ContentTypeDef) {
  const shape: Record<string, z.ZodTypeAny> = {
    slug: z
      .string()
      .min(2, 'Lo slug deve avere almeno 2 caratteri')
      .max(80, 'Lo slug è troppo lungo (max 80 caratteri)')
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug non valido: solo lettere minuscole, numeri e trattini singoli'),
  };
  for (const field of typeDef.fields) {
    shape[field.key] = schemaForField(field);
  }
  if (typeDef.hasBody) {
    shape.corpo = z.string().max(20000).optional().or(z.literal(''));
  }
  return z.object(shape);
}
