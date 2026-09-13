"""Import MLIT N02-25 railway geometry. Keeps source curves, never connects gaps."""
import argparse
from collections import defaultdict
from copy import deepcopy
from datetime import date
import hashlib
import json
import math
from pathlib import Path
import re
import zipfile

from generate_station_sample import network
from transit_style import operator_key, operator_color

SOURCE_URL = 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N02-2025.html'
DOWNLOAD_URL = 'https://nlftp.mlit.go.jp/ksj/gml/data/N02/N02-25/N02-25_GML.zip'
BBOX = (134.15, 33.35, 136.90, 35.85)
OPERATORS = {'JR':'西日本旅客鉄道','Osaka Metro':'大阪市高速電気軌道','近鉄':'近畿日本鉄道','阪急':'阪急電鉄','阪神':'阪神電気鉄道','京阪':'京阪電気鉄道'}
REGIONAL_OPERATORS = {
    **{value:key for key,value in OPERATORS.items()},
    '東海旅客鉄道':'JR東海', '南海電気鉄道':'南海', '山陽電気鉄道':'山陽電鉄',
    '能勢電鉄':'能勢電鉄','神戸電鉄':'神戸電鉄','大阪モノレール':'大阪モノレール',
    '神戸市':'神戸市営地下鉄','神戸新交通':'神戸新交通','京都市':'京都市営地下鉄',
    '京福電気鉄道':'嵐電・京福','叡山電鉄':'叡山電鉄','近江鉄道':'近江鉄道',
    '信楽高原鐵道':'信楽高原鐵道','WILLER　TRAINS':'京都丹後鉄道','北条鉄道':'北条鉄道',
    '和歌山電鐵':'和歌山電鐵','紀州鉄道':'紀州鉄道','阪堺電気軌道':'阪堺電車',
    '北大阪急行電鉄':'北大阪急行','水間鉄道':'水間鉄道','伊賀鉄道':'伊賀鉄道',
    '伊勢鉄道':'伊勢鉄道','嵯峨野観光鉄道':'嵯峨野観光鉄道','比叡山鉄道':'比叡山鉄道',
    '神戸六甲鉄道':'六甲ケーブル','こうべ未来都市機構':'摩耶ケーブル',
    '丹後海陸交通':'丹後海陸交通','鞍馬寺':'鞍馬山ケーブル',
}

ROUTES = {
    'loop':['大阪環状線'], 'kyoto':['東海道線'],
    'midosuji':['1号線(御堂筋線)'], 'chuo':['4号線(中央線)'], 'yamatoji':['関西線'],
    'hankyu_kobe':['神戸線'], 'hankyu_kyoto':['京都線'], 'hankyu_takarazuka':['宝塚線'],
    'hanshin_main':['本線'], 'hanshin_namba':['阪神なんば線'],
    'kintetsu_nara':['難波線','奈良線'], 'kintetsu_osaka':['大阪線'],
    'keihan_main':['京阪本線','鴨東線'], 'keihan_nakanoshima':['中之島線'],
    'metro_tanimachi':['2号線(谷町線)'], 'metro_sakaisuji':['6号線(堺筋線)'],
    'metro_nagahori':['7号線(長堀鶴見緑地線)'],
}


def clip_segment(a, b, bbox):
    """Liang-Barsky clip. Returning None means no artificial connection is allowed."""
    xmin,ymin,xmax,ymax=bbox
    dx,dy=b[0]-a[0],b[1]-a[1]
    lo,hi=0.,1.
    for p,q in [(-dx,a[0]-xmin),(dx,xmax-a[0]),(-dy,a[1]-ymin),(dy,ymax-a[1])]:
        if p==0:
            if q<0: return None
        elif p<0: lo=max(lo,q/p)
        else: hi=min(hi,q/p)
        if lo>hi: return None
    start=[round(a[0]+lo*dx,7),round(a[1]+lo*dy,7)]
    end=[round(a[0]+hi*dx,7),round(a[1]+hi*dy,7)]
    return (start,end) if start!=end else None


def clip_line(coords,bbox):
    parts=[];part=[]
    for a,b in zip(coords,coords[1:]):
        clipped=clip_segment(a,b,bbox)
        if clipped is None:
            if len(part)>1: parts.append(part)
            part=[]
            continue
        start,end=clipped
        if part and part[-1]==start: part.append(end)
        else:
            if len(part)>1: parts.append(part)
            part=[start,end]
    if len(part)>1: parts.append(part)
    return parts


