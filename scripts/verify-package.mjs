import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
const required=['dist/index.html','dist/app.js','dist/styles.css','dist/engine.js','dist/knowledge.js','dist/sw.js','dist/manifest.webmanifest','dist/icon.svg','dist/icon-192.png','dist/icon-512.png','README.md','SECURITY.md','docs/SOURCES.md'];
for(const file of required)if(!(await stat(file)).size)throw new Error(`Empty required file: ${file}`);
async function walk(dir){for(const x of await readdir(dir,{withFileTypes:true})){if(['.git','.openai','node_modules'].includes(x.name))continue;const p=path.join(dir,x.name);if(x.isDirectory())await walk(p);else{if(/\.(docx?|pdf|xlsx?|csv|tsv|zip)$/i.test(p))throw new Error(`Reference/data file in source: ${p}`);const text=await readFile(p,'utf8');if(/(?:sk-(?:proj-)?[A-Za-z0-9_-]{25,}|ghp_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{40,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(text))throw new Error(`Potential credential in ${p}`);}}}
await walk('.');
const html=await readFile('dist/index.html','utf8');
if(/<script[^>]+src=["']https?:/i.test(html))throw new Error('External runtime script');
for(const f of ['dist/app.js','dist/engine.js']){const s=await readFile(f,'utf8');if(/localStorage|sessionStorage|indexedDB|sendBeacon|XMLHttpRequest/.test(s))throw new Error(`Unexpected persistent storage or transport in ${f}`);}
console.log('Package audit passed: required assets, no reference attachments, no credential patterns, no persistent clinical storage.');
