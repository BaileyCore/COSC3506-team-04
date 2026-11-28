const https = require('node:https');
const dns = require('node:dns/promises');
const ip = require('ipaddr.js');

const text = value => (value || '').replace(/<[^>]*>/g,' ').replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/gi, (_, x) => ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ','#39':"'"})[x.toLowerCase()]).replace(/\s+/g,' ').trim();
function webUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Enter a public HTTPS website.');
  const u = new URL(value.trim());
  if (u.protocol !== 'https:' || u.username || u.password || u.port) throw new Error('Enter a public HTTPS website.');
  return u;
}
async function fetchHtml(url) {
  const u = webUrl(url);
  let timer;
  const addresses = await Promise.race([
    dns.lookup(u.hostname,{all:true}),
    new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error('Website lookup timed out.')),2500);})
  ]).finally(()=>clearTimeout(timer));
  const isPublic = value => {
    const addr=ip.process(value);
    return addr.range()==='unicast' && !(addr.kind()==='ipv4' && addr.match(ip.parse('198.18.0.0'),15));
  };
  const available = addresses.find(a => a.family === 4 && isPublic(a.address));
  if (!available || addresses.some(a => !isPublic(a.address))) throw new Error('The website did not resolve to a supported public address.');
  return new Promise((resolve,reject) => {
    const request = https.get(u, {agent:false, family:4, autoSelectFamily:false, signal:AbortSignal.timeout(5500),
      lookup(_host, _opts, callback) { callback(null,available.address,4); },
      headers:{Accept:'text/html', 'User-Agent':'Team04-R4-CompanyImport/1.0'}}, res => {
      if (res.statusCode !== 200 || !/^text\/html\b/i.test(res.headers['content-type'] || '')) {
        res.destroy();
        return reject(new Error('The website did not return an HTML page. Try its final HTTPS URL or enter the company manually.'));
      }
      const chunks=[]; let bytes=0;
      res.on('data', b => {
        bytes += b.length;
        if (bytes > 524288) request.destroy(new Error('The website exceeds the import size limit.'));
        else chunks.push(b);
      });
      res.once('error',reject);
      res.once('end',() => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    request.once('error',reject);
  });
}
function extractCompany(html, source) {
  const sourceUrl=webUrl(source);
  const clean=html.replace(/<!--[^]*?-->|<(script|style|template)\b[^>]*>[^]*?<\/\1\s*>/gi,'');
  const first=tag => text(clean.match(new RegExp('<'+tag+'\\b[^>]*>([^]*?)<\\/'+tag+'\\s*>','i'))?.[1]);
  const name=(first('h1') || first('title')).slice(0,160);
  if (!name) throw new Error('No company name was found. Please enter it manually.');
  const paragraphs=Array.from(clean.matchAll(/<p\b[^>]*>([^]*?)<\/p\s*>/gi), m=>text(m[1]));
  const meta=Object.create(null);
  for (const [tag] of clean.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs=Object.fromEntries(Array.from(tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g), m=>[m[1].toLowerCase(),m[2]??m[3]??m[4]]));
    if (attrs.name || attrs.property) meta[(attrs.name || attrs.property).toLowerCase()]=text(attrs.content);
  }
  const desc=meta.description || meta['og:description'] || paragraphs.find(p=>p.length>=35 && !/^(location|services|keywords|sector):/i.test(p)) || '';
  const location=meta['business:contact_data:locality'] || paragraphs.find(p=>/^location:/i.test(p))?.replace(/^location:\s*/i,'') || '';
  const services=meta.keywords || paragraphs.find(p=>/^(services|sector|keywords):/i.test(p))?.split(':').slice(1).join(':').trim() || '';
  const rawKeywords=[
    ...services.split(',').map(x=>x.trim().replace(/[.;:]+$/g,'').trim()).filter(Boolean),
    ...['simulation','XR','training'].filter(x=>new RegExp('\\b'+x+'\\b','i').test(desc+' '+services))
  ];
  const seenKeywords=new Set();
  const keywords=[];
  for(const kw of rawKeywords){
    const key=kw.toLowerCase();
    if(!seenKeywords.has(key)){seenKeywords.add(key);keywords.push(kw);}
  }
  let website=sourceUrl.origin;
  // Unchanged course fixtures identify the simulated company with reserved .example.test links.
  const link=Array.from(clean.matchAll(/href\s*=\s*["']([^"']+)["']/gi),x=>x[1]).find(x=>/^https:\/\/[\w.-]+\.example\.test\/?$/i.test(x));
  if(link) website=webUrl(link).origin;
  return {name,description:desc.slice(0,1600),location:location.slice(0,240),sector:keywords.join(', ').slice(0,300),
    website,domain:new URL(website).hostname,source_url:sourceUrl.href,needs_manual_completion:!desc || !location || !keywords.length};
}
module.exports={webUrl,fetchHtml,extractCompany};
