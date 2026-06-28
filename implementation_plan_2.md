# Add Gemini Native PDF & Google Vision OCR

This plan details the addition of two new OCR pathways while keeping the existing Gemini Image Chunking logic as the default.

## User Review Required

> [!WARNING]
> **API Key Compatibility**
> 
> The embedded passcode (`Ocean2026`) unlocks a **Gemini API Key**. This key will **NOT** work for Google Cloud Vision. If you select Google Cloud Vision from the dropdown, you MUST input a valid Google Cloud API key (with the Cloud Vision API enabled) into the "API Key / Passcode" input box.

> [!IMPORTANT]
> **Gemini Native PDF Page Boundaries**
>
> When using Gemini Native PDF Upload (Option 1), we send the entire PDF to Gemini directly. While this is significantly faster and uses less quota, Gemini is occasionally unreliable at placing exact `---PAGE_BOUNDARY---` delimiters exactly where physical page breaks occur. This might cause some images (like graphs) to be mapped to the wrong questions. The default chunking method is slightly slower but guarantees perfect page alignment.

## Proposed Changes

### `quiz_generator.html`
- [MODIFY] Add an `<select id="ocr-engine">` dropdown under "קבצי מקור" (Source Files) with the following options:
  - `gemini_chunked`: Gemini (Page Chunking) - *Default*
  - `gemini_native`: Gemini (Native PDF Upload)
  - `google_vision`: Google Cloud Vision
- [MODIFY] Rename the "Gemini API Key" label to "API Key / Passcode" to clarify that it accepts different API keys depending on the selected engine.

### `generator.js`
- [MODIFY] Add `elements.ocrEngine` to the elements map.
- [NEW] Add `extractTextViaGeminiNativePdf(pdfBuffer, apiKey)`:
  - Converts `pdfBuffer` to base64.
  - Sends a single request to Gemini 1.5 Flash using `inlineData: { mimeType: 'application/pdf', data: base64 }`.
  - Splits response by `---PAGE_BOUNDARY---`.
- [NEW] Add `extractTextViaGoogleVision(pdf, apiKey)`:
  - Renders all pages to base64 images (reuses existing logic).
  - Sends chunks of 5 pages to `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}` with `DOCUMENT_TEXT_DETECTION`.
  - Parses `fullTextAnnotation.text` from the response.
- [MODIFY] Update `runParse()`:
  - Pass the original `pdfBuffer` into the extraction functions.
  - Switch between the three OCR functions based on `elements.ocrEngine.value`.

## Verification Plan

### Manual Verification
1. Run local HTTP server and open the site.
2. Verify the dropdown appears and functions correctly.
3. Test **Gemini (Native PDF)** using the passcode.
4. If a Google Cloud API key is available, test **Google Cloud Vision** using the API key.
5. Verify the default Gemini Chunking method still works seamlessly.
