import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {radialMinutes,radialRadius,radialReach,evaluateItinerary,EARTH_METERS} from '../src/travel.js';
const a={sourceId:'a',type:'station',lat:34.68,lon:135.53};
const north=meters=>({...a,lat:a.lat+meters/EARTH_METERS*180/Math.PI});
test('walking circle includes all directions to 750m, and single-station outbound is consistent',()=>{
  assert.equal(radialRadius(10,'walk'),750);
  for(const sign of [-1,1])assert.ok(Math.abs(radialMinutes(a,north(sign*750),'walk')-10)<1e-8);
  assert.ok(radialReach(north(1000),[a],5)!==null);
  assert.equal(radialReach(north(1300),[a],5),null);
  assert.equal(radialReach(a,[a],20,true),null);
  for(let meters=-6000;meters<=6000;meters+=100){
    const p=north(meters),one=radialReach(p,[a],20),two=radialReach(p,[a,north(1000)],20);
    if(one!==null)assert.ok(two!==null && two<=one);
  }
});
test('generated event costs match the displayed continuous field without rounding before eligibility',()=>{
 const read=name=>JSON.parse(readFileSync(new URL(`../public/data/${name}`,import.meta.url)));
 const rail=read('railway.json'),events=read('station_events.geojson');
 for(const e of events.features)for(const s of rail.stations){
   const cost=e.properties.access[s.id];if(!cost)continue;
   const point={lon:e.geometry.coordinates[0],lat:e.geometry.coordinates[1]};
   assert.ok(Math.abs(cost.out-radialMinutes(s,point,'bike'))<1e-8);
   assert.ok(Math.abs(cost.walk_out-radialMinutes(s,point,'walk'))<1e-8);
 }
});
test('multiple events, stations and same-station return evaluate every ordered leg',()=>{
 const e={...north(500),type:'event'},f={...north(1000),type:'event'};
 const trip=evaluateItinerary([a,e,f,a],['walk','bike','bike'],{sample:true,budget:10});
 assert.equal(trip.status,'ok');assert.equal(trip.legs.length,3);assert.ok(trip.totalMinutes>0);
 assert.equal(evaluateItinerary([a,f,a],['walk','bike'],{sample:true,budget:10}).status,'over');
 const train=evaluateItinerary([a,e,f,a,north(10000)],['bike','bike','bike','rail'],{sample:true,budget:20});
 assert.equal(train.status,'unknown');assert.equal(train.totalMinutes,null);
 assert.equal(evaluateItinerary([a,e,a],['rail','bike'],{sample:true,budget:20}).status,'invalid');
});
test('real-data journeys retain directed costs and never invent unknown event-to-event routes',()=>{
 const e={...north(500),type:'event',access:{a:{out:3,back:7,walk_out:9,walk_back:null}}};
 const trip=evaluateItinerary([a,e,a],['bike','bike'],{sample:false,budget:5});
 assert.equal(trip.status,'over');assert.equal(trip.totalMinutes,10);
 assert.equal(evaluateItinerary([e,a],['walk'],{sample:false,budget:20}).legs[0].status,'unknown');
 assert.equal(evaluateItinerary([e,{...e,lat:35}],['bike'],{sample:false,budget:20}).legs[0].status,'unknown');
});

test('all five requested patterns have every adjacent leg and public-transport endpoints',()=>{
 const b={...north(600),sourceId:'b'},c={...north(1200),sourceId:'c',type:'bus_stop'};
 const e={...north(200),type:'event'},f={...north(400),type:'event'};
 for(const stops of [[a,e,a],[a,e,b],[a,e,f,a],[a,e,f,b],[a,e,b,f,c]]){
  const result=evaluateItinerary(stops,[],{sample:true,budget:20});
  assert.equal(result.endpointsValid,true);assert.equal(result.status,'ok');assert.equal(result.legs.length,stops.length-1);
  result.legs.forEach((leg,i)=>{assert.equal(leg.from,stops[i]);assert.equal(leg.to,stops[i+1]);});
 }
 for(const stops of [[a,e],[e,a],[e,f]]){
  const result=evaluateItinerary(stops,[],{sample:true,budget:20});
  assert.equal(result.status,'draft');assert.equal(result.endpointsValid,false);assert.equal(result.legs.length,stops.length-1);
 }
 assert.equal(evaluateItinerary([a,c],['transit'],{sample:true,budget:20}).status,'unknown');
});

test('same minutes produce different walking and cycling radii and consistent walking journey limits',()=>{
 assert.equal(radialRadius(20,'walk'),1500);assert.equal(radialRadius(20,'bike'),5000);
 assert.notEqual(radialReach(north(2000),[a],20,false,'bike'),null);
 assert.equal(radialReach(north(2000),[a],20,false,'walk'),null);
 const event={...north(1200),type:'event'};
 assert.equal(evaluateItinerary([a,event,a],['walk','walk'],{sample:true,budget:20}).status,'ok');
 assert.equal(evaluateItinerary([a,event,a],['walk','walk'],{sample:true,budget:15}).status,'over');
});
