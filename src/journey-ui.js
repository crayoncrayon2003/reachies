import { searchablePicker } from './stop-picker.js';
import { evaluateItinerary, isTransitStop } from './travel.js';
const el=(tag,value,cls)=>{const e=document.createElement(tag);e.textContent=value;if(cls)e.className=cls;return e;};
const MODE_LABELS={bike:'自転車',walk:'徒歩',transit:'公共交通（鉄道・バス等）'};
const STATUS={empty:'イベントや経由駅を追加してください',ok:'各区間が時間上限内（推定）',over:'時間上限を超える区間があります',unknown:'未計算の区間があります。旅程全体の可否は未判定です',invalid:'公共交通は駅・停留所どうしの区間に指定してください',draft:'出発駅・到着駅を指定してください'};
export function createJourneyEditor({stations,events,sample,getBudget,getMode,getSelected,onDraw}){
  const nodes=[...stations.map(s=>({...s,key:`station:${s.id}`,sourceId:s.id,type:s.type||'station'})),...events.map(e=>({key:`event:${e.properties.id}`,sourceId:e.properties.id,type:'event',name:e.properties.name,lat:e.geometry.coordinates[1],lon:e.geometry.coordinates[0],access:e.properties.access}))];
  const byKey=new Map(nodes.map(n=>[n.key,n]));
  let via=[],modes=[],active=false;
  // Endpoints are structural fields, never optional entries among events.
  const endpoints={start:{key:null,manual:false},end:{key:null,manual:false}};
  const picker=document.getElementById('journey-point'),list=document.getElementById('journey-stops'),summary=document.getElementById('journey-summary');
  const pointPicker=searchablePicker(picker,nodes,'経由地点');
  const endpointPickers={};
  for(const role of ['start','end']){
    const select=document.getElementById(`journey-${role}`);
    endpointPickers[role]=searchablePicker(select,nodes.filter(isTransitStop),role==='start'?'出発駅・停留所':'到着駅・停留所');
    select.onchange=()=>{endpoints[role]={key:select.value||null,manual:!!select.value};active=true;render();};
  }
  function syncEndpoints(){
    const selected=[...getSelected()].map(id=>`station:${id}`).filter(key=>isTransitStop(byKey.get(key)));
    for(const role of ['start','end']){
      if(!active&&!endpoints[role].manual)endpoints[role].key=(role==='start'?selected[0]:selected.at(-1))||null;
      endpointPickers[role].setValue(endpoints[role].key);
    }
  }
  function positions(key){
    const node=byKey.get(key);
    const options=[];
    if(isTransitStop(node))options.push(['start','出発駅として設定'],['end','到着駅として設定']);
    for(let i=0;i<=via.length;i++){
      const before=i+1;
      options.push([i===via.length?'append':`via:${i}`,`${before}と${before+1}の間`]);
    }
    return options;
  }
  function fillPositions(select,key){
    const value=select.value;select.replaceChildren();
    for(const [id,label] of positions(key)){const option=el('option',label);option.value=id;select.append(option);}
    select.value=[...select.options].some(o=>o.value===value)?value:'append';
  }
  function render(){
    syncEndpoints();
    fillPositions(document.getElementById('journey-position'),picker.value);
    const start=byKey.get(endpoints.start.key),end=byKey.get(endpoints.end.key);
    const complete=!!start&&!!end;
    const stops=active?[...(start?[start]:[]),...via,...(end?[end]:[])]:[];
    modes=stops.slice(1).map((_,i)=>modes[i]||getMode());
    const result=evaluateItinerary(stops,modes,{sample,budget:getBudget()});list.replaceChildren();
    stops.forEach((stop,index)=>{
      const row=el('li','','journey-stop');
      if(index){
        const leg=result.legs[index-1],select=document.createElement('select');select.setAttribute('aria-label',`区間${index}の移動手段`);
        for(const [mode,label] of Object.entries(MODE_LABELS)){const option=el('option',label);option.value=mode;select.append(option);}select.value=modes[index-1];
        select.onchange=()=>{modes[index-1]=select.value;render();};
        const cost=leg.minutes===null?'時間未計算':`${leg.minutes.toFixed(1)}分${leg.status==='over'?'（上限超過）':''}`;
        const segment=el('div','','journey-leg');segment.dataset.status=leg.status;segment.append(select,el('span',cost));row.append(segment);
      }
      const isStart=!!start&&index===0,isEnd=!!end&&index===stops.length-1;
      const title=el('div','','journey-stop-title');title.append(el('strong',`${index+1}. ${isStart?'出発':isEnd?'到着':isTransitStop(stop)?'経由駅':'イベント'}：${stop.name}`));
      if(!isStart&&!isEnd){
        const v=index-(start?1:0);
        for(const [label,offset] of [['↑',-1],['↓',1]]){const b=el('button',label);b.type='button';b.setAttribute('aria-label',`${index+1}番目を${offset<0?'上':'下'}へ`);b.disabled=v+offset<0||v+offset>=via.length;b.onclick=()=>{[via[v],via[v+offset]]=[via[v+offset],via[v]];modes=[];render();};title.append(b);}
        const remove=el('button','×');remove.type='button';remove.setAttribute('aria-label',`${index+1}番目を削除`);remove.onclick=()=>removeVia(v);title.append(remove);
      }
      row.append(title);list.append(row);
    });
    const status=active&&!complete?'draft':result.status;
    summary.dataset.status=status;
    summary.textContent=`${!sample&&status==='ok'?'計算済み区間は時間上限内':STATUS[status]}${complete&&result.legs.length?` ／ ${result.totalMinutes===null?'計算済み区間の小計':'移動合計'} ${result.knownMinutes.toFixed(1)}分`:''}`;
    // Never present an event-only draft as a connected journey.
    onDraw(complete?stops:[],complete?result:{...result,legs:[]});
    document.querySelectorAll('.journey-insertion').forEach(element=>element.dispatchEvent(new Event('journeychange')));
  }
  function insert(key,position='append'){
    const node=byKey.get(key);if(!node)return;
    if(position==='start'||position==='end'){
      if(!isTransitStop(node))return;
      endpoints[position]={key,manual:true};
    }else{
      const index=position==='append'?via.length:Number(position.slice(4));
      if(!Number.isInteger(index)||index<0||index>via.length)return;
      via.splice(index,0,node);
      modes.splice(index,1,getMode(),getMode());
    }
    active=true;render();
  }
  function removeVia(index){
    if(!Number.isInteger(index)||index<0||index>=via.length)return;
    via.splice(index,1);modes.splice(index,2,getMode());render();
  }
  function createInsertionControl(key,onAdded){
    const element=el('div','','journey-insertion'),label=el('label','追加位置'),select=document.createElement('select'),button=el('button','旅程に追加');
    select.setAttribute('aria-label','旅程への追加位置');label.append(select);element.append(label,button);
    const removalLabel=el('label','削除する箇所'),removalSelect=document.createElement('select'),remove=el('button','旅程から削除');
    removalSelect.setAttribute('aria-label','旅程から削除する箇所');removalLabel.append(removalSelect);element.append(removalLabel,remove);
    const refresh=()=>{
      fillPositions(select,key);
      const previous=removalSelect.value;removalSelect.replaceChildren();
      via.forEach((node,index)=>{if(node.key!==key)return;const option=el('option',`${index+(endpoints.start.key?2:1)}番目：${node.name}`);option.value=String(index);removalSelect.append(option);});
      if([...removalSelect.options].some(option=>option.value===previous))removalSelect.value=previous;
      remove.disabled=removalSelect.options.length===0;
      remove.title=remove.disabled?'この地点は経由地点に追加されていません':'';
      removalLabel.hidden=removalSelect.options.length<2;
    };
    element.addEventListener('journeychange',refresh);refresh();
    remove.onclick=()=>{const index=Number(removalSelect.value);if(remove.disabled||via[index]?.key!==key)return;removeVia(index);onAdded?.();};
    button.onclick=()=>{insert(key,select.value);document.getElementById('journey-editor').open=true;onAdded?.();};
    return {element,refresh};
  }
  function setJourney(keys){
    const points=keys.map(key=>byKey.get(key)).filter(Boolean);
    if(isTransitStop(points[0]))endpoints.start={key:points.shift().key,manual:true};
    if(isTransitStop(points.at(-1)))endpoints.end={key:points.pop().key,manual:true};
    else endpoints.end={...endpoints.start};
    via=points;modes=[];active=true;render();
  }
  picker.onchange=()=>fillPositions(document.getElementById('journey-position'),picker.value);
  document.getElementById('journey-add').onclick=()=>insert(picker.value,document.getElementById('journey-position').value);
  document.getElementById('journey-clear').onclick=()=>{via=[];modes=[];active=false;endpoints.start={key:null,manual:false};endpoints.end={key:null,manual:false};render();};
  render();
  return {refresh:render,createInsertionControl,addPoint:key=>{insert(key);document.getElementById('journey-editor').open=true;},setJourney};
}
