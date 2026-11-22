import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
await mkdir('dist',{recursive:true});
const cssBuild=spawnSync(process.execPath,['node_modules/@tailwindcss/cli/dist/index.mjs','-i','src/ui.css','-o','dist/ui.css','--minify'],{stdio:'inherit'});
if(cssBuild.status!==0)throw new Error('UI CSS build failed. Run npm install before building.');
const [template, style, script] = await Promise.all([
  readFile('src/index.html','utf8'),
  readFile('src/style.css','utf8'),
  readFile('src/app.js','utf8'),
]);
// Callback replacements preserve literal dollar signs such as the $$ selector.
const libraryCSS=await readFile('dist/ui.css','utf8');
const html = template.replace('/* APP_STYLE */',()=>libraryCSS+'\n'+style).replace('/* APP_SCRIPT */',()=>script);
const source = 'const HTML = '+JSON.stringify(html)+';\n'+await readFile('src/server.js','utf8');
await mkdir('dist/server',{recursive:true});
await mkdir('dist/.openai',{recursive:true});
await writeFile('worker/index.js',source);
await writeFile('dist/server/index.js',source);
await writeFile('dist/.openai/hosting.json',await readFile('.openai/hosting.json'));
console.log('Built Locket Gallery');
