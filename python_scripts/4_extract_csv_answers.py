import argparse
import csv
import json
import re
import sys
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ANSWER_PATTERN = re.compile(r'\((\d+)\)')


def load_rows(input_path):
    suffix = input_path.suffix.lower()

    if suffix in {".xlsx", ".xls"}:
        try:
            import pandas as pd
        except ImportError as exc:
            raise RuntimeError("pandas is required to read Excel answer files. Install pandas and openpyxl, or convert the file to CSV.") from exc

        frame = pd.read_excel(input_path, header=None)
        return frame.fillna("").astype(str).values.tolist()

    with input_path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.reader(handle))


def find_header_row(rows):
    for index, row in enumerate(rows):
        normalized = [str(cell).strip() for cell in row]
        if any(cell == "שאלון" for cell in normalized) and any(cell.startswith("שאלה") for cell in normalized):
            return index, normalized
    return None, []


def parse_answer_cell(cell_value):
    text = str(cell_value).strip()

    if not text:
        return None

    if "מבוטל" in text or "והת" in text:
        return None

    match = ANSWER_PATTERN.search(text)
    if match:
        return int(match.group(1))

    if text.isdigit():
        return int(text)

    return None


def main():
    parser = argparse.ArgumentParser(description="Extract correct answers from a CSV or Excel file based on the form number.")
    parser.add_argument("csv_file", help="Path to the CSV or Excel file")
    parser.add_argument("form_num", help="Test form number (e.g. '76' or '63')")
    parser.add_argument("-o", "--output", help="Output JSON file", default="answers.json")
    
    args = parser.parse_args()

    input_path = Path(args.csv_file)
    if not input_path.exists():
        print(f"Input file not found: {input_path}")
        return 1

    answers_map = {}
    
    try:
        rows = load_rows(input_path)
        header_row_index, headers = find_header_row(rows)

        if header_row_index is None:
            print("Could not find a header row containing both 'שאלון' and 'שאלה'.")
            return 1

        target_row = None
        for row in rows[header_row_index + 1:]:
            if not row:
                continue

            if any(str(cell).strip() == args.form_num for cell in row[:3]):
                target_row = row
                break

        if target_row is None:
            print(f"No answers found for form {args.form_num}. Check if the form number exists in the file.")
            return 1

        for column_index, header_text in enumerate(headers):
            if not header_text.startswith("שאלה"):
                continue

            q_num_match = re.search(r"\d+", header_text)
            if not q_num_match:
                continue

            q_num = q_num_match.group(0)
            if column_index >= len(target_row):
                continue

            parsed_answer = parse_answer_cell(target_row[column_index])
            if parsed_answer is not None:
                answers_map[q_num] = parsed_answer
            elif any(token in str(target_row[column_index]) for token in ("והת", "מבוטל")):
                answers_map[q_num] = None

    except Exception as e:
        print(f"Error reading answers file: {e}")
        return 1

    if not answers_map:
        print(f"No answers found for form {args.form_num}. Check if the form number exists in the CSV.")
        return 1

    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(dict(sorted(answers_map.items(), key=lambda item: int(item[0]))), f, ensure_ascii=False, indent=2)

    print(f"Successfully extracted {len(answers_map)} answers to {args.output}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
