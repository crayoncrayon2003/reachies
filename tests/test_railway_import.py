import json
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from import_railway import clip_line, nearest_on_parts


class RailwayGeometryTests(unittest.TestCase):
    def test_clip_preserves_curves_and_does_not_bridge_external_gaps(self):
        parts=clip_line([[.2,.2],[.4,.6],[2,.6],[2,.8],[.4,.8],[.2,.9]],(0,0,1,1))
        self.assertEqual(len(parts),2)
        self.assertEqual(parts[0],[[.2,.2],[.4,.6],[1,.6]])
        self.assertEqual(parts[1],[[1,.8],[.4,.8],[.2,.9]])

    def test_station_anchor_is_on_its_own_operator_and_route(self):
        data=json.loads((ROOT/'public/data/railway.json').read_text())
        self.assertEqual(data['geometry_source'],'mlit-n02-2025')
        for station in data['stations']:
            parts=[part for line in data['lines']['features'] if line['properties']['source_operator']==station['source_operator'] and station['source_route'] in line['properties']['source_routes'] for part in line['geometry']['coordinates']]
            distance,_=nearest_on_parts([station['lon'],station['lat']],parts)
            self.assertLess(distance,.02,station['name'])

    def test_requested_regional_networks_are_present(self):
        data=json.loads((ROOT/'public/data/railway.json').read_text())
        routes={(l['properties']['source_operator'],n) for l in data['lines']['features'] for n in l['properties']['source_routes']}
        for pair in [('南海電気鉄道','南海本線'),('南海電気鉄道','高野線'),('西日本旅客鉄道','湖西線'),('西日本旅客鉄道','紀勢線'),('西日本旅客鉄道','片町線'),('西日本旅客鉄道','阪和線'),('WILLER　TRAINS','宮津線'),('近江鉄道','本線'),('信楽高原鐵道','信楽線'),('神戸新交通','ポートアイランド線'),('東海旅客鉄道','東海道新幹線'),('和歌山電鐵','貴志川線'),('紀州鉄道','紀州鉄道線')]:
            self.assertIn(pair,routes)

    def test_all_regional_stations_and_interchanges(self):
        data=json.loads((ROOT/'public/data/railway.json').read_text())
        stations=data['stations']
        self.assertGreater(len(stations),2000)
        for name in ['米原','敦賀','姫路','福知山','白浜','新宮','吉野','和歌山','京都','森ノ宮','京橋','大阪・梅田','なんば']:
            self.assertEqual(sum(s['name']==name for s in stations),1,name)
        for old in ['hankyu_umeda','hanshin_umeda','umeda_metro']:
            self.assertEqual(data['station_aliases'][old],'osaka')
        seen=set()
        for station in stations:
            for member in station['members']:
                key=(member['code'],member['operator'],member['route'])
                self.assertNotIn(key,seen)
                seen.add(key)
        self.assertGreater(len(seen),len(stations))

    def test_company_colors_are_shared_by_rail_and_bus(self):
        colors={}
        for file,field in [('railway.json','lines'),('bus_routes.geojson',None)]:
            data=json.loads((ROOT/'public/data'/file).read_text())
            for feature in (data[field] if field else data)['features']:
                p=feature['properties'];key=p['operator_key']
                self.assertEqual(colors.setdefault(key,p['color']),p['color'],key)

    def test_bus_stops_preserve_sources_and_merge_operators(self):
        data=json.loads((ROOT/'public/data/bus_stops.json').read_text())
        self.assertGreater(len(data['stops']),30000)
        self.assertEqual(len({s['id'] for s in data['stops']}),len(data['stops']))
        self.assertTrue(any(len(s['operators'])>1 for s in data['stops']))
        for stop in data['stops']:
            self.assertEqual(stop['type'],'bus_stop')
            self.assertTrue(stop['members'])
            self.assertTrue(134.15<=stop['lon']<=136.9 and 33.35<=stop['lat']<=35.85)
        report=json.loads((ROOT/'docs/bus-stops-import-report.json').read_text())
        self.assertEqual(sum(len(s['members']) for s in data['stops']),report['source_record_count'])

    def test_source_vertices_and_separate_sections_are_retained(self):
        data=json.loads((ROOT/'public/data/railway.json').read_text())
        self.assertEqual(data['provenance']['reference_date'],'2025-12-31')
        self.assertEqual(data['provenance']['license'],'CC BY 4.0')
        for line in data['lines']['features']:
            self.assertEqual(line['geometry']['type'],'MultiLineString')
            self.assertGreater(len(line['geometry']['coordinates']),1)
            self.assertTrue(all(len(part)>=2 for part in line['geometry']['coordinates']))
        self.assertTrue(any(len(part)>20 for line in data['lines']['features'] for part in line['geometry']['coordinates']))
        self.assertGreater(sum(len(part) for line in data['lines']['features'] for part in line['geometry']['coordinates']),8000)


if __name__=='__main__': unittest.main()