def distance(a,b):
    return math.hypot((a[0]-b[0])*91500,(a[1]-b[1])*111000)


def nearest_on_parts(point,parts):
    best=None
    for part in parts:
        for a,b in zip(part,part[1:]):
            x,y=(point[0]-a[0])*91500,(point[1]-a[1])*111000
            dx,dy=(b[0]-a[0])*91500,(b[1]-a[1])*111000
            t=max(0,min(1,(x*dx+y*dy)/(dx*dx+dy*dy))) if dx*dx+dy*dy else 0
            candidate=[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]
            d=distance(point,candidate)
            if best is None or d<best[0]: best=(d,candidate)
    if best is None: raise ValueError('No railway to project station onto')
    return best


def midpoint(coords):
    lengths=[distance(a,b) for a,b in zip(coords,coords[1:])]
    remaining=sum(lengths)/2
    for a,b,length in zip(coords,coords[1:],lengths):
        if remaining<=length and length:
            t=remaining/length
            return [a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]
        remaining-=length
    return coords[0]


def read_geojson(archive,suffix):
    names=[name for name in archive.namelist() if name.endswith(suffix) and '/UTF-8/' in name]
    if len(names)!=1: raise ValueError(f'Expected one UTF-8 {suffix}')
    return json.loads(archive.read(names[0]))


