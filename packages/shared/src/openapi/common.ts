import { z } from 'zod';

export const apiErrorSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  details: z.unknown().optional(),
  requestId: z.string().optional(),
});

export const paginatedMetaSchema = z.object({
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});

/** Fallback when no entity schema is available for docs */
export const jsonDataResponseSchema = z.object({
  data: z.unknown(),
  meta: paginatedMetaSchema.optional(),
});

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  api: z.literal('up'),
  database: z.enum(['up', 'down']),
});

export const authMeResponseSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  permissions: z.array(z.string()),
});

export const deletedResourceResponseSchema = z.object({
  data: z.object({
    id: z.string().uuid(),
    deleted: z.literal(true),
  }),
});

/** Typical `{ data: T }` API success body */
export function entityDataResponse<T extends z.ZodTypeAny>(entity: T) {
  return z.object({
    data: entity,
    meta: paginatedMetaSchema.optional(),
  });
}

/** Typical `{ data: T[], meta }` list response */
export function listDataResponse<T extends z.ZodTypeAny>(entity: T) {
  return z.object({
    data: z.array(entity),
    meta: paginatedMetaSchema,
  });
}

/** Report / analytics rows plus optional summary meta */
export const reportDataResponseSchema = z.object({
  data: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))),
  meta: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

/** Adds `id` for OpenAPI examples on detail/create responses */
export function withResourceId<T extends z.ZodTypeAny>(schema: T): z.ZodTypeAny {
  const base = openApiDocSchema(schema);
  if (base instanceof z.ZodObject) {
    return base.extend({ id: z.string().uuid() });
  }
  return z.intersection(base, z.object({ id: z.string().uuid() }));
}

/**
 * Strips Zod transforms/preprocess so zod-openapi can emit schemas.
 * Use only for documentation — runtime validation keeps original schemas.
 */
export function openApiDocSchema<T extends z.ZodTypeAny>(schema: T): z.ZodTypeAny {
  if (schema instanceof z.ZodEffects) {
    return openApiDocSchema(schema.innerType());
  }
  if (schema instanceof z.ZodOptional) {
    return openApiDocSchema(schema.unwrap()).optional();
  }
  if (schema instanceof z.ZodNullable) {
    return openApiDocSchema(schema.unwrap()).nullable();
  }
  if (schema instanceof z.ZodDefault) {
    return openApiDocSchema(schema.removeDefault());
  }
  if (schema instanceof z.ZodArray) {
    return z.array(openApiDocSchema(schema.element));
  }
  if (schema instanceof z.ZodObject) {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [key, value] of Object.entries(schema.shape)) {
      shape[key] = openApiDocSchema(value as z.ZodTypeAny);
    }
    return z.object(shape);
  }
  if (schema instanceof z.ZodUnion) {
    const options = schema.options.map((opt: z.ZodTypeAny) => openApiDocSchema(opt));
    return z.union(options as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
  }
  if (schema instanceof z.ZodIntersection) {
    return z.intersection(openApiDocSchema(schema._def.left), openApiDocSchema(schema._def.right));
  }
  if (schema instanceof z.ZodLazy) {
    return schema;
  }
  return schema;
}

export const loginResponseSchema = z.object({
  accessToken: z.string(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string(),
    name: z.string(),
  }),
  permissions: z.array(z.string()),
});
