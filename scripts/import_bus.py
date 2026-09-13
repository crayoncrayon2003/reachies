"""Import regional MLIT N07-22 bus paths. This dataset excludes express buses."""
import argparse
from collections import defaultdict
from datetime import date
import hashlib
import json
from pathlib import Path
import zipfile
from import_railway import BBOX,clip_line
from transit_style import operator_key,operator_color


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archives',nargs='+',type=Path)
    parser.add_argument('--output',type=Path,default=Path('public/data/bus_routes.geojson'))
    args=parser.parse_args()
    from pyproj import Transformer
    transform=Transformer.from_crs(6668,4326,always_xy=True)
    grouped=defaultdict(list);seen=set();sources=[]
    for path in args.archives:
        with zipfile.ZipFile(path) as z:
            names=[name for name in z.namelist() if name.endswith('.geojson')]
            if len(names)!=1: raise ValueError(f'Expected one GeoJSON: {path}')
            features=json.loads(z.read(names[0]))['features']
        for f in features:
            operator=operator_key(f['properties']['N07_001'])
            coords=[list(transform.transform(*p)) for p in f['geometry']['coordinates']]
            for part in clip_line(coords,BBOX):
                key=tuple(map(tuple,part));key=(operator,min(key,tuple(reversed(key))))
                if key not in seen:grouped[operator].append(part);seen.add(key)
        sources.append(dict(file=path.name,sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
    result=dict(type='FeatureCollection',features=[dict(type='Feature',properties=dict(operator=name,operator_key=name,color=operator_color(name),reference_year=2022),geometry=dict(type='MultiLineString',coordinates=parts)) for name,parts in sorted(grouped.items())],provenance=dict(url='https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N07-2022.html',license='CC BY 4.0',reference_year=2022,retrieved=date.today().isoformat(),bbox=list(BBOX),sources=sources,source_crs='EPSG:6668',output_crs='EPSG:4326',limitations='事業者単位の道路経路。系統別・高速バス・デマンド交通は含まない。現在の運行・時刻表は未確認。'))
    args.output.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
    report=dict(operators=list(sorted(grouped)),operator_count=len(grouped),part_count=sum(len(p) for p in grouped.values()),vertex_count=sum(len(part) for parts in grouped.values() for part in parts),provenance=result['provenance'])
    Path('docs/bus-import-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(f'{report["operator_count"]} operators / {report["part_count"]} parts / {report["vertex_count"]} vertices')

if __name__=='__main__':main()
