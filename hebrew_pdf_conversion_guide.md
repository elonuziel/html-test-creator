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

> **`correctIndex` Convention — specific to these Litoral exam PDFs**: In the PDFs in `project_files/` and `test_2/`, the correct answer is **always option `א` (aleph), index 0 in the options array**, so the parser hardcodes `'correctIndex': 0` for every question. **This is NOT universally true for all Hebrew PDF exams.** If you are working with a different PDF where the correct answer varies per question, you must either:
> - Parse an answer-key appendix at the end of the PDF to populate `correctIndex` per question, or
> - Manually set `correctIndex` in `fix_json.py` for each question after inspecting the original PDF.
>
> The app shuffles displayed options but tracks the **original array index** of each option, so `correctIndex` must always reflect the pre-shuffle position.

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

> **How to use**: Copy these three files directly into every new exam project folder. No modifications needed — they read from questions.json automatically. Only change the <title> and the logo text in index.html to match the exam name.

---

### index.html

`html
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Interactive Exam</title>
    <link rel="stylesheet" href="style.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;700&display=swap" rel="stylesheet">
</head>
<body>
    <header class="navbar">
        <div class="logo">מבחן אינטראקטיבי</div>
        <div class="controls">
            <label class="toggle">
                <span class="toggle-label">משוב מיידי</span>
                <div class="toggle-wrapper">
                    <input type="checkbox" id="immediate-feedback-toggle">
                    <span class="slider"></span>
                </div>
            </label>
            <button id="theme-toggle" class="icon-btn" aria-label="Toggle theme">
                <svg id="theme-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
            </button>
        </div>
    </header>

    <main class="container">
        <!-- Setup Screen -->
        <div id="setup-screen" class="screen active">
            <div class="welcome-card">
                <h1>מוכנים להתחיל?</h1>
                <p>השאלות נטענו בהצלחה. סדר התשובות מעורבב בכל שאלה.</p>
                <div class="start-actions">
                    <button id="start-btn" class="primary-btn lg-btn">התחל מבחן</button>
                </div>
            </div>
        </div>

        <!-- Quiz Screen -->
        <div id="quiz-screen" class="screen">
            <div class="progress-container">
                <div class="progress-bar" id="progress-bar"></div>
            </div>
            
            <div class="quiz-card">
                <div class="question-header">
                    <span id="question-counter" class="badge">שאלה 1 מתוך X</span>
                </div>
                
                <div class="question-container">
                    <h2 id="question-text">טוען שאלה...</h2>
                    <img id="question-image" src="" alt="Question Image" class="hidden">
                    <div id="options-container" class="options-list">
                        <!-- Options injected here -->
                    </div>
                </div>

                <div id="feedback-message" class="feedback-message hidden">
                    <!-- Correct/Incorrect message injected here -->
                </div>

                <div class="navigation">
                    <button id="prev-btn" class="secondary-btn" disabled>הקודם</button>
                    <button id="next-btn" class="primary-btn">הבא</button>
                    <button id="submit-btn" class="success-btn hidden">סיום מבחן</button>
                </div>
            </div>
        </div>

        <!-- Results Screen -->
        <div id="results-screen" class="screen">
            <div class="results-header">
                <h1>תוצאות המבחן</h1>
                <div class="score-card">
                    <div class="score-circle">
                        <span id="final-score">0%</span>
                    </div>
                    <p id="score-text">ענית נכונה על 0 מתוך 0 שאלות.</p>
                </div>
                <button id="restart-btn" class="primary-btn">התחל מחדש</button>
            </div>
            
            <h2 class="review-title">סקירת תשובות</h2>
            <div id="review-container" class="review-list">
                <!-- Review items injected here -->
            </div>
        </div>
    </main>

    <script src="app.js"></script>
</body>
</html>

`

---

### style.css

