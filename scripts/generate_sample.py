"""Generate deterministic, fictional Osaka demonstration data. No routing claim."""
import json
import math
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / 'public/data'
ORIGINS = [dict(id='osaka', name='大阪駅', lon=135.4959, lat=34.7025), dict(id='namba', name='なんば駅', lon=135.5002, lat=34.6651), dict(id='tennoji', name='天王寺駅', lon=135.5138, lat=34.6473)]

def minutes(lon, lat, origin, mode):
    distance = math.hypot((lon-origin['lon'])*91.5, (lat-origin['lat'])*111)
    # Deliberately synthetic continuous surface, shared by cells and events.
    return round(8 + distance * {'transit': 7.5, 'walk': 5.7, 'bike': 3.7}[mode], 1)

def save(name, value):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f'{name}.geojson').write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':'))+'\n')

def main():
    save('metadata', dict(sample=True, period='休日 12:00発（架空）', origins=ORIGINS, source='架空のデモデータ。実際の経路・時刻表ではありません。'))
    for mode, filename in [('transit','reach_transit'), ('walk','reach_transit_walk'), ('bike','reach_transit_bike')]:
        features = []
        for origin in ORIGINS:
            for x in range(48):
                for y in range(50):
                    lon, lat = 135.38+x*.005, 34.56+y*.004
                    value = minutes(lon+.0025, lat+.002, origin, mode)
                    if value > 60: continue
                    features.append(dict(type='Feature', properties=dict(origin=origin['id'], minutes=value), geometry=dict(type='Polygon', coordinates=[[[lon,lat],[lon+.005,lat],[lon+.005,lat+.004],[lon,lat+.004],[lon,lat]]])))
        save(filename, dict(type='FeatureCollection', features=features))
    places = [('中之島 リバーサイドマーケット','中之島公園','マーケット',135.506,34.692,'11:00','17:00'),('大阪城公園 みどりの音楽会','大阪城公園','音楽',135.526,34.687,'13:00','18:00'),('天王寺 週末クラフト市','てんしば','マーケット',135.511,34.649,'10:00','17:00'),('靱公園 青空ワークショップ','靱公園','体験',135.489,34.685,'12:00','16:00'),('鶴見緑地 花と暮らしのフェア','花博記念公園鶴見緑地','自然',135.574,34.711,'12:00','17:00'),('住吉 まちあるきの日','住吉公園','まち歩き',135.489,34.611,'13:00','16:00'),('港のサンセットライブ','天保山公園','音楽',135.430,34.658,'16:00','22:00'),('長居 星空シネマ','長居公園','映画',135.520,34.613,'18:00','23:00'),('堺 水辺のアート散歩','堺旧港','アート',135.467,34.585,'12:00','17:00'),('万博 週末ピクニック','万博記念公園','自然',135.532,34.810,'11:00','16:00')]
    features=[]
    for i,(name,venue,category,lon,lat,start,end) in enumerate(places):
        journeys={o['id']:dict(**{m:minutes(lon,lat,o,m) for m in ['transit','walk','bike']},return_status='difficult' if i in [6,7] else 'ok',return_note='サンプル設定：終了後の帰路に注意。終電判定ではありません。' if i in [6,7] else 'サンプル設定：帰路可。実際の終電・運行は未確認です。') for o in ORIGINS}
        features.append(dict(type='Feature',geometry=dict(type='Point',coordinates=[lon,lat]),properties=dict(id=f'event-{i+1}',name=name,venue=venue,category=category,date='2026-10-18',start=start,end=end,fictional=True,journeys=journeys)))
    save('events',dict(type='FeatureCollection',features=features))

if __name__ == '__main__': main()
