import { readFile, writeFile, mkdir } from 'node:fs/promises';
const [template, style, script] = await Promise.all([
  readFile('src/index.html','utf8'),
  readFile('src/style.css','utf8'),
  readFile('src/app.js','utf8'),
]);
// Callback replacements preserve literal dollar signs such as the $$ selector.
const html = template.replace('/* APP_STYLE */',()=>style).replace('/* APP_SCRIPT */',()=>script);
const source = 'const HTML = '+JSON.stringify(html)+';\n'+await readFile('src/server.js','utf8');
await mkdir('dist/server',{recursive:true});
await mkdir('dist/.openai',{recursive:true});
await writeFile('worker/index.js',source);
await writeFile('dist/server/index.js',source);
await writeFile('dist/.openai/hosting.json',await readFile('.openai/hosting.json'));
console.log('Built Locket Gallery');
