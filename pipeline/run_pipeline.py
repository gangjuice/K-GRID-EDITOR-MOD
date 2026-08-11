"""
run_pipeline.py

PNG(또는 JPG) 계통도 한 장을 넣으면, 편집기가 바로 불러올 수 있는 JSON을
한 번에 생성합니다. 내부적으로 01(심볼 탐지) -> 02(OCR) -> 03(편집기 포맷 변환)을
순서대로 실행하며, 중간 결과도 함께 저장해서 어느 단계가 부정확한지 확인할 수
있게 합니다.

사용법:
    python3 run_pipeline.py <입력.png> [출력폴더]

예시:
    python3 run_pipeline.py 250415_동평택_덕풍.png ./out
    # ./out/01_symbols_raw.json      (심볼 위치)
    # ./out/02_symbols_ocr.json      (심볼 + OCR 텍스트)
    # ./out/03_editor_import.json    (편집기 최종 입력 파일) <- 이걸 편집기에서 불러오면 됨
"""

import sys
import os
import json
import subprocess
import numpy as np
from PIL import Image
from scipy import ndimage

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

TESSERACT_LANG = "kor+eng"
# 데스크톱 앱에 번들된 tesseract를 쓸 때는 Electron이 이 환경변수로 실제 경로를 넘겨줍니다.
TESSERACT_CMD = os.environ.get("PIPELINE_TESSERACT_CMD", "tesseract")


def log(msg):
    print(f"[pipeline] {msg}", flush=True)


