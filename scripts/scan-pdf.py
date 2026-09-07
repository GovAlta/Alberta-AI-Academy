import fitz
doc = fitz.open('C:/_LOCALdata/AI Academy Site/Masterclass PDF/AI-Academy-Masterclass-Presentation.pdf')
for i in range(len(doc)):
    text = doc[i].get_text()[:300].replace('\n', ' ').strip()
    print(f'--- Page {i+1} --- {text}')
