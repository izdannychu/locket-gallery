import { readFile, writeFile, mkdir } from 'node:fs/promises';
const html = (await readFile('src/index.html','utf8')).replace('/* APP_STYLE */',await readFile('src/style.css','utf8')).replace('/* APP_SCRIPT */',await readFile('src/app.js','utf8'));
const source = 'const HTML = '+JSON.stringify(html)+';\n'+await readFile('src/server.js','utf8');
await mkdir('dist/server',{recursive:true});
await mkdir('dist/.openai',{recursive:true});
await writeFile('worker/index.js',source);
await writeFile('dist/server/index.js',source);
await writeFile('dist/.openai/hosting.json',await readFile('.openai/hosting.json'));
console.log('Built Locket Gallery');