# ---------- 1단계: 심볼(개폐기/S·L쌍) 위치 탐지 ----------
def detect_symbols(img_path):
    im = Image.open(img_path).convert("RGB")
    arr = np.array(im)
    r, g, b = arr[:, :, 0].astype(int), arr[:, :, 1].astype(int), arr[:, :, 2].astype(int)

    red_mask = (r > 180) & (g < 80) & (b < 80)
    green_mask = (g > 120) & (r < 100) & (b < 100)
    symbol_mask = red_mask | green_mask

    struct = np.ones((9, 9), dtype=bool)
    dilated = ndimage.binary_dilation(symbol_mask, structure=struct)
    labels, n = ndimage.label(dilated)
    objs = ndimage.find_objects(labels)

    symbols = []
    for sl in objs:
        if sl is None:
            continue
        y0, y1 = sl[0].start, sl[0].stop
        x0, x1 = sl[1].start, sl[1].stop
        w_, h_ = x1 - x0, y1 - y0
        area = w_ * h_
        if area < 30 or area > 5000:
            continue
        sub_red = int(red_mask[y0:y1, x0:x1].sum())
        sub_green = int(green_mask[y0:y1, x0:x1].sum())
        symbols.append({
            "id": len(symbols),
            "bbox": [int(x0), int(y0), int(x1), int(y1)],
            "center": [int((x0 + x1) // 2), int((y0 + y1) // 2)],
            "red_px": sub_red,
            "green_px": sub_green,
        })
    log(f"1단계-1 완료 - 원시 블록 {len(symbols)}개 탐지")
    symbols = merge_nearby_symbols(symbols, radius=50)
    log(f"1단계-2 완료 - 근접 병합 후 심볼 {len(symbols)}개 (같은 물리 심볼이 쪼개진 것을 합침)")
    return arr, symbols


def merge_nearby_symbols(symbols, radius=50):
    """S/L쌍처럼 원래 하나의 심볼인데 원 사이 간격이 커서 별도 블록으로 잡힌 것들을
    중심점 거리 기준으로 다시 하나로 합친다.
    실측 결과: 같은 심볼 내부 간격은 ~32px, 서로 다른 심볼 간 최소 간격은 ~85px로
    뚜렷이 구분되어 50px을 안전한 임계값으로 사용한다."""
    n = len(symbols)
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for i in range(n):
        xi, yi = symbols[i]["center"]
        for j in range(i + 1, n):
            xj, yj = symbols[j]["center"]
            if ((xi - xj) ** 2 + (yi - yj) ** 2) ** 0.5 <= radius:
                union(i, j)

    groups = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)

    merged = []
    for members in groups.values():
        xs0 = min(symbols[i]["bbox"][0] for i in members)
        ys0 = min(symbols[i]["bbox"][1] for i in members)
        xs1 = max(symbols[i]["bbox"][2] for i in members)
        ys1 = max(symbols[i]["bbox"][3] for i in members)
        merged.append({
            "id": len(merged),
            "bbox": [xs0, ys0, xs1, ys1],
            "center": [(xs0 + xs1) // 2, (ys0 + ys1) // 2],
            "red_px": sum(symbols[i]["red_px"] for i in members),
            "green_px": sum(symbols[i]["green_px"] for i in members),
        })
    return merged


# ---------- 2단계: 심볼별 텍스트 OCR ----------
def clean_black_text(region_arr):
    r = region_arr[:, :, 0].astype(int)
    g = region_arr[:, :, 1].astype(int)
    b = region_arr[:, :, 2].astype(int)
    is_dark = (r < 110) & (g < 110) & (b < 110)
    out = np.ones_like(region_arr) * 255
    out[is_dark] = [0, 0, 0]
    return out.astype("uint8")


def find_next_below(sym, all_syms):
    x0, y0, x1, y1 = sym["bbox"]
    cx = (x0 + x1) / 2
    candidates = []
    for o in all_syms:
        if o["id"] == sym["id"]:
            continue
        ox0, oy0, ox1, oy1 = o["bbox"]
        ocx = (ox0 + ox1) / 2
        if oy0 > y1 and abs(ocx - cx) < 80:
            candidates.append(oy0)
    return min(candidates) if candidates else None


def ocr_symbols(arr, symbols, tmp_dir):
    import re
    H, W, _ = arr.shape
    os.makedirs(tmp_dir, exist_ok=True)
    results = []

    for i, sym in enumerate(symbols):
        x0, y0, x1, y1 = sym["bbox"]
        cx = (x0 + x1) // 2

        next_y = find_next_below(sym, symbols)
        max_h = 140
        if next_y is not None:
            max_h = max(20, min(max_h, next_y - y1 - 6))

        tx0, tx1 = max(0, cx - 100), min(W, cx + 160)
        ty0, ty1 = y1 + 2, min(H, y1 + 2 + max_h)

        raw_text = ""
        if ty1 > ty0 + 5:
            region = arr[ty0:ty1, tx0:tx1]
            cleaned = clean_black_text(region)
            crop_im = Image.fromarray(cleaned)
            crop_im = crop_im.resize((crop_im.width * 3, crop_im.height * 3), Image.LANCZOS)
            tmp_path = os.path.join(tmp_dir, f"sym_{sym['id']}.png")
            crop_im.save(tmp_path)
            try:
                raw_text = subprocess.run(
                    [TESSERACT_CMD, tmp_path, "stdout", "-l", TESSERACT_LANG, "--psm", "6"],
                    capture_output=True, text=True, encoding="utf-8", timeout=10,
                ).stdout.strip()
            except Exception as e:
                raw_text = f"[ERROR: {e}]"
            os.remove(tmp_path)

        results.append({**sym, "raw_text": raw_text})
        if (i + 1) % 30 == 0:
            log(f"  OCR 진행 {i + 1}/{len(symbols)}")

    # 후처리: device_id / specs / distance_km 구조화
    def postprocess(raw):
        lines = [l.strip() for l in raw.split("\n") if l.strip()]
        out = {"device_id": None, "specs": [], "distance_km": None, "other": []}
        for l in lines:
            l2 = l.replace(" ", "")
            if l2.startswith("고덕") and out["device_id"] is None:
                fixed = re.sub(r"^고덕([8SB])", lambda m: "고덕S", l2)
                out["device_id"] = fixed
                continue
            m2 = re.search(r"(CNC[VYE][\-\w/]*)\(?\s*(\d{2,4})\)?", l, re.IGNORECASE)
            if m2:
                out["specs"].append(f"{m2.group(1).upper().replace('Y','V')}({m2.group(2)})")
                continue
            m3 = re.search(r"(\d+\.\d+)\s*\[?\s*k?m\]?", l, re.IGNORECASE)
            if m3 and out["distance_km"] is None:
                out["distance_km"] = float(m3.group(1))
                continue
            out["other"].append(l)
        return out

    for r_ in results:
        r_["parsed"] = postprocess(r_["raw_text"])

    ok = sum(1 for r_ in results if r_["parsed"]["device_id"])
    log(f"2단계 완료 - device_id 인식 {ok}/{len(results)}")
    return results


# ---------- 3단계: 편집기 JSON 포맷으로 변환 ----------
def classify(sym):
    x0, y0, x1, y1 = sym["bbox"]
    w, h = x1 - x0, y1 - y0
    area = w * h
    red, green = sym["red_px"], sym["green_px"]
    if red > 50 and green > 50 and 900 <= area <= 4500:
        return "switch"
    if red > 30 and green == 0 and h > w * 1.2 and 150 <= area <= 1800:
        return "pair_sl"
    if area < 150:
        return None
    return "unknown"


def convert_to_editor(symbols, title="자동 변환 - 검수 필요"):
    POSITION_SCALE = 1 / 4.0
    used_ids = set()

    def unique_id(base):
        if base not in used_ids:
            used_ids.add(base)
            return base
        i = 2
        while f"{base}-{i}" in used_ids:
            i += 1
        used_ids.add(f"{base}-{i}")
        return f"{base}-{i}"

    nodes = []
    for sym in symbols:
        node_type = classify(sym)
        if node_type is None:
            continue
        parsed = sym.get("parsed", {})
        device_id = parsed.get("device_id")
        review = False
        if not device_id:
            device_id = f"UNKNOWN_{sym['id']}"
            review = True
        if node_type == "unknown":
            node_type = "switch"
            review = True

        node_id = unique_id(device_id)
        cx, cy = sym["center"]
        node = {
            "id": node_id,
            "type": node_type,
            "specs": parsed.get("specs", []),
            "distance_km": parsed.get("distance_km") if parsed.get("distance_km") is not None else 0,
            "position": {"x": round(cx * POSITION_SCALE, 1), "y": round(cy * POSITION_SCALE, 1)},
            "needs_review": review,
        }
        if node_type in ("switch", "pair_sl"):
            node["state"] = [1, 0, 1, 0] if node_type == "switch" else [1, 1]
        nodes.append(node)

    log(f"3단계 완료 - 편집기 노드 {len(nodes)}개 생성 (검수 필요 {sum(1 for n in nodes if n['needs_review'])}개)")
    return {
        "meta": {
            "title": title,
            "source": "run_pipeline.py",
            "note": "선/엣지는 자동 추출되지 않았습니다. needs_review=true 노드는 원본과 대조 확인하세요.",
        },
        "nodes": nodes,
        "edges": [],
    }


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    img_path = sys.argv[1]
    out_dir = sys.argv[2] if len(sys.argv) > 2 else "./pipeline_out"
    os.makedirs(out_dir, exist_ok=True)

    log(f"입력: {img_path}")
    arr, symbols = detect_symbols(img_path)
    with open(os.path.join(out_dir, "01_symbols_raw.json"), "w", encoding="utf-8") as f:
        json.dump(symbols, f, ensure_ascii=False, indent=2)

    ocr_results = ocr_symbols(arr, symbols, tmp_dir=os.path.join(out_dir, "_tmp"))
    with open(os.path.join(out_dir, "02_symbols_ocr.json"), "w", encoding="utf-8") as f:
        json.dump(ocr_results, f, ensure_ascii=False, indent=2)

    title = os.path.splitext(os.path.basename(img_path))[0]
    editor_json = convert_to_editor(ocr_results, title=title)
    out_path = os.path.join(out_dir, "03_editor_import.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(editor_json, f, ensure_ascii=False, indent=2)

    log(f"완료 -> {out_path} 를 편집기에서 '불러오기' 하면 됩니다.")


if __name__ == "__main__":
    main()
