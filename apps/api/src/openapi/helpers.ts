import 'zod-openapi/extend';
import type { ZodOpenApiPathsObject, ZodOpenApiOperationObject } from 'zod-openapi';
import { z } from 'zod';
import {
  apiErrorSchema,
  asOfQuerySchema,
  dateRangeQuerySchema,
  deletedResourceResponseSchema,
  entityDataResponse,
  jsonDataResponseSchema,
  listDataResponse,
  paginationQuerySchema,
  reportDataResponseSchema,
  openApiDocSchema,
  withResourceId,
} from '@tradeflow/shared';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export type RouteSpec = {
  method: HttpMethod;
  path: string;
  summary: string;
  tag: string;
  /** Default true — set false for public routes (e.g. login, health) */
  secured?: boolean;
  body?: z.ZodType;
  query?: z.ZodType;
  pathParams?: z.ZodType;
  /** HTTP status for success (default 200; use 201 for creates) */
  successStatus?: 200 | 201;
  responseSchema?: z.ZodType;
  /** Entity shape for list/detail GET docs (usually the create schema) */
  itemSchema?: z.ZodType;
};

const errorResponse = (description: string) => ({
  description,
  content: {
    'application/json': { schema: apiErrorSchema },
  },
});

function resolveResponseSchema(spec: RouteSpec): z.ZodType {
  if (spec.responseSchema) return spec.responseSchema;

  if (spec.method === 'delete') return deletedResourceResponseSchema;

  const item = spec.itemSchema;
  const isDetailGet = spec.method === 'get' && !!spec.pathParams;
  const isListGet = spec.method === 'get' && !spec.pathParams;

  if (item) {
    const docItem = withResourceId(openApiDocSchema(item));
    if (isDetailGet) return entityDataResponse(docItem);
    if (isListGet) return listDataResponse(docItem);
    if (spec.method === 'post' || spec.method === 'patch' || spec.method === 'put') {
      return entityDataResponse(docItem);
    }
  }

  if (spec.body && (spec.method === 'post' || spec.method === 'patch' || spec.method === 'put')) {
    return entityDataResponse(withResourceId(openApiDocSchema(spec.body)));
  }

  return jsonDataResponseSchema;
}

export function buildOperation(spec: RouteSpec): ZodOpenApiOperationObject {
  const op: ZodOpenApiOperationObject = {
    summary: spec.summary,
    tags: [spec.tag],
    responses: {
      [String(spec.successStatus ?? (spec.method === 'post' && spec.body ? 201 : 200))]: {
        description: 'Success',
        content: {
          'application/json': {
            schema: resolveResponseSchema(spec),
          },
        },
      },
      '400': errorResponse('Bad request / validation error'),
      '401': errorResponse('Unauthorized'),
      '403': errorResponse('Forbidden'),
      '404': errorResponse('Not found'),
    },
  };

  if (spec.secured !== false) {
    op.security = [{ bearerAuth: [] }];
  }

  if (spec.body) {
    op.requestBody = {
      required: true,
      content: {
        'application/json': { schema: spec.body },
      },
    };
  }

  const requestParams: NonNullable<ZodOpenApiOperationObject['requestParams']> = {};
  if (spec.pathParams) requestParams.path = spec.pathParams;
  if (spec.query) requestParams.query = spec.query;
  if (spec.pathParams || spec.query) {
    op.requestParams = requestParams;
  }

  return op;
}

export function buildPathsFromSpecs(specs: RouteSpec[]): ZodOpenApiPathsObject {
  const paths: ZodOpenApiPathsObject = {};

  for (const spec of specs) {
    const operation = buildOperation(spec);
    const existing = paths[spec.path] ?? {};
    paths[spec.path] = { ...existing, [spec.method]: operation };
  }

  return paths;
}

export const idPathParams = z.object({
  id: z.string().uuid(),
});

export const paginationQuery = paginationQuerySchema;
export const dateRangeQuery = dateRangeQuerySchema;
export const asOfQuery = asOfQuerySchema;

/** GET /reports/* — tabular `data` rows */
export function reportRouteSpec(path: string, summary: string, query?: z.ZodType): RouteSpec {
  return {
    method: 'get',
    path: `/reports${path}`,
    summary,
    tag: 'Reports',
    query: query ?? dateRangeQuery,
    responseSchema: reportDataResponseSchema,
  };
}

export function crudSpecs(
  base: string,
  tag: string,
  options: {
    createSchema: z.ZodType;
    updateSchema: z.ZodType;
    resourceName: string;
  }
): RouteSpec[] {
  const { createSchema, updateSchema, resourceName } = options;
  const itemSchema = createSchema;
  return [
    {
      method: 'get',
      path: base,
      summary: `List ${resourceName}`,
      tag,
      query: paginationQuery,
      itemSchema,
    },
    {
      method: 'post',
      path: base,
      summary: `Create ${resourceName}`,
      tag,
      body: createSchema,
      successStatus: 201,
      itemSchema,
    },
    {
      method: 'get',
      path: `${base}/{id}`,
      summary: `Get ${resourceName}`,
      tag,
      pathParams: idPathParams,
      itemSchema,
    },
    {
      method: 'patch',
      path: `${base}/{id}`,
      summary: `Update ${resourceName}`,
      tag,
      pathParams: idPathParams,
      body: updateSchema,
      itemSchema,
    },
    {
      method: 'delete',
      path: `${base}/{id}`,
      summary: `Delete ${resourceName}`,
      tag,
      pathParams: idPathParams,
    },
  ];
}
