import fitz
import sys
import argparse

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def main():
    parser = argparse.ArgumentParser(description="Detect if a PDF is digital (extractable text) or scanned (images only).")
    parser.add_argument("pdf_file", help="Path to the PDF file")
    parser.add_argument("--pages", type=int, default=3, help="Number of pages to sample")
    parser.add_argument("--min-chars", type=int, default=50, help="Minimum average characters per page to be considered digital")
    
    args = parser.parse_args()

    try:
        doc = fitz.open(args.pdf_file)
    except Exception as e:
        print(f"Error opening PDF: {e}")
        return

    total_chars = 0
    pages_checked = min(args.pages, len(doc))

    if pages_checked == 0:
        print("PDF has no pages.")
        return

    for i in range(pages_checked):
        text = doc[i].get_text().strip()
        total_chars += len(text)

    avg = total_chars / pages_checked
    if avg < args.min_chars:
        print(f"SCANNED PDF detected (avg {avg:.0f} chars/page). You should use Vision LLM or OCR to extract text.")
    else:
        print(f"DIGITAL PDF detected (avg {avg:.0f} chars/page). You can use standard text extraction tools.")

if __name__ == "__main__":
    main()
