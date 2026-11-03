// Local static shell for synthetic browser tests. No request or case logging.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve('dist');
createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1:4173');
  const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(req.method!=='GET'||!path.startsWith(root+sep)||url.search){res.writeHead(404).end();return;}
  const data=await readFile(path);res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'})[extname(path)]??'application/octet-stream'}).end(data);
 }catch{res.writeHead(404).end();}
}).listen(4173,'127.0.0.1');