def build(archive_path):
    from pyproj import Transformer
    transform=Transformer.from_crs('EPSG:6668','EPSG:4326',always_xy=True)
    def converted(coords): return [list(transform.transform(*p)) for p in coords]
    with zipfile.ZipFile(archive_path) as archive:
        sections=read_geojson(archive,'RailroadSection.geojson')['features']
        source_stations=read_geojson(archive,'Station.geojson')['features']
    by_route=defaultdict(list)
    for feature in sections:
        p=feature['properties'];by_route[(p['N02_004'],p['N02_003'])].append(feature)
    data=network();old_lines=deepcopy(data['lines']['features']);lines=[]
    for line in old_lines:
        p=line['properties'];id=p['id']
        if id=='kobe': continue  # These two service names share the source Tokaido line.
        company=OPERATORS[p['operator']]
        parts=[];seen=set();source_count=0
        for source_name in ROUTES[id]:
            raw=by_route[(company,source_name)]
            if not raw: raise ValueError(f'Missing route: {company} / {source_name}')
            for f in raw:
                clipped=clip_line(converted(f['geometry']['coordinates']),BBOX)
                if clipped: source_count+=1
                for part in clipped:
                    key=tuple(map(tuple,part));key=min(key,tuple(reversed(key)))
                    if key not in seen: parts.append(part);seen.add(key)
        if not parts: raise ValueError(f'Empty route: {id}')
        if id=='kyoto':
            p['name']='JR琵琶湖・京都・神戸線（東海道線）'
            p['stations']=list(dict.fromkeys(p['stations']+next(l['properties']['stations'] for l in old_lines if l['properties']['id']=='kobe')))
        else:
            p['name']=re.sub('（主要駅.*?）','',p['name'])
        p.update(source_routes=ROUTES[id],source_operator=company,source_segments=source_count)
        line['geometry']=dict(type='MultiLineString',coordinates=parts);lines.append(line)
    covered={(line['properties']['source_operator'],route) for line in lines for route in line['properties']['source_routes']}
    palette=['#30819c','#76569a','#3e8168','#bd7927','#536daf','#a15b7c']
    for (company,route),raw in sorted(by_route.items()):
        if (company,route) in covered: continue
        parts=[];seen=set();source_count=0
        for f in raw:
            clipped=clip_line(converted(f['geometry']['coordinates']),BBOX)
            if clipped: source_count+=1
            for part in clipped:
                key=tuple(map(tuple,part));key=min(key,tuple(reversed(key)))
                if key not in seen: parts.append(part);seen.add(key)
        if not parts: continue
        operator=REGIONAL_OPERATORS.get(company,company)
        code=hashlib.sha256(f'{company}/{route}'.encode()).hexdigest()[:10]
        color=next((line['properties']['color'] for line in lines if line['properties']['operator']==operator),palette[int(code,16)%len(palette)])
        aliases={'湖西線':'湖西線','紀勢線':'きのくに線・紀勢線','桜井線':'万葉まほろば線（桜井線）','山陰線':'嵯峨野線・山陰線','片町線':'学研都市線（片町線）','福知山線':'JR宝塚線・福知山線','宮津線':'宮舞線・宮豊線（宮津線）','ポートアイランド線':'ポートライナー','六甲アイランド線':'六甲ライナー'}
        lines.append(dict(type='Feature',properties=dict(id=f'n02-{code}',name=f'{operator} {aliases.get(route,route)}',color=color,operator=operator,stations=[],source_routes=[route],source_operator=company,source_segments=source_count),geometry=dict(type='MultiLineString',coordinates=parts)))
    for line in lines:
        line['properties']['transport_type']='shinkansen' if any('新幹線' in name for name in line['properties']['source_routes']) else 'rail'
    data['lines']['features']=lines
    matched=[]
    for s in data['stations']:
        name=re.sub('（.*?）','',s['name'])
        names={'なんば':{'難波'},'なかもず':{'中百舌鳥'},'日本橋':{'日本橋','近鉄日本橋'}}.get(name,{name})
        allowed={(OPERATORS[l['properties']['operator']],route) for l in old_lines if s['id'] in l['properties']['stations'] for route in ROUTES['kyoto' if l['properties']['id']=='kobe' else l['properties']['id']]}
        candidates=[]
        for f in source_stations:
            p=f['properties']
            if p['N02_005'] not in names or (p['N02_004'],p['N02_003']) not in allowed: continue
            point=midpoint(converted(f['geometry']['coordinates']))
            candidates.append((distance([s['lon'],s['lat']],point),point,p))
        if not candidates: raise ValueError(f'No source station for {s["id"]}')
        shift,point,p=min(candidates,key=lambda item:item[0])
        if shift>1200: raise ValueError(f'Station match too far: {s["id"]} {shift}m')
        source_point=point
        route_parts=[part for line in lines if line['properties']['source_operator']==p['N02_004'] and p['N02_003'] in line['properties']['source_routes'] for part in line['geometry']['coordinates']]
        snap,point=nearest_on_parts(point,route_parts)
        if snap>250: raise ValueError(f'Station too far from its route: {s["id"]} {snap}m')
        s.update(lon=round(point[0],7),lat=round(point[1],7),source_station=p['N02_005c'],source_operator=p['N02_004'],source_route=p['N02_003'],source_position=source_point,snap_m=round(snap,2))
        matched.append(dict(id=s['id'],name=s['name'],shift_m=round(shift,1),rail_snap_m=round(snap,2),source_route=p['N02_003'],source_code=p['N02_005c']))
    expand_stations(data,source_stations,converted)
    data.update(sample=False,geometry_source='mlit-n02-2025',source='国土数値情報（鉄道データ・2025年度）を加工して作成',provenance=dict(url=SOURCE_URL,download_url=DOWNLOAD_URL,reference_date='2025-12-31',retrieved=date.today().isoformat(),license='CC BY 4.0',license_url='https://creativecommons.org/licenses/by/4.0/',source_crs='EPSG:6668',output_crs='EPSG:4326',transform_accuracy_m=transform.accuracy,bbox=list(BBOX),archive_sha256=hashlib.sha256(archive_path.read_bytes()).hexdigest(),processing='指定路線抽出、範囲切り出し、重複除去、WGS84変換。曲線頂点は簡略化せず保持。駅は該当駅区間の長さの中点を、同事業者・同路線の線形へ投影。'))
    report=dict(stations=matched,station_count=len(data['stations']),station_grouping=data['station_grouping'],route_count=len(lines),part_count=sum(len(l['geometry']['coordinates']) for l in lines),vertex_count=sum(len(p) for l in lines for p in l['geometry']['coordinates']),source=data['provenance'])
    return data,report


def station_name(name):
    # Explicit interchange names; other same-named stations must also be nearby.
    return {'大阪':'大阪・梅田','大阪梅田':'大阪・梅田','梅田':'大阪・梅田','東梅田':'大阪・梅田','西梅田':'大阪・梅田','難波':'なんば','大阪難波':'なんば','JR難波':'なんば','三ノ宮':'三宮','神戸三宮':'三宮'}.get(name,name)


