// Bundles the companion into dist/index.mjs. Third-party packages stay external for now;
// the release workflow will produce fully self-contained executables.
import { build } from 'esbuild'

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  // @yoto-local/shared is TypeScript source, so it must be bundled rather than imported.
  alias: { '@yoto-local/shared': '../shared/src/index.ts' },
  sourcemap: true,
  logLevel: 'info'
})
