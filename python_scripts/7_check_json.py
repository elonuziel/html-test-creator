import sys
import json
import argparse

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def main():
    parser = argparse.ArgumentParser(description="QA check for the final questions.json file.")
    parser.add_argument("json_file", help="Path to the questions.json file")
    
    args = parser.parse_args()

    try:
        with open(args.json_file, 'r', encoding='utf-8') as f:
            qs = json.load(f)
    except Exception as e:
        print(f"Error reading JSON: {e}")
        return

    print(f"Total questions: {len(qs)}\n")
    problems = []

    for i, q in enumerate(qs):
        issues = []
        if not q.get('question'):
            issues.append("EMPTY question text")
            
        options = q.get('options', [])
        if len(options) != 4:
            issues.append(f"Wrong option count: {len(options)}")
            
        for j, opt in enumerate(options):
            if not opt:
                issues.append(f"Empty option {j}")
                
        # correctIndex out of range causes a silent app bug
        ci = q.get('correctIndex', 0)
        if ci >= len(options):
            issues.append(f"correctIndex {ci} out of range (only {len(options)} options)")
            
        if issues:
            problems.append((i + 1, issues))

    if not problems:
        print("All questions look good!")
    else:
        print(f"{len(problems)} questions have issues:\n")
        for qnum, issues in problems:
            print(f"  Q{qnum}: {', '.join(issues)}")

if __name__ == "__main__":
    main()
