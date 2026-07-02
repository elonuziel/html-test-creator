# Complete Guide: Hebrew PDF Exam → Interactive HTML Quiz

This guide is a **battle-tested runbook** built from three real conversion projects (`project_files/`, `test_2/`, and `test_3/`). It documents every script, every pitfall, and the exact workflow to go from a raw Hebrew PDF to a working interactive quiz with images, dark mode, and answer shuffling.

Hand this document to an AI agent at the start of a new project for a fast, reliable execution.

---

## Quick Start Checklist

For repeat use — tick each step off as you go. Full details in Part 1.

- [ ] Copy `index.html`, `style.css`, `app.js` from the repo root into the new exam folder
- [ ] **Run `detect_pdf_type.py`** — determines if the PDF is digital or scanned (see Step 0)
  - If **digital** → follow Steps 1–7 below
  - If **scanned** → skip to **Part 4 (Vision LLM path)** directly
- [ ] Run `extract_images.py` — note which image belongs to which question
- [ ] **Ask the user**: "How are correct answers indicated in this PDF?" (see Step 3)
- [ ] Run `extract_text_fitz.py` → inspect the output `.md` file
- [ ] Run `parse_questions.py` → produces `questions.json`
- [ ] Run `check_json.py` — fix any issues found
- [ ] Run `dump_problem_qs.py` for each broken question → patch with `fix_json.py`
- [ ] Run `find_img.py` → run `add_images.py` to map images
- [ ] Double-click `run_quiz.bat` (or `python -m http.server 8000` **from inside the exam folder**) and verify in browser
- [ ] Ctrl+Shift+R (hard refresh) if questions.json looks stale in the browser

---

## Prerequisites

Install the required Python packages once:

```powershell
pip install pymupdf markitdown
```

> **PyMuPDF** (`import fitz`) is the core extraction tool. **markitdown** is a secondary option but has known issues with Hebrew (documented in Part 3).
>
> **What is markitdown?** It is a Microsoft tool that converts a PDF to Markdown via pdfminer under the hood. Invoke it from the command line: `markitdown your_exam.pdf > output.md`, or from Python: `from markitdown import MarkItDown; md = MarkItDown(); print(md.convert("your_exam.pdf").text_content)`. The output `.md` file is what you then pass to `parse_questions.py`. Note: unlike PyMuPDF, markitdown extracts text in **visual (character-reversed) order**, requiring a different reversal script.

---

## Part 1: The Canonical 7-Step Workflow

### Step 0 — Detect PDF Type (Digital vs Scanned)

**Do this first — it determines your entire workflow.** A scanned PDF contains only rasterised page images with no extractable text. Running `fitz.get_text()` on it produces an empty string, and the output Markdown will be blank. The script reports "Extracted to file.md" successfully but the file is just empty lines — there is no error message to warn you.

```python
# detect_pdf_type.py
import fitz, sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

PDF_FILE = "your_exam.pdf"   # <-- change this
SAMPLE_PAGES = 3             # pages to check (first N pages)
MIN_CHARS_PER_PAGE = 50      # threshold: fewer chars → treat as scanned

doc = fitz.open(PDF_FILE)
total_chars = 0
pages_checked = min(SAMPLE_PAGES, len(doc))

for i in range(pages_checked):
    text = doc[i].get_text().strip()
    total_chars += len(text)

avg = total_chars / pages_checked
if avg < MIN_CHARS_PER_PAGE:
    print(f"SCANNED PDF detected (avg {avg:.0f} chars/page). Use Part 4 (Vision LLM path).")
else:
    print(f"DIGITAL PDF detected (avg {avg:.0f} chars/page). Use the standard Steps 1–7.")
```

> **If SCANNED**: Stop here and go directly to **Part 4**. The Vision LLM path handles scanned PDFs completely — it renders pages as images and extracts all text via a multimodal model. Steps 1–5 will produce empty or garbage output on a scanned PDF.
>
> **If DIGITAL**: Continue with Step 1 below.

---

### Step 1 — Extract Embedded Images First

