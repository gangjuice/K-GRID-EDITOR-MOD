import numpy as np
from PIL import Image
import json, subprocess, os, re

IMG_PATH = '/mnt/user-data/uploads/250415_동평택_덕풍.png'
OUT_DIR = '/home/claude/work'

im = Image.open(IMG_PATH).convert('RGB')
arr = np.array(im)
H, W, _ = arr.shape

symbols = json.load(open(os.path.join(OUT_DIR, 'symbols_raw.json'), encoding='utf-8'))

def clean_black_text(region_arr):
    r = region_arr[:,:,0].astype(int)
    g = region_arr[:,:,1].astype(int)
    b = region_arr[:,:,2].astype(int)
    is_dark = (r<110)&(g<110)&(b<110)
    out = np.ones_like(region_arr)*255
    out[is_dark] = [0,0,0]
    return out.astype('uint8')

# For dynamic crop: for each symbol, find nearest symbol below it (roughly same x column)
# to know where the text block must stop before the next icon starts.
def find_next_below(s, all_syms):
    x0,y0,x1,y1 = s['bbox']
    cx = (x0+x1)/2
    candidates = []
    for o in all_syms:
        if o['id'] == s['id']:
            continue
        ox0,oy0,ox1,oy1 = o['bbox']
        ocx = (ox0+ox1)/2
        if oy0 > y1 and abs(ocx-cx) < 80:
            candidates.append(oy0)
    if candidates:
        return min(candidates)
    return None

results = []
for s in symbols:
    x0,y0,x1,y1 = s['bbox']
    cx = (x0+x1)//2
    next_y = find_next_below(s, symbols)
    max_text_h = 140
    if next_y is not None:
        avail = next_y - y1 - 6
        max_text_h = max(20, min(max_text_h, avail))
    tx0, tx1 = max(0,cx-100), min(W, cx+160)
    ty0, ty1 = y1+2, min(H, y1+2+max_text_h)
    if ty1 <= ty0+5:
        results.append({**s, 'raw_text': '', 'note': 'no_space_for_text'})
        continue
    region = arr[ty0:ty1, tx0:tx1]
    cleaned = clean_black_text(region)
    crop_im = Image.fromarray(cleaned)
    crop_im = crop_im.resize((crop_im.width*3, crop_im.height*3), Image.LANCZOS)
    tmp_path = f'/tmp/sym_{s["id"]}.png'
    crop_im.save(tmp_path)
    try:
        text = subprocess.run(
            ['tesseract', tmp_path, 'stdout', '-l', 'kor+eng', '--psm', '6'],
            capture_output=True, text=True, timeout=10
        ).stdout.strip()
    except Exception as e:
        text = f'[ERROR: {e}]'
    os.remove(tmp_path)
    results.append({
        'id': s['id'], 'bbox': s['bbox'], 'center': s['center'],
        'red_px': s['red_px'], 'green_px': s['green_px'],
        'raw_text': text
    })
    if s['id'] % 30 == 0:
        print(f"processed {s['id']}/{len(symbols)}")

# ---- post-processing / regex correction pass ----
def postprocess(raw):
    lines = [l.strip() for l in raw.split('\n') if l.strip()]
    out = {'device_id': None, 'specs': [], 'distance_km': None, 'other': []}
    for l in lines:
        l2 = l.replace(' ', '')
        # device id line: 고덕 + alnum/hyphen
        m = re.match(r'^(고\s*덕|고덕)[Ss8]?[0-9A-Za-z\-\[\]]+', l)
        if l2.startswith('고덕') and out['device_id'] is None:
            # fix common S/8 confusion right after 고덕
            fixed = re.sub(r'^고덕([8SB])', lambda m2: '고덕S', l2)
            out['device_id'] = fixed
            continue
        # cable spec line: CNCV / CNCY / CNCE variants with a number in parens
        m2 = re.search(r'(CNC[VYE][\-\w/]*)\(?\s*(\d{2,4})\)?', l, re.IGNORECASE)
        if m2:
            spec = f"{m2.group(1).upper().replace('Y','V')}({m2.group(2)})"
            out['specs'].append(spec)
            continue
        # distance line: number[km]
        m3 = re.search(r'(\d+\.\d+)\s*\[?\s*k?m\]?', l, re.IGNORECASE)
        if m3 and out['distance_km'] is None:
            out['distance_km'] = float(m3.group(1))
            continue
        out['other'].append(l)
    return out

for r_ in results:
    r_['parsed'] = postprocess(r_.get('raw_text',''))

with open(os.path.join(OUT_DIR, 'symbols_final.json'), 'w', encoding='utf-8') as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

ok = sum(1 for r_ in results if r_['parsed']['device_id'])
print(f'device_id 파싱 성공: {ok}/{len(results)}')
