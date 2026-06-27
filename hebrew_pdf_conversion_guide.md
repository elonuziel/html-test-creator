# Complete Guide: Hebrew PDF Exam → Interactive HTML Quiz

This guide is a **battle-tested runbook** built from two real conversion projects (`project_files/` and `test_2/`). It documents every script, every pitfall, and the exact workflow to go from a raw Hebrew PDF to a working interactive quiz with images, dark mode, and answer shuffling.

Hand this document to an AI agent at the start of a new project for a fast, reliable execution.

---

## Prerequisites

Install the required Python packages once:

```powershell
pip install pymupdf markitdown
```

> **PyMuPDF** (`import fitz`) is the core extraction tool. **markitdown** is a secondary option but has known issues with Hebrew (documented in Part 3).

---

## Part 1: The Canonical 7-Step Workflow

### Step 1 — Extract Embedded Images First

**Do this before any text work.** PDF images live at the `xref` level, not tied to text position. Run this script immediately:

```python
# extract_images.py
import fitz
import os

PDF_FILE = "your_exam.pdf"   # <-- change this

doc = fitz.open(PDF_FILE)
os.makedirs("images", exist_ok=True)

img_count = 0
for i in range(len(doc)):
    for img in doc.get_page_images(i):
        xref = img[0]
        pix = fitz.Pixmap(doc, xref)

        filename = f"images/img_p{i+1}_{img_count}.png"
        if pix.n - pix.alpha > 3:          # CMYK -> RGB conversion
            pix = fitz.Pixmap(fitz.csRGB, pix)

        pix.save(filename)
        pix = None
        print(f"Saved {filename}")
        img_count += 1

print(f"Extracted {img_count} images total.")
```

You will get files named `images/img_p<page>_<counter>.png`. Write down which image belongs to which question now — it is much harder to figure out later.

---

### Step 2 — Extract Text with PyMuPDF (Recommended)

PyMuPDF (`fitz`) extracts text in **logical order**, meaning it captures everything reliably. Run this to dump the full text to a file:

```python
# extract_text_fitz.py
import fitz, sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

PDF_FILE = "your_exam.pdf"   # <-- change this

def reverse_word_order(text):
    """
    PyMuPDF places logical Hebrew words in visual left-to-right order on each line.
    Example raw line:  ":1 שאלה מספר"
    After fix:        "שאלה מספר :1"

    Strategy: reverse the ORDER of words on each line (not the characters within words).
    Do NOT use [::-1] on the full line -- that breaks the Hebrew characters themselves.
    """
    lines = text.split('\n')
    out_lines = []
    for line in lines:
        if not line.strip():
            out_lines.append(line)
            continue
        words = line.split(' ')
        words.reverse()
        out_lines.append(' '.join(words))
    return '\n'.join(out_lines)

doc = fitz.open(PDF_FILE)
full_text = ""
for page in doc:
    full_text += page.get_text() + "\n"

fixed = reverse_word_order(full_text)

out_file = PDF_FILE.replace('.pdf', '_fitz.md')
with open(out_file, 'w', encoding='utf-8') as f:
    f.write(fixed)

print(f"Extracted to {out_file}")
```

**Open the output `.md` file in VS Code** and verify:
- Hebrew reads right-to-left
- Answer letters (`א.`, `ב.`, `ג.`, `ד.`) appear on the same line as their text
- Question headers match pattern: `שאלה מספר 1:`

---

### Step 3 — Parse the Markdown into `questions.json`

This state-machine parser reads the fixed markdown and produces the JSON the app consumes:

```python
# parse_questions.py
import sys, json, re

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

MD_FILE  = "your_exam_fitz.md"    # <-- output from Step 2
OUT_FILE = "questions.json"

Q_PATTERN   = re.compile(r'^שאלה מספר \d+:')
ANS_PATTERN = re.compile(r'^([אבגד])\.(.*)')
NOISE_RE    = re.compile(r"^עמוד \d+ מתוך \d+$")
NOISE_WORDS = ("קוד מבחן", "מבחן מס'")

def is_noise(line):
    return NOISE_RE.match(line) or any(w in line for w in NOISE_WORDS)

def parse(md_file):
    with open(md_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

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
            'correctIndex': 0   # Option 'א' (index 0) is always correct in this exam format
        })

    with open(OUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(formatted, f, ensure_ascii=False, indent=2)

    print(f"Parsed {len(formatted)} questions -> {OUT_FILE}")

if __name__ == '__main__':
    parse(MD_FILE)
```

---

### Step 4 — QA the JSON

**Never skip this.** Text extraction always drops or corrupts some questions:

