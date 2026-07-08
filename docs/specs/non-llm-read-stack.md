# Non-LLM Image Read Stack (v0.1 target)

## Default path (no model download)

| Layer | Tool | Output |
| --- | --- | --- |
| Container | sharp / libvips | format, dimensions, alpha, orientation |
| Metadata | exiftool-vendored or exifr | EXIF, XMP, IPTC, GPS (redacted in trust report) |
| Embedded text | XMP/IPTC fields | caption, keywords when present |
| OCR | Tesseract (optional adapter) | text + word boxes when no embedded text |
| Codes | zbar wasm / quirc | QR, barcode payload + bbox |
| Regions | classical edges / saliency (optional) | region candidates with bbox only |

## Explicitly not default

- CLIP / LLaVA / GPT-4V captioning
- Open-vocabulary object naming ("a dog on a sofa")
- Generative image Q&A

## Agent Media Twin output

`read_image` returns JSON + optional markdown listing **measurable facts**:
filename, mime, dimensions, color space, metadata fields, OCR lines with bbox,
decoded barcodes, trust warnings (EXIF spoofing, extreme GPS, steganography hints).