**Do this before any text work.** PDF images live at the `xref` level, not tied to text position. Run this script immediately:

> ⚠️ **Scanned PDFs behave differently here.** `get_page_images()` extracts images embedded *within* the PDF at the `xref` level. For a **digital PDF**, this yields individual charts and figures. For a **scanned PDF**, it returns one large rasterised image per page (the scan itself) — not individual figures. If you see one image per page with identical dimensions matching the page size, you have a scanned PDF — stop and switch to Part 4.


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

> **⚠ Stop — Ask the user about correct answers before continuing**
>
> Before running the parser (or starting Step 3 at all), ask the user:
>
> *"How are the correct answers indicated in this exam PDF? For example:*
> *- The first answer option (א) is always correct*
> *- The correct answers are listed in a separate Excel or answer-key file*
> *- The correct answers are printed at the end of the PDF*
> *- Some other format — please describe"*
>
> Then act on their response:
>
> | User says | What to do |
> |---|---|
> | "First option is always correct" | Leave `'correctIndex': 0` as-is in the parser. No extra work needed. |
> | "Excel / answer key file" | After parsing, add a step that reads the Excel (use `openpyxl`) and sets `qs[i]['correctIndex']` per question before saving `questions.json`. See snippet below. |

After parsing, run this to populate `correctIndex` from an Excel answer key:

> **💡 Note for Tomamix / TTP Exports:** If your answer key is a Tomamix export containing `שאלון` and `3 (2) [15] {4}` formatted cells, refer to `llm_csv_extraction_guide.md` for the extraction logic instead of the simple A/B/C/D mapping below.

```python
# apply_answer_key.py
# Excel format assumed: Column A = question number (1-based), Column B = correct letter (א/ב/ג/ד)
import json, openpyxl

LETTER_TO_INDEX = {'א': 0, 'ב': 1, 'ג': 2, 'ד': 3}
EXCEL_FILE = "answer_key.xlsx"   # <-- change this

wb = openpyxl.load_workbook(EXCEL_FILE)
ws = wb.active

with open('questions.json', 'r', encoding='utf-8') as f:
    qs = json.load(f)

for row in ws.iter_rows(min_row=2, values_only=True):   # skip header row
    q_num, correct_letter = row[0], row[1]
    if q_num and correct_letter:
        idx = int(q_num) - 1   # convert 1-based to 0-based
        letter = str(correct_letter).strip()
        if idx < len(qs) and letter in LETTER_TO_INDEX:
            qs[idx]['correctIndex'] = LETTER_TO_INDEX[letter]
        else:
            print(f"WARNING: Q{q_num} letter '{letter}' not recognised")

with open('questions.json', 'w', encoding='utf-8') as f:
    json.dump(qs, f, ensure_ascii=False, indent=2)

print("correctIndex values applied from answer key.")
```

> Install openpyxl if needed: `pip install openpyxl`
> | "At the end of the PDF" | Use PyMuPDF to extract the last page(s), parse the answer table, and populate `correctIndex` per question. Do this before running `parse_questions.py`. |
> | Other | Discuss with the user and implement accordingly. |
>
> The app shuffles displayed options but tracks the **original array index**, so `correctIndex` must always be the pre-shuffle position in the `options` array.
>
> **💡 Alternative — Frontend Adaptation:** If you prefer not to manipulate the source data at all, you can leave `answers.json` as 1-based and instead adjust the JavaScript evaluation in `app.js`:
> ```javascript
> const isCorrect = (selectedId + 1) === correctId;
> ```
> This approach keeps the raw data untouched and is useful when you want a single `answers.json` to remain readable without knowing the app's internal indexing scheme.

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
    # correctIndex out of range causes a silent app bug — nothing can ever be correct
    ci = q.get('correctIndex', 0)
    if ci >= len(q['options']):
        issues.append(f"correctIndex {ci} out of range (only {len(q['options'])} options)")
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

#### Option A — Double-click launcher (recommended)

Create a `run_quiz.bat` file inside the exam folder. **Use a unique port for each exam folder** to avoid collisions with other running servers:

