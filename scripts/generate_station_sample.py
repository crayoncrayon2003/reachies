"""Radial travel-time demo; preserve imported railway geometry, never infer road routes."""
import json
import math
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / 'public/data'
# Approximate station locations. Major stations only, not a complete railway network.
STATIONS = [
 ('osaka','大阪',135.4959,34.7025),('fukushima','福島',135.4869,34.6972),
 ('nishikujo','西九条',135.4666,34.6826),('bentencho','弁天町',135.4625,34.6694),
 ('taisho','大正',135.4798,34.6656),('shinimamiya','新今宮',135.5011,34.6501),
 ('tennoji','天王寺',135.5138,34.6473),('tsuruhashi','鶴橋',135.5303,34.6654),
 ('morinomiya','森ノ宮',135.5333,34.6815),('kyobashi','京橋',135.5331,34.6960),
 ('sakuranomiya','桜ノ宮',135.5203,34.7043),('temma','天満',135.5121,34.7048),
 ('shinosaka','新大阪',135.5001,34.7335),('suita','吹田',135.5230,34.7630),
 ('ibaraki','茨木',135.5620,34.8150),('takatsuki','高槻',135.6170,34.8517),
 ('kyoto','京都',135.7588,34.9858),('amagasaki','尼崎',135.4317,34.7311),
 ('nishinomiya','西宮',135.3470,34.7389),('ashiya','芦屋',135.3075,34.7342),
 ('sumiyoshi','住吉（JR）',135.2616,34.7196),('sannomiya','三ノ宮',135.1933,34.6947),
 ('kobe','神戸',135.1781,34.6796),('yodoyabashi','淀屋橋',135.5010,34.6924),
 ('hommachi','本町',135.5000,34.6820),('shinsaibashi','心斎橋',135.5008,34.6745),
 ('namba','なんば',135.5002,34.6651),('nagai','長居',135.5134,34.6093),
 ('nakamozu','なかもず',135.5055,34.5562),('osakako','大阪港',135.4344,34.6539),
 ('awaza','阿波座',135.4863,34.6815),('tanimachi4','谷町四丁目',135.5172,34.6817),
 ('fukaebashi','深江橋',135.5560,34.6787),('nagata','長田',135.5917,34.6787),
 ('kyuhoji','久宝寺',135.5837,34.6225),('oji','王寺',135.7041,34.5975),
 ('nara','奈良',135.8188,34.6805),
 ('hankyu_umeda','大阪梅田（阪急）',135.4984,34.7055),('juso','十三',135.4820,34.7200),
 ('tsukaguchi','塚口（阪急）',135.4156,34.7526),('nishikita','西宮北口',135.3567,34.7458),
 ('shukugawa','夙川',135.3285,34.7424),('okamoto','岡本',135.2753,34.7281),
 ('hankyu_sannomiya','神戸三宮（阪急）',135.1922,34.6934),
 ('awaji','淡路',135.5168,34.7393),('ibaraki_shi','茨木市',135.5750,34.8166),
 ('takatsuki_shi','高槻市',135.6234,34.8498),('katsura','桂',135.7035,34.9797),
 ('karasuma','烏丸',135.7590,35.0035),('kawaramachi','京都河原町',135.7690,35.0038),
 ('toyonaka','豊中',135.4614,34.7870),('ishibashi','石橋阪大前',135.4455,34.8085),
 ('kawanishi','川西能勢口',135.4132,34.8279),('takarazuka','宝塚',135.3433,34.8108),
 ('hanshin_umeda','大阪梅田（阪神）',135.4962,34.7008),('hanshin_amagasaki','尼崎（阪神）',135.4173,34.7186),
 ('koshien','甲子園',135.3634,34.7238),('hanshin_nishinomiya','西宮（阪神）',135.3386,34.7360),
 ('hanshin_ashiya','芦屋（阪神）',135.3032,34.7274),('uozaki','魚崎',135.2698,34.7120),
 ('hanshin_sannomiya','神戸三宮（阪神）',135.1950,34.6930),('motomachi','元町（阪神）',135.1870,34.6894),
 ('kujo','九条',135.4733,34.6754),('sakuragawa','桜川',135.4875,34.6685),
 ('osaka_namba','大阪難波',135.4995,34.6670),('uehommachi','大阪上本町',135.5207,34.6655),
 ('fuse','布施',135.5630,34.6642),('higashihanazono','東花園',135.6280,34.6628),
 ('ikoma','生駒',135.6974,34.6932),('saidaiji','大和西大寺',135.7832,34.6935),
 ('kintetsu_nara','近鉄奈良',135.8273,34.6844),('kintetsu_yao','近鉄八尾',135.6030,34.6297),
 ('kawachi_yamamoto','河内山本',135.6198,34.6277),('takaida_osaka','河内国分',135.6357,34.5678),
 ('yamato_yagi','大和八木',135.7927,34.5133),
 ('kitahama','北浜',135.5069,34.6913),('temmabashi','天満橋',135.5165,34.6900),
 ('moriguchi_shi','守口市',135.5650,34.7353),('neyagawa','寝屋川市',135.6202,34.7637),
 ('hirakata','枚方市',135.6493,34.8160),('kuzuha','樟葉',135.6750,34.8629),
 ('chushojima','中書島',135.7601,34.9264),('tambabashi','丹波橋',135.7659,34.9388),
 ('shichijo','七条',135.7676,34.9899),('gion_shijo','祇園四条',135.7723,35.0037),
 ('sanjo','三条',135.7722,35.0092),('demachiyanagi','出町柳',135.7725,35.0301),
 ('nakanoshima','中之島',135.4864,34.6892),('watanabebashi','渡辺橋',135.4950,34.6911),
 ('oe_bridge','大江橋',135.5006,34.6931),('naniwabashi','なにわ橋',135.5077,34.6924),
 ('umeda_metro','梅田（メトロ）',135.4983,34.7030),
 ('higashi_umeda','東梅田',135.4999,34.7012),('tenroku','天神橋筋六丁目',135.5100,34.7108),
 ('minamimorimachi','南森町',135.5110,34.6970),('tanimachi9','谷町九丁目',135.5160,34.6668),
 ('miyakojima','都島',135.5255,34.7088),('dainichi','大日',135.5787,34.7500),
 ('tanimachi6','谷町六丁目',135.5172,34.6755),('taishibashi','太子橋今市',135.5542,34.7315),
 ('nagahoribashi','長堀橋',135.5068,34.6750),('nipponbashi','日本橋',135.5063,34.6661),
 ('dobutsuen','動物園前',135.5032,34.6489),('taisho_metro','大正（メトロ）',135.4788,34.6650),
 ('osaka_business','大阪ビジネスパーク',135.5298,34.6926),('gamo4','蒲生四丁目',135.5474,34.7016),
 ('tsurumi','鶴見緑地',135.5800,34.7109),('kadoma_minami','門真南',135.5921,34.7163),

]
LINES = [
 ('loop','JR大阪環状線（主要駅）','#ed7135',['osaka','fukushima','nishikujo','bentencho','taisho','shinimamiya','tennoji','tsuruhashi','morinomiya','kyobashi','sakuranomiya','temma','osaka']),
 ('kyoto','JR京都線（主要駅）','#3279bd',['osaka','shinosaka','suita','ibaraki','takatsuki','kyoto']),
 ('kobe','JR神戸線（主要駅）','#3279bd',['osaka','amagasaki','nishinomiya','ashiya','sumiyoshi','sannomiya','kobe']),
 ('midosuji','Osaka Metro 御堂筋線（主要駅）','#d84965',['shinosaka','umeda_metro','yodoyabashi','hommachi','shinsaibashi','namba','tennoji','nagai','nakamozu']),
 ('chuo','Osaka Metro 中央線（主要駅）','#20866c',['osakako','bentencho','awaza','hommachi','tanimachi4','morinomiya','fukaebashi','nagata']),
 ('yamatoji','大和路線（主要駅）','#8970b9',['tennoji','kyuhoji','oji','nara']),
 ('hankyu_kobe','阪急 神戸線（主要駅）','#713b62',['hankyu_umeda','juso','tsukaguchi','nishikita','shukugawa','okamoto','hankyu_sannomiya']),
 ('hankyu_kyoto','阪急 京都線（主要駅）','#713b62',['hankyu_umeda','juso','awaji','ibaraki_shi','takatsuki_shi','katsura','karasuma','kawaramachi']),
 ('hankyu_takarazuka','阪急 宝塚線（主要駅）','#713b62',['hankyu_umeda','juso','toyonaka','ishibashi','kawanishi','takarazuka']),
 ('hanshin_main','阪神 本線（主要駅）','#167fb0',['hanshin_umeda','hanshin_amagasaki','koshien','hanshin_nishinomiya','hanshin_ashiya','uozaki','hanshin_sannomiya','motomachi']),
 ('hanshin_namba','阪神 なんば線（主要駅）','#167fb0',['hanshin_amagasaki','nishikujo','kujo','sakuragawa','osaka_namba']),
 ('kintetsu_nara','近鉄 難波・奈良線（主要駅）','#c58c12',['osaka_namba','nipponbashi','uehommachi','tsuruhashi','fuse','higashihanazono','ikoma','saidaiji','kintetsu_nara']),
 ('kintetsu_osaka','近鉄 大阪線（主要駅）','#c58c12',['uehommachi','tsuruhashi','fuse','kintetsu_yao','kawachi_yamamoto','takaida_osaka','yamato_yagi']),
 ('keihan_main','京阪 本線・鴨東線（主要駅）','#267d48',['yodoyabashi','kitahama','temmabashi','kyobashi','moriguchi_shi','neyagawa','hirakata','kuzuha','chushojima','tambabashi','shichijo','gion_shijo','sanjo','demachiyanagi']),
 ('keihan_nakanoshima','京阪 中之島線（主要駅）','#267d48',['nakanoshima','watanabebashi','oe_bridge','naniwabashi','temmabashi']),
 ('metro_tanimachi','Osaka Metro 谷町線（主要駅・天王寺まで）','#855ba0',['dainichi','taishibashi','miyakojima','tenroku','higashi_umeda','minamimorimachi','temmabashi','tanimachi4','tanimachi6','tanimachi9','tennoji']),
 ('metro_sakaisuji','Osaka Metro 堺筋線（主要駅）','#947653',['tenroku','minamimorimachi','kitahama','nagahoribashi','nipponbashi','dobutsuen']),
 ('metro_nagahori','Osaka Metro 長堀鶴見緑地線（主要駅）','#8b9c25',['taisho_metro','shinsaibashi','nagahoribashi','tanimachi6','morinomiya','osaka_business','kyobashi','gamo4','tsurumi','kadoma_minami']),

]