def expand_stations(data,source,converted):
    lines=data['lines']['features']
    routes={}
    for line in lines:
        p=line['properties'];p['color']=operator_color(p['source_operator']);p['operator_key']=operator_key(p['source_operator']);p['stations']=[]
        for route in p['source_routes']:routes[(p['source_operator'],route)]=line
    records=[]
    for f in source:
        p=f['properties'];pair=(p['N02_004'],p['N02_003'])
        if pair not in routes:continue
        point=midpoint(converted(f['geometry']['coordinates']))
        if not(BBOX[0]<=point[0]<=BBOX[2] and BBOX[1]<=point[1]<=BBOX[3]):continue
        records.append(dict(p=p,point=point,name=station_name(p['N02_005'])))
    parent=list(range(len(records)))
    def root(i):
        while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
        return i
    def union(a,b):parent[root(b)]=root(a)
    groups={};names=defaultdict(list)
    for i,r in enumerate(records):
        group=r['p']['N02_005g']
        if group in groups:union(i,groups[group])
        groups[group]=i
        for j in names[r['name']]:
            if distance(r['point'],records[j]['point'])<= (900 if r['name'] in ['大阪・梅田','なんば','三宮'] else 500):union(i,j)
        names[r['name']].append(i)
    clusters=defaultdict(list)
    for i,r in enumerate(records):clusters[root(i)].append(r)
    old=data['stations'];new=[];aliases={}
    for members in clusters.values():
        codes={r['p']['N02_005c'] for r in members}
        matches=[s for s in old if s['source_station'] in codes]
        rep=next((r for r in members if matches and r['p']['N02_005c']==matches[0]['source_station'] and r['p']['N02_003']==matches[0]['source_route']),members[0])
        p=rep['p'];point=rep['point'];line=routes[(p['N02_004'],p['N02_003'])]
        snap,anchor=nearest_on_parts(point,line['geometry']['coordinates'])
        if matches:
            anchor=[matches[0]['lon'],matches[0]['lat']]
        id=matches[0]['id'] if matches else 'rail-'+min(codes)
        names=sorted({r['p']['N02_005'] for r in members})
        name=station_name(p['N02_005'])
        unique={(r['p']['N02_005c'],r['p']['N02_004'],r['p']['N02_003']):r for r in members}
        entries=[dict(code=c,operator=o,route=t,position=r['point']) for (c,o,t),r in unique.items()]
        new.append(dict(id=id,name=name,type='station',lon=round(anchor[0],7),lat=round(anchor[1],7),names=names,operators=sorted({r['p']['N02_004'] for r in members}),members=entries,source_station=p['N02_005c'],source_operator=p['N02_004'],source_route=p['N02_003'],source_position=point,snap_m=round(snap,2)))
        for s in matches:aliases[s['id']]=id
        for r in members:
            ids=routes[(r['p']['N02_004'],r['p']['N02_003'])]['properties']['stations']
            if id not in ids:ids.append(id)
    data['stations']=sorted(new,key=lambda s:(s['name'],s['id']))
    data['station_aliases']=aliases
    data['default_stations']=list(dict.fromkeys(aliases.get(id,id) for id in data['default_stations']))
    data['station_grouping']=dict(source_record_count=len(records),station_count=len(new),method='N02_005g station groups; nearby same names within 500m; Osaka/Umeda, Namba, Sannomiya interchange aliases within 900m. One original railway anchor per group; member positions retained.')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive',type=Path,help='N02-25_GML.zip downloaded from MLIT')
    parser.add_argument('--output',type=Path,default=Path('public/data/railway.json'))
    parser.add_argument('--report',type=Path,default=Path('docs/railway-import-report.json'))
    args=parser.parse_args()
    data,report=build(args.archive)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
    args.report.parent.mkdir(parents=True,exist_ok=True)
    args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(f'{len(data["stations"])} stations / {report["route_count"]} routes / {report["part_count"]} parts / {report["vertex_count"]} vertices')
    print(f'Max station correction: {max(s["shift_m"] for s in report["stations"])} m')


if __name__=='__main__': main()
