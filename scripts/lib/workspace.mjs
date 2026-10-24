import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);

export const projectPath = file => path.resolve(root, file);

export function cliOption(name, fallback, args = process.argv.slice(2)) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

export function optionalPackage(name, option) {
  return require(cliOption(option, name));
}

export function readProjectJson(file) {
  return JSON.parse(readFileSync(projectPath(file), 'utf8').replace(/^\uFEFF/, ''));
}

export function writeProjectJson(file, value) {
  const target = projectPath(file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(value, null, 2) + '\n');
}
