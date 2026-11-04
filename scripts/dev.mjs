import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
const env={SESSION_SECRET:process.env.SESSION_SECRET||randomBytes(32).toString('hex')};
createServer(async(req,res)=>{try{
  const source=await readFile('worker/index.js','utf8');
  const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const r=await worker.fetch(new Request('http://localhost:4173'+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}),env);
  res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));
}catch{res.writeHead(500);res.end('Local server error');}}).listen(4173,'127.0.0.1',()=>console.log('Local: http://localhost:4173'));
