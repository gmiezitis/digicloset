import { z } from 'zod';
import { ITEM_CATEGORIES } from './item';

export const STYLE_PROFILE_VERSION = 1;

export const measurementUnitSchema = z.enum(['cm', 'in']);
export type MeasurementUnit = z.infer<typeof measurementUnitSchema>;

const garmentTypeSchema = z.union([z.enum(ITEM_CATEGORIES), z.literal('other')]);
export type GarmentType = z.infer<typeof garmentTypeSchema>;

export const measurementEntrySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  value: z.number().positive(),
  unit: measurementUnitSchema,
  notes: z.string().max(280).optional(),
  orderIndex: z.number().int().nonnegative(),
  updatedAtUtc: z.string().datetime({ offset: true }),
});
export type MeasurementEntry = z.infer<typeof measurementEntrySchema>;

export const sizePreferenceEntrySchema = z.object({
  id: z.string().min(1),
  garmentType: garmentTypeSchema,
  sizeLabel: z.string().min(1),
  notes: z.string().max(280).optional(),
  orderIndex: z.number().int().nonnegative(),
  updatedAtUtc: z.string().datetime({ offset: true }),
});
export type SizePreferenceEntry = z.infer<typeof sizePreferenceEntrySchema>;

export const brandSizeExceptionEntrySchema = z.object({
  id: z.string().min(1),
  brand: z.string().min(1),
  garmentType: garmentTypeSchema,
  sizeLabel: z.string().min(1),
  notes: z.string().max(280).optional(),
  updatedAtUtc: z.string().datetime({ offset: true }),
});
export type BrandSizeExceptionEntry = z.infer<typeof brandSizeExceptionEntrySchema>;

export const profileRevisionSchema = z.object({
  revisionId: z.string().min(1),
  updatedAtUtc: z.string().datetime({ offset: true }),
});
export type ProfileRevision = z.infer<typeof profileRevisionSchema>;

export const styleProfileSchema = z.object({
  id: z.literal('style-profile'),
  version: z.number().int().positive(),
  revision: profileRevisionSchema,
  updatedAtUtc: z.string().datetime({ offset: true }),
  measurements: z.array(measurementEntrySchema),
  sizePreferences: z.array(sizePreferenceEntrySchema),
  brandSizeExceptions: z.array(brandSizeExceptionEntrySchema),
});
export type StyleProfile = z.infer<typeof styleProfileSchema>;

export function validateStyleProfile(profile: StyleProfile): StyleProfile {
  return styleProfileSchema.parse(profile);
}

export interface StyleProfileFactoryOptions {
  nowUtc: () => string;
  generateId: (prefix: string) => string;
  generateRevisionId: () => string;
}

export function createDefaultStyleProfile(options: StyleProfileFactoryOptions): StyleProfile {
  const timestamp = options.nowUtc();
  return validateStyleProfile({
    id: 'style-profile',
    version: STYLE_PROFILE_VERSION,
    revision: {
      revisionId: options.generateRevisionId(),
      updatedAtUtc: timestamp,
    },
    updatedAtUtc: timestamp,
    measurements: [],
    sizePreferences: [],
    brandSizeExceptions: [],
  });
}

export function normalizeOrder<T extends { orderIndex: number }>(entries: T[]): T[] {
  return [...entries]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((entry, index) => ({ ...entry, orderIndex: index }));
}


