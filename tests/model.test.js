import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classify, summarize, reachable, validateData } from '../src/model.js';
const read = name => JSON.parse(readFileSync(new URL(`../public/data/${name}.geojson`, import.meta.url)));
const meta = read('metadata'), events = read('events'), reaches = { transit: read('reach_transit'), walk: read('reach_transit_walk'), bike: read('reach_transit_bike') };
test('all exported scenarios have valid data and closed longitude-first polygons', () => {
  validateData(meta, events, reaches);
  for (const reach of Object.values(reaches)) {
    for (const origin of meta.origins) assert.ok(reach.features.some(f => f.properties.origin === origin.id));
    for (const f of reach.features) { const ring = f.geometry.coordinates[0]; assert.deepEqual(ring[0],ring.at(-1)); for (const [lon,lat] of ring) { assert.ok(lon > 130 && lon < 140); assert.ok(lat > 30 && lat < 40); } }
  }
});
test('threshold includes boundary and excludes missing times', () => {
  assert.equal(reachable(45,45),true); for (const v of [null,undefined,NaN,Infinity,-1,46]) assert.equal(reachable(v,45),false);
});
const event = route => ({properties:{journeys:{osaka:route}}});
test('selected mode and return condition determine marker category', () => {
  const e=event({transit:50,walk:48,bike:30,return_status:'ok'});
  assert.equal(classify(e,'osaka','transit',45).category,'unreachable');
  assert.equal(classify(e,'osaka','bike',45).category,'bike');
  e.properties.journeys.osaka.return_status='difficult';
  assert.equal(classify(e,'osaka','bike',45).category,'caution');
  e.properties.journeys.osaka.return_status='unknown';
  assert.equal(classify(e,'osaka','bike',45).label,'帰路は未確認');
});
test('bicycle gain is additional reachable events, not a difference of totals', () => {
  const es=[event({transit:20,bike:50}),event({transit:50,bike:20}),event({transit:null,bike:30})];
  assert.deepEqual(summarize(es,'osaka','bike',45),{count:2,gain:2});
});
test('every origin and budget has consistent expanded modes', () => {
  for (const o of meta.origins) for (const budget of [15,30,45,60]) {
    const counts=Object.keys(reaches).map(m=>summarize(events.features,o.id,m,budget).count);
    assert.ok(counts[0]<=counts[1] && counts[1]<=counts[2]);
  }
});
