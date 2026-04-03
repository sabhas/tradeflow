import { z } from 'zod';

export const patchAuthMeSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    branchId: z.union([z.string().uuid(), z.null()]).optional(),
  })
  .strict();
