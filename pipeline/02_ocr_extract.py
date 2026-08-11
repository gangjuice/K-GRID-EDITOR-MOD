"""
02_ocr_extract.py - 2단계(OCR 텍스트 추출)만 단독 실행하고 싶을 때 사용.
1단계 결과(symbols_raw.json)를 입력으로 받아 텍스트를 채웁니다.

사용법: python3 02_ocr_extract.py <원본.png> <01단계결과.json> [출력.json]
"""
import sys
import os
import json

sys.path.insert(0, os.path.dirname(__file__))
from run_pipeline import ocr_symbols
from PIL import Image
import numpy as np

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    img_path = sys.argv[1]
    symbols_path = sys.argv[2]
    out_path = sys.argv[3] if len(sys.argv) > 3 else "symbols_ocr.json"

    arr = np.array(Image.open(img_path).convert("RGB"))
    with open(symbols_path, encoding="utf-8") as f:
        symbols = json.load(f)

    results = ocr_symbols(arr, symbols, tmp_dir="/tmp/ocr_step2")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"-> {out_path}")