```bat
@echo off
echo Starting local web server...
start http://localhost:8001
python -m http.server 8001
```

> ⚠️ **Port collision is a silent failure.** If another server is already running on your chosen port, the new one silently fails to start. The browser still opens — but it connects to the *other* server and serves the wrong `questions.json`. The quiz shows "שאלה 1 מתוך 0" or the wrong questions. **Prevention**: assign a different port number to every exam subfolder (`8001` for the first, `8002` for the second, etc.) and write it permanently in that folder's `run_quiz.bat`.

#### Option B — Manual

```powershell
python -m http.server 8000
# Open http://localhost:8000
```

App features: RTL layout, immediate feedback toggle, answer shuffling, dark/light mode, score screen with conic-gradient circle, full review list.

#### Cache-busting in `app.js`

The app fetches `questions.json` on startup. If the browser has cached a previous (empty or wrong) version of the file, the quiz will show "שאלה 1 מתוך 0" even after the file is fixed. The root-folder `app.js` template already includes a timestamp query parameter to prevent this:

```javascript
fetch('questions.json?v=' + new Date().getTime())
```

If you copy `app.js` from an older project that lacks this line, add it. Hard-refreshing (`Ctrl+Shift+R`) is a manual alternative but less reliable than the code fix.

---

## Part 2: Complete File Structure

```
# Root folder — copy these once, reuse for every exam:
# index.html, style.css, app.js  (enhanced versions with all enhancements)
#
# Per-exam project folder (create a new subfolder for each PDF):
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

## Common Mistakes

These are the top errors seen across all real projects. Check this list before debugging.

| Mistake | Symptom | Fix |
|---|---|---|
| Skipping Step 0 on a scanned PDF | `extract_text_fitz.py` produces an empty `.md` file; `parse_questions.py` yields 0 questions | Run `detect_pdf_type.py` first — if scanned, go to Part 4 immediately |
| Running `python -m http.server` from the wrong directory | Browser shows 404 for `questions.json` | `cd` into the exam folder first, then run the server |
| Port already in use by another exam's server | Browser opens but shows 0 questions or wrong questions | Use a unique port per exam folder — see Step 7, Option A |
| Browser caching stale `questions.json` | Changes to the JSON don't appear | Ensure `app.js` uses the `?v=timestamp` cache-bust fetch; or press **Ctrl+Shift+R** |
| Running `get_page_images()` on a scanned PDF | One large full-page image per page instead of individual charts | Scanned PDFs embed page scans as a single image; use `get_pixmap()` + LLM crop instead |
| Using character reversal (`[::-1]`) on PyMuPDF output | Hebrew text looks correct but words are in wrong order | PyMuPDF needs **word-order** reversal, not character reversal — see Part 3 §2 |
| Forgetting `sys.stdout.reconfigure(encoding='utf-8')` | `UnicodeEncodeError` when printing Hebrew | Add to the top of every Python script that prints Hebrew text |
| Answer letter `א.` on its own line | First option is empty in `questions.json` | The parser handles this with the `pop()` edge case — verify your parser has it |
| Saving a CMYK image directly with PyMuPDF | `fitz.Pixmap.save()` raises an exception | Always check `pix.n - pix.alpha > 3` and convert to RGB before saving |
| Setting `correctIndex` without asking the user first | Wrong answers marked correct | **Always ask** — do not assume `correctIndex: 0` for unfamiliar PDFs |
| Editing `questions.json` directly in VS Code without UTF-8 encoding | Hebrew characters corrupted on save | Check bottom-right status bar shows **UTF-8** before saving |

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

### 7. `ensure_ascii=False` is Mandatory in `json.dump`

Every script in this guide writes JSON with `json.dump(..., ensure_ascii=False, indent=2)`. The `ensure_ascii=False` argument is **not optional**. Without it, Python's default behaviour escapes every non-ASCII character to a Unicode escape sequence:

```json
// With ensure_ascii=True (default — DO NOT USE)
{"question": "\u05e9\u05d0\u05dc\u05d4 \u05de\u05e1\u05e4\u05e8 1"}

