"""Import P11-22 GML points; merge nearby, same-named bus stops across operators."""
import argparse
from collections import defaultdict
from datetime import date
import hashlib
import json
from pathlib import Path
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
from pyproj import Transformer
from import_railway import BBOX,distance
from transit_style import operator_key

NS={'g':'http://schemas.opengis.net/gml/3.2.1','k':'http://nlftp.mlit.go.jp/ksj/schemas/ksj-app','x':'http://www.w3.org/1999/xlink'}


def build(paths):
    transform=Transformer.from_crs(6668,4326,always_xy=True)
    names=defaultdict(list);stops=[];sources=[];records=0
    for path in sorted(paths):
        with zipfile.ZipFile(path) as z:
            name=next(n for n in z.namelist() if n.endswith('.xml') and '/KS-META' not in n)
            root=ET.fromstring(z.read(name))
        points={p.attrib['{'+NS['g']+'}id']:list(reversed([float(v) for v in p.find('g:pos',NS).text.split()])) for p in root.findall('g:Point',NS)}
        for item in root.findall('k:BusStop',NS):
            key=item.find('k:loc',NS).attrib['{'+NS['x']+'}href'].lstrip('#')
            lon,lat=transform.transform(*points[key])
            if not(BBOX[0]<=lon<=BBOX[2] and BBOX[1]<=lat<=BBOX[3]):continue
            records+=1
            name=unicodedata.normalize('NFKC',item.findtext('k:bsn','',NS)).strip()
            operator=operator_key(item.findtext('k:boc','',NS))
            member=dict(source=path.name,code=item.attrib['{'+NS['g']+'}id'],operator=operator,lon=round(lon,7),lat=round(lat,7),routes=[r.text for r in item.findall('k:bri/k:brn',NS)])
            existing=next((s for s in names[name] if distance([s['lon'],s['lat']],[lon,lat])<=100),None)
            if existing:
                existing['members'].append(member)
                if operator not in existing['operators']:existing['operators'].append(operator)
            else:
                id='bus-'+hashlib.sha256(f'{name}|{lon:.7f}|{lat:.7f}'.encode()).hexdigest()[:12]
                s=dict(id=id,type='bus_stop',name=name,lon=round(lon,7),lat=round(lat,7),operators=[operator],members=[member])
                stops.append(s);names[name].append(s)
        sources.append(dict(file=path.name,sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
    provenance=dict(url='https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P11-2022.html',reference_year=2022,license='CC BY 4.0',retrieved=date.today().isoformat(),bbox=BBOX,sources=sources,source_crs='EPSG:6668',output_crs='EPSG:4326',processing='同名で代表点から100m以内の停留所を統合。元の位置・事業者・系統名を保持。高速・デマンドバスは原典対象外。現在の運行は未確認。')
    return dict(stops=sorted(stops,key=lambda s:(s['name'],s['id'])),provenance=provenance),dict(source_record_count=records,stop_count=len(stops),provenance=provenance)


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('archives',nargs='+',type=Path);args=parser.parse_args()
    data,report=build(args.archives)
    Path('public/data/bus_stops.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
    Path('docs/bus-stops-import-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(f'{report["source_record_count"]} records / {report["stop_count"]} grouped stops')
if __name__=='__main__':main()