`css
:root {
    /* Light Theme (Default) */
    --bg-color: #f8fafc;
    --surface-color: #ffffff;
    --text-primary: #0f172a;
    --text-secondary: #64748b;
    --primary-color: #3b82f6;
    --primary-hover: #2563eb;
    --success-color: #10b981;
    --success-bg: #d1fae5;
    --error-color: #ef4444;
    --error-bg: #fee2e2;
    --border-color: #e2e8f0;
    --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    --glass-bg: rgba(255, 255, 255, 0.8);
    --glass-border: rgba(255, 255, 255, 0.3);
    
    --option-bg: #f1f5f9;
    --option-hover: #e2e8f0;
    --option-selected: #bfdbfe;
    --option-selected-border: #3b82f6;
}

[data-theme="dark"] {
    /* Dark Theme */
    --bg-color: #0f172a;
    --surface-color: #1e293b;
    --text-primary: #f8fafc;
    --text-secondary: #94a3b8;
    --primary-color: #60a5fa;
    --primary-hover: #3b82f6;
    --success-color: #34d399;
    --success-bg: rgba(16, 185, 129, 0.2);
    --error-color: #f87171;
    --error-bg: rgba(239, 68, 68, 0.2);
    --border-color: #334155;
    --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.3);
    --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -1px rgba(0, 0, 0, 0.2);
    --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.3);
    --glass-bg: rgba(30, 41, 59, 0.8);
    --glass-border: rgba(255, 255, 255, 0.1);
    
    --option-bg: #334155;
    --option-hover: #475569;
    --option-selected: rgba(59, 130, 246, 0.3);
    --option-selected-border: #60a5fa;
}

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    font-family: 'Rubik', system-ui, -apple-system, sans-serif;
}

body {
    background-color: var(--bg-color);
    color: var(--text-primary);
    transition: background-color 0.3s ease, color 0.3s ease;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
}

/* Navbar */
.navbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 2rem;
    background: var(--glass-bg);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border-color);
    position: sticky;
    top: 0;
    z-index: 100;
}

.logo {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--primary-color);
}

.controls {
    display: flex;
    align-items: center;
    gap: 1.5rem;
}

/* Toggles and Buttons */
.toggle {
    display: flex;
    align-items: center;
    cursor: pointer;
    gap: 0.5rem;
}

.toggle-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
}

.toggle-wrapper {
    position: relative;
    width: 44px;
    height: 24px;
}

.toggle-wrapper input {
    opacity: 0;
    width: 0;
    height: 0;
}

.slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #cbd5e1;
    transition: .4s;
    border-radius: 34px;
}

.slider:before {
    position: absolute;
    content: "";
    height: 18px;
    width: 18px;
    left: 4px;
    bottom: 3px;
    background-color: white;
    transition: .4s;
    border-radius: 50%;
}

input:checked + .slider {
    background-color: var(--primary-color);
}

input:checked + .slider:before {
    transform: translateX(18px);
}

[data-theme="dark"] .slider {
    background-color: #475569;
}
[data-theme="dark"] input:checked + .slider {
    background-color: var(--primary-color);
}

.icon-btn {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem;
    border-radius: 50%;
    transition: background-color 0.2s ease, color 0.2s ease;
}

.icon-btn:hover {
    background-color: var(--option-bg);
    color: var(--primary-color);
}

/* Main Container */
.container {
    flex: 1;
    max-width: 800px;
    margin: 0 auto;
    width: 100%;
    padding: 2rem 1rem;
    display: flex;
    flex-direction: column;
}

/* Screens */
.screen {
    display: none;
    animation: fadeIn 0.4s ease-out forwards;
}

.screen.active {
    display: block;
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}

/* Setup Screen */
.welcome-card {
    background: var(--surface-color);
    padding: 3rem 2rem;
    border-radius: 1rem;
    box-shadow: var(--shadow-lg);
    text-align: center;
    border: 1px solid var(--border-color);
}

.welcome-card h1 {
    font-size: 2rem;
    margin-bottom: 1rem;
    color: var(--text-primary);
}

.welcome-card p {
    color: var(--text-secondary);
    margin-bottom: 2rem;
    font-size: 1.125rem;
}

/* Buttons */
.primary-btn, .secondary-btn, .success-btn {
    padding: 0.75rem 1.5rem;
    border-radius: 0.5rem;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
}

.primary-btn {
    background-color: var(--primary-color);
    color: white;
    box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.4);
}

.primary-btn:hover {
    background-color: var(--primary-hover);
    transform: translateY(-1px);
    box-shadow: 0 6px 8px -1px rgba(59, 130, 246, 0.5);
}

.primary-btn:active {
    transform: translateY(0);
}

.secondary-btn {
    background-color: var(--surface-color);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
}

.secondary-btn:hover:not(:disabled) {
    background-color: var(--option-hover);
}

.secondary-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.success-btn {
    background-color: var(--success-color);
    color: white;
}

.success-btn:hover {
    filter: brightness(0.95);
}

.lg-btn {
    padding: 1rem 2rem;
    font-size: 1.125rem;
}

.hidden {
    display: none !important;
}

/* Quiz Screen */
.progress-container {
    width: 100%;
    height: 8px;
    background-color: var(--border-color);
    border-radius: 4px;
    margin-bottom: 2rem;
    overflow: hidden;
}

.progress-bar {
    height: 100%;
    background-color: var(--primary-color);
    width: 0%;
    transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.quiz-card {
    background: var(--surface-color);
    border-radius: 1rem;
    box-shadow: var(--shadow-md);
    padding: 2rem;
    border: 1px solid var(--border-color);
}

.badge {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    background-color: var(--option-bg);
    color: var(--text-secondary);
    border-radius: 9999px;
    font-size: 0.875rem;
    font-weight: 500;
    margin-bottom: 1.5rem;
}

.question-container h2 {
    font-size: 1.5rem;
    line-height: 1.5;
    margin-bottom: 2rem;
    color: var(--text-primary);
}

#question-image {
    max-width: 100%;
    height: auto;
    border-radius: 0.5rem;
    margin-bottom: 2rem;
    border: 1px solid var(--border-color);
}

.quiz-table {
    width: 100%;
    border-collapse: collapse;
    margin: 1.5rem 0;
    text-align: right;
}

.quiz-table th, .quiz-table td {
    border: 1px solid var(--border-color);
    padding: 0.75rem;
}

.quiz-table th {
    background-color: var(--option-bg);
    font-weight: 600;
}

.options-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 2rem;
}

.option {
    padding: 1rem 1.25rem;
    border: 2px solid var(--border-color);
    border-radius: 0.75rem;
    background-color: var(--surface-color);
    color: var(--text-primary);
    font-size: 1.05rem;
    line-height: 1.4;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    position: relative;
    overflow: hidden;
}

.option:hover:not(.disabled) {
    background-color: var(--option-hover);
    border-color: var(--text-secondary);
}

.option.selected {
    background-color: var(--option-selected);
    border-color: var(--option-selected-border);
}

.option.correct {
    background-color: var(--success-bg) !important;
    border-color: var(--success-color) !important;
}

.option.incorrect {
    background-color: var(--error-bg) !important;
    border-color: var(--error-color) !important;
}

.option.disabled {
    cursor: default;
    opacity: 0.8;
}

.feedback-message {
    padding: 1rem;
    border-radius: 0.5rem;
    margin-bottom: 1.5rem;
    font-weight: 500;
    text-align: center;
    animation: fadeIn 0.3s ease-out;
}

.feedback-message.success {
    background-color: var(--success-bg);
    color: var(--success-color);
    border: 1px solid var(--success-color);
}

.feedback-message.error {
    background-color: var(--error-bg);
    color: var(--error-color);
    border: 1px solid var(--error-color);
}

.navigation {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid var(--border-color);
    padding-top: 1.5rem;
    margin-top: 1rem;
}

/* Results Screen */
.results-header {
    background: var(--surface-color);
    border-radius: 1rem;
    box-shadow: var(--shadow-md);
    padding: 3rem 2rem;
    text-align: center;
    border: 1px solid var(--border-color);
    margin-bottom: 2rem;
}

.results-header h1 {
    font-size: 2rem;
    margin-bottom: 2rem;
}

.score-circle {
    width: 150px;
    height: 150px;
    border-radius: 50%;
    background: conic-gradient(var(--primary-color) 0%, var(--option-bg) 0%);
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 1.5rem;
    position: relative;
}

.score-circle::before {
    content: '';
    position: absolute;
    inset: 10px;
    background-color: var(--surface-color);
    border-radius: 50%;
}

.score-circle span {
    position: relative;
    font-size: 2.5rem;
    font-weight: 700;
    color: var(--text-primary);
}

#score-text {
    font-size: 1.25rem;
    color: var(--text-secondary);
    margin-bottom: 2rem;
}

.review-title {
    font-size: 1.5rem;
    margin-bottom: 1.5rem;
    padding: 0 1rem;
}

.review-list {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
}

.review-item {
    background: var(--surface-color);
    border-radius: 0.75rem;
    padding: 1.5rem;
    box-shadow: var(--shadow-sm);
    border: 1px solid var(--border-color);
}

.review-question {
    font-weight: 700;
    font-size: 1.125rem;
    margin-bottom: 1rem;
}

.review-option {
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    margin-bottom: 0.5rem;
    background-color: var(--option-bg);
}

.review-option.correct {
    background-color: var(--success-bg);
    border: 1px solid var(--success-color);
}

.review-option.incorrect {
    background-color: var(--error-bg);
    border: 1px solid var(--error-color);
}

`

