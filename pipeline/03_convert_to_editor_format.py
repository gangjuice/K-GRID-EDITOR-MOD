"""
03_convert_to_editor_format.py

02_ocr_extract.py 의 출력(symbols_final.json)을 편집기(gyetongdo-editor.jsx)가
읽을 수 있는 노드/엣지 JSON 포맷으로 변환합니다.

현재 버전의 한계 (정직하게 명시):
- 색상 기반 탐지기가 빨강/초록 원(개폐기, S/L쌍)만 잡기 때문에, 변압기·수용가
  아이콘(보라/초록 사각형)은 이 스크립트로 변환되지 않습니다. 01_symbol_detect.py의
  색상 마스크를 확장해야 다음 단계에서 처리 가능합니다.
- 접점 상태(1~4번 단자의 red/green)는 심볼 전체 픽셀만 집계되어 있어 단자별로
  정확히 매핑할 근거가 부족합니다. 그래서 기본값([1,0,1,0])으로 채우고
  needs_review=true 로 표시합니다. 실제 상태는 편집기에서 원본과 대조 후 수정하세요.
- 선(엣지)/단자 연결은 아직 자동 추출되지 않습니다. 노드만 채워지며, 연결은
  편집기의 "단자 연결" 모드로 직접 이어야 합니다.
"""

import json
import os

IN_PATH = "/home/claude/work/symbols_final.json"
OUT_PATH = "/home/claude/work/editor_import.json"

POSITION_SCALE = 1 / 4.0  # 원본 픽셀 좌표가 매우 크므로 편집기 캔버스에 맞게 축소

with open(IN_PATH, encoding="utf-8") as f:
    symbols = json.load(f)

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
        return None  # 화살표/마커류로 추정 - 이번 변환에서는 제외
    return "unknown"  # 분류 애매 - 검수 대상으로 포함

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
skipped = 0
needs_review = 0

for sym in symbols:
    node_type = classify(sym)
    if node_type is None:
        skipped += 1
        continue

    parsed = sym.get("parsed", {})
    device_id = parsed.get("device_id")
    review = False

    if not device_id:
        device_id = f"UNKNOWN_{sym['id']}"
        review = True
    if node_type == "unknown":
        node_type = "switch"  # 편집기에서 바로 다룰 수 있도록 기본은 개폐기로, 이름에 표시
        review = True

    node_id = unique_id(device_id)
    cx, cy = sym["center"]

    node = {
        "id": node_id,
        "type": node_type,
        "specs": parsed.get("specs", []),
        "distance_km": parsed.get("distance_km") if parsed.get("distance_km") is not None else 0,
        "position": {
            "x": round(cx * POSITION_SCALE, 1),
            "y": round(cy * POSITION_SCALE, 1),
        },
        "needs_review": review,
    }
    if node_type in ("switch", "pair_sl"):
        node["state"] = [1, 0, 1, 0] if node_type == "switch" else [1, 1]

    nodes.append(node)
    if review:
        needs_review += 1

output = {
    "meta": {
        "title": "동평택/덕풍 (자동 변환 - 검수 필요)",
        "source": "OCR pipeline v2 -> editor converter",
        "note": "선/엣지는 자동 추출되지 않았습니다. needs_review=true 노드는 원본과 대조 확인하세요.",
    },
    "nodes": nodes,
    "edges": [],
}

with open(OUT_PATH, "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print(f"입력 심볼: {len(symbols)}개")
print(f"제외(마커/노이즈로 추정): {skipped}개")
print(f"변환된 노드: {len(nodes)}개")
print(f"  - 검수 필요(needs_review): {needs_review}개")
print(f"출력: {OUT_PATH}")
