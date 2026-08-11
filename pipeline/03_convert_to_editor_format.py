"""
03_convert_to_editor_format.py - 3단계(편집기 JSON 변환)만 단독 실행하고 싶을 때 사용.
2단계 결과(symbols_ocr.json)를 입력으로 받아 편집기용 JSON을 만듭니다.

사용법: python3 03_convert_to_editor_format.py <02단계결과.json> [출력.json]
"""
import sys
import os
import json

sys.path.insert(0, os.path.dirname(__file__))
from run_pipeline import convert_to_editor

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    symbols_path = sys.argv[1]
    out_path = sys.argv[2] if len(sys.argv) > 2 else "editor_import.json"

    with open(symbols_path, encoding="utf-8") as f:
        symbols = json.load(f)

    title = os.path.splitext(os.path.basename(symbols_path))[0]
    editor_json = convert_to_editor(symbols, title=title)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(editor_json, f, ensure_ascii=False, indent=2)
    print(f"-> {out_path}")