```python
# check_json.py
import sys, json

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

with open('questions.json', 'r', encoding='utf-8') as f:
    qs = json.load(f)

print(f"Total questions: {len(qs)}\n")
problems = []

for i, q in enumerate(qs):
    issues = []
    if not q['question']:
        issues.append("EMPTY question text")
    if len(q['options']) != 4:
        issues.append(f"Wrong option count: {len(q['options'])}")
    for j, opt in enumerate(q['options']):
        if not opt:
            issues.append(f"Empty option {j}")
    if issues:
        problems.append((i + 1, issues))

if not problems:
    print("All questions look good!")
else:
    print(f"{len(problems)} questions have issues:\n")
    for qnum, issues in problems:
        print(f"  Q{qnum}: {', '.join(issues)}")
```

For each broken question, dump the raw source to inspect it:

```python
# dump_problem_qs.py
import re

PROBLEM_QS = [6, 7, 11]   # <-- question numbers from check_json.py
MD_FILE    = "your_exam_fitz.md"

with open(MD_FILE, 'r', encoding='utf-8') as f:
    text = f.read()

for q_num in PROBLEM_QS:
    pattern = re.compile(
        rf'שאלה מספר {q_num}:.*?(?=שאלה מספר {q_num + 1}:|$)',
        re.DOTALL
    )
    match = pattern.search(text)
    if match:
        print(f"=== Q{q_num} ===")
        print(match.group(0))
```

---

### Step 5 — Patch Broken Questions

After inspecting the raw source, directly fix the JSON:

```python
# fix_json.py
import json

with open('questions.json', 'r', encoding='utf-8') as f:
    qs = json.load(f)

# Q6 (index 5) -- two options were merged into one:
qs[5]['options'][2] = "correct text for option ג"
qs[5]['options'][3] = "correct text for option ד"

# Q11 (index 10) -- question text was dropped:
qs[10]['question'] = "correct question text here"
qs[10]['options'][0] = "correct text for option א"

with open('questions.json', 'w', encoding='utf-8') as f:
    json.dump(qs, f, ensure_ascii=False, indent=2)

print("Patches applied.")
```

---

### Step 6 — Map Images to Questions

Find which questions reference images:

```python
# find_img.py
import json

with open('questions.json', encoding='utf-8') as f:
    qs = json.load(f)

IMAGE_KEYWORDS = ('גרף', 'איור', 'תרשים', 'הבא', 'מפה')

for i, q in enumerate(qs):
    if any(kw in q['question'] for kw in IMAGE_KEYWORDS):
        print(f"Index {i} (Q{i+1}): {q['question'][:70]}...")
```

Then add the image field, cross-referencing with Step 1 filenames:

```python
# add_images.py
import json

with open('questions.json', 'r', encoding='utf-8') as f:
    qs = json.load(f)

qs[3]['image']  = 'images/img_p2_1.png'
qs[4]['image']  = 'images/img_p3_2.png'
qs[19]['image'] = 'images/img_p5_3.png'
qs[31]['image'] = 'images/img_p8_4.png'

with open('questions.json', 'w', encoding='utf-8') as f:
    json.dump(qs, f, ensure_ascii=False, indent=2)

print("Images mapped.")
```

---

### Step 7 — Deploy the HTML App

Copy `index.html`, `style.css`, and `app.js` from a previous project into the new folder. No code changes needed — they read `questions.json` automatically.

Start a local server to test:

```powershell
python -m http.server 8000
# Open http://localhost:8000
```

App features: RTL layout, immediate feedback toggle, answer shuffling, dark/light mode, score screen with conic-gradient circle, full review list.

---

## Part 2: Complete File Structure

```
your_exam_folder/
├── your_exam.pdf               # Original source
├── your_exam_fitz.md           # Raw text dump from PyMuPDF (Step 2)
│
├── extract_images.py           # Step 1
├── extract_text_fitz.py        # Step 2
├── parse_questions.py          # Step 3
├── check_json.py               # Step 4
├── dump_problem_qs.py          # Step 4 debug helper
├── fix_json.py                 # Step 5
├── find_img.py                 # Step 6
├── add_images.py               # Step 6
│
├── questions.json              # Final data (consumed by app.js)
├── index.html
├── style.css
├── app.js
│
└── images/
    ├── img_p2_1.png
    └── ...
```

---

## Part 3: Lessons Learned

### 1. PyMuPDF vs. markitdown

| Feature | PyMuPDF (fitz) | markitdown |
|---|---|---|
| Text completeness | Captures everything | Randomly drops entire option blocks |
| RTL order | Word-level reversal needed | Character-level reversal needed |
| LTR blocks | Words stay intact | English words get reversed char-by-char |
| Tables | Structured extraction possible | Completely scrambled |
| **Recommendation** | **Use this** | Fallback only |

If you must use `markitdown`, you need a character-level reversal + bracket-mirroring + LTR block un-reversal script. See `test_2/reverse_file.py`. The markitdown approach required 2-3 extra scripts and still produced more errors.

