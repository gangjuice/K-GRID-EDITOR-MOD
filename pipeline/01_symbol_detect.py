"""
01_symbol_detect.py - 1단계(심볼 탐지)만 단독 실행하고 싶을 때 사용.
로직은 run_pipeline.py의 detect_symbols()를 그대로 재사용합니다
(로직을 여러 곳에 복사해두면 한쪽만 고치고 다른 쪽을 놓치는 버그가 생기기 쉬워서
 한 곳에만 구현하고 나머지는 이를 불러다 씁니다).

사용법: python3 01_symbol_detect.py <입력.png> [출력.json]
"""
import sys
import os
import json

sys.path.insert(0, os.path.dirname(__file__))
from run_pipeline import detect_symbols

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    img_path = sys.argv[1]
    out_path = sys.argv[2] if len(sys.argv) > 2 else "symbols_raw.json"
    _, symbols = detect_symbols(img_path)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(symbols, f, ensure_ascii=False, indent=2)
    print(f"-> {out_path} ({len(symbols)}개 심볼)")
