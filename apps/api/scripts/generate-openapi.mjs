/**
 * Writes OpenAPI JSON to public/openapi.json (optional static artifact for CI/docs).
 * Runtime spec is built in src/openapi/document.ts when the API starts.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const apiRoot = join(__dirname, '..');

// Load compiled output after `tsc`
const { createOpenApiDocument } = require(join(apiRoot, 'dist/openapi/document.js'));

const port = process.env.PORT || 3001;
const doc = createOpenApiDocument(`http://localhost:${port}`);

const outDir = join(apiRoot, 'public');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'openapi.json');
writeFileSync(outPath, JSON.stringify(doc, null, 2));
console.log('Wrote', outPath);
