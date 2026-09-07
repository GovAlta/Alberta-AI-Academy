"""
read-pdf-pages.py — Read specific pages from the Masterclass PDF

Usage:
  py scripts/read-pdf-pages.py <start_page> <end_page>
  py scripts/read-pdf-pages.py 9 11       # reads pages 9, 10, 11 (1-indexed)

Requires: pip install pymupdf
PDF location: C:/_LOCALdata/AI Academy Site/Masterclass PDF/AI-Academy-Masterclass-Presentation.pdf
"""
import sys
import fitz  # PyMuPDF

PDF_PATH = 'C:/_LOCALdata/AI Academy Site/Masterclass PDF/AI-Academy-Masterclass-Presentation.pdf'

if len(sys.argv) < 3:
    print("Usage: py scripts/read-pdf-pages.py <start_page> <end_page>")
    print("       Pages are 1-indexed.")
    sys.exit(1)

start = int(sys.argv[1])
end = int(sys.argv[2])

doc = fitz.open(PDF_PATH)
for i in range(start - 1, end):  # convert to 0-indexed
    print(f'\n===== PAGE {i + 1} =====')
    print(doc[i].get_text())
