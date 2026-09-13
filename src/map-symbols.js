// Original SVG pictograms. No external icon font or emoji rendering dependency.
export const EVENT_SYMBOLS = {
  '音楽': { label: '音楽', paths: '<path d="M9 17V5l11-2v12M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>' },
  'マーケット': { label: 'マーケット', paths: '<path d="M4 11v10h16V11M3 5h18l1 6H2l1-6ZM9 21v-7h6v7M7 5v6m5-6v6m5-6v6"/>' },
  '映画': { label: '映画', paths: '<path d="M3 9h18v12H3V9Zm0 0L2 4l18-3 1 5-18 3Zm3-6 3 4m4-5 3 4"/><path d="m10 12 5 3-5 3Z"/>' },
  '自然': { label: '自然', paths: '<path d="M20 3C8 2 2 7 5 15c5 7 15 2 15-12ZM3 22 16 8M8 17l-1-6m4 3 6 1"/>' },
  '体験': { label: '体験', paths: '<path d="M14 4a6 6 0 0 0-7 8l-5 6 4 4 6-6a6 6 0 0 0 8-7l-4 4-4-4 4-4Z"/>' },
  'まち歩き': { label: 'まち歩き', paths: '<circle cx="13" cy="3" r="2"/><path d="m10 22 2-7-3-4 2-5 4 1 2 5 4 1M11 7 7 9l-2 5m7 1 5 7"/>' },
  'アート': { label: 'アート', paths: '<path d="M12 2a10 10 0 1 0 0 20c4 0-2-5 2-6h3c7 0 6-14-5-14Z"/><circle cx="7" cy="8" r="1"/><circle cx="12" cy="6" r="1"/><circle cx="17" cy="9" r="1"/><circle cx="6" cy="14" r="1"/>' },
};
const fallback = { label: 'その他', paths: '<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>' };
export function eventSymbol(category) { return EVENT_SYMBOLS[category] || fallback; }
export function iconSvg(category) {
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${eventSymbol(category).paths}</svg>`;
}
export const REACH_BANDS = [
  { max:5, color:'#990d1b' }, { max:10, color:'#c92534' }, { max:15, color:'#e95760' },
  { max:20, color:'#f58f96' }, { max:25, color:'#fac3c6' }, { max:30, color:'#fff0f0' },
];
export function reachColor(minutes) { return (REACH_BANDS.find(b=>minutes<=b.max) || REACH_BANDS.at(-1)).color; }
