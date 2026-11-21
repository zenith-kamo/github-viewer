import { build, transform } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'src');
const outDir = path.join(root, 'public');

export async function buildAll({ quiet = false } = {}) {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(path.join(outDir, 'assets'), { recursive: true });

  // Bundle + minify the app (marked / DOMPurify / highlight.js are bundled in).
  await build({
    entryPoints: [path.join(srcDir, 'js/app.js')],
    bundle: true,
    minify: true,
    format: 'esm',
    target: ['es2020'],
    outfile: path.join(outDir, 'assets/app.min.js'),
    legalComments: 'none',
    logLevel: 'silent',
  });

  // highlight.js theme + app styles, minified into one file.
  const hljsCss = await readFile(
    path.join(root, 'node_modules/highlight.js/styles/github-dark.css'),
    'utf8',
  );
  const appCss = await readFile(path.join(srcDir, 'styles.css'), 'utf8');
  const css = await transform(`${hljsCss}\n${appCss}`, { loader: 'css', minify: true });
  await writeFile(path.join(outDir, 'styles.css'), css.code);

  await copyFile(path.join(srcDir, 'index.html'), path.join(outDir, 'index.html'));
  await copyFile(path.join(srcDir, 'assets/icon.png'), path.join(outDir, 'assets/icon.png'));
  await copyFile(path.join(srcDir, 'assets/favicon.ico'), path.join(outDir, 'assets/favicon.ico'));

  if (!quiet) {
    const { size } = await stat(path.join(outDir, 'assets/app.min.js'));
    console.log(`built public/ (app.min.js ${(size / 1024).toFixed(1)} KB)`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildAll();
}
