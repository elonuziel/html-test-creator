# Interactive Hebrew Quiz & Study Guides

> **🚀 Try the Generator Now:** The Quiz Generator is live at [https://elonuziel.github.io/html-test-creator/quiz_generator.html](https://elonuziel.github.io/html-test-creator/quiz_generator.html)

This repository contains a modern, interactive web-based quiz application tailored for Hebrew (RTL support) along with guides for study material processing.

## 🚀 Interactive Quiz Application

The web application (`index.html`, `app.js`, `style.css`) is a premium-designed, fully responsive, and accessible interactive quiz interface.

### Features
- **RTL & Hebrew Support**: Built from the ground up for right-to-left layout and Hebrew text.
- **Immediate Feedback Mode**: Optional toggle to check answers instantly.
- **Keyboard Navigation**:
  - `1` to `4` keys to select option answers.
  - Left (`←`) and Right (`→`) arrow keys to navigate questions.
  - `Esc` key to close image zoom.
- **Visual Progress Tracking**: Real-time progress bar and a question jump navigation bar.
- **Dynamic Question Order**: Answers are shuffled/randomized for each question run.
- **Auto-Save & Resume**: Save your progress automatically in LocalStorage to resume later if the tab is closed.
- **Rich Review Screen**: View your score and filter questions by All, Wrong Only, or Unanswered.
- **Responsive Theme**: Dark/Light mode support.

## 📚 Conversion and Extraction Guides

This repository also hosts comprehensive documentation on digitizing and extracting study materials:

1. **[Hebrew PDF Conversion Guide](hebrew_pdf_conversion_guide.md)**: A detailed walkthrough on converting Hebrew PDFs to markdown formats using state-of-the-art tools (e.g., MarkItDown).
2. **[LLM CSV Extraction Guide](llm_csv_extraction_guide.md)**: Guidance on parsing exams and answer keys using LLMs and structured formats (like CSV files).

## 🛠️ Quiz Generator (Implementation Started)

A first implementation pass is now available:
- **[quiz_generator.html](quiz_generator.html)**: Browser UI to upload exam PDF + answers CSV.
- **[generator.js](generator.js)**: Extracts text from PDF pages, parses questions, merges CSV answer keys by form number, and exports `questions.json`.

### Gemini OCR Reliability Note
- The scanned-PDF OCR flow uses Gemini with automatic model fallback.
- If one model becomes unavailable (for example, due to API/version rollout changes), the generator automatically tries the next supported model.
- A 404 model error usually indicates model availability drift, not necessarily a bad passcode.

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
