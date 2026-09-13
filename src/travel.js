export const EARTH_METERS=6371008.8;
export const SPEEDS={walk:4.5,bike:15};
export function distanceMeters(a,b){
  const rad=Math.PI/180, lat1=a.lat*rad,lat2=b.lat*rad;
  const h=Math.sin((lat2-lat1)/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin((b.lon-a.lon)*rad/2)**2;
  return 2*EARTH_METERS*Math.asin(Math.sqrt(Math.min(1,h)));
}
export function radialMinutes(a,b,mode){return distanceMeters(a,b)/1000/SPEEDS[mode]*60;}
export function radialRadius(minutes,mode){return SPEEDS[mode]*1000*minutes/60;}
export function radialReach(point,stations,budget,through=false,mode='bike'){
  const times=stations.map(s=>radialMinutes(s,point,mode)).filter(t=>t<=budget+1e-9).sort((a,b)=>a-b);
  return times.length>=(through?2:1)?times[0]:null;
}
export const isTransitStop=node=>['station','stop','bus_stop'].includes(node?.type);
// The editor does not infer railway travel times from geographic straight lines.
export function evaluateItinerary(stops,modes,{sample,budget}){
  const legs=[];
  for(let i=1;i<stops.length;i++){
    const from=stops[i-1],to=stops[i],mode=modes[i-1]||'bike';
    const leg={from,to,mode,minutes:null,status:'unknown'};
    if(!['walk','bike','rail','transit'].includes(mode))leg.status='invalid';
    else if((mode==='rail'||mode==='transit')){
      if(!isTransitStop(from)||!isTransitStop(to))leg.status='invalid';
    }else{
      if(sample)leg.minutes=radialMinutes(from,to,mode);
      else if(isTransitStop(from)&&to.type==='event')leg.minutes=to.access?.[from.sourceId]?.[mode==='walk'?'walk_out':'out']??null;
      else if(from.type==='event'&&isTransitStop(to))leg.minutes=from.access?.[to.sourceId]?.[mode==='walk'?'walk_back':'back']??null;
      if(Number.isFinite(leg.minutes)&&leg.minutes>=0)leg.status=leg.minutes<=budget+1e-9?'ok':'over';
      else leg.minutes=null;
    }
    legs.push(leg);
  }
  const knownMinutes=legs.reduce((sum,l)=>sum+(l.minutes??0),0);
  const endpointsValid=stops.length>=2&&isTransitStop(stops[0])&&isTransitStop(stops.at(-1));
  const status=legs.length===0?'empty':!endpointsValid?'draft':legs.some(l=>l.status==='invalid')?'invalid':legs.some(l=>l.status==='over')?'over':legs.some(l=>l.status==='unknown')?'unknown':'ok';
  return {legs,endpointsValid,knownMinutes,totalMinutes:legs.length&&legs.every(l=>l.minutes!==null)?knownMinutes:null,status};
}