// With ensure_ascii=False (correct)
{"question": "שאלה מספר 1"}
```

The escaped form technically works in the app, but makes `questions.json` completely unreadable for debugging and manual patching — which you will definitely need to do.

### 8. Expect ~15% of Questions to Need Manual Patches

From two real projects (~35 questions each), expect 5–10 questions with extraction errors:
- **Dropped options**: Tool silently skips a text block.
- **Merged options**: Two answer choices run together without a newline separator.
- **Wrong boundary**: Text from one question bleeds into the next.

`check_json.py` catches wrong option counts. Empty options and bad question text require manually reading the raw dump for that specific question number.

### 9. Scanned PDFs: `get_text()` Returns Empty String Without Warning (test_3)

`fitz.get_text()` returns an empty string for scanned PDFs, and the extraction script still exits successfully — it just writes a blank Markdown file. There is no error. The symptom only appears later when `parse_questions.py` reports "Parsed 0 questions".

**Root cause**: The file had no digital text layer — it was a camera/scanner image of exam pages embedded in a PDF wrapper.

**Better fix**: Run `detect_pdf_type.py` (Step 0) first. If average characters per page < 50, abort and go to Part 4 immediately. Do not let the pipeline continue past Step 0 on a scanned PDF.

### 10. Port Collision Causes Silent Wrong-Folder Serving (test_3)

A `python -m http.server 8000` process was already running in the repo root. When `run_quiz.bat` (for `test_3/`) tried to bind to port 8000, the OS silently rejected the bind — no error printed. The browser opened `http://localhost:8000` and hit the *root folder's* server, which served the root's `questions.json` (empty at the time). The quiz showed "שאלה 1 מתוך 0".

**Why it's hard to debug**: Both symptoms (empty `questions.json` and wrong-port serving) produce identical UI — "0 questions". There is no visible indication of which problem you have.

**Better fix**: Assign a unique port per exam subfolder and hardcode it in `run_quiz.bat`. The root folder uses 8000; subfolders use 8001, 8002, 8003, etc. This is a one-time decision — write it in `run_quiz.bat` and never change it.

### 11. Browser Caches Empty `questions.json` Permanently (test_3)

The first pipeline run wrote an empty `questions.json` (0 questions array). The browser cached it. After the file was corrected, `Ctrl+Shift+R` partially helped but was not fully reliable. The permanent fix is the `?v=timestamp` cache-bust in `app.js`:

```javascript
fetch('questions.json?v=' + new Date().getTime())
```

This forces a fresh request on every page load. The root-folder `app.js` template now includes this. Older copies of `app.js` in `project_files/` and `test_2/` do **not** have this line — update them if you reuse those copies.

---


## Part 4: The Vision LLM Alternative (Mandatory for Scanned PDFs; Optional for Digital)

Use this path when:
- The PDF is **scanned** (Step 0 detected it), OR
- The PDF has complex tables or heavy mixed RTL/LTR content that trips up the text parser

**Step A** — Render PDF pages as images:
```python
import fitz
doc = fitz.open("your_exam.pdf")
import os; os.makedirs("pages", exist_ok=True)
for i, page in enumerate(doc):
    pix = page.get_pixmap(dpi=150)
    pix.save(f"pages/page_{i+1}.png")
print(f"Rendered {len(doc)} pages.")
```

> **`get_pixmap()` vs `get_page_images()`**: `get_page_images()` extracts images embedded *within the PDF data stream* at the `xref` level. For a scanned PDF, this means one big page scan per page — not individual charts. `get_pixmap()` renders the visible page as it appears on screen at a configurable DPI. **Always use `get_pixmap()` for the Vision LLM path**, regardless of whether the PDF is digital or scanned.

**Step B** — Pass each page image to Gemini 1.5 Pro (or similar) with this prompt:

