import { z } from 'zod';

/**
 * Domain definitions for wardrobe items.
 * Local-first data strategy: all items carry a local revisionId and sync status.
 */

export const ITEM_CATEGORIES = [
  'tops',
  'bottoms',
  'dresses',
  'outerwear',
  'shoes',
  'accessories',
] as const;

export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export const SEASONS = ['spring', 'summer', 'autumn', 'winter', 'all'] as const;

export type ItemSeason = (typeof SEASONS)[number];

export const SYNC_STATUS = ['pending', 'synced', 'failed'] as const;

export type SyncStatus = (typeof SYNC_STATUS)[number];

export interface ItemColor {
  name: string;
  hex: string;
}

export interface ItemRevision {
  revisionId: string;
  updatedAtUtc: string;
}

export interface WardrobeItem {
  id: string;
  category: ItemCategory;
  subCategory?: string;
  name: string;
  brand?: string;
  description?: string;
  seasons: ItemSeason[];
  colors: ItemColor[];
  priceCents?: number;
  currency?: string;
  location?: string;
  notes?: string;
  tags?: string[];
  imageUri: string;
  thumbnailUri?: string;
  isFavorite?: boolean;
  lastWornAtUtc?: string;
  createdAtUtc: string;
  revision: ItemRevision;
  syncStatus: SyncStatus;
}

const colorSchema = z.object({
  name: z.string().min(1, 'Color name is required'),
  hex: z
    .string()
    .regex(/^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/, 'Color hex must be a valid hex code'),
});

export const itemRevisionSchema = z.object({
  revisionId: z.string().min(1, 'Revision ID is required'),
  updatedAtUtc: z.string().datetime({ offset: true }),
});

export const wardrobeItemSchema = z
  .object({
    id: z.string().min(1, 'ID is required'),
    category: z.enum(ITEM_CATEGORIES, {
      errorMap: () => ({ message: 'Invalid category' }),
    }),
    subCategory: z.string().min(1).optional(),
    name: z.string().min(1, 'Name is required'),
    brand: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    seasons: z
      .array(z.enum(SEASONS))
      .nonempty('At least one season is required')
      .superRefine((value, ctx) => {
        if (value.includes('all') && value.length > 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "'all' season cannot be combined with other seasons",
          });
        }
      }),
    colors: z.array(colorSchema).min(1, 'At least one color is required'),
    priceCents: z.number().int().nonnegative().optional(),
    currency: z.string().length(3).optional(),
    location: z.string().min(1).optional(),
    notes: z.string().min(1).optional(),
    tags: z.array(z.string().min(1)).optional(),
    imageUri: z.string().url('Image URI must be a valid URL'),
    thumbnailUri: z.string().url().optional(),
    isFavorite: z.boolean().optional(),
    lastWornAtUtc: z.string().datetime({ offset: true }).optional(),
    createdAtUtc: z.string().datetime({ offset: true }),
    revision: itemRevisionSchema,
    syncStatus: z.enum(SYNC_STATUS),
  })
  .superRefine((value, ctx) => {
    if (value.priceCents != null && !value.currency) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['currency'],
        message: 'Currency is required when price is provided',
      });
    }

    if (value.lastWornAtUtc && value.lastWornAtUtc < value.createdAtUtc) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lastWornAtUtc'],
        message: 'Last worn date cannot be before creation date',
      });
    }
  });

export function validateWardrobeItem(data: WardrobeItem): WardrobeItem {
  return wardrobeItemSchema.parse(data);
}

export function createWardrobeItem(
  input: Omit<WardrobeItem, 'revision' | 'createdAtUtc'> & {
    revision?: ItemRevision;
    createdAtUtc?: string;
  },
  nowUtc: () => string,
  generateRevisionId: () => string
): WardrobeItem {
  const createdAtUtc = input.createdAtUtc ?? nowUtc();

  const revision: ItemRevision =
    input.revision ??
    itemRevisionSchema.parse({
      revisionId: generateRevisionId(),
      updatedAtUtc: createdAtUtc,
    });

  const item: WardrobeItem = {
    ...input,
    createdAtUtc,
    revision,
  };

  return validateWardrobeItem(item);
}

export function updateWardrobeItem(
  current: WardrobeItem,
  changes: Partial<Omit<WardrobeItem, 'id' | 'createdAtUtc' | 'revision'>>,
  nowUtc: () => string,
  generateRevisionId: () => string
): WardrobeItem {
  const updatedRevision = itemRevisionSchema.parse({
    revisionId: generateRevisionId(),
    updatedAtUtc: nowUtc(),
  });

  const candidate: WardrobeItem = {
    ...current,
    ...changes,
    revision: updatedRevision,
  };

  return validateWardrobeItem(candidate);
}

export function markSyncStatus(
  item: WardrobeItem,
  status: SyncStatus,
  revisionOverrides?: Partial<ItemRevision>
): WardrobeItem {
  const revision: ItemRevision =
    status === 'synced'
      ? {
          revisionId: revisionOverrides?.revisionId ?? item.revision.revisionId,
          updatedAtUtc: revisionOverrides?.updatedAtUtc ?? item.revision.updatedAtUtc,
        }
      : item.revision;

  return {
    ...item,
    syncStatus: status,
    revision,
  };
}


