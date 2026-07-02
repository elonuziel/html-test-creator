import re
import json

def is_noise(line):
    noise_words = ["קוד מבחן", "מבחן מס'", "מתוך", "עמוד", "סוף הבחינה", "סוף המבחן", "בהצלחה"]
    return any(w in line for w in noise_words) or not line.strip()

def extract_option_letter(line):
    line_clean = line.strip()
    if not line_clean:
        return None
        
    # Case 1: Letter alone
    if re.match(r'^[א-ה]\.?$', line_clean) or re.match(r'^\.[א-ה]\.?$', line_clean):
        letter = line_clean.replace('.', '')
        return letter, ""
        
    # Case 2: Letter at the very beginning (e.g., "א. כלורופלסטים" or ".א. הורמון")
    m_start = re.match(r'^\.?([א-ה])\.(.*)', line_clean)
    if m_start:
        return m_start.group(1), m_start.group(2).strip()
        
    # Case 3: Letter in the middle (e.g., "(Chloroplasts) א. כלורופלסטים" or "פוטוסינטזה-א. אי")
    m_mid = re.search(r'[\s\-]+([א-ה])\.\s+', line_clean)
    if m_mid:
        letter = m_mid.group(1)
        parts = re.split(r'[\s\-]+[א-ה]\.\s+', line_clean)
        text = " ".join([p.strip() for p in parts if p.strip()]).strip()
        return letter, text

    # Case 4: Letter at the very end with a dot before (e.g., ".3 .א" or "Malate .ה" or "Bacillariophyceae .א")
    # Requiring a dot before the letter ensures we don't accidentally match part of regular Hebrew words
    m_end = re.search(r'^(.*?)\s+\.([א-ה])\.?$', line_clean)
    if m_end:
        text = m_end.group(1).strip()
        letter = m_end.group(2)
        if text.endswith('.'):
            text = text[:-1].strip()
        return letter, text

    return None

def parse_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Split into sections by question marker
    sections = re.split(r':\d+\s+שאלה מספר', content)
    question_blocks = sections[1:]

    parsed_questions = []

    for idx, block in enumerate(question_blocks):
        q_num = idx + 1
        lines = [line.strip() for line in block.split('\n') if line.strip() and not is_noise(line.strip())]
        
        options_dict = {}
        question_text_lines = []
        
        for i, line in enumerate(lines):
            opt = extract_option_letter(line)
            if opt:
                letter, text = opt
                if not text and i > 0:
                    prev_line = lines[i-1]
                    prev_opt = extract_option_letter(prev_line)
                    if not prev_opt:
                        text = prev_line
                        if question_text_lines and question_text_lines[-1] == prev_line:
                            question_text_lines.pop()
                options_dict[letter] = text
            else:
                question_text_lines.append(line)
                
        question_text = " ".join(question_text_lines).strip()
        
        options = []
        expected_letters = ['א', 'ב', 'ג', 'ד', 'ה']
        for l in expected_letters:
            if l in options_dict:
                opt_text = options_dict[l].strip().strip('.').strip()
                options.append(opt_text)
                
        parsed_questions.append({
            "question": question_text,
            "options": options,
            "correctIndex": 0
        })
        
    return parsed_questions

questions = parse_file('tests/2018 a/raw_text.md')
with open('tests/2018 a/questions.json', 'w', encoding='utf-8') as f:
    json.dump(questions, f, ensure_ascii=False, indent=2)

print(f"Successfully wrote {len(questions)} questions to tests/2018 a/questions.json")