### 2. Word-Order vs. Character Reversal — They Are Not The Same

**PyMuPDF** output (words in visual L→R order, each word correct internally):
```
":1 שאלה מספר"
```
Fix: `words.reverse()` → `"שאלה מספר :1"`

**markitdown** output (every single character reversed):
```
":1 הלאש רפסמ"
```
Fix: `line[::-1]`, then un-reverse LTR blocks with regex.

Applying the wrong fix to the wrong tool's output produces garbage. Always match the fix to the tool.

### 3. Windows Console Encoding

Printing any Hebrew string to PowerShell crashes with `UnicodeEncodeError` because the default console encoding is `cp1252`. Add this to the top of every script:

```python
import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
```

### 4. The `א.` Edge Case (Most Common Parsing Bug)

The parser sees `א.` on its own line with no following text, and creates an empty option 0. The actual text was on the previous line, parsed as the end of the question body.

Fix in `parse_questions.py`:
```python
if letter == 'א' and not text and current_q['text']:
    text = current_q['text'].pop()   # rescue text from question body
```

### 5. CMYK Images Must Be Converted

Some PDFs embed CMYK images. Saving them directly will raise an exception. Always check:

```python
if pix.n - pix.alpha > 3:          # more than 3 channels = CMYK
    pix = fitz.Pixmap(fitz.csRGB, pix)
```

### 6. Header/Footer Noise

Every PDF page has a header (`קוד מבחן ...`) and footer (`עמוד X מתוך Y`). These inject into question text if not filtered. The parser skips them with:

```python
NOISE_RE    = re.compile(r"^עמוד \d+ מתוך \d+$")
NOISE_WORDS = ("קוד מבחן", "מבחן מס'")
```

### 7. Expect ~15% of Questions to Need Manual Patches

From two real projects (~35 questions each), expect 5–10 questions with extraction errors:
- **Dropped options**: Tool silently skips a text block.
- **Merged options**: Two answer choices run together without a newline separator.
- **Wrong boundary**: Text from one question bleeds into the next.

`check_json.py` catches wrong option counts. Empty options and bad question text require manually reading the raw dump for that specific question number.

---

## Part 4: The Vision LLM Alternative (Skips Steps 2–5)

For PDFs with complex tables or heavy mixed RTL/LTR content, use a multimodal LLM instead:

**Step A** — Render PDF pages as images:
```python
import fitz
doc = fitz.open("your_exam.pdf")
import os; os.makedirs("pages", exist_ok=True)
for i, page in enumerate(doc):
    pix = page.get_pixmap(dpi=150)
    pix.save(f"pages/page_{i+1}.png")
```

**Step B** — Pass each page image to Gemini 1.5 Pro (or similar) with this prompt:

> *"Extract all questions, multiple-choice options, and tables from this Hebrew exam page into a JSON array. Each element: `{question, options: [string x4], correctIndex: 0}`. Keep Hebrew text in standard logical RTL. Convert any tables to HTML `<table>` tags inside the `question` field. Return ONLY the JSON array."*

**Step C** — Merge per-page JSONs, then go to Step 6 (image mapping) and Step 7 (deploy).

Trade-offs:
- Handles tables perfectly, no RTL issues, no manual patching
- Costs API tokens, requires reviewing for LLM hallucinations

---

## Part 5: App Template Reference

### `questions.json` Schema

```json
[
  {
    "question": "שאלה מספר 1 טקסט כאן",
    "options": [
      "תשובה א — זו התשובה הנכונה",
      "תשובה ב",
      "תשובה ג",
      "תשובה ד"
    ],
    "correctIndex": 0,
    "image": "images/img_p2_1.png"
  }
]
```

- `correctIndex` is always 0 after parsing (option `א` is always correct in this exam format)
- `app.js` shuffles options at load time and tracks the original `id` so correctness is preserved
- `image` is optional; if present, rendered above the question
- `question` can contain HTML (`<table>` tags) — app.js uses `innerHTML`

### `index.html` Key Points

- `<html lang="he" dir="rtl">` — RTL set on root, not per-element
- Google Font: `Rubik` (best Hebrew support available on Google Fonts)
- Three screens: `#setup-screen`, `#quiz-screen`, `#results-screen` — toggled by adding/removing `.active`

### `app.js` Key Behaviours

- **Shuffle**: Fisher-Yates on load. Original option `id` preserved for correct-answer tracking.
- **Immediate Feedback toggle**: Locks question on selection, shows ✓/✗ highlighting + Hebrew message.
- **Navigation**: Prev/Next. Last question replaces "הבא" with "סיום מבחן".
- **Results**: Conic-gradient circle percentage + full answer review with green/red per option.

---

*Derived from two real projects: `project_files/` (מועד א ליטורל 2021) and `test_2/` (ליטורל מועד ב טופס 0).*
