import { createRouteControls } from './network-controls.js';
import { stationSymbolSize } from './station-symbol.js';
import { radialReachLayer } from './reach-layer.js';
import { radialRadius, radialMinutes } from './travel.js';
import { createJourneyEditor } from './journey-ui.js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import { COLORS, bestJourney, assess, validateStationData } from './accessibility.js';
import { EVENT_SYMBOLS, iconSvg, REACH_BANDS, reachColor } from './map-symbols.js';
const $ = id => document.getElementById(id);
const text = (tag, value, className) => { const e = document.createElement(tag); e.textContent = value; if (className) e.className = className; return e; };
const map = L.map('map', { zoomControl: false }).setView([34.689,135.515],14);
L.control.zoom({ position: 'bottomright' }).addTo(map);
for (const [name,zIndex] of [['reach',350],['buses',390],['rails',410],['trip',450],['events',490],['stations',470]]) map.createPane(name).style.zIndex = zIndex;
const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
tiles.on('tileerror', () => { $('status').textContent = '背景地図を取得できません。通信環境をご確認ください。'; });
const reachRenderer = L.canvas({ pane: 'reach', padding: .5 });
const reachLayer = L.layerGroup().addTo(map), stationsLayer = L.layerGroup().addTo(map), eventLayer = L.layerGroup().addTo(map);
const busLayer=L.layerGroup(), busRenderer=L.canvas({pane:'buses',padding:.5});
const plannerLayer=L.layerGroup().addTo(map);
let journeyEditor=null, journeyPoints=[];
let busData=null, busRequest=null;
const railLayers=new Map(),busLayers=new Map(),stationRoutes=new Map();
let enabledRails=new Set(),enabledBuses=new Set();
let stationButtons = [], lastClickedStation=null;
let railway, surface, events, busStops, stationIndex, selected = new Set(), activeEvent = null;
const state = () => ({ budget:Number($('budget').value), mode:$('travel-mode').value, through:false });
const station = id => stationIndex.get(id);
const stationName = id => station(id)?.name || id;
const eventDates=p=>p.end_date&&p.end_date!==p.date?`${p.date} ～ ${p.end_date}`:p.date;
const eventHours=p=>p.start&&p.end?`${p.start}–${p.end}`:'';
const pairText = p => p.to ? `${stationName(p.from)} → イベント → ${stationName(p.to)}` : `${stationName(p.from)} → イベント`;
const categoryLabel = {walk:'徒歩で到達可能',bike:'自転車で到達可能',oneWay:'片道のみ可',outside:'選択条件の範囲外'};
async function read(name) { const r = await fetch(`${import.meta.env.BASE_URL}data/${name}`); if (!r.ok) throw Error(`${name}: HTTP ${r.status}`); return r.json(); }
function toggleStation(id) { selected.has(id) ? selected.delete(id) : selected.add(id); render(); }
function showTrip(event, result) {
  $('route-detail').replaceChildren();
  if (!result.journey) { $('route-detail').hidden=true; return; }
  const p=result.journey;
  // Candidate details never replace or add lines to the ordered itinerary.
  $('route-detail').hidden=false;
  const close=text('button','×','close-route'); close.setAttribute('aria-label','経由表示を閉じる'); close.onclick=()=>{activeEvent=null;$('route-detail').hidden=true;};
  $('route-detail').append(close,text('small',`選択駅からの${state().mode==='walk'?'徒歩':'自転車'}プラン`),text('strong',event.properties.name),text('p',pairText(p)),text('p',`${p.outbound.toFixed(1)}分${p.to ? ` ＋ ${p.inbound.toFixed(1)}分 ＝ 計${Math.round(p.total*10)/10}分` : '（片道）'}`),text('small','旅程線は駅・イベントの接続イメージです。道路経路・貸出返却の可否は未確認です。'));
  const use=text('button','この組み合わせで旅程を作る');use.onclick=()=>{journeyEditor.setJourney([`station:${p.from}`,`event:${event.properties.id}`,...(p.to?[`station:${p.to}`]:[])]);$('journey-editor').open=true;};$('route-detail').append(use);

}
function render() {
  const {budget,through,mode}=state(),modeLabel=mode==='walk'?'徒歩':'自転車';
  $('budget-label').textContent=`各区間 ${budget}分`;
  $('scenario').textContent=`${selected.size}駅選択 · 片道の到達圏 · ${modeLabel} ${budget}分 / 区間`;
  $('area-label').textContent=`選択駅から${modeLabel}で行ける範囲`;
  $('reach-scale').setAttribute('aria-label',`${modeLabel}所要時間の色分け`);
  if(surface.sample)$('reach-method').textContent=`到達圏：${modeLabel}${budget}分で半径${(radialRadius(budget,mode)/1000).toFixed(2)}km。徒歩4.5km/h・自転車15km/hを使用。道路・河川・坂は反映しません。`;
  $('selection-help').textContent=!selected.size?'駅未選択':'';
  $('selected').replaceChildren();
  for (const id of selected) { const b=text('button',`${stationName(id)} ×`,'station-chip'); b.setAttribute('aria-label',`${stationName(id)}の選択を解除`); b.onclick=()=>toggleStation(id); $('selected').append(b); }
  for (const input of document.querySelectorAll('[data-station]')) input.checked=selected.has(input.dataset.station);
  $('fit-selection').disabled=selected.size===0;
  reachLayer.clearLayers(); stationsLayer.clearLayers(); eventLayer.clearLayers();
  $('route-detail').hidden=true;
  if(surface.sample && surface.model?.kind==='radial-demo'){
    const origins=[...selected].map(station);
    if(origins.length)radialReachLayer(origins,budget,through,mode).addTo(reachLayer);
  }else{
  // Render each cell once: union of eligible station pairs, without opacity stacking.
  const [dx,dy]=surface.cell_size;
  for (const c of surface.cells) {
    const journey=bestJourney(c.access,selected,budget,{through,mode});
    if (!journey) continue;
    const bounds = [[c.lat-dy/2,c.lon-dx/2],[c.lat+dy/2,c.lon+dx/2]];
    // Eligibility still requires the chosen trip mode. Color measures distance in travel time
    // from the nearest selected station, on a fixed scale across budget changes.
    if (journey) {
      const nearest = bestJourney(c.access,selected,budget,{through:false,mode});
      L.rectangle(bounds,{renderer:reachRenderer,stroke:false,fillColor:reachColor(nearest.outbound),fillOpacity:.68,interactive:false}).addTo(reachLayer);
    }

  }
  }
  renderStations();
  renderStationList();
  const assessed=events.features.map(event=>{
    let access=event.properties.access;
    if(surface.sample&&surface.model?.kind==='radial-demo'){
      const point={lon:event.geometry.coordinates[0],lat:event.geometry.coordinates[1]};
      access=Object.fromEntries([...selected].map(id=>{const origin=station(id),bike=radialMinutes(origin,point,'bike'),walk=radialMinutes(origin,point,'walk');return [id,{out:bike,back:bike,walk_out:walk,walk_back:walk}];}));
    }
    return {event,result:assess(access,selected,budget,through,mode)};
  });
  assessed.sort((a,b)=>(a.result.journey?.total??Infinity)-(b.result.journey?.total??Infinity));
  $('count').textContent=assessed.filter(e=>e.result.journey).length;
  $('list-count').textContent=`${assessed.length}件`; $('events').replaceChildren();
  for(const {event,result} of assessed) {
    const p=event.properties;
    const popup=document.createElement('div'); popup.append(text('strong',p.name),text('p',`${p.venue} · ${eventDates(p)} ${eventHours(p)}`),text('p',categoryLabel[result.category]));
    if(p.schedule)popup.append(text('p',p.schedule,'event-schedule'));
    if(typeof p.url==='string'&&p.url.trim()){
      try{
        const url=new URL(p.url.trim());
        if(['https:','http:'].includes(url.protocol)&&!url.username&&!url.password){
          const source=text('p','','event-source'),link=text('a',url.href);
          link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';
          source.append(text('span','イベント情報'),link);popup.append(source);
        }
      }catch{ /* Invalid URLs are omitted from the popup. */ }
    }
    if(result.journey)popup.append(text('p',pairText(result.journey)));
    const insertion=journeyEditor.createInsertionControl(`event:${p.id}`,()=>{map.closePopup();activeEvent=null;$('route-detail').hidden=true;});popup.append(insertion.element);
    const pin=text('span','','event-pin'); pin.dataset.category=p.category;
    pin.style.setProperty('--event-color',COLORS[result.category]); pin.innerHTML=iconSvg(p.category);
    const marker=L.marker([...event.geometry.coordinates].reverse(),{pane:'events',icon:L.divIcon({html:pin,className:'event-marker',iconSize:[30,39],iconAnchor:[15,39],popupAnchor:[0,-38]}),title:`${p.category}：${p.name}（${categoryLabel[result.category]}）`,alt:`${p.category}：${p.name}`}).bindPopup(popup).bindTooltip(text('span',`${p.category}：${p.name}`),{direction:'top',offset:[0,-36]}).addTo(eventLayer);
    marker.on('popupopen',()=>insertion.refresh());
    const open=()=>{activeEvent=p.id;showTrip(event,result);}; marker.on('click',open);
    const card=text('button','','event-card');card.type='button';card.style.setProperty('--category',COLORS[result.category]);
    const category=text('span',`${p.category} · ${eventDates(p)} ${eventHours(p)}`,'event-category');
    const categoryIcon=text('span','','category-icon');categoryIcon.innerHTML=iconSvg(p.category);category.prepend(categoryIcon);
    card.append(category,text('strong',p.name),text('span',categoryLabel[result.category],'event-result'));
    if(result.journey) card.append(text('span',pairText(result.journey),'event-detail'),text('span',`${result.journey.outbound.toFixed(1)}分${result.journey.to?` + ${result.journey.inbound.toFixed(1)}分`:''}`,'event-time'));
    card.onclick=()=>{open();if(!result.journey&&!journeyPoints.length)map.setView([...event.geometry.coordinates].reverse(),13);marker.openPopup();if(innerWidth<800)$('map').scrollIntoView({behavior:'smooth'});};$('events').append(card);
    if(activeEvent===p.id)showTrip(event,result);
  }
  journeyEditor?.refresh();
}
function renderStations(){
  if(!railway)return;
  stationButtons = []; stationsLayer.clearLayers();
  const bounds=map.getBounds().pad(.15),zoom=map.getZoom(),busCells=new Set();
  for (const s of railway.stations) {
    const chosen=selected.has(s.id),bus=s.type==='bus_stop';
    if(bus?!$('show-bus-stops').checked:!$('show-stations').checked)continue;
    if(!bus&&!(stationRoutes.get(s.id)||[]).some(id=>enabledRails.has(id)))continue;
    if(!chosen&&!bounds.contains([s.lat,s.lon]))continue;
    // Use DOM markers at every zoom: Canvas scales the circles with its entire surface.
    // Thin only unselected bus stops in the overview; search and selected stops remain available.
    if(bus&&!chosen&&s.id!==lastClickedStation&&zoom<15){
      const p=map.project([s.lat,s.lon],zoom),cell=`${Math.floor(p.x/32)}:${Math.floor(p.y/32)}`;
      if(busCells.has(cell))continue;
      busCells.add(cell);
    }
    const button=text('button','','station-dot'); button.setAttribute('aria-label',`${s.name}駅を${chosen?'解除':'選択'}`); button.setAttribute('aria-pressed',String(chosen)); button.title=s.name;
    if(bus)button.classList.add('bus-stop-dot');
    button.style.setProperty('--station-size',`${s.symbolSize}px`);button.dataset.symbolSize=String(s.symbolSize);
    if(chosen)button.classList.add('is-selected');
    button.append(text('span',chosen?'✓':'','station-circle'),text('span',s.name,'station-label'));
    stationButtons.push({station:s,button,chosen});
    button.dataset.stationId=s.id;
    button.onclick=e=>{e.stopPropagation();chooseStation(s);};
    L.marker([s.lat,s.lon],{pane:'stations',icon:L.divIcon({html:button,className:'station-marker',iconSize:[32,32],iconAnchor:[16,16]}),keyboard:false,zIndexOffset:s.id===lastClickedStation?2000:chosen?1000:bus?-500:0}).addTo(stationsLayer);
  }
  updateStationLabels();
}
function renderStationList(){
  const query=$('station-search').value.trim();
  const candidates=railway.stations.filter(s=>!query||[s.name,s.id,...(s.names||[]),...(s.operators||[])].some(v=>v.includes(query)));
  candidates.sort((a,b)=>Number(selected.has(b.id))-Number(selected.has(a.id))||Number(!b.id.startsWith('rail-')&&!b.id.startsWith('bus-'))-Number(!a.id.startsWith('rail-')&&!a.id.startsWith('bus-')));
  $('station-list').replaceChildren();
  for(const s of candidates.slice(0,150)){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.dataset.station=s.id;input.checked=selected.has(s.id);input.onchange=()=>toggleStation(s.id);label.title=(s.operators||[]).join(' / ');label.append(input,document.createTextNode(`${s.name}${s.type==='bus_stop'?'（バス）':''}`));$('station-list').append(label);}
  $('station-search-count').textContent=`${candidates.length}件中 ${Math.min(150,candidates.length)}件を表示`;
}
function chooseStation(s) {
  lastClickedStation=s.id;
  map.closePopup();
  toggleStation(s.id);
  const popup=text('div','');popup.append(text('strong',s.name));
  const insertion=journeyEditor.createInsertionControl(`station:${s.id}`,()=>map.closePopup());
  popup.append(insertion.element);
  L.popup({autoPan:false}).setLatLng([s.lat,s.lon]).setContent(popup).openOn(map);

}
function updateStationLabels() {
  // Only labels are decluttered. Leaflet owns marker positions throughout wheel zoom.
  for(const entry of stationButtons)entry.position=map.latLngToContainerPoint([entry.station.lat,entry.station.lon]);
  const occupied=[];
  for (const {station:s,button,chosen,position:p} of [...stationButtons].sort((a,b)=>Number(b.chosen)-Number(a.chosen))) {
    const w=s.name.length*11+12;
    const box={left:p.x-w/2,right:p.x+w/2,top:p.y+14,bottom:p.y+33};
    const collision=occupied.some(b=>box.left<b.right+4&&box.right>b.left-4&&box.top<b.bottom+3&&box.bottom>b.top-3);
    button.classList.toggle('label-hidden',!chosen&&collision);
    if(chosen||!collision)occupied.push(box);
  }
}
map.on('moveend',renderStations);
function setBusVisible(visible){
  // Retain the Canvas renderer so pending redraws remain valid across visibility changes.
  map.getPane('buses').hidden=!visible;
  if(visible)busLayer.addTo(map);else map.removeLayer(busLayer);
}
async function toggleBuses() {
  renderStations();
  if (!$('show-bus').checked) {setBusVisible(false);return;}
  $('bus-status').textContent='バス経路を読み込み中…';
  try {
    if(!busData){
      busRequest ||= read('bus_routes.geojson');
      busData=await busRequest;
      if(busData.type!=='FeatureCollection'||!Array.isArray(busData.features))throw Error('バスデータの形式が不正です');
      for(const [i,feature] of busData.features.entries()){
        const id=String(i),layer=L.geoJSON(feature,{pane:'buses',renderer:busRenderer,style:f=>({color:f.properties.color,weight:2.5,opacity:.8}),onEachFeature:(f,l)=>l.bindTooltip(text('span',`${f.properties.operator}（2022年経路資料）`))});
        busLayers.set(id,layer);layer.addTo(busLayer);
      }
      const showBusAfterLoad=$('show-bus').checked;
      enabledBuses=createRouteControls($('bus-switches'),$('show-bus'),busData.features.map((f,i)=>({id:String(i),name:f.properties.operator})),enabled=>{
        for(const [id,layer] of busLayers)if(enabled.has(id))busLayer.addLayer(layer);else busLayer.removeLayer(layer);
        setBusVisible(enabled.size>0);
      });
      if(!showBusAfterLoad){$('show-bus').checked=false;$('show-bus').dispatchEvent(new Event('change'));}
    }
    if($('show-bus').checked)setBusVisible(true);
    $('bus-status').textContent=`${busData.features.length}事業者・自治体の経路。高速バス未収録。運行状況は未確認。`;
  }catch(error){busRequest=null;busData=null;$('show-bus').checked=false;$('bus-status').textContent=`バス経路を読み込めませんでした：${error.message}`;}
}
async function init() {
  [railway,surface,events,busStops]=await Promise.all(['railway.json','station_access.json','station_events.geojson','bus_stops.json'].map(read));
  railway.stations.push(...busStops.stops);for(const s of railway.stations)s.symbolSize=stationSymbolSize(s);stationIndex=new Map(railway.stations.map(s=>[s.id,s]));
  validateStationData(railway,surface,events); selected=new Set(railway.default_stations.slice(0,2));
  // Draw casings first, so subsequent white strokes never erase earlier route colors.
  for (const line of railway.lines.features){
    const id=line.properties.id,group=L.layerGroup().addTo(map);railLayers.set(id,group);enabledRails.add(id);
    for(const stationId of line.properties.stations||[]){if(!stationRoutes.has(stationId))stationRoutes.set(stationId,[]);stationRoutes.get(stationId).push(id);}
    L.geoJSON(line,{pane:'rails',smoothFactor:0,style:{color:'#fff',weight:9,opacity:.9},interactive:false}).addTo(group);
  }
  for (const line of railway.lines.features) {
    L.geoJSON(line,{pane:'rails',smoothFactor:0,className:`rail-route rail-${line.properties.id}`,style:{color:line.properties.color,weight:line.properties.transport_type==='shinkansen'?3:5,dashArray:line.properties.transport_type==='shinkansen'?'9 3':null,opacity:.95}}).bindTooltip(text('span',line.properties.name)).addTo(railLayers.get(line.properties.id));
    const operator=line.properties.operator || 'JR';
    let group=[...$('line-legend').children].find(e=>e.dataset.operator===operator);
    if(!group){ group=document.createElement('details');group.dataset.operator=operator;group.append(text('summary',operator));$('line-legend').append(group); }
    const row=text('div',line.properties.name);row.style.borderLeft=`5px solid ${line.properties.color}`;group.append(row);
  }
  for (const [category] of Object.entries(EVENT_SYMBOLS)) {
    const item=text('span','','symbol-legend-item');item.innerHTML=iconSvg(category);item.append(document.createTextNode(category));$('event-symbols').append(item);
  }
  for (const band of REACH_BANDS) {
    const swatch=text('span',`${band.max}分`);swatch.style.background=band.color;swatch.style.color=band.max<=15?'white':'#64121a';$('reach-scale').append(swatch);
  }
  $('station-search').oninput=renderStationList;
  for(const id of ['clear','budget','travel-mode','fit-selection'])$(id).disabled=false;
  $('budget').addEventListener('input',render);$('travel-mode').addEventListener('change',render);
  $('clear').onclick=()=>{selected.clear();activeEvent=null;render();};
  $('fit-selection').onclick=()=>map.fitBounds(L.latLngBounds([...selected].map(id=>{const s=station(id);return[s.lat,s.lon];})).pad(.65),{maxZoom:13,padding:[65,65]});
  $('reset').onclick=()=>{const [west,south,east,north]=railway.provenance.bbox;map.fitBounds([[south,west],[north,east]],{padding:[35,35]});};
  enabledRails=createRouteControls($('rail-switches'),$('show-rail'),railway.lines.features.map(f=>({id:f.properties.id,name:f.properties.name,operator:f.properties.operator})),enabled=>{
    for(const [id,layer] of railLayers)if(enabled.has(id))layer.addTo(map);else map.removeLayer(layer);
    renderStations();
  });
  $('show-stations').onchange=renderStations;$('show-bus-stops').onchange=renderStations;
  $('show-bus').onchange=toggleBuses;
  $('coverage-summary').textContent=`鉄道 ${railway.lines.features.length}路線グループ · ${railway.stations.length-busStops.stops.length}駅・${busStops.stops.length}バス停`;
  const realRails = railway.geometry_source === 'mlit-n02-2025';
  const railDescription = realRails ? '鉄道：国土数値情報2025年度' : '鉄道：概略図';
  const eventDescription = events.features.some(e => e.properties.fictional) ? 'イベントは架空' : `イベント：${events.source?.name||'出典はREADME参照'}${events.source?.fetched_at?'（取得：'+events.source.fetched_at.slice(0,10)+'）':''}`;
  if(!surface.sample)$('reach-method').textContent='道路ネットワークの事前計算値を格子で表示しています。選択した移動手段と時間で到達可能な格子を赤色で表示します。';
  const reachDescription = surface.sample ? '到達圏・移動時間は直線距離に基づく推定' : '到達圏は道路ネットワークの事前計算';
  document.querySelector('.sample').textContent = `${railDescription}。${reachDescription}。${eventDescription}。`;
  document.querySelector('footer').firstChild.textContent = `背景地図 © `;
  if (realRails) {
    const credit=text('a','国土数値情報（鉄道データ）を加工');credit.href=railway.provenance.url;
    document.querySelector('footer').append(document.createTextNode(' · '),credit);
    const stopCredit=text('a','バス停留所：国土数値情報2022');stopCredit.href=busStops.provenance.url;document.querySelector('footer').append(document.createTextNode(' · '),stopCredit);
    const busCredit=text('a','バス経路：国土数値情報2022');busCredit.href='https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N07-2022.html';document.querySelector('footer').append(document.createTextNode(' · '),busCredit);
    map.attributionControl.addAttribution('<a href="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N02-2025.html">国土数値情報 鉄道2025</a>');
  }
  journeyEditor=createJourneyEditor({stations:railway.stations,events:events.features,sample:surface.sample&&surface.model?.kind==='radial-demo',getBudget:()=>state().budget,getMode:()=>state().mode,getSelected:()=>selected,onDraw:(stops,result)=>{
    plannerLayer.clearLayers();journeyPoints=stops.map(s=>[s.lat,s.lon]);
    // Draw every adjacent pair, including unfinished or uncomputed legs.
    for(const [i,leg] of result.legs.entries()){
      const coords=[[leg.from.lat,leg.from.lon],[leg.to.lat,leg.to.lon]];
      const color=leg.mode==='walk'?'#405fc5':['transit','rail'].includes(leg.mode)?'#73519c':'#146b61';
      L.polyline(coords,{pane:'trip',color:'white',weight:7,opacity:.95,interactive:false}).addTo(plannerLayer);
      const line=L.polyline(coords,{pane:'trip',className:'journey-segment',color,weight:4,interactive:false}).addTo(plannerLayer);
      line.getElement().dataset.leg=String(i+1);
      // Direction labels distinguish outbound and return legs sharing a line.
      const a=map.project(coords[0],0),b=map.project(coords[1],0);
      const position=map.unproject(a.add(b.subtract(a).multiplyBy(.35)),0);
      L.marker(position,{pane:'events',interactive:false,icon:L.divIcon({className:'journey-direction',html:`${i+1} → ${i+2}`,iconSize:[42,18],iconAnchor:[21,9]})}).addTo(plannerLayer);
    }
    const visits=new Map();
    stops.forEach((stop,i)=>{const key=`${stop.lat},${stop.lon}`;if(!visits.has(key))visits.set(key,{stop,indices:[]});visits.get(key).indices.push(i+1);});
    for(const {stop,indices} of visits.values())L.marker([stop.lat,stop.lon],{pane:'events',interactive:false,icon:L.divIcon({className:'journey-number',html:indices.join('・'),iconSize:[Math.max(20,indices.join('・').length*12),20],iconAnchor:[-14,30]})}).addTo(plannerLayer);
    $('journey-fit').disabled=!stops.length;
  }});
  $('journey-fit').onclick=()=>map.fitBounds(L.latLngBounds(journeyPoints).pad(.2),{maxZoom:14});
  render();
  toggleBuses();
}
init().catch(error=>{$('status').textContent=`データを読み込めませんでした。再読み込みしてください。(${error.message})`;$('status').setAttribute('role','alert');$('scenario').textContent='読み込みエラー';});
