import {chromium} from 'playwright';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {radialMinutes} from '../src/travel.js';
const LIST='https://osaka-info.jp/event/',FEED=LIST+'article.json';
const REQUEST_DELAY_MS=3000;
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo'}).format(new Date());
const fetchedAt=new Date().toISOString();
const railway=JSON.parse(await readFile('public/data/railway.json','utf8'));
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
const context=await browser.newContext({locale:'ja-JP'});
await context.route('**/*',async route=>{
 if(['image','font','media'].includes(route.request().resourceType()))return route.abort();
 const request=route.request();
 if(request.url()===FEED||(request.isNavigationRequest()&&request.frame()===page.mainFrame()))await new Promise(resolve=>setTimeout(resolve,REQUEST_DELAY_MS));
 return route.continue();
});
const page=await context.newPage();
const clean=s=>String(s||'').replace(/<br\s*\/?\s*>/gi,' ').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
const report={source:LIST,feed:FEED,fetched_at:fetchedAt,as_of:today,excluded:[]};
try{
 const responsePromise=page.waitForResponse(r=>r.url()===FEED,{timeout:60000});
 const listing=await page.goto(LIST,{waitUntil:'domcontentloaded',timeout:60000});
 if(!listing.ok())throw Error(`Listing HTTP ${listing.status()}`);
 const response=await responsePromise;if(!response.ok())throw Error(`Feed HTTP ${response.status()}`);
 const data=await response.json();if(!Array.isArray(data.items)||!data.items.length)throw Error('Empty or invalid event feed');
 report.listed=data.items.length;
 const candidates=data.items.filter(e=>e.ja_published===1&&!e.cancel&&/^\d{4}-\d{2}-\d{2}$/.test(e.eventStartDate)&&/^\d{4}-\d{2}-\d{2}$/.test(e.eventEndDate)&&e.eventEndDate>=today);
 const features=[];
 for(const item of candidates){
  const url=new URL(item.url);if(url.origin!=='https://osaka-info.jp'||!url.pathname.startsWith('/event/'))throw Error('Unexpected event URL');
  const response=await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:60000});
  if(!response.ok())throw Error(`Detail HTTP ${response.status()}: ${url.href}`);
  const detail=await page.evaluate(()=>{
   const fields=Object.fromEntries([...document.querySelectorAll('dt')].map(dt=>[dt.textContent.trim(),dt.nextElementSibling?.textContent.trim()]));
   const points=[...document.querySelectorAll('iframe[src]')].map(frame=>{
    try{const u=new URL(frame.src);if(!/(^|\.)google\.(com|co\.jp)$/.test(u.hostname))return null;
     const q=u.searchParams.get('q')||'',m=q.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);return m?[Number(m[2]),Number(m[1])]:null;
    }catch{return null;}
   }).filter(Boolean);
   const unique=[...new Map(points.map(p=>[p.join(','),p])).values()];
   return {venue:fields['開催地'],schedule:fields['スケジュール'],coordinates:unique.length===1?unique[0]:null};
  });
  const coords=detail.coordinates;
  if(!coords||!detail.venue||coords[0]<134.15||coords[0]>136.9||coords[1]<33.35||coords[1]>35.85){report.excluded.push({id:item.id,url:url.href,reason:'会場の一意な掲載座標がない、または対象範囲外'});continue;}
  const access={};const point={lon:coords[0],lat:coords[1]};
  for(const station of railway.stations){const bike=radialMinutes(station,point,'bike'),walk=radialMinutes(station,point,'walk');if(Math.min(bike,walk)<=30)access[station.id]={out:bike,back:bike,walk_out:walk,walk_back:walk};}
  features.push({type:'Feature',geometry:{type:'Point',coordinates:coords},properties:{id:`osaka-info-${item.id}`,name:clean(item.title),venue:clean(detail.venue),address:clean(item.address),category:({season:'季節',traditional:'伝統行事',gourmet:'グルメ',exhibition:'アート',sports:'スポーツ'})[item.label]||'その他',date:item.eventStartDate,end_date:item.eventEndDate,start:null,end:null,schedule:clean(detail.schedule),url:url.href,source:'OSAKA-INFO（大阪観光局）',source_category:item.ja_label||'その他',source_updated:item.modifiedDate,fetched_at:fetchedAt,coordinate_source:url.href,fictional:false,access}});
  console.log(`Imported ${item.id}: ${clean(item.title)}`);

 }
 if(!features.length)throw Error('No located events; keeping existing data');
 report.candidates=candidates.length;report.imported=features.length;
 const output={type:'FeatureCollection',source:{name:'OSAKA-INFO（大阪観光局）',url:LIST,feed_url:FEED,fetched_at:fetchedAt,as_of:today,coordinate_method:'掲載ページの地図に指定された会場座標',limitations:'掲載期間内でも休催日・個別開催日があります。詳細は掲載元を確認してください。'},features};
 await mkdir('docs',{recursive:true});
 // Complete the entire fetch before replacing the served data.
 await writeFile('public/data/station_events.geojson.tmp',JSON.stringify(output)+'\n');
 await rename('public/data/station_events.geojson.tmp','public/data/station_events.geojson');
 await writeFile('docs/events-import-report.json',JSON.stringify(report,null,2)+'\n');
 console.log(`Imported ${features.length}/${candidates.length}; excluded ${report.excluded.length}`);
}finally{await browser.close();}
