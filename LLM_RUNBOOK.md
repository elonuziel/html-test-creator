# LLM Runbook: Extracting Hebrew Exams into Interactive HTML Quizzes

This document is the definitive guide for an LLM (like yourself!) to convert a Hebrew PDF exam and an accompanying answer key (Excel/CSV) into a structured `questions.json` for the interactive web app.

**You do NOT need to write any extraction code from scratch.** All the necessary utilities are already written and located in the `python_scripts/` directory. Your job is to invoke them, orchestrate the output, and handle edge cases.

## The Goal
To create a `questions.json` file inside a new test folder (e.g., `tests/2022_moed_b`) alongside an optional `images/` directory.

## Prerequisite: Environment Setup
Ensure the required libraries are installed:
```bash
pip install pymupdf pandas openpyxl
```

---

## Step 1: Detect PDF Type
Run the detector script on the provided PDF:
```bash
python python_scripts/1_detect_pdf_type.py "path/to/exam.pdf"
```
It will output whether the PDF is a **Digital PDF** (extractable text) or a **Scanned PDF** (images only).

---

## Step 2: Extract Questions (Digital PDF Path)
If the PDF is Digital, you can automate text extraction.

**2A. Extract Raw Text**
Use PyMuPDF to extract the text and automatically fix the Hebrew word-order reversal issue:
```bash
python python_scripts/2_extract_text_fitz.py "path/to/exam.pdf" -o "raw_text.md"
```

**2B. Parse to JSON**
Parse the raw text markdown into a structured JSON:
```bash
python python_scripts/5_parse_questions_md.py "raw_text.md" -o "questions.json"
```

---

## Step 2 Alternative: Extract Questions (Scanned PDF Path)
If the PDF is scanned (or has heavily complex diagrams that break digital extraction), you must render it to images.

**2A. Render Pages**
```bash
python python_scripts/3_render_pdf_pages.py "path/to/exam.pdf" -o "pages_output"
```
**2B. Manual / LLM Transcription**
You must read the generated images, extract the questions and options manually (using your vision capabilities), and format them into the `questions.json` structure:
```json
[
  {
    "question": "כותרת השאלה...",
    "options": ["תשובה 1", "תשובה 2", "תשובה 3", "תשובה 4"],
    "correctIndex": 0,
    "image": "images/q1_graph.png" 
  }
]
```

---

## Step 3: Extract the Answer Key

You will usually be provided with an Answer Key file (e.g. `answers.csv` or `answers.xlsx`).

### Scenario A: Standard CSV
If it's a standard CSV, use the provided script:
```bash
python python_scripts/4_extract_csv_answers.py "answers.csv" "FORM_NUMBER" -o "answers.json"
```

### Scenario B: Tomamix / TTP Excel Exports (`.xls` or `.xlsx`)
If the file is an Excel export from Tomamix, it often has the following quirks:
1. **Header Row Location:** The column headers (like `שאלון` and `שאלה 1`) are usually **not on the first row** (often row 5 or 6).
2. **Cell Format:** Cells look like `3 (2) [15] {4}`. The correct answer is the integer inside the parentheses `()`.

Because it is an Excel file, `4_extract_csv_answers.py` will not work directly unless you convert it to CSV first. Alternatively, you can write a short Pandas script to extract it:
> **⚠️ WARNING FOR PANDAS:** Do not assume `header=0`. You must dynamically scan the rows to find the row containing the string `שאלון` and use that as the header row. Map cancelled questions (e.g. cells containing `והת` or `מבוטלת`) to `null`. Save the output as `answers.json` structured like `{"1": 3, "2": null, "3": 1...}`.

---

## Step 4: Merge Answers
Merge the extracted `answers.json` into the `questions.json` to populate the `correctIndex` fields:
```bash
python python_scripts/6_merge_json_answers.py "questions.json" "answers.json" -o "final_questions.json"
```
*(Note: `correctIndex` in `questions.json` is 0-indexed, meaning Option 1 = 0, Option 2 = 1, etc.)*

---

## Step 5: QA & Finalization
Run the QA script to catch dropped options or out-of-bounds indices:
```bash
python python_scripts/7_check_json.py "final_questions.json"
```

If everything passes:
1. Create a directory for the exam: `mkdir -p tests/test_name`
2. Move `final_questions.json` into the directory and rename it to `questions.json`.
3. Move any extracted images into `tests/test_name/images/`.
4. The test is now playable at `http://localhost:8000/web/index.html?test=tests/test_name`!