> *"Extract all questions, multiple-choice options, and tables from this Hebrew exam page into a JSON array. Each element: `{question, options: [string x4], correctIndex: 0}`. Keep Hebrew text in standard logical RTL. Convert any tables to HTML `<table>` tags inside the `question` field. Return ONLY the JSON array."*
>
> **Note on `correctIndex`**: The prompt above sets `correctIndex: 0` as a placeholder. Before merging the JSONs, apply the same answer-key logic you established with the user in Step 3 (first option always correct / Excel file / end-of-PDF table). If the user said "first option always", leave it as 0. Otherwise, patch `correctIndex` values using the same `fix_json.py` approach as Step 5.

**Step C** — Merge per-page JSONs:

```python
# merge_pages.py
import json, os, glob

all_questions = []
for path in sorted(glob.glob('pages/page_*.json')):
    with open(path, encoding='utf-8') as f:
        all_questions.extend(json.load(f))

with open('questions.json', 'w', encoding='utf-8') as f:
    json.dump(all_questions, f, ensure_ascii=False, indent=2)

print(f"Merged {len(all_questions)} questions from {len(glob.glob('pages/page_*.json'))} pages.")
```

**Step D** — If the user said the answer key is not "first option always", apply `apply_answer_key.py` from Step 3 now (before Step 6). Otherwise leave `correctIndex: 0` as set by the LLM.

**Step E** — Then continue to Step 6 (image mapping) and Step 7 (deploy).

> ⚠️ **Scanned PDFs: Do NOT attempt to hardcode image bounding boxes.**
>
> On a scanned page, multiple questions share the same page image. It is tempting to use `fitz.Rect` to crop a precise bounding box around a diagram, but this is **extremely fragile** — pixel offsets vary between PDFs, and even small mistakes cut off axis labels, answer text, or part of the diagram itself.
>
> **Recommended approach for scanned image questions:**
> 1. Export the **entire page** as a high-resolution image with `page.get_pixmap(dpi=150)`.
> 2. Reference that full-page image in `questions.json` (`"image": "images/page7_full.png"`).
> 3. Inject **[Cropper.js](https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.1/cropper.min.js)** into the web app and add a "Crop Image" button below each question image.
> 4. When clicked, open the full page in a modal where the user draws their own crop box. Use HTML5 Canvas to replace the full-page image with their precise crop.
>
> This approach is more robust than any automated script because the user sees exactly what they are cropping and can adjust in real time. The crop is stored in memory (JavaScript object) for the duration of the session. See `test_4/` for a complete working implementation.

Trade-offs:
- Handles tables perfectly, no RTL issues, no manual patching
- Costs API tokens, requires reviewing for LLM hallucinations

---

## Part 5: App Template Files

The three ready-to-use template files live in the **root of this repository**. Copy them into each new exam project folder. No code changes required — they read `questions.json` automatically.

| File | Description |
|---|---|
| [`index.html`](index.html) | RTL Hebrew UI — jump bar, zoom overlay, review filters, resume button |
| [`style.css`](style.css) | Full light/dark theme, glassmorphism navbar, all component styles |
| [`app.js`](app.js) | Quiz engine — shuffle, keyboard nav, localStorage, jump bar, image zoom, review filter |

Only change the `<title>` tag and the `.logo` text in `index.html` to match the exam name.

### `questions.json` Schema

```json
[
  {
    "question": "טקסט השאלה כאן (may contain HTML <table> tags)",
    "options": [
      "תשובה א — האינדקס שמוגדר ב-correctIndex הוא זה הנכון",
      "תשובה ב",
      "תשובה ג",
      "תשובה ד"
    ],
    "correctIndex": 0,
    "image": "images/img_p2_1.png"
  }
]
```

- `correctIndex` — the **pre-shuffle** index of the correct answer (see the ⚠ note in Step 3 for how to determine this)
- `image` — optional; if present, rendered above the question with click-to-zoom
- `question` — rendered as `innerHTML`, so HTML is supported (tables, `<br>`, `<b>` etc.)
- The app shuffles `options` on every quiz start but tracks each option's original `id`, so `correctIndex` always refers to the original array position

### `app.js` Key Behaviours