---

### pp.js

`javascript
document.addEventListener('DOMContentLoaded', () => {
    // State
    let questions = [];
    let currentQuestionIndex = 0;
    let userAnswers = []; // stores objects { selectedOptionId, isCorrect }
    let isImmediateFeedback = false;
    let theme = localStorage.getItem('theme') || 'light';
    
    // DOM Elements
    const setupScreen = document.getElementById('setup-screen');
    const quizScreen = document.getElementById('quiz-screen');
    const resultsScreen = document.getElementById('results-screen');
    
    const startBtn = document.getElementById('start-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const submitBtn = document.getElementById('submit-btn');
    const restartBtn = document.getElementById('restart-btn');
    
    const questionCounter = document.getElementById('question-counter');
    const questionText = document.getElementById('question-text');
    const questionImage = document.getElementById('question-image');
    const optionsContainer = document.getElementById('options-container');
    const progressBar = document.getElementById('progress-bar');
    const feedbackMessage = document.getElementById('feedback-message');
    
    const themeToggle = document.getElementById('theme-toggle');
    const feedbackToggle = document.getElementById('immediate-feedback-toggle');
    const themeIcon = document.getElementById('theme-icon');

    // Theme initialization
    function setTheme(newTheme) {
        theme = newTheme;
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        
        if (theme === 'dark') {
            themeIcon.innerHTML = '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>';
        } else {
            themeIcon.innerHTML = '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path>';
        }
    }
    setTheme(theme);

    themeToggle.addEventListener('click', () => {
        setTheme(theme === 'light' ? 'dark' : 'light');
    });

    feedbackToggle.addEventListener('change', (e) => {
        isImmediateFeedback = e.target.checked;
    });

    // Fetch Data
    fetch('questions.json')
        .then(response => response.json())
        .then(data => {
            // Pre-process: shuffle options but remember the correct one
            questions = data.map(q => {
                const options = q.options.map((optText, index) => ({
                    id: index, // index 0 is always correct originally
                    text: optText
                }));
                // Shuffle options
                for (let i = options.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [options[i], options[j]] = [options[j], options[i]];
                }
                return {
                    ...q,
                    options
                };
            });
        })
        .catch(err => console.error("Error loading questions:", err));

    // Start Quiz
    startBtn.addEventListener('click', () => {
        userAnswers = new Array(questions.length).fill(null);
        currentQuestionIndex = 0;
        switchScreen(setupScreen, quizScreen);
        renderQuestion();
    });

    // Navigation
    nextBtn.addEventListener('click', () => {
        if (currentQuestionIndex < questions.length - 1) {
            currentQuestionIndex++;
            renderQuestion();
        }
    });

    prevBtn.addEventListener('click', () => {
        if (currentQuestionIndex > 0) {
            currentQuestionIndex--;
            renderQuestion();
        }
    });

    submitBtn.addEventListener('click', () => {
        switchScreen(quizScreen, resultsScreen);
        renderResults();
    });

    restartBtn.addEventListener('click', () => {
        switchScreen(resultsScreen, setupScreen);
    });

    function switchScreen(from, to) {
        from.classList.remove('active');
        to.classList.add('active');
    }

    function renderQuestion() {
        const q = questions[currentQuestionIndex];
        const answered = userAnswers[currentQuestionIndex];
        
        questionCounter.textContent = `שאלה ${currentQuestionIndex + 1} מתוך ${questions.length}`;
        questionText.innerHTML = q.question;
        
        if (q.image) {
            questionImage.src = q.image;
            questionImage.classList.remove('hidden');
        } else {
            questionImage.classList.add('hidden');
            questionImage.src = '';
        }
        
        // Update Progress Bar
        const progress = ((currentQuestionIndex) / questions.length) * 100;
        progressBar.style.width = `${progress}%`;

        // Hide feedback
        feedbackMessage.classList.add('hidden');
        feedbackMessage.className = 'feedback-message hidden';
        
        // Navigation buttons state
        prevBtn.disabled = currentQuestionIndex === 0;
        if (currentQuestionIndex === questions.length - 1) {
            nextBtn.classList.add('hidden');
            submitBtn.classList.remove('hidden');
        } else {
            nextBtn.classList.remove('hidden');
            submitBtn.classList.add('hidden');
        }

        // Render Options
        optionsContainer.innerHTML = '';
        q.options.forEach(option => {
            const btn = document.createElement('div');
            btn.className = 'option';
            
            // Clean up the 'א.', 'ב.', etc. from the text if it's still there
            // Usually we want to present clean text, but let's just show it as is.
            btn.textContent = option.text;
            
            // Restore previous state if answered
            if (answered) {
                if (answered.selectedOptionId === option.id) {
                    btn.classList.add('selected');
                }
                
                // If immediate feedback is on and question is answered, show right/wrong styling
                if (isImmediateFeedback) {
                    btn.classList.add('disabled');
                    if (option.id === q.correctIndex) {
                        btn.classList.add('correct');
                    } else if (answered.selectedOptionId === option.id) {
                        btn.classList.add('incorrect');
                    }
                }
            }

            btn.addEventListener('click', () => handleOptionSelect(option.id, btn, q.correctIndex));
            optionsContainer.appendChild(btn);
        });

        // Show immediate feedback message if already answered
        if (answered && isImmediateFeedback) {
            showFeedbackMessage(answered.isCorrect);
        }
    }

    function handleOptionSelect(selectedId, btnElement, correctId) {
        const answered = userAnswers[currentQuestionIndex];
        
        // If already answered in immediate feedback mode, lock it.
        if (isImmediateFeedback && answered) return;

        const isCorrect = selectedId === correctId;
        userAnswers[currentQuestionIndex] = { selectedOptionId: selectedId, isCorrect };

        // Update UI for options
        const allOptions = optionsContainer.querySelectorAll('.option');
        allOptions.forEach(opt => opt.classList.remove('selected'));
        btnElement.classList.add('selected');

        if (isImmediateFeedback) {
            // Apply correct/incorrect classes
            allOptions.forEach(opt => opt.classList.add('disabled'));
            const q = questions[currentQuestionIndex];
            
            // Re-render essentially to apply correct/incorrect classes reliably
            renderQuestion();
        }
    }

    function showFeedbackMessage(isCorrect) {
        feedbackMessage.classList.remove('hidden');
        if (isCorrect) {
            feedbackMessage.textContent = 'תשובה נכונה! כל הכבוד.';
            feedbackMessage.classList.add('success');
        } else {
            feedbackMessage.textContent = 'תשובה שגויה.';
            feedbackMessage.classList.add('error');
        }
    }

    function renderResults() {
        const correctCount = userAnswers.filter(a => a && a.isCorrect).length;
        const total = questions.length;
        const percentage = Math.round((correctCount / total) * 100);

        document.getElementById('final-score').textContent = `${percentage}%`;
        document.getElementById('score-text').textContent = `ענית נכונה על ${correctCount} מתוך ${total} שאלות.`;

        // Update circle gradient
        const circle = document.querySelector('.score-circle');
        circle.style.background = `conic-gradient(var(--primary-color) ${percentage}%, var(--option-bg) 0%)`;

        // Render Review
        const reviewContainer = document.getElementById('review-container');
        reviewContainer.innerHTML = '';

        questions.forEach((q, i) => {
            const answer = userAnswers[i];
            const div = document.createElement('div');
            div.className = 'review-item';
            
            let html = `<div class="review-question">${i + 1}. ${q.question}</div>`;
            
            q.options.forEach(opt => {
                let className = 'review-option';
                if (opt.id === q.correctIndex) {
                    className += ' correct';
                } else if (answer && answer.selectedOptionId === opt.id) {
                    className += ' incorrect';
                }
                html += `<div class="${className}">${opt.text}</div>`;
            });

            if (!answer) {
                html += `<div class="review-option incorrect">לא נענה</div>`;
            }

            div.innerHTML = html;
            reviewContainer.appendChild(div);
        });
    }
});

`



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

