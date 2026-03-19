import { z } from 'zod';

export const backgroundRemovalRequestSchema = z.object({
  captureId: z.string().min(1, 'captureId is required'),
  draftId: z.string().min(1).optional(),
  sourceUri: z.string().url('sourceUri must be a valid URL or file path'),
});

export type BackgroundRemovalRequest = z.infer<typeof backgroundRemovalRequestSchema>;

export const backgroundRemovalResponseSchema = z.object({
  processedUri: z.string().url('processedUri must be a valid URL or file path'),
  maskUri: z.string().url().optional(),
  metadata: z.record(z.any()).optional(),
});

export type BackgroundRemovalResponse = z.infer<typeof backgroundRemovalResponseSchema>;









