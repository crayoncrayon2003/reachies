export const COLORS = { walk: '#287cc1', bike: '#148d71', oneWay: '#d49b24', outside: '#9da6ac' };
const valid = (value, limit) => Number.isFinite(value) && value >= 0 && value <= limit;
// Directed costs: A -> event and event -> B are never assumed equal.
export function bestJourney(access, selected, budget, { through = true, mode = 'bike' } = {}) {
  const outKey = mode === 'walk' ? 'walk_out' : 'out';
  const backKey = mode === 'walk' ? 'walk_back' : 'back';
  let best = null;
  for (const from of selected) {
    const outbound = access[from]?.[outKey];
    if (!valid(outbound, budget)) continue;
    if (!through) {
      if (!best || outbound < best.total) best = { from, to: null, outbound, inbound: null, total: outbound };
      continue;
    }
    for (const to of selected) {
      if (from === to) continue;
      const inbound = access[to]?.[backKey];
      if (!valid(inbound, budget)) continue;
      if (!best || outbound + inbound < best.total) best = { from, to, outbound, inbound, total: outbound + inbound };
    }
  }
  return best;
}
export function assess(access, selected, budget, through, mode = 'bike') {
  const bike = bestJourney(access, selected, budget, { through });
  const walk = bestJourney(access, selected, budget, { through, mode: 'walk' });
  const oneWay = bestJourney(access, selected, budget, { through: false, mode });
  const journey = mode === 'walk' ? walk : bike;
  return { bike, walk, journey, oneWay, category: journey ? mode : oneWay ? 'oneWay' : 'outside' };
}
export function validateStationData(rail, surface, events) {
  if (rail.schema_version !== 2 || surface.schema_version !== 2 || !rail.stations?.length || !Array.isArray(surface.cells) || events.type !== 'FeatureCollection' || !Array.isArray(events.features)) throw Error('駅到達圏データの形式が不正です');
  const ids = new Set(rail.stations.map(s => s.id));
  if (ids.size !== rail.stations.length) throw Error('駅IDが重複しています');
  const coordinate = (lon,lat) => Number.isFinite(lon) && Number.isFinite(lat) && lon >= 130 && lon <= 140 && lat >= 30 && lat <= 40;
  if (!surface.cell_size?.every(v => Number.isFinite(v) && v > 0) || surface.cell_size.length !== 2) throw Error('格子サイズが不正です');
  for (const s of rail.stations) if (!coordinate(s.lon,s.lat) || !s.name) throw Error('駅座標・名称が不正です');
  if (!rail.default_stations?.every(id => ids.has(id))) throw Error('初期選択駅が不正です');
  if (!rail.lines?.features?.length) throw Error('路線がありません');
  for (const line of rail.lines.features) {
    const parts = line.geometry?.type === 'LineString' ? [line.geometry.coordinates] : line.geometry?.type === 'MultiLineString' ? line.geometry.coordinates : null;
    if (!parts?.length || !line.properties?.stations?.every(id => ids.has(id)) || !parts.every(part => Array.isArray(part) && part.length >= 2 && part.every(c => Array.isArray(c) && coordinate(...c)))) throw Error('路線が不正です');
  }
  const checkAccess = access => {
    if (!access || typeof access !== 'object') throw Error('方向別所要時間がありません');
    for (const [id,costs] of Object.entries(access)) {
      if (!ids.has(id)) throw Error('未定義の駅IDです');
      for (const key of ['out','back','walk_out','walk_back']) if (costs[key] !== null && (!Number.isFinite(costs[key]) || costs[key] < 0)) throw Error('方向別所要時間が不正です');
    }
  };
  for (const c of surface.cells) { if (!coordinate(c.lon,c.lat)) throw Error('格子座標が不正です'); checkAccess(c.access); }
  for (const e of events.features) { if (e.geometry?.type !== 'Point' || !coordinate(...e.geometry.coordinates) || !e.properties?.name) throw Error('イベントが不正です'); checkAccess(e.properties.access); }
}
