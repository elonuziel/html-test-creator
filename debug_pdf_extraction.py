import fitz, re, sys
sys.stdout.reconfigure(encoding='utf-8')

doc = fitz.open('test_1/מועד א ליטורל 2021.pdf')

page_has_image = [bool(page.get_images()) for page in doc]

# Simulate PDF.js + fixHebrewWordOrder pipeline
def fix_hebrew(text):
    return '\n'.join(
        ' '.join(reversed(l.strip().split())) if l.strip() else ''
        for l in text.split('\n')
    )

rawPages = []
for page in doc:
    words = page.get_text('words')
    line_groups = {}
    for w in words:
        x0, y0, word = w[0], w[1], w[4]
        if not word.strip(): continue
        placed = False
        for key in list(line_groups.keys()):
            if abs(key - y0) <= 3:
                line_groups[key].append((x0, word))
                placed = True
                break
        if not placed:
            line_groups[y0] = [(x0, word)]
    page_lines = []
    for y_key in sorted(line_groups.keys()):
        chunks = sorted(line_groups[y_key], key=lambda t: t[0])
        page_lines.append(' '.join(c[1] for c in chunks))
    rawPages.append('\n'.join(page_lines))

# Build filteredLinePageMap
filteredLinePageMap = []
for pageIdx, pageText in enumerate(rawPages):
    processed_lines = [l for l in fix_hebrew(pageText).split('\n') if l.strip()]
    for _ in processed_lines:
        filteredLinePageMap.append(pageIdx)

text = fix_hebrew('\n'.join(rawPages))
lines = [l.strip() for l in text.split('\n') if l.strip()]

# New tighter qPattern
q_pattern = re.compile(r'(?:שאלה\s+(?:מספר\s+)?:?\d+\s*:?|\d+\s*:?\s*מספר\s+שאלה|^\d+\s*[\.\)]\s|^\d+\s*-\s)')
image_keywords = re.compile(r'לפניכם|גרף|תרשים|תמונה|איור|מפה|ציור|דיאגרמה|צילום|מוצג')
ans_pattern = re.compile(r'^([אבגד1-4])\s*[\.]\s*(.*)$|^([אבגד1-4])[)]\s*(.*)$')
noise_pattern = re.compile(r'^עמוד\s+\d+\s+מתוך\s+\d+$')

questions = []
current = None
stateMode = 0

for i, line in enumerate(lines):
    if not line or noise_pattern.match(line) or 'קוד מבחן' in line or 'מבחן מס' in line:
        continue
    rev = ' '.join(reversed(line.split()))
    if q_pattern.search(line) or q_pattern.search(rev):
        if current: questions.append(current)
        current = {'text': [], 'answers': [], 'lineIdx': i}
        stateMode = 1
        continue
    if not current: continue
    m = ans_pattern.match(line) or ans_pattern.match(rev)
    if m:
        stateMode = 2
        current['answers'].append(m.group(1) or m.group(3))
        continue
    if stateMode == 1:
        current['text'].append(line)
    elif stateMode == 2 and current['answers']:
        pass

if current: questions.append(current)

print(f"Total questions parsed: {len(questions)}")
print()
for i, q in enumerate(questions):
    q_text = ' '.join(q['text'])
    page_idx = filteredLinePageMap[q['lineIdx']] if q['lineIdx'] < len(filteredLinePageMap) else -1
    has_kw = bool(image_keywords.search(q_text))
    has_img = page_has_image[page_idx] if page_idx >= 0 else False
    if has_kw:
        print(f"Q{i+1} (lineIdx={q['lineIdx']}, page={page_idx+1}, has_image={has_img}): {q_text[:60]}")
