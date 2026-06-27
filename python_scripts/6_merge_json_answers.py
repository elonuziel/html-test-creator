import json
import argparse
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def main():
    parser = argparse.ArgumentParser(description="Merge questions.json with an answers.json file mapping.")
    parser.add_argument("questions_file", help="Path to the questions.json file")
    parser.add_argument("answers_file", help="Path to the answers.json file (from CSV extraction)")
    parser.add_argument("-o", "--output", help="Output JSON file", default="questions_merged.json")
    
    args = parser.parse_args()

    try:
        with open(args.questions_file, 'r', encoding='utf-8') as f:
            questions = json.load(f)
            
        with open(args.answers_file, 'r', encoding='utf-8') as f:
            answers = json.load(f)
            
    except Exception as e:
        print(f"Error reading files: {e}")
        return
        
    updated = 0
    for i, q in enumerate(questions):
        question_num = str(i + 1)
        if question_num in answers and answers[question_num] is not None:
            # Assuming answers.json uses 1-based indexing for answers (e.g. 1-4)
            # The HTML app uses 0-based indexing for the correct option
            ans_idx = answers[question_num] - 1
            q['correctIndex'] = ans_idx
            updated += 1
            
    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)
        
    print(f"Successfully updated correctIndex for {updated}/{len(questions)} questions in {args.output}")

if __name__ == '__main__':
    main()
