# Guide: Converting Hebrew PDF Exams to Interactive HTML

This document serves as both a **step-by-step runbook** for converting a raw Hebrew PDF test into an interactive web application, and a **lessons-learned manual** documenting the unique challenges of Hebrew PDF extraction.

Provide this document to an AI agent at the start of a new project to guarantee a flawless and fast execution.

---

## Part 1: The Step-by-Step Conversion Runbook

When you receive a new raw Hebrew PDF test, follow these steps in order:

### Step 1: Automated Image Extraction
Do not rely on text extraction tools to grab images. Before doing anything else, run a Python script using `PyMuPDF` (`fitz`) to extract all embedded images (graphs, charts) and save them to an `images/` directory.

### Step 2: The "Vision LLM" Data Extraction (Recommended)
Standard OCR and text extraction (`markitdown`, `PyPDF2`) fail spectacularly on Hebrew PDFs due to RTL/LTR mixing and layout fragmentation (tables break, lines split).
- **Action**: Pass the raw PDF pages as images to a multi-modal Vision LLM (like Gemini 1.5 Pro).
- **Prompt**: *"Extract all questions, multiple-choice options, and tables from this image into a structured JSON array. Keep the Hebrew text in standard logical RTL format. If there is a table, convert it into an HTML table. Return ONLY the JSON."*
- **Result**: You will get a perfectly structured `questions.json` without having to manually reverse text strings or patch broken tables.
- **Fallback Note**: If you must use `markitdown`, be prepared to write a Python script that reverses visual RTL lines (while preserving English blocks via Regex) and manually patch missing/dropped text in the JSON afterward, as `markitdown` frequently separates the option letter (e.g. `א.`) from its text or drops options entirely.

### Step 3: Match Images to Questions
Write a Python script to scan the `questions.json` for keywords like `איור` (illustration), `גרף` (graph), or `תרשים` (diagram). Manually or automatically map the extracted images from Step 1 to the `image` field of the corresponding question objects in the JSON.

### Step 4: Deploy the App Template
Instead of building the UI from scratch, copy the vanilla HTML/JS/CSS scaffolding from a previous project. The template should already include:
- `index.html`: The UI layout.
- `style.css`: Premium styling (Dark/Light mode, glassmorphism, responsive design).
- `app.js`: The engine that fetches `questions.json`, scrambles the answers, handles the "Immediate Feedback" toggle, and calculates the final score.

### Step 5: QA and Run
Start a local server (`python -m http.server 8000`) and test the application in the browser. Verify that images render correctly and tables are properly formatted.

---

## Part 2: Lessons Learned (Why we use the workflow above)

If you attempt to parse the PDF using standard text tools, you will encounter the following severe issues:

1. **Visual vs. Logical RTL**:
   - *Problem*: Tools extract Hebrew text in "visual order" (reversed, left-to-right).
   - *Complication*: Reversing every string `[::-1]` breaks LTR blocks (English words, numbers, dates) and flips brackets `()` into `)(`.

2. **Windows Console Encoding**:
   - *Problem*: Printing parsed Hebrew text to the console throws `UnicodeEncodeError`. The Windows console defaults to cp1252.
   - *Fix*: Always use `sys.stdout.reconfigure(encoding='utf-8')` in Python scripts or pipe output directly to files.

3. **PDF Layout Fragmentation**:
   - *Problem*: Standard text extraction loses the visual context of the document.
     - The answer letter (`א.`) often appears on a separate line from its text.
     - Multiple answer choices merge into the main question block.
     - Tables get completely jumbled into vertical, incoherent columns.
   - *Fix*: This is why **Step 2 (Vision LLM)** is highly recommended. If you must use text extraction, use `PyMuPDF`'s coordinate-based extraction (`fitz.get_page_text("dict")`) to map text chunks visually rather than sequentially.

4. **Markitdown vs. PyMuPDF Extraction Behaviors**:
   - *Problem*: Different tools extract Hebrew text in different directions, requiring completely different programmatic fixes.
   - *Markitdown*: Extracts text in **Visual Order**. The line is backwards, so you must write a script to reverse the characters in the line `[::-1]` while preserving LTR blocks (English/Numbers). It also tends to completely drop text blocks randomly (e.g., entirely missing the options for a question).
   - *PyMuPDF (`fitz`)*: Extracts text in **Logical Order**, but places the logical words in a visual, left-to-right alignment on the page line. For example: `":1 שאלה מספר"`. If you apply a standard string reversal script to this, you will break the words. Instead, you must split the string by spaces and reverse the *order of the words* on the line. However, PyMuPDF is much more reliable at actually capturing all the text on the page without dropping blocks.
