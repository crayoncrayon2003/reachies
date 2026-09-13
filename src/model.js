export const MODES = { transit: '公共交通のみ', walk: '公共交通 + 徒歩', bike: '公共交通 + レンタサイクル' };
export const COLORS = { transit: '#287cc1', bike: '#20835d', caution: '#dfa51b', unreachable: '#d85a59' };
export function reachable(minutes, budget) { return Number.isFinite(minutes) && minutes >= 0 && minutes <= budget; }
export function classify(event, origin, mode, budget) {
  const route = event.properties.journeys[origin];
  const minutes = route[mode];
  if (!reachable(minutes, budget)) return { category: 'unreachable', minutes, label: '選択条件では厳しい' };
  if (route.return_status === 'difficult') return { category: 'caution', minutes, label: '帰りに注意' };
  if (route.return_status !== 'ok') return { category: 'caution', minutes, label: '帰路は未確認' };
  return { category: mode === 'bike' && !reachable(route.walk, budget) ? 'bike' : 'transit', minutes, label: mode === 'bike' && !reachable(route.walk, budget) ? '自転車併用で到達可能' : '公共交通・徒歩で到達可能' };
}
export function summarize(events, origin, mode, budget) {
  return { count: events.filter(e => reachable(e.properties.journeys[origin][mode], budget)).length,
    gain: events.filter(e => reachable(e.properties.journeys[origin].bike, budget) && !reachable(e.properties.journeys[origin].transit, budget)).length };
}
export function validateData(meta, events, reaches) {
  if (!meta.origins?.length || events.type !== 'FeatureCollection' || !Array.isArray(events.features)) throw Error('イベントデータの形式が不正です');
  for (const event of events.features) {
    if (event.geometry?.type !== 'Point' || !event.properties?.name || !event.properties.journeys) throw Error('イベントの必須項目がありません');
    const [lon, lat] = event.geometry.coordinates;
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < 130 || lon > 140 || lat < 30 || lat > 40) throw Error('イベント座標を確認してください');
    for (const origin of meta.origins) for (const mode of Object.keys(MODES)) {
      const v = event.properties.journeys[origin.id]?.[mode];
      if (v !== null && (!Number.isFinite(v) || v < 0)) throw Error('イベントの所要時間が不正です');
    }
  }
  for (const reach of Object.values(reaches)) {
    if (reach.type !== 'FeatureCollection' || !Array.isArray(reach.features)) throw Error('到達圏データの形式が不正です');
    for (const f of reach.features) if (f.geometry?.type !== 'Polygon' || !meta.origins.some(o => o.id === f.properties.origin) || !Number.isFinite(f.properties.minutes) || f.properties.minutes < 0) throw Error('到達圏の必須項目が不正です');
  }
}
