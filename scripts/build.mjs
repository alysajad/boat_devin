import * as esbuild from 'esbuild';
import { cp, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
export async function build(watch = false) {
  await writeFile('version.js', 'export const version = "0.16.0";\n');
  await mkdir('dist', { recursive: true });
  await cp('public', 'dist', { recursive: true });
  await cp('license', 'dist/LICENSE.txt');
  await mkdir('dist/licenses', { recursive: true });
  const packages = ['@dimforge/rapier2d-compat', 'http-proxy', 'three', 'p5', '@deepstream/client', '@deepstream/server', 'qrcode', 'on-change', 'reefjs', 'buffer', '@fontsource/bungee', '@fontsource/noto-sans'];
  const notices = ['Open-source software used in Kerala Boat Race\n\np5.party: MIT, copyright (c) 2020 Justin Bakse.\nSee /LICENSE.txt for the retained upstream notice.\n'];
  for (const name of packages) {
    const dir = `node_modules/${name}`;
    const pkg = JSON.parse(await readFile(`${dir}/package.json`, 'utf8'));
    const files = (await readdir(dir)).filter(f => /^(license|copying|ofl)(\.|$)/i.test(f));
    const label = name.replaceAll('/', '-').replaceAll('@', '');
    for (const file of files) await cp(`${dir}/${file}`, `dist/licenses/${label}-${file}`);
    notices.push(`${name} ${pkg.version} — ${pkg.license}\n${files.map(f => `/licenses/${label}-${f}`).join('\n')}\n`);
  }
  notices.push('Photographic wood and shore materials: Poly Haven, CC0 1.0. See /assets/river/CREDITS.txt for sources.\n');
  notices.push('Anatomical rowers: MakeHuman Community, CC0. See /assets/crew/CREDITS.txt. Island Tree 01: Poly Haven, CC0. See /assets/scenery/CREDITS.txt.\n');
  await writeFile('dist/CREDITS.txt', notices.join('\n'));
  const ctx = await esbuild.context({ entryPoints: ['app/main.ts'], bundle: true, outdir: 'dist', entryNames: 'app', chunkNames: 'chunks/[name]-[hash]', splitting: true, metafile: true, format: 'esm', target: 'es2022', sourcemap: true, minify: !watch, define: { global: 'window' }, inject: ['scripts/buffer-shim.js'], loader: { '.css': 'css', '.woff': 'file', '.woff2': 'file' }, plugins: [{ name: 'upstream-info-css', setup(b) { b.onLoad({ filter: /src\/info\.css$/ }, async args => ({ contents: await (await import('node:fs/promises')).readFile(args.path, 'utf8'), loader: 'text' })); } }], logLevel: 'info' });
  if (watch) await ctx.watch(); else { const result = await ctx.rebuild(); await writeFile('dist/build-meta.json', JSON.stringify(result.metafile, null, 2)); await ctx.dispose(); }
  return ctx;
}
if (process.argv[1]?.endsWith('build.mjs')) await build();