- `correctIndex` is always 0 **for these Litoral exam PDFs** — option `א` is always correct. For other PDFs this may vary; set it manually per question if needed.
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

---

## Part 6: Suggested Enhancements

These improvements are recommended for future versions, ordered by impact vs. effort.

### High Priority

| Enhancement | Why | Implementation Hint |
|---|---|---|
| **Answer-key parser** | `correctIndex: 0` is hardcoded for Litoral PDFs only. A real answer key parser makes the guide reusable for any exam | Parse a table at the end of the PDF, or a separate answer-key PDF page, using PyMuPDF's `get_text("dict")` for coordinate-based extraction |
| **Keyboard navigation** | Significantly speeds up using the quiz | `document.addEventListener('keydown', ...)`: `1`–`4` select options, `ArrowRight`/`ArrowLeft` for next/prev, `Enter` to confirm |
| **Question jump bar** | Essential once question count exceeds ~15 | A horizontal row of numbered buttons at the top; answered = filled dot, unanswered = empty. Click to jump. |
| **`localStorage` answer persistence** | Lose browser tab → lose all progress | Serialize `userAnswers` to `localStorage` on every selection. Restore on page load. |

### Medium Priority

| Enhancement | Why | Implementation Hint |
|---|---|---|
| **Exam timer** | Simulate real test conditions | Countdown from configurable minutes. Display in navbar. Auto-submit when time expires. |
| **Question filtering in review** | Long review screens are hard to navigate | Toggle buttons: "All", "Wrong only", "Unanswered only". Filter `review-list` children. |
| **Export results** | Study tracking across attempts | `Blob` + `URL.createObjectURL` to download a CSV: `Q#, question, selected, correct, right/wrong` |
| **Table styling in HTML questions** | `app.js` uses `innerHTML`, so HTML tables in `question` field render — but they need CSS | The `.quiz-table` class is already defined in `style.css`; just ensure the LLM/parser wraps tables with `class="quiz-table"` |

