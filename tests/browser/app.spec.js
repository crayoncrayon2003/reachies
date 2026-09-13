import { test, expect } from '@playwright/test';
async function ready(page){await page.goto('/',{waitUntil:'domcontentloaded'});await expect(page.locator('#budget')).toBeEnabled();}
test('station selection synchronizes map and list and evaluates outbound reach',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await ready(page);
  expect(await page.locator('.station-dot').count()).toBeGreaterThan(30);
  await expect(page.locator('[data-station-id=osaka]')).toHaveCount(1);
  await expect(page.locator('[data-station-id=hankyu_umeda]')).toHaveCount(0);
  await expect(page.locator('#selected button')).toHaveCount(2);
  await expect(page.locator('.leaflet-rails-pane path')).toHaveCount(360);
  await page.getByRole('button',{name:'選択解除',exact:true}).click();
  await expect(page.locator('#count')).toHaveText('0');
  await page.locator('summary').filter({hasText:'駅名から選ぶ'}).click();
  await page.locator('[data-station=osaka]').check();
  await expect(page.locator('#selected button')).toHaveCount(1);
  expect(Number(await page.locator('#count').textContent())).toBeGreaterThan(0);
  await expect(page.locator('#scope')).toHaveCount(0);
  await page.locator('[data-station=kyobashi]').check();
  await expect(page.locator('#selected button')).toHaveCount(2);
  await expect(page.locator('[data-station=osaka]')).toBeChecked();
  await page.locator('[data-station=osaka]').uncheck();
  await expect(page.getByRole('button',{name:'大阪・梅田駅を選択',exact:true})).toHaveAttribute('aria-pressed','false');
  expect(errors).toEqual([]);
});
test('mode and time updates match event eligibility and candidate itinerary',async({page})=>{
  await ready(page);
  for(const mode of ['bike','walk'])for(const scope of ['outbound'])for(const budget of [5,10,20,30]){
    await page.locator('#travel-mode').selectOption(mode);await page.locator('#budget').fill(String(budget));
    const count=await page.evaluate(async({scope,budget,mode})=>{
      const events=await(await fetch('./data/station_events.geojson')).json();const selected=['osaka','kyobashi'];const out=mode==='walk'?'walk_out':'out',back=mode==='walk'?'walk_back':'back';
      return events.features.filter(e=>selected.some(a=>Number.isFinite(e.properties.access[a]?.[out])&&e.properties.access[a][out]<=budget&&(scope==='outbound'||selected.some(b=>a!==b&&Number.isFinite(e.properties.access[b]?.[back])&&e.properties.access[b][back]<=budget)))).length;
    },{scope,budget,mode});
    await expect(page.locator('#count')).toHaveText(String(count));
  }
  await page.locator('.event-card').first().click();
  await expect(page.locator('#route-detail')).toBeVisible();
  await expect(page.locator('#route-detail')).toContainText('→ イベント');
  await expect(page.locator('.journey-segment')).toHaveCount(0);
  await page.getByRole('button',{name:'この組み合わせで旅程を作る'}).click();
  await expect(page.locator('.journey-segment')).toHaveCount(2);
  await page.getByRole('button',{name:'選択解除',exact:true}).click();
  await expect(page.locator('#route-detail')).toBeHidden();
  await expect(page.locator('.journey-segment')).toHaveCount(2);
});
test('mobile layout and desktop preview',async({page})=>{
  await ready(page);await page.screenshot({path:'test-results/desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.screenshot({path:'test-results/mobile.png',fullPage:true});
});
test('missing station accessibility data is visible and controls stay disabled',async({page})=>{
  await page.route('**/data/station_access.json',r=>r.fulfill({status:404,body:'missing'}));await page.goto('/',{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('alert')).toContainText('データを読み込めませんでした');await expect(page.locator('#budget')).toBeDisabled();
});
test('repository subpath supports static data files',async({page})=>{
  await page.route('**/PublicTransportationReachMap/**',async route=>{const url=new URL(route.request().url());url.pathname=url.pathname.replace('/PublicTransportationReachMap/','/');await route.fulfill({response:await route.fetch({url:url.toString()})});});
  await page.goto('/PublicTransportationReachMap/',{waitUntil:'domcontentloaded'});await expect(page.locator('#budget')).toBeEnabled();await expect(page.locator('.event-card')).toHaveCount(13);
});


test('event types use pictogram pins and major railway operators are available',async({page})=>{
  await ready(page);
  await expect(page.locator('.event-pin')).toHaveCount(13);
  await expect(page.locator('.event-pin svg')).toHaveCount(13);
  await expect(page.locator('#reach-scale span')).toHaveCount(6);
  const shapes=await page.locator('.event-pin').evaluateAll(pins=>Object.fromEntries(pins.map(p=>[p.dataset.category,p.innerHTML])));
  expect(Object.keys(shapes).length).toBeGreaterThanOrEqual(6);
  expect(new Set(Object.values(shapes)).size).toBe(Object.keys(shapes).length);
  for(const operator of ['JR','Osaka Metro','阪急','阪神','近鉄','京阪'])await expect(page.locator(`#line-legend details[data-operator="${operator}"]`)).toHaveCount(1);
  const icon=page.locator('.event-marker').filter({has:page.locator('[data-category="音楽"]')}).first();
  await icon.click();
  await expect(page.locator('.leaflet-popup')).toBeVisible();
});


test('station circles stay on the railway during repeated wheel zoom',async({page})=>{
  await ready(page);
  const drift=()=>page.evaluate(()=>{
    const circle=document.querySelector('[data-station-id="kyobashi"] .station-circle').getBoundingClientRect();
    const x=circle.x+circle.width/2,y=circle.y+circle.height/2;
    const path=document.querySelector('.rail-loop'), matrix=path.getScreenCTM(), length=path.getTotalLength();
    let min=Infinity;
    for(let t=0;t<=length;t+=.8){const p=path.getPointAtLength(t),q=new DOMPoint(p.x,p.y).matrixTransform(matrix);min=Math.min(min,Math.hypot(q.x-x,q.y-y));}
    return min;
  });
  expect(await drift()).toBeLessThan(3);
  for(const delta of [-180,180,-180,180]){
    const rect=await page.locator('[data-station-id="kyobashi"]').boundingBox();
    await page.mouse.move(rect.x+14,rect.y+14);await page.mouse.wheel(0,delta);await page.waitForTimeout(650);
    expect(await drift()).toBeLessThan(3);
    expect(await page.locator('[data-station-id="kyobashi"]').evaluate(e=>e.style.transform)).toBe('');
  }
});

test('historical bus network loads on demand and can be removed',async({page})=>{
  await ready(page);
  await page.locator('#show-bus').check();await expect(page.locator('#bus-status')).toContainText('219', {timeout:20000});
  await expect(page.locator('.leaflet-buses-pane canvas')).toBeVisible();
  await page.locator('#show-bus').uncheck();
  await expect(page.locator('.leaflet-buses-pane canvas')).toHaveCount(0);
  await page.locator('#show-bus').check();
  await expect(page.locator('.leaflet-buses-pane canvas')).toBeVisible();
});


test('station click toggles reach selection and offers journey insertion positions',async({page})=>{
 await ready(page);
 await page.locator('[data-station-id=osaka]').click();
 await expect(page.locator('#selected button')).toHaveCount(1);
 await expect(page.locator('[data-station-id=osaka]')).toHaveAttribute('aria-pressed','false');
 await expect(page.locator('.leaflet-popup')).toHaveCount(1);
 await page.locator('[data-station-id=osaka]').click();
 await expect(page.locator('#selected button')).toHaveCount(2);
 await expect(page.locator('[data-station-id=osaka]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.leaflet-popup')).toHaveCount(1);
});

test('walking and cycling reach areas reflect the selected speed',async({page})=>{
 await ready(page);await page.locator('#clear').click();await page.locator('summary').filter({hasText:'駅名から選ぶ'}).click();await page.locator('[data-station=morinomiya]').check();
 await expect(page.locator('#show-walk')).toHaveCount(0);await expect(page.locator('.walk-radius')).toHaveCount(0);
 const painted=()=>page.locator('.radial-reach canvas').evaluateAll(canvases=>canvases.reduce((sum,c)=>{const data=c.getContext('2d').getImageData(0,0,256,256).data;for(let i=3;i<data.length;i+=4)if(data[i])sum++;return sum;},0));
 const bike=await painted();expect(bike).toBeGreaterThan(1000);
 await page.locator('#travel-mode').selectOption('walk');await expect(page.locator('#scenario')).toContainText('徒歩 20分');await expect(page.locator('#area-label')).toContainText('徒歩');
 await expect(page.locator('#reach-method')).toContainText('1.50km');
 const walk=await painted();expect(walk/bike).toBeGreaterThan(.08);expect(walk/bike).toBeLessThan(.10);
 await expect(page.locator('.walk-radius')).toHaveCount(0);
 await page.locator('.event-card').first().click();await expect(page.locator('#route-detail')).toContainText('徒歩プラン');
 await page.getByRole('button',{name:'この組み合わせで旅程を作る'}).click();await expect(page.getByLabel('区間1の移動手段')).toHaveValue('walk');
 await expect(page.locator('.radial-reach')).toHaveCount(1);
 await page.locator('[data-station=kyobashi]').check();await expect(page.locator('.radial-reach canvas').first()).toBeAttached();
});
const A='station:osaka',B='station:kyobashi',C='station:morinomiya',E='event:event-1',F='event:event-4';
for(const [name,points] of Object.entries({AEA:[A,E,A],AEB:[A,E,B],AEFA:[A,E,F,A],AEFB:[A,E,F,B],AEBFC:[A,E,B,F,C]}))test(`all ordered connections are drawn: ${name}`,async({page})=>{
 await ready(page);await page.locator('#journey-editor summary').click();
 await page.locator('#journey-start').selectOption(points[0]);await page.locator('#journey-end').selectOption(points.at(-1));
 for(const point of points.slice(1,-1)){await page.locator('#journey-point').selectOption(point);await page.locator('#journey-add').click();}
 await page.locator('#journey-fit').click();await page.waitForTimeout(350);
 await expect(page.locator('.journey-segment')).toHaveCount(points.length-1);
 await expect(page.locator('#journey-summary')).not.toContainText('編集中');
 const connections=await page.evaluate(()=>{
  const markers=[...document.querySelectorAll('.journey-number')];
  const position=index=>{const m=markers.find(m=>m.textContent.split('・').includes(String(index))),r=m.getBoundingClientRect();return {x:r.x-14,y:r.y+30};};
  return [...document.querySelectorAll('.journey-segment')].map((p,i)=>{
   const length=p.getTotalLength(),matrix=p.getScreenCTM();
   const start=p.getPointAtLength(0),end=p.getPointAtLength(length);
   const a=new DOMPoint(start.x,start.y).matrixTransform(matrix),b=new DOMPoint(end.x,end.y).matrixTransform(matrix);
   const from=position(i+1),to=position(i+2);
   return {length,start:Math.hypot(a.x-from.x,a.y-from.y),end:Math.hypot(b.x-to.x,b.y-to.y)};
  });
 });
 for(const leg of connections){expect(leg.length).toBeGreaterThan(0);expect(leg.start).toBeLessThan(2);expect(leg.end).toBeLessThan(2);}
 // Opening another candidate must not replace the first or any other itinerary leg.
 await page.locator('.event-card').first().click();await expect(page.locator('.journey-segment')).toHaveCount(points.length-1);
 if(name==='AEA')await page.screenshot({path:'test-results/return-journey.png',fullPage:true});
});
test('selected Honmachi and Yodoyabashi enclose events added from the map',async({page})=>{
 await ready(page);await page.locator('#clear').click();
 await page.locator('summary').filter({hasText:'駅名から選ぶ'}).click();
 await page.locator('[data-station=hommachi]').check();await page.locator('[data-station=yodoyabashi]').check();
 // Selected stations provide endpoints for the ordered event visits.
 for(const name of ['靱公園 青空ワークショップ','中之島 リバーサイドマーケット']){
  await page.locator('.event-card').filter({hasText:name}).click();await page.locator('.leaflet-popup').filter({has:page.getByText(name,{exact:true})}).getByRole('button',{name:'旅程に追加',exact:true}).click();
 }
 await expect(page.locator('#journey-start')).toHaveValue('station:hommachi');await expect(page.locator('#journey-end')).toHaveValue('station:yodoyabashi');
 await expect(page.locator('.journey-stop')).toHaveCount(4);await expect(page.locator('.journey-segment')).toHaveCount(3);
 await expect(page.locator('.journey-stop-title strong').first()).toHaveText('1. 出発：本町');
 await expect(page.locator('.journey-stop-title strong').last()).toHaveText('4. 到着：淀屋橋');
 await page.locator('#journey-fit').click();await page.waitForTimeout(350);
 await page.screenshot({path:'test-results/selected-stations-journey.png',fullPage:true});
 await page.locator('#journey-end').selectOption('station:hommachi');await expect(page.locator('.journey-stop-title strong').last()).toHaveText('4. 到着：本町');
 await page.getByRole('button',{name:'2番目を下へ',exact:true}).click();await expect(page.locator('.journey-stop-title strong').nth(1)).toContainText('中之島');
 await page.locator('#journey-point').selectOption('station:osaka');await page.locator('#journey-add').click();
 await expect(page.locator('.journey-stop-title strong').nth(3)).toContainText('経由駅：大阪');await expect(page.locator('.journey-segment')).toHaveCount(4);
 await page.getByLabel('区間1の移動手段').selectOption('walk');await expect(page.getByLabel('区間1の移動手段')).toHaveValue('walk');
 await page.getByRole('button',{name:'2番目を削除',exact:true}).click();await expect(page.locator('.journey-segment')).toHaveCount(3);
 await page.locator('#clear').click(); // Reach selection does not rewrite the established itinerary.
 await expect(page.locator('.journey-segment')).toHaveCount(3);
 await page.locator('#journey-start').selectOption('station:hommachi');await expect(page.locator('.journey-segment')).toHaveCount(3);
 await page.locator('#journey-clear').click();await expect(page.locator('.journey-segment')).toHaveCount(0);
});
test('one selected station automatically supplies both endpoints for event additions',async({page})=>{
 await ready(page);await page.locator('#clear').click();await page.locator('summary').filter({hasText:'駅名から選ぶ'}).click();await page.locator('[data-station=hommachi]').check();
 await page.locator('.event-card').filter({hasText:'靱公園 青空ワークショップ'}).click();await page.locator('.leaflet-popup').filter({hasText:'靱公園 青空ワークショップ'}).getByRole('button',{name:'旅程に追加',exact:true}).click();
 await expect(page.locator('#journey-start')).toHaveValue('station:hommachi');await expect(page.locator('#journey-end')).toHaveValue('station:hommachi');await expect(page.locator('.journey-segment')).toHaveCount(2);
});

test('regional stations are searchable, mapped once and selectable for journeys',async({page})=>{
 await ready(page);await page.locator('#clear').click();await page.locator('summary').filter({hasText:'駅名から選ぶ'}).click();
 for(const name of ['米原','白浜','福知山','新宮']){
  await page.locator('#station-search').fill(name);
  const id=await page.locator('#station-list input').first().getAttribute('data-station');
  await page.locator(`#station-list [data-station="${id}"]`).check();await page.locator('#fit-selection').click();
  await expect(page.locator(`[data-station-id="${id}"]`)).toHaveCount(1);
  await page.locator('#clear').click();
 }
 await page.locator('#station-search').fill('京都');
 const stations=await page.evaluate(async()=> (await(await fetch('./data/railway.json')).json()).stations.filter(s=>s.name==='京都'));
 expect(stations).toHaveLength(1);expect(stations[0].operators.length).toBeGreaterThan(2);
});
test('bus routes are on by default and an actual bus stop supplies journey endpoints',async({page})=>{
 await ready(page);await expect(page.locator('#show-bus')).toBeChecked();
 await expect(page.locator('.leaflet-buses-pane canvas')).toHaveCount(1,{timeout:20000});
 await page.locator('#clear').click();await page.locator('summary').filter({hasText:'駅名から選ぶ'}).click();await page.locator('#station-search').fill('本町');
 const id='bus-2ae70131c5be';await page.locator(`[data-station="${id}"]`).check();await page.locator('#fit-selection').click();
 await expect(page.locator(`[data-station-id="${id}"]`)).toHaveCount(1);
 await page.locator(`[data-station-id="${id}"]`).click();await expect(page.locator(`[data-station-id="${id}"]`)).toHaveAttribute('aria-pressed','false');
 await page.locator(`[data-station-id="${id}"]`).click();await expect(page.locator(`[data-station-id="${id}"]`)).toHaveAttribute('aria-pressed','true');
 await page.locator('.event-card').filter({hasText:'靱公園 青空ワークショップ'}).click();await page.locator('.leaflet-popup').filter({hasText:'靱公園 青空ワークショップ'}).getByRole('button',{name:'旅程に追加',exact:true}).click();
 await expect(page.locator('#journey-start')).toHaveValue(`station:${id}`);await expect(page.locator('#journey-end')).toHaveValue(`station:${id}`);
 await expect(page.locator('.journey-segment')).toHaveCount(2);await expect(page.locator('#journey-summary')).toContainText('各区間が時間上限内（推定）');
 await page.locator('#journey-fit').click();await page.waitForTimeout(350);await page.screenshot({path:'test-results/bus-journey.png',fullPage:true});
});
test('every displayed rail route uses its company color',async({page})=>{
 await ready(page);
 const result=await page.evaluate(async()=>{
  const data=await(await fetch('./data/railway.json')).json();const colors={};
  return data.lines.features.every(f=>{const p=f.properties,c=document.querySelector(`.rail-${p.id}`).getAttribute('stroke');if(colors[p.operator_key]&&colors[p.operator_key]!==c)return false;colors[p.operator_key]=c;return c===p.color;});
 });expect(result).toBe(true);
});

test('event popup chooses an insertion gap and station picker can replace endpoints',async({page})=>{
 await ready(page);
 for(const name of ['靱公園 青空ワークショップ','中之島 リバーサイドマーケット']){
  await page.locator('.event-card').filter({hasText:name}).click();
  const popup=page.locator('.leaflet-popup').filter({has:page.getByText(name,{exact:true})});
  if(name.startsWith('中之島'))await popup.getByLabel('旅程への追加位置').selectOption('via:0');
  await popup.getByRole('button',{name:'旅程に追加',exact:true}).click();
 }
 await expect(page.locator('.journey-stop-title strong').nth(1)).toContainText('中之島');
 await expect(page.locator('.journey-stop-title strong').nth(2)).toContainText('靱公園');
 await expect(page.locator('.journey-segment')).toHaveCount(3);
 await page.locator('#journey-point').selectOption('station:namba');
 await page.locator('#journey-position').selectOption('start');await page.locator('#journey-add').click();
 await expect(page.locator('#journey-start')).toHaveValue('station:namba');
 await page.locator('#journey-position').selectOption('end');await page.locator('#journey-add').click();
 await expect(page.locator('#journey-end')).toHaveValue('station:namba');
 await page.locator('#journey-point').selectOption('station:kyobashi');await page.locator('#journey-position').selectOption('via:1');await page.locator('#journey-add').click();
 await expect(page.locator('.journey-stop-title strong').nth(2)).toContainText('経由駅：京橋');
 await expect(page.locator('.journey-segment')).toHaveCount(4);
 await page.locator('#journey-point').selectOption('event:event-1');
 await expect(page.locator('#journey-position option[value=start]')).toHaveCount(0);await expect(page.locator('#journey-position option[value=end]')).toHaveCount(0);
});

test('event popup removes the chosen visit, reconnects neighbors and updates after sidebar edits',async({page})=>{
 await ready(page);
 const first='靱公園 青空ワークショップ',second='中之島 リバーサイドマーケット';
 const open=async name=>{await page.locator('.event-card').filter({hasText:name}).click();return page.locator('.leaflet-popup').filter({has:page.getByText(name,{exact:true})});};
 let popup=await open(first);await expect(popup.getByRole('button',{name:'旅程から削除',exact:true})).toBeDisabled();
 for(const name of [first,second,first]){popup=await open(name);await popup.getByRole('button',{name:'旅程に追加',exact:true}).click();}
 popup=await open(first);
 await expect(popup.getByLabel('旅程から削除する箇所')).toBeVisible();
 await popup.getByLabel('旅程から削除する箇所').selectOption('2');
 await popup.getByRole('button',{name:'旅程から削除',exact:true}).click();
 await expect(page.locator('.journey-stop-title strong').nth(1)).toContainText(first);
 await expect(page.locator('.journey-stop-title strong').nth(2)).toContainText(second);
 await expect(page.locator('.journey-segment')).toHaveCount(3);
 popup=await open(first);await expect(popup.getByLabel('旅程から削除する箇所')).toBeHidden();
 await popup.getByRole('button',{name:'旅程から削除',exact:true}).click();
 await expect(page.locator('.journey-stop-title strong').nth(1)).toContainText(second);await expect(page.locator('.journey-segment')).toHaveCount(2);
 popup=await open(first);await expect(popup.getByRole('button',{name:'旅程から削除',exact:true})).toBeDisabled();
 popup=await open(second);
 await page.getByRole('button',{name:'2番目を削除',exact:true}).click();
 await expect(popup.getByRole('button',{name:'旅程から削除',exact:true})).toBeDisabled();
 await expect(page.locator('.journey-stop')).toHaveCount(2);
 await expect(page.locator('#journey-start')).toHaveValue('station:osaka');await expect(page.locator('#journey-end')).toHaveValue('station:morinomiya');
 await expect(page.locator('.event-card')).toHaveCount(13);
});

test('insertion gaps use numbers and station sizes depend only on distinct routes',async({page})=>{
 await ready(page);await page.locator('#journey-editor summary').click();
 await expect(page.locator('#journey-position option[value=append]')).toHaveText('1と2の間');
 await page.locator('#journey-point').selectOption('event:event-1');await page.locator('#journey-add').click();
 await expect(page.locator('#journey-position option[value="via:0"]')).toHaveText('1と2の間');await expect(page.locator('#journey-position option[value=append]')).toHaveText('2と3の間');
 await page.locator('.event-card').filter({hasText:'靱公園 青空ワークショップ'}).click();
 await expect(page.getByLabel('旅程への追加位置').locator('option')).toHaveText(['1と2の間','2と3の間']);
 const sizes=await page.locator('.station-dot').evaluateAll(buttons=>buttons.map(b=>({id:b.dataset.stationId,size:Number(b.dataset.symbolSize),width:b.querySelector('.station-circle').getBoundingClientRect().width})));
 expect(new Set(sizes.map(s=>s.width))).toEqual(new Set([14,20]));
 for(const s of sizes)expect(s.width).toBe(s.size);
 expect(sizes.find(s=>s.id==='kyobashi').width).toBe(20);
 await page.locator('#clear').click();expect(await page.locator('[data-station-id=kyobashi] .station-circle').evaluate(e=>e.getBoundingClientRect().width)).toBe(20);
});

test('station screen sizes stay constant throughout zoom and sidebar hides explanatory text',async({page})=>{
 await ready(page);await page.locator('summary').filter({hasText:'駅名から選ぶ'}).click();await page.locator('[data-station=temma]').check();
 await expect(page.locator('aside .intro')).toHaveCount(0);await expect(page.locator('.journey-intro')).toHaveCount(0);
 await expect(page.locator('#journey-example')).toHaveCount(0);await expect(page.locator('#reach-method')).toBeHidden();
 await expect(page.locator('.demo-badge')).toHaveCount(0);
 await expect(page.locator('.leaflet-stations-pane canvas')).toHaveCount(0);
 expect(await page.locator('[data-station-id=kyobashi]').evaluate(e=>e.getBoundingClientRect().width)).toBe(32);
 for(const delta of [-180,-180,180,180]){
  const rect=await page.locator('[data-station-id=kyobashi]').boundingBox();await page.mouse.move(rect.x+14,rect.y+14);
  const [frames]=await Promise.all([
   page.evaluate(()=>new Promise(resolve=>{
    const frames=[],start=performance.now();function measure(){
     const width=id=>document.querySelector(`[data-station-id=${id}] .station-circle`).getBoundingClientRect().width;
     const bus=document.querySelector('.bus-stop-dot .station-circle');
     frames.push({small:width('temma'),large:width('kyobashi'),bus:bus?.getBoundingClientRect().width,animating:!!document.querySelector('.leaflet-zoom-anim')});
     if(performance.now()-start<700)requestAnimationFrame(measure);else resolve(frames);
    }requestAnimationFrame(measure);
   })),page.mouse.wheel(0,delta)
  ]);
  expect(frames.length).toBeGreaterThan(5);
  expect(frames.some(frame=>frame.animating)).toBe(true);
  for(const frame of frames){expect(frame.small).toBeCloseTo(14,2);expect(frame.large).toBeCloseTo(20,2);if(frame.bus)expect(Math.min(Math.abs(frame.bus-14),Math.abs(frame.bus-20))).toBeLessThan(.01);}
 }
 await page.locator('.data-details summary').click();await expect(page.locator('#reach-method')).toBeVisible();
});

test('station popup inserts at chosen gaps and changes endpoints only explicitly',async({page})=>{
 await ready(page);await page.locator('#clear').click();
 await page.locator('summary').filter({hasText:'駅名から選ぶ'}).click();
 await page.locator('[data-station=osaka]').check();await page.locator('[data-station=kyobashi]').check();
 await page.locator('#journey-editor summary').click();
 await page.locator('#journey-point').selectOption(E);await page.locator('#journey-add').click();
 await page.locator('[data-station-id=morinomiya]').click();
 await expect(page.locator('#journey-end')).toHaveValue(B);
 await expect(page.locator('.journey-segment')).toHaveCount(2);
 await page.getByLabel('旅程への追加位置').selectOption('append');await page.getByRole('button',{name:'旅程に追加',exact:true}).click();await expect(page.locator('.leaflet-popup')).toHaveCount(0);
 await expect(page.locator('.journey-stop-title strong')).toHaveText(['1. 出発：大阪・梅田','2. イベント：中之島 リバーサイドマーケット','3. 経由駅：森ノ宮','4. 到着：京橋']);
 await page.getByLabel('区間3の移動手段',{exact:true}).selectOption('transit');
 const rect=await page.locator('[data-station-id=temma]').boundingBox();await page.mouse.move(rect.x+16,rect.y+16);await page.mouse.wheel(0,-360);await page.waitForTimeout(650);
 await page.locator('[data-station-id=temma]').click();
 await page.getByLabel('旅程への追加位置').selectOption('via:0');await page.getByRole('button',{name:'旅程に追加',exact:true}).click();await expect(page.locator('.leaflet-popup')).toHaveCount(0);
 await expect(page.locator('#journey-end')).toHaveValue(B);
 await expect(page.locator('.journey-stop-title strong').nth(1)).toHaveText('2. 経由駅：天満');
 await expect(page.getByLabel('区間4の移動手段',{exact:true})).toHaveValue('transit');
 await page.locator('[data-station-id=temma]').click();await page.getByRole('button',{name:'旅程から削除',exact:true}).click();
 await expect(page.getByLabel('区間3の移動手段',{exact:true})).toHaveValue('transit');
 await page.locator('[data-station-id=temma]').click();await page.getByLabel('旅程への追加位置').selectOption('end');await page.getByRole('button',{name:'旅程に追加',exact:true}).click();await expect(page.locator('.leaflet-popup')).toHaveCount(0);
 await expect(page.locator('#journey-end')).toHaveValue('station:temma');
 await page.locator('[data-station-id=kyobashi]').click();await page.getByLabel('旅程への追加位置').selectOption('start');await page.getByRole('button',{name:'旅程に追加',exact:true}).click();await expect(page.locator('.leaflet-popup')).toHaveCount(0);
 await expect(page.locator('#journey-start')).toHaveValue(B);
 await expect(page.locator('.journey-segment')).toHaveCount(3);
});

test('network controls are always visible with independent layers and route switches',async({page})=>{
 await ready(page);
 await expect(page.locator('.network-options summary')).toHaveCount(0);
 await expect(page.locator('#selected button')).toHaveCount(2);
 await expect(page.locator('#rail-switches [data-route-id]')).toHaveCount(180);
 await expect(page.locator('#bus-switches [data-route-id]')).toHaveCount(219,{timeout:20000});
 expect(await page.locator('.leaflet-tile').evaluateAll(tiles=>tiles.some(t=>/\/14\//.test(t.src)))).toBe(true);
 for(const id of ['show-rail','show-bus','show-stations','show-bus-stops'])await expect(page.locator(`#${id}`)).toBeChecked();
 await page.locator('#rail-switches [data-route-id=loop]').uncheck();
 await expect(page.locator('.rail-loop')).toHaveCount(0);
 await expect(page.locator('#show-rail')).toHaveJSProperty('indeterminate',true);
 await expect(page.locator('[data-station-id=kyobashi]')).toHaveCount(1);
 await page.locator('#show-rail').check();await page.locator('#show-rail').uncheck();
 await expect(page.locator('.rail-route')).toHaveCount(0);
 await expect(page.locator('.station-dot:not(.bus-stop-dot)')).toHaveCount(0);
 await page.locator('#rail-switches [data-route-id=loop]').check();
 await expect(page.locator('.rail-route')).toHaveCount(1);
 await expect(page.locator('[data-station-id=kyobashi]')).toHaveCount(1);
 await page.locator('#show-stations').uncheck();
 await expect(page.locator('.station-dot:not(.bus-stop-dot)')).toHaveCount(0);
 await expect(page.locator('.rail-loop')).toHaveCount(1);
 await page.locator('#show-bus-stops').uncheck();await expect(page.locator('.bus-stop-dot')).toHaveCount(0);
 await page.locator('#show-bus').uncheck();await expect(page.locator('.leaflet-buses-pane canvas')).toHaveCount(0);
 await page.locator('#bus-switches [data-route-id]').first().check();
 await expect(page.locator('.leaflet-buses-pane canvas')).toHaveCount(1);
 await expect(page.locator('#show-bus')).toHaveJSProperty('indeterminate',true);
 await expect(page.locator('#bus-switches input[type=checkbox]:checked')).toHaveCount(1);
 await page.locator('#show-bus').check();
 await expect(page.locator('#bus-switches input[type=checkbox]:checked')).toHaveCount(219);
});
