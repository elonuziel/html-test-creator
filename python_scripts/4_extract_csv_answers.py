import csv
import json
import re
import argparse
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def main():
    parser = argparse.ArgumentParser(description="Extract correct answers from a CSV file based on the form number.")
    parser.add_argument("csv_file", help="Path to the CSV file")
    parser.add_argument("form_num", help="Test form number (e.g. '76' or '63')")
    parser.add_argument("-o", "--output", help="Output JSON file", default="answers.json")
    
    args = parser.parse_args()

    answers_map = {}
    
    try:
        # Use utf-8-sig to handle Windows BOM which commonly breaks CSV parsing
        with open(args.csv_file, 'r', encoding='utf-8-sig') as f:
            reader = csv.reader(f)
            
            headers = []
            
            for row in reader:
                if not row:
                    continue
                
                # Assume headers row contains 'שאלון' (Questionnaire/Form column)
                if 'שאלון' in row[0]:
                    headers = row
                    continue
                
                # If we found the target form row
                if row[0] == args.form_num and headers:
                    for i, cell in enumerate(row):
                        if i >= len(headers):
                            break
                            
                        header_text = headers[i].strip()
                        
                        # Process only columns matching "שאלה X"
                        if header_text.startswith('שאלה'):
                            # Extract the question number from the header
                            q_num_match = re.search(r'\d+', header_text)
                            if not q_num_match:
                                continue
                            q_num = q_num_match.group(0)
                            
                            # Standard format: e.g. "2 (1) [40] {0}" where (1) is the correct answer
                            match = re.search(r'\((\d+)\)', str(cell))
                            if match:
                                answers_map[q_num] = int(match.group(1))
                            elif 'והת' in str(cell) or 'מבוטלת' in str(cell):
                                # Question was cancelled
                                answers_map[q_num] = None
                    break # Stop after finding the first matching form row
                    
    except Exception as e:
        print(f"Error reading CSV: {e}")
        return

    if not answers_map:
        print(f"No answers found for form {args.form_num}. Check if the form number exists in the CSV.")
        return

    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(answers_map, f, ensure_ascii=False, indent=2)

    print(f"Successfully extracted {len(answers_map)} answers to {args.output}")

if __name__ == "__main__":
    main()