### Low Priority / Nice-to-Have

| Enhancement | Why | Implementation Hint |
|---|---|---|
| **Multi-correct-answer support** | Some exam formats have "all of the above" or checkbox questions | Add `correctIndices: [0, 2]` to schema; switch option rendering to `<input type="checkbox">` for those questions |
| **Configurable question count** | Study a random subset of N questions from a large bank | Add a number input to the setup screen; slice the shuffled questions array |
| **Image zoom on click** | Graphs and maps are often hard to read at card width | CSS `position: fixed; z-index: 999` overlay on image click; close on second click or Escape |
| **VS Code workspace file** | Speeds up agent/human QA | A `.code-workspace` file that opens the exam folder with UTF-8 as default encoding and enables RTL display |
| **Markitdown extraction path as fallback script** | The guide documents it conceptually but doesn't provide a ready script | A `extract_text_markitdown.py` wrapper that runs markitdown + the character-level reversal from `test_2/reverse_file.py` in one step |

### Script Improvements

- **`parse_questions.py`**: Add a `--strict` flag that raises an error (instead of silently creating empty options) if a question has fewer than 4 options after parsing. This surfaces problems during the pipeline instead of in the QA step.
- **`check_json.py`**: Add a check for questions where `correctIndex >= len(options)` — this crashes the app silently.
- **`extract_text_fitz.py`**: Add `page.get_text("dict")` mode as an optional flag. The `"dict"` mode returns individual text spans with their bounding boxes, which enables coordinate-based grouping that handles complex multi-column layouts better than plain text extraction.
- **`add_images.py`**: Instead of hardcoded index-to-filename mapping, auto-match by listing `images/` directory and prompting the user or agent to confirm the mapping. Reduces one manual step.
