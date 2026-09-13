"""Compute directed station <-> cell/event costs on an OSM street network with r5py.
Rail journeys are outside this stage: users select the stations they can use.
"""
import argparse
import json
import math
from datetime import timedelta
from pathlib import Path
from generate_station_sample import grid


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--osm', type=Path, required=True)
    parser.add_argument('--railway', type=Path, default=Path('public/data/railway.json'))
    parser.add_argument('--events', type=Path, default=Path('public/data/station_events.geojson'))
    parser.add_argument('--output', type=Path, default=Path('computed-data'))
    args = parser.parse_args()
    for path in [args.osm,args.railway,args.events]:
        if not path.is_file(): parser.error(f'入力ファイルがありません: {path}')
    railway=json.loads(args.railway.read_text())
    events=json.loads(args.events.read_text())
    stations=railway['stations']
    ids=[e['properties']['id'] for e in events['features']]
    if len(ids)!=len(set(ids)) or any(not isinstance(id,str) or id.startswith('cell-') for id in ids):
        parser.error('イベントIDは重複のない文字列（cell-以外で開始）にしてください')
    if len({s['id'] for s in stations}) != len(stations): parser.error('駅IDが重複しています')
    # Deferred imports let --help and input validation work in the supplied env.
    import geopandas as gpd
    import r5py
    from shapely.geometry import Point
    cells=grid(stations)
    origins=gpd.GeoDataFrame([dict(id=s['id'],geometry=Point(s['lon'],s['lat'])) for s in stations],crs=4326)
    destinations=gpd.GeoDataFrame([dict(id=c['id'],geometry=Point(c['lon'],c['lat'])) for c in cells]+[dict(id=e['properties']['id'],geometry=Point(e['geometry']['coordinates'])) for e in events['features']],crs=4326)
    network=r5py.TransportNetwork(args.osm)
    # Four independent matrices, because event -> station may differ from station -> event.
    costs={}
    for mode,transport in [('bike',r5py.TransportMode.BICYCLE),('walk',r5py.TransportMode.WALK)]:
        for direction in ['out','back']:
            reverse=direction=='back'
            matrix=r5py.TravelTimeMatrix(network,
                origins=destinations if reverse else origins,
                destinations=origins if reverse else destinations,
                transport_modes=[transport],max_time=timedelta(minutes=30),
                max_time_cycling=timedelta(minutes=30),max_time_walking=timedelta(minutes=30),
                speed_cycling=15,speed_walking=4.5)
            key=direction if mode=='bike' else f'walk_{direction}'
            costs[key]={(str(row.to_id),str(row.from_id)) if reverse else (str(row.from_id),str(row.to_id)):float(row.travel_time) for row in matrix.itertuples() if math.isfinite(row.travel_time) and 0<=row.travel_time<=30}
    def access(id):
        values={}
        for s in stations:
            entry={key:table.get((s['id'],id)) for key,table in costs.items()}
            if any(v is not None for v in entry.values()): values[s['id']]=entry
        return values
    for c in cells: c['access']=access(c['id'])
    for e in events['features']: e['properties']['access']=access(e['properties']['id'])
    args.output.mkdir(parents=True,exist_ok=True)
    def save(name,value):
        (args.output/name).write_text(json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n')
    save('railway.json',railway)
    save('station_events.geojson',events)
    save('station_access.json',dict(schema_version=2,sample=False,cell_size=[1/182,1/222],max_minutes=30,cells=cells,source=f'r5py / {args.osm.name}',limitations='格子中心の所要時間。鉄道・レンタサイクル貸出返却・終了時刻は未判定。'))
    print(f'出力: {args.output}。結果と出典を確認後、3ファイルをまとめてpublic/dataにコピーしてください。')


if __name__=='__main__': main()
