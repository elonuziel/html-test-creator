# Interactive Hebrew Quiz & Study Guides

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

1. **[LLM Runbook](LLM_RUNBOOK.md)**: The end-to-end workflow for turning Hebrew exam PDFs and answer keys into playable quiz folders.
2. **[Python Utilities](python_scripts/README.md)**: Script-by-script usage for the extraction pipeline.

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
