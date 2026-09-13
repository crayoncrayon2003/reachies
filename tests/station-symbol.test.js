import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stationSymbolSize} from '../src/station-symbol.js';
test('single routes stay small and duplicate records do not count as extra routes',()=>{
 assert.equal(stationSymbolSize({members:[]}),14);
 assert.equal(stationSymbolSize({members:[{operator:'A',route:'X'},{operator:'A',route:'X'}]}),14);
 assert.equal(stationSymbolSize({members:[{operator:'A',route:'X'},{operator:'A',route:'Y'}]}),20);
 assert.equal(stationSymbolSize({members:[{operator:'A',routes:['X','X']}]}),14);
 assert.equal(stationSymbolSize({members:[{operator:'A',routes:['X','Y']}]}),20);
});
