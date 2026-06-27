# Implementation Plan: Web-Based Interactive Quiz Generator

This plan describes how to build a web-based client-side quiz generator. The generator will allow users to upload an exam PDF and answer CSV, extract text and answers, preview the result, and export a self-contained interactive HTML quiz file.

---

## User Review Required

> [!IMPORTANT]
> The proposed tool runs **completely client-side**. This means it does not require a backend server. 
> To support PDF parsing in the browser, we will load **PDF.js** from a standard CDN (`cdnjs.cloudflare.com`).
> The exported file will be a **single, self-contained HTML file** containing all HTML, CSS, JS, and questions data, making it easy to open and run offline.

---

## Proposed Changes

### Central Builder UI & Logic

We will add a new builder tool to the root workspace.

#### [NEW] [quiz_generator.html](file:///c:/Users/elon/Documents/GitHub/test/quiz_generator.html)
A modern, user-friendly webpage designed with the same look and feel (RTL, Dark/Light modes, custom typography) as the main quiz application.
- **File Upload Areas**: Drag-and-drop zones for the exam PDF and CSV files.
- **Gemini API Key Input (Optional)**: A secure input field (saved to local storage) to provide an API key for automatic AI parsing of scanned PDFs.
- **Passcode Protection (Encrypted API Key)**: The application will support a hardcoded, AES-encrypted API key. A "Passcode" modal will prompt the user to enter a shared password. The JS will use this password to decrypt the API key in memory, allowing safe, backend-free sharing of the tool without exposing the raw API key in the source code.
- **Interactive Preview & Edit Area**: Displays parsed questions in a card list, letting the user verify text, options, and correctness, and edit them on screen before exporting.
- **Actions**:
- **"Run Parse"**: Performs PDF text extraction (digital) or falls back to Gemini API (scanned) and merges the CSV.
- **"Download Self-Contained Quiz"**: Compiles the template into a single download.
- **"Take Quiz Now"**: Runs the quiz immediately in a modal or new tab.

#### [NEW] [generator.js](file:///c:/Users/elon/Documents/GitHub/test/generator.js)
The logic engine that runs in the browser:
- **PDF Text Extractor / Renderer**: Uses `pdfjs-dist` to fetch page text. If a scanned PDF is detected (no text content), it uses HTML5 Canvas to render the pages to images, encodes them as Base64, and sends them to the Gemini API using the provided API Key.
- **Hebrew Order Corrector**: Automatically processes Hebrew text line-by-line, splitting and reversing word order to resolve reversed visual layout (matching `2_extract_text_fitz.py`).
- **Regex Question Parser**: Parses text into questions and answers matching the format of `שאלה מספר \d+:` and options `א.`, `ב.`, `ג.`, `ד.` (matching `5_parse_questions_md.py`).
- **CSV Parser**: Splits the CSV file into rows, matches the selected Form row, extracts answers of the form `(X)`, and converts them to 0-based indices (matching `4_extract_csv_answers.py` and `6_merge_json_answers.py`).
- **Template Compiler**: Inlines the template code of `index.html`, `style.css`, and `app.js` with the newly generated `questions` array directly into a downloadable HTML blob.

---

## Verification Plan

### Manual Verification
1. Open [quiz_generator.html](file:///c:/Users/elon/Documents/GitHub/test/quiz_generator.html) in the browser.
2. Upload `test_1/מועד א ליטורל 2021.pdf` and a sample student answers CSV.
3. Input the form number.
4. Click **Run Parse** and verify that all questions and correct answers are extracted correctly in the preview panel.
5. Click **Download Self-Contained Quiz** and verify that the downloaded HTML file opens, renders perfectly, and allows completing the quiz successfully offline.
