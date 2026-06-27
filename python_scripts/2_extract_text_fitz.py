import fitz
import sys
import os
import argparse

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def main():
    parser = argparse.ArgumentParser(description="Extract raw text from a Digital PDF and fix Hebrew word order.")
    parser.add_argument("pdf_file", help="Path to the PDF file")
    parser.add_argument("-o", "--output", help="Path to the output Markdown file", default=None)
    
    args = parser.parse_args()

    try:
        doc = fitz.open(args.pdf_file)
    except Exception as e:
        print(f"Error opening PDF: {e}")
        return

    full_text = ""
    for page in doc:
        full_text += page.get_text() + "\n"

    # Fix Hebrew word order (PyMuPDF outputs logical Hebrew words in visual left-to-right order on each line)
    lines = full_text.split('\n')
    out_lines = []
    for line in lines:
        if not line.strip():
            out_lines.append(line)
            continue
        words = line.split(' ')
        words.reverse()
        out_lines.append(' '.join(words))
    
    fixed_text = '\n'.join(out_lines)

    out_file = args.output
    if not out_file:
        out_file = os.path.splitext(args.pdf_file)[0] + '_extracted.md'

    with open(out_file, 'w', encoding='utf-8') as f:
        f.write(fixed_text)

    print(f"Successfully extracted and fixed Hebrew text to {out_file}")

if __name__ == "__main__":
    main()
