import fitz
import os
import argparse

def main():
    parser = argparse.ArgumentParser(description="Render PDF pages as images (useful for Scanned PDFs).")
    parser.add_argument("pdf_file", help="Path to the PDF file")
    parser.add_argument("-o", "--outdir", help="Output directory for images", default="pages")
    parser.add_argument("--dpi", type=int, default=150, help="DPI for the rendered images")
    
    args = parser.parse_args()

    try:
        doc = fitz.open(args.pdf_file)
    except Exception as e:
        print(f"Error opening PDF: {e}")
        return

    os.makedirs(args.outdir, exist_ok=True)
    
    for i, page in enumerate(doc):
        pix = page.get_pixmap(dpi=args.dpi)
        filename = os.path.join(args.outdir, f"page_{i+1}.png")
        pix.save(filename)
        print(f"Saved {filename}")

    print(f"Rendered {len(doc)} pages to '{args.outdir}' directory.")

if __name__ == "__main__":
    main()
