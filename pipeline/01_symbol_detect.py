import numpy as np
from PIL import Image
from scipy import ndimage
import subprocess, json, os

IMG_PATH = '/mnt/user-data/uploads/250415_동평택_덕풍.png'
OUT_DIR = '/home/claude/work'
os.makedirs(OUT_DIR, exist_ok=True)

im = Image.open(IMG_PATH).convert('RGB')
arr = np.array(im)
H, W, _ = arr.shape
r = arr[:,:,0].astype(int); g = arr[:,:,1].astype(int); b = arr[:,:,2].astype(int)

red_mask = (r>180)&(g<80)&(b<80)
green_mask = (g>120)&(r<100)&(b<100)
symbol_mask = red_mask | green_mask

# label connected components of the combined symbol mask (small circles that touch/overlap get grouped)
# dilate slightly to merge adjacent sub-circles of the same symbol cluster
struct = np.ones((9,9), dtype=bool)
dilated = ndimage.binary_dilation(symbol_mask, structure=struct)
labels, n = ndimage.label(dilated)
print(f'Found {n} raw symbol clusters')

objs = ndimage.find_objects(labels)
symbols = []
for i, sl in enumerate(objs):
    if sl is None:
        continue
    y0, y1 = sl[0].start, sl[0].stop
    x0, x1 = sl[1].start, sl[1].stop
    w_, h_ = x1-x0, y1-y0
    # filter noise: too small or absurdly large (whole background merges)
    area = w_*h_
    if area < 30 or area > 5000:
        continue
    # count red vs green pixels within original (non-dilated) mask for this bbox
    sub_red = red_mask[y0:y1, x0:x1].sum()
    sub_green = green_mask[y0:y1, x0:x1].sum()
    cx, cy = (x0+x1)//2, (y0+y1)//2
    symbols.append({
        'id': len(symbols),
        'bbox': [int(x0), int(y0), int(x1), int(y1)],
        'center': [int(cx), int(cy)],
        'red_px': int(sub_red),
        'green_px': int(sub_green),
    })

print(f'Filtered to {len(symbols)} candidate symbols')

with open(os.path.join(OUT_DIR, 'symbols_raw.json'), 'w', encoding='utf-8') as f:
    json.dump(symbols, f, ensure_ascii=False, indent=2)
