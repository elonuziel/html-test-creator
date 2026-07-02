import sys
import json
import re
import argparse

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

Q_PATTERN   = re.compile(r'^(שאלה מספר|מספר שאלה)\s*:?\s*\d+:?')
ANS_PATTERN = re.compile(r'^([א-ז])\.(.*)')
NOISE_RE    = re.compile(r"^עמוד \d+ מתוך \d+$")
NOISE_WORDS = ("קוד מבחן", "מבחן מס'")

def is_noise(line):
    return NOISE_RE.match(line) or any(w in line for w in NOISE_WORDS)

def main():
    parser = argparse.ArgumentParser(description="Parse extracted Hebrew Markdown into structured JSON.")
    parser.add_argument("md_file", help="Path to the Markdown file")
    parser.add_argument("-o", "--output", help="Output JSON file", default="questions.json")
    
    args = parser.parse_args()

    try:
        with open(args.md_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()
    except Exception as e:
        print(f"Error reading file: {e}")
        return

    questions = []
    current_q = None
    state = 0   # 0=looking for Q, 1=in question text, 2=in answer options

    for raw_line in lines:
        line = raw_line.strip()
        if not line or is_noise(line):
            continue

        if Q_PATTERN.match(line):
            if current_q:
                questions.append(current_q)
            current_q = {'id': line.replace(':', ''), 'text': [], 'answers': [], 'current_ans_letter': None}
            state = 1
            continue

        if state >= 1:
            m = ANS_PATTERN.match(line)
            if m:
                state = 2
                letter = m.group(1)
                text   = m.group(2).strip()
                # Edge case: 'א.' appears alone; its text was parsed as last line of question
                if letter == 'א' and not text and current_q['text']:
                    text = current_q['text'].pop()
                current_q['answers'].append({'letter': letter, 'text': [text] if text else []})
                current_q['current_ans_letter'] = letter
            else:
                if state == 1:
                    current_q['text'].append(line)
                elif state == 2:
                    current_q['answers'][-1]['text'].append(line)

    if current_q:
        questions.append(current_q)

    formatted = []
    for q in questions:
        formatted.append({
            'question':     " ".join(q['text']).strip(),
            'options':      [" ".join(a['text']).strip() for a in q['answers']],
            'correctIndex': 0   # Placeholder, should be updated by answer key
        })

    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(formatted, f, ensure_ascii=False, indent=2)

    print(f"Parsed {len(formatted)} questions -> {args.output}")

if __name__ == '__main__':
    main()