def network():
    stations = [dict(id=i,name=n,lon=x,lat=y) for i,n,x,y in STATIONS]
    points={s['id']:[s['lon'],s['lat']] for s in stations}
    lines=[dict(type='Feature',properties=dict(id=i,name=n,color=c,stations=ids,operator=('Osaka Metro' if 'Metro' in n else n.split(' ')[0] if ' ' in n else 'JR')),geometry=dict(type='LineString',coordinates=[points[s] for s in ids])) for i,n,c,ids in LINES]
    return dict(schema_version=2,sample=True,stations=stations,lines=dict(type='FeatureCollection',features=lines),default_stations=['osaka','kyobashi','morinomiya'],source='主要駅を結ぶ概略図。実際の線路形状・全駅を表すものではありません。')


def grid(stations):
    # Sparse 500 m grid around stations; full Kansai bounding box is unnecessary.
    cells=set()
    for s in stations:
        cx,cy=round(s['lon']*182),round(s['lat']*222)
        for dx in range(-14,15):
            for dy in range(-14,15):
                if dx*dx+dy*dy <= 196: cells.add((cx+dx,cy+dy))
    return [dict(id=f'cell-{x}-{y}',lon=x/182,lat=y/222) for x,y in sorted(cells)]


def access(lon,lat,stations):
    result={}
    for s in stations:
        lat1,lat2=map(math.radians,[s['lat'],lat])
        h=math.sin((lat2-lat1)/2)**2+math.cos(lat1)*math.cos(lat2)*math.sin(math.radians(lon-s['lon'])/2)**2
        km=2*6371.0088*math.asin(math.sqrt(min(1,h)))
        bike=km/15*60
        walk=km/4.5*60
        if bike<=45:
            result[s['id']]=dict(out=bike,back=bike,walk_out=walk,walk_back=walk)
    return result


