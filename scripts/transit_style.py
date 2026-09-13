"""Stable company identity and one color per operating company across transport modes."""
import colorsys
import hashlib
import re
import unicodedata


def operator_key(name):
    name=unicodedata.normalize('NFKC',name)
    name=re.sub(r'株式会社|有限会社|\(株\)|\(有\)|\s+', '',name)
    return {'京都市交通局':'京都市','神戸市交通局':'神戸市'}.get(name,name)


def operator_color(name):
    key=operator_key(name)
    fixed={'西日本旅客鉄道':'#2879b9','東海旅客鉄道':'#d78320','大阪市高速電気軌道':'#d84965','近畿日本鉄道':'#bf8a12','阪急電鉄':'#713b62','阪神電気鉄道':'#167f96','京阪電気鉄道':'#267d48','南海電気鉄道':'#d36b2c'}
    if key in fixed:return fixed[key]
    hue=int(hashlib.sha256(key.encode()).hexdigest()[:8],16)%360
    return '#'+''.join(f'{round(c*255):02x}' for c in colorsys.hls_to_rgb(hue/360,.37,.52))