- **Shuffle**: Fisher-Yates on load. Each option gets an `id` equal to its original index.
- **Jump bar**: Re-renders on every navigation. Grey = unanswered, green = correct, red = wrong, filled = current.
- **Keyboard**: `1`–`4` select options · `←`/`→` navigate · `Esc` closes zoom overlay.
- **localStorage**: Saves `{answers, index}` on every selection under key `quiz_answers_v1`. A "Resume" button appears on the setup screen if a saved session matches the current question count.
- **Immediate Feedback**: When toggled on, selecting an answer locks the question and shows ✓/✗ styling + Hebrew message.
- **Results**: Conic-gradient score circle + filterable review list (All / Wrong / Unanswered).


## Part 6: Enhancements

The root-folder template (`index.html`, `style.css`, `app.js`) already implements the high-priority items listed below. Items marked ✅ are live; items marked 🔲 are still pending.

> **Note**: The templates in the **root folder** are the enhanced versions. The copies in `project_files/` and `test_2/` are the original, unmodified versions kept for reference.

These improvements are recommended for future versions, ordered by impact vs. effort.

### High Priority

| Status | Enhancement | Notes |
|---|---|---|
| ✅ | **Keyboard navigation** | Keys `1`–`4` select options · `←`/`→` arrows navigate questions · `Esc` closes zoom |
| ✅ | **Question jump bar** | Row of numbered circles at top · grey = unanswered · green = correct · red = wrong · highlighted = current |
| ✅ | **`localStorage` answer persistence** | Answers saved on every selection · "Resume" button appears on setup screen if a previous session exists |
| ✅ | **Image zoom** | Click any question image to open fullscreen overlay · click again or press Esc to close |
| ✅ | **Review filters** | "הכל / שגויות בלבד / לא נענו" filter buttons on the results screen |
| ✅ | **Keyboard shortcut hints on options** | Each option shows its `1`–`4` key as a small label |
| 🔲 | **Answer-key parser** | `correctIndex` handling is now a user conversation step (Step 3 asks the user). An Excel parser using `openpyxl` still needs to be written per-project when the answer key is in a spreadsheet. |

### Medium Priority (not yet implemented)

| Enhancement | Implementation Hint |
|---|---|
| **Exam timer** | Countdown from configurable minutes in navbar. Auto-submit on expiry. |
| **Export results to CSV** | `Blob` + `URL.createObjectURL`: columns `Q#, question, selected, correct, right/wrong` |
| **Table styling in question HTML** | The `.quiz-table` CSS class exists. Ensure LLM/parser wraps tables with `class="quiz-table"` |
| **Multi-correct-answer support** | Add `correctIndices: [0, 2]` to schema; switch options to `<input type="checkbox">` for those questions |

### Low Priority / Nice-to-Have (not yet implemented)

| Enhancement | Implementation Hint |
|---|---|
| **Configurable question count** | Number input on setup screen; slice the shuffled array to N questions |
| **VS Code workspace file** | `.code-workspace` with UTF-8 default encoding + RTL support enabled |
| **markitdown fallback script** | Wrapper combining markitdown + `reverse_file.py` character-level reversal into one script |

### Script Improvements (still pending)

- **`parse_questions.py`**: Add a `--strict` flag that errors (instead of silently producing empty options) if a question has fewer than 4 options. Surfaces problems in the pipeline, not during browser testing.
- **`check_json.py`**: ~~Add a check for `correctIndex >= len(options)`~~ — ✅ already added to the script in Step 4.
- **`extract_text_fitz.py`**: Add a `--dict` mode flag using `page.get_text("dict")`. Returns individual text spans with bounding boxes, enabling coordinate-based grouping that handles complex multi-column layouts better than plain text extraction.
- **`add_images.py`**: Auto-list the `images/` directory and prompt the user/agent to confirm each mapping, rather than requiring hardcoded index-to-filename pairs.

---

*Last updated: 2026-06-27. Built from three real Litoral oceanography exam projects (`project_files/`, `test_2/`, `test_3/`).*
