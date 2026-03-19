import { z } from 'zod';
import type { ItemRevision, SyncStatus, ItemCategory, ItemSeason } from './item';
import { itemRevisionSchema, SYNC_STATUS, ITEM_CATEGORIES, SEASONS } from './item';

export type DraftSource = 'addItemWizard';

export interface WardrobeDraftWizardState {
  photoConfirmed: boolean;
  cleanupConfirmed: boolean;
  reviewAcknowledged: boolean;
  confirmedAtUtc: string;
}

export interface WardrobeDraft {
  id: string;
  name: string;
  category: ItemCategory;
  seasons: ItemSeason[];
  source: DraftSource;
  wizard: WardrobeDraftWizardState;
  createdAtUtc: string;
  updatedAtUtc: string;
  revision: ItemRevision;
  syncStatus: SyncStatus;
  lastSyncAttemptUtc: string | null;
  lastSyncError?: string;
  version: number;
  captureId?: string;
  imageUri?: string;
}

export const wizardStateSchema = z.object({
  photoConfirmed: z.boolean(),
  cleanupConfirmed: z.boolean(),
  reviewAcknowledged: z.boolean(),
  confirmedAtUtc: z.string().datetime({ offset: true }),
});

export const wardrobeDraftSchema = z.object({
  id: z.string().min(1, 'Draft ID is required'),
  name: z.string().min(1, 'Name is required'),
  category: z.enum(ITEM_CATEGORIES, {
    errorMap: () => ({ message: 'Invalid category' }),
  }),
  seasons: z
    .array(z.enum(SEASONS))
    .nonempty('Select at least one season')
    .superRefine((value, ctx) => {
      if (value.includes('all') && value.length > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "'all' season cannot be combined with other seasons",
        });
      }
    }),
  source: z.literal('addItemWizard'),
  version: z.number().int().positive(),
  wizard: wizardStateSchema,
  createdAtUtc: z.string().datetime({ offset: true }),
  updatedAtUtc: z.string().datetime({ offset: true }),
  revision: itemRevisionSchema,
  syncStatus: z.enum(SYNC_STATUS),
  lastSyncAttemptUtc: z.string().datetime({ offset: true }).nullable(),
  lastSyncError: z.string().optional(),
  captureId: z.string().optional(),
  imageUri: z.string().optional(),
});

export function validateWardrobeDraft(draft: WardrobeDraft): WardrobeDraft {
  return wardrobeDraftSchema.parse(draft);
}

export interface AddItemWizardDraftPayload extends WardrobeDraftWizardState {
  name: string;
  category: ItemCategory;
  seasons: ItemSeason[];
  captureId?: string;
  imageUri?: string;
}

export function createWardrobeDraftFromWizard(
  payload: AddItemWizardDraftPayload,
  {
    nowUtc,
    generateId,
    generateRevisionId,
    version,
  }: {
    nowUtc: () => string;
    generateId: () => string;
    generateRevisionId: () => string;
    version: number;
  }
): WardrobeDraft {
  const timestamp = nowUtc();
  const revision: ItemRevision = {
    revisionId: generateRevisionId(),
    updatedAtUtc: timestamp,
  };

  const draft: WardrobeDraft = {
    id: generateId(),
    name: payload.name.trim(),
    category: payload.category,
    seasons: [...payload.seasons],
    source: 'addItemWizard',
    version,
    wizard: {
      photoConfirmed: payload.photoConfirmed,
      cleanupConfirmed: payload.cleanupConfirmed,
      reviewAcknowledged: payload.reviewAcknowledged,
      confirmedAtUtc: payload.confirmedAtUtc,
    },
    createdAtUtc: timestamp,
    updatedAtUtc: timestamp,
    revision,
    syncStatus: 'pending',
    lastSyncAttemptUtc: null,
    captureId: payload.captureId,
    imageUri: payload.imageUri,
  };

  return validateWardrobeDraft(draft);
}



