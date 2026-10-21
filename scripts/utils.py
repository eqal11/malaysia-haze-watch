"""Standard-library-only ingestion, atomic writes and WGS84 geometry helpers."""
import json
import math
import os
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'

def now():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')

def read(path, default=None):
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else default

def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n'
    if path.exists() and path.read_text(encoding='utf-8') == content:
        return
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(content, encoding='utf-8')
    os.replace(temp, path)

def fetch(url):
    # Never log URL: FIRMS embeds the secret in the path.
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'MalaysiaHazeWatch/1.0 (+public environmental dashboard)'})
            with urllib.request.urlopen(req, timeout=45) as response:
                return response.read().decode('utf-8-sig')
        except Exception:
            if attempt == 2:
                raise RuntimeError('Upstream request failed after three attempts') from None
            time.sleep(2 ** attempt)

def status(source, ok, observed=None, message=None, transport=None):
    meta = read(DATA / 'meta.json', {'version': 1, 'sources': {}})
    old = meta['sources'].get(source, {})
    old.update({'last_attempt': now(), 'status': 'ok' if ok else 'unavailable', 'message': message})
    if ok:
        old['last_success'] = now()
        old['observed_at'] = observed
    if transport:
        old['transport'] = transport
    meta['sources'][source] = old
    write(DATA / 'meta.json', meta)

def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)

def valid_coord(point):
    return len(point) >= 2 and all(finite(v) for v in point[:2]) and -180 <= point[0] <= 180 and -90 <= point[1] <= 90

def validate_geojson(obj):
    if obj.get('type') != 'FeatureCollection' or not isinstance(obj.get('features'), list) or obj.get('crs'):
        raise ValueError('Expected WGS84 RFC7946 FeatureCollection without legacy CRS')
    def ring(r):
        if len(r) < 4 or r[0] != r[-1] or not all(valid_coord(p) for p in r):
            raise ValueError('Invalid polygon ring')
    for f in obj['features']:
        g = f.get('geometry') or {}
        c = g.get('coordinates', [])
        if g.get('type') == 'Point':
            if not valid_coord(c):
                raise ValueError('Invalid longitude/latitude')
        elif g.get('type') in ('Polygon', 'MultiPolygon'):
            for poly in ([c] if g['type'] == 'Polygon' else c):
                if not poly:
                    raise ValueError('Empty polygon')
                for r in poly:
                    ring(r)
        else:
            raise ValueError('Unsupported geometry')
    return obj

def in_ring(p, ring):
    x, y = p
    inside = False
    for a, b in zip(ring, ring[1:]):
        if (a[1] > y) != (b[1] > y) and x < (b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:
            inside = not inside
    return inside

def contains(p, geometry):
    polys = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']
    return any(in_ring(p, poly[0]) and not any(in_ring(p, h) for h in poly[1:]) for poly in polys)

def locate(p, features):
    return next((f for f in features if contains(p, f['geometry'])), None)

def validate_ipu(doc):
    if doc.get('version') != 1 or not isinstance(doc.get('stations'), list) or not doc['stations']:
        raise ValueError('No valid station collection')
    ids = set()
    for s in doc['stations']:
        if not s.get('id') or s['id'] in ids or not s.get('name') or not s.get('state'):
            raise ValueError('Missing or duplicate station identity')
        ids.add(s['id'])
        if not valid_coord([s.get('lng'), s.get('lat')]) or not (98 <= s['lng'] <= 120 and 0 <= s['lat'] <= 8):
            raise ValueError('Station outside Malaysia coordinate envelope')
        v = s.get('ipu')
        if v is not None and (not finite(v) or not 0 <= v <= 1000):
            raise ValueError('Invalid IPU')
        datetime.fromisoformat(s['updated_at'].replace('Z', '+00:00'))
    return doc
