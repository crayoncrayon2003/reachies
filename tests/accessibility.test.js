import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bestJourney,assess,validateStationData} from '../src/accessibility.js';
const costs=(out,back,walk_out=60,walk_back=60)=>({out,back,walk_out,walk_back});
test('different selected stations must satisfy directed outward and return limits',()=>{
  const access={a:costs(10,35),b:costs(40,15)};
  assert.deepEqual(bestJourney(access,['a','b'],20),{from:'a',to:'b',outbound:10,inbound:15,total:25});
  assert.equal(bestJourney(access,['a'],20),null);
  assert.equal(bestJourney(access,['b'],20),null);
  assert.equal(bestJourney(access,[],20),null);
});
test('outbound union is not the through area, and same-station return is excluded',()=>{
  const access={a:costs(10,10),b:costs(50,50)};
  assert.equal(bestJourney(access,['a','b'],20),null);
  assert.equal(bestJourney(access,['a'],20,{through:false}).from,'a');
  assert.equal(assess(access,['a','b'],20,true).category,'oneWay');
});
test('each leg has an inclusive budget, not a combined budget',()=>{
  assert.equal(bestJourney({a:costs(20,null),b:costs(null,20)},['a','b'],20).total,40);
  assert.equal(bestJourney({a:costs(20.1,null),b:costs(null,20)},['a','b'],20),null);
});
test('missing and non-finite costs cannot become zero-time routes',()=>{
  for(const value of [null,undefined,NaN,Infinity,-1])assert.equal(bestJourney({a:costs(value,value)},['a'],20,{through:false}),null);
});
test('best valid pair minimizes combined cycling time and retains direction',()=>{
  const access={a:costs(15,20),b:costs(5,19),c:costs(17,2)};
  assert.equal(bestJourney(access,['a','b','c'],20).from,'b');
  assert.equal(bestJourney(access,['a','b','c'],20).to,'c');
});
test('selected walking mode uses the same distinct-station requirement',()=>{
  const access={a:costs(5,5,5,5),b:costs(10,10,30,30)};
  assert.equal(assess(access,['a','b'],20,true).category,'bike');
  assert.equal(assess(access,['a','b'],20,false,'walk').category,'walk');
});
test('exported station data uses the current contract',()=>{
  const read=name=>JSON.parse(readFileSync(new URL(`../public/data/${name}`,import.meta.url)));
  const rail=read('railway.json'),surface=read('station_access.json'),events=read('station_events.geojson');
  validateStationData(rail,surface,events);
  assert.ok(rail.stations.length>=30);assert.ok(rail.lines.features.length>=5);
  assert.ok(events.features.some(e=>assess(e.properties.access,rail.default_stations,20,true).bike));
});

test('walking uses its directed costs and the selected budget without cycling fallback',()=>{
 const access={a:costs(2,2,15,null),b:costs(3,3,null,18)};
 assert.equal(assess(access,['a','b'],10,true,'bike').journey.total,5);
 assert.equal(assess(access,['a','b'],10,true,'walk').journey,null);
 assert.equal(assess(access,['a','b'],20,true,'walk').journey.total,33);
 assert.equal(assess(access,['a'],20,true,'walk').category,'oneWay');
 assert.equal(assess({a:costs(2,2,null,null)},['a'],30,false,'walk').category,'outside');
});
