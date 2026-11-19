import { existsSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'next/server') return nextResolve('next/server.js', context);
  if (specifier.startsWith('.') && !extname(specifier.split(/[?#]/)[0])) {
    const parent = context.parentURL ? fileURLToPath(context.parentURL) : process.cwd();
    const base = join(dirname(parent), specifier);
    for (const ext of ['.js', '.mjs', '.cjs', '.json']) {
      if (existsSync(base + ext)) return nextResolve(pathToFileURL(base + ext).href, context);
    }
  }
  return nextResolve(specifier, context);
}