def main():
    existing = OUT / 'railway.json'
    data = json.loads(existing.read_text()) if existing.exists() else network()
    # Keep imported railway geometry and station positions when regenerating demo costs.
    if data.get('geometry_source') != 'mlit-n02-2025': data = network()
    stations=data['stations']
    def save(name,value):
        (OUT/name).write_text(json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n')
    save('railway.json',data)
    # The radial demo is evaluated continuously in the browser. Grid costs are
    # only needed by precompute.py for real road-network data.
    cells=[]
    save('station_access.json',dict(schema_version=2,sample=True,model=dict(kind='radial-demo',walk_kmh=4.5,bike_kmh=15),cell_size=[1/182,1/222],max_minutes=30,cells=cells))
    previous=json.loads((OUT/'events.geojson').read_text())
    features=[]
    for e in previous['features']:
        p=dict(e['properties']); p.pop('journeys',None)
        p['access']=access(*e['geometry']['coordinates'],stations)
        features.append(dict(type='Feature',geometry=e['geometry'],properties=p))
    for id,name,venue,x,y in [('kobe-event','港のアートマルシェ','メリケンパーク',135.188,34.682),('kyoto-event','梅小路 手づくり広場','梅小路公園',135.747,34.987),('nara-event','奈良 緑のクラフト市','奈良公園',135.843,34.685)]:
        features.append(dict(type='Feature',geometry=dict(type='Point',coordinates=[x,y]),properties=dict(id=id,name=name,venue=venue,category='マーケット',date='2026-10-18',start='11:00',end='17:00',fictional=True,access=access(x,y,stations))))
    save('station_events.geojson',dict(type='FeatureCollection',features=features))
    print(f'Wrote {len(stations)} stations, {len(cells)} cells, {len(features)} events')

if __name__=='__main__': main()
