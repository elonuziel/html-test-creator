# Python Utilities for PDF to HTML Interactive Quiz

This folder contains the Python pipeline for extracting Hebrew exam PDFs into the interactive HTML format used by this project.

## Prerequisites
```bash
pip install pymupdf pandas openpyxl
```

`pandas` and `openpyxl` are only needed if you plan to read Excel answer keys with `4_extract_csv_answers.py`.

## The Workflow

The scripts are numbered in the order you would typically use them.

### 1. `1_detect_pdf_type.py`
Determines if a PDF is a Digital PDF (has extractable text) or a Scanned PDF (images only). 
**Usage:** `python 1_detect_pdf_type.py "exam.pdf"`

### 2. Digital PDF Path (if Step 1 is Digital)
Use these scripts to extract text and parse it:

**A. `2_extract_text_fitz.py`**
Extracts the text using PyMuPDF and fixes the Hebrew word-order reversal issue automatically.
**Usage:** `python 2_extract_text_fitz.py "exam.pdf" -o "raw_text.md"`

**B. `5_parse_questions_md.py`**
Parses the generated Markdown file into a structured `questions.json` file.
**Usage:** `python 5_parse_questions_md.py "raw_text.md" -o "questions.json"`

### 3. Scanned PDF Path (if Step 1 is Scanned)
Use these scripts to render the PDF to images and extract text manually (via Vision LLMs or manual transcription).

**A. `3_render_pdf_pages.py`**
Renders a PDF to PNG images per page.
**Usage:** `python 3_render_pdf_pages.py "exam.pdf" -o "pages"`

*After rendering, use an LLM or manual transcription to create `questions.json` with the text and options.*

### 4. Answer Extraction and Merging

**A. `4_extract_csv_answers.py`**
Extracts the correct answers for a specific exam form from the master student answers CSV or Excel export.
The script scans for the row containing `שאלון` and handles the `3 (2) [15] {4}`-style cell format.
**Usage:** `python 4_extract_csv_answers.py "answers.xlsx" "76" -o "answers.json"`
*(Where "76" is the test form number)*

**B. `6_merge_json_answers.py`**
Merges the extracted answers from the CSV with the raw questions JSON (which might just have `correctIndex: 0` placeholders) and updates the `correctIndex` accordingly.
**Usage:** `python 6_merge_json_answers.py "questions.json" "answers.json" -o "final_questions.json"`

### 5. Quality Assurance

**`7_check_json.py`**
Checks the final JSON file for dropped options, empty questions, or out-of-bounds `correctIndex` values. Run this before deploying!
**Usage:** `python 7_check_json.py "final_questions.json"`
