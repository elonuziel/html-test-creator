document.addEventListener('DOMContentLoaded', () => {
    const STORAGE = {
        theme: 'theme'
    };

    const EMBEDDED_KEY = {
        encryptedKeyB64: 'Jk71s+jMhwvQREzIhFB3OeeBOAHMTrX5tQn/PflNsFfZABcZEaoK1s0nONNDm8jFBi8VVp1RcRc6E0MA4t3PD4FCkL/b',
        ivB64: 'Klg+fy9R79W9jMIz',
        saltB64: 'DDyNzdsTLeWBGAnJIuT/Wg=='
    };

    const state = {
        questions: [],
        templateCache: null
    };

    const elements = {
        pdfFile: document.getElementById('pdf-file'),
        csvFile: document.getElementById('csv-file'),
        formNumber: document.getElementById('form-number'),
        apiKey: document.getElementById('api-key'),
        passcode: document.getElementById('passcode'),
        runParse: document.getElementById('run-parse'),
        downloadQuiz: document.getElementById('download-quiz'),
        takeQuiz: document.getElementById('take-quiz'),
        status: document.getElementById('status'),
        preview: document.getElementById('preview'),
        themeToggle: document.getElementById('theme-toggle'),
        themeIcon: document.getElementById('theme-icon')
    };

    let theme = localStorage.getItem(STORAGE.theme) || 'light';

    function setTheme(nextTheme) {
        theme = nextTheme;
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(STORAGE.theme, theme);
        if (theme === 'dark') {
            elements.themeIcon.innerHTML = '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>';
        } else {
            elements.themeIcon.innerHTML = '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path>';
        }
    }

    setTheme(theme);
    elements.themeToggle.addEventListener('click', () => setTheme(theme === 'light' ? 'dark' : 'light'));

    function setStatus(message, isError = false) {
        elements.status.textContent = message;
        elements.status.classList.toggle('muted', !isError);
        elements.status.style.color = isError ? 'var(--danger)' : 'var(--text-primary)';
    }

    function disableOutputActions(disabled) {
        elements.downloadQuiz.disabled = disabled;
        elements.takeQuiz.disabled = disabled;
    }

    function decodeBase64(base64) {
        const str = atob(base64);
        const bytes = new Uint8Array(str.length);
        for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
        return bytes;
    }

    async function decryptEmbeddedApiKey(passcode) {
        if (!EMBEDDED_KEY.encryptedKeyB64 || !EMBEDDED_KEY.ivB64 || !EMBEDDED_KEY.saltB64 || !passcode) {
            return '';
        }

        try {
            const encoder = new TextEncoder();
            const keyMaterial = await crypto.subtle.importKey(
                'raw',
                encoder.encode(passcode),
                'PBKDF2',
                false,
                ['deriveKey']
            );

            const aesKey = await crypto.subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt: decodeBase64(EMBEDDED_KEY.saltB64),
                    iterations: 100000,
                    hash: 'SHA-256'
                },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false,
                ['decrypt']
            );

            const decrypted = await crypto.subtle.decrypt(
                {
                    name: 'AES-GCM',
                    iv: decodeBase64(EMBEDDED_KEY.ivB64)
                },
                aesKey,
                decodeBase64(EMBEDDED_KEY.encryptedKeyB64)
            );

            return new TextDecoder().decode(decrypted).trim();
        } catch {
            return '';
        }
    }

    function normalizeWhitespace(value) {
        return value.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function fixHebrewWordOrder(text) {
        return text
            .split('\n')
            .map((line) => {
                const trimmed = line.trim();
                if (!trimmed) return '';
                return trimmed.split(/\s+/).reverse().join(' ');
            })
            .join('\n');
    }

    function groupPdfTextItemsToLines(items) {
        const normalized = items
            .filter((item) => item.str && item.str.trim())
            .map((item) => ({ text: item.str.trim(), x: item.transform[4], y: item.transform[5] }));

        normalized.sort((a, b) => {
            if (Math.abs(a.y - b.y) > 2) return b.y - a.y;
            return a.x - b.x;
        });

        const lines = [];
        for (const item of normalized) {
            const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 2);
            if (!line) {
                lines.push({ y: item.y, chunks: [item] });
            } else {
                line.chunks.push(item);
            }
        }

        lines.sort((a, b) => b.y - a.y);

        return lines.map((line) => line.chunks.sort((a, b) => a.x - b.x).map((chunk) => chunk.text).join(' '));
    }

    async function extractPageImage(page) {
        // Render the full page to a canvas and return it as a base64 PNG data URL.
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        return canvas.toDataURL('image/png');
    }

    async function extractPdfText(arrayBuffer) {
        if (!window.pdfjsLib?.getDocument) {
            throw new Error('PDF.js לא נטען. רענן את העמוד ונסה שוב.');
        }

        const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const pages = [];
        const pageImages = []; // index = pageNumber-1, value = base64 data URL or null
        let nonWhitespaceChars = 0;

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
            const page = await pdf.getPage(pageNumber);
            const textContent = await page.getTextContent();
            const lineText = groupPdfTextItemsToLines(textContent.items).join('\n');
            pages.push(lineText);
            nonWhitespaceChars += lineText.replace(/\s/g, '').length;

            // Detect if this page has embedded images via operator list.
            // Fallback to hardcoded PDF.js OPS values if .OPS is not exported.
            try {
                const ops = await page.getOperatorList();
                const PAINT_IMAGE = (window.pdfjsLib.OPS && window.pdfjsLib.OPS.paintImageXObject) || 85;
                const PAINT_INLINE = (window.pdfjsLib.OPS && window.pdfjsLib.OPS.paintInlineImageXObject) || 86;
                const hasPaintOp = ops.fnArray.some((fn) => fn === PAINT_IMAGE || fn === PAINT_INLINE);
                pageImages.push(hasPaintOp ? await extractPageImage(page) : null);
            } catch {
                pageImages.push(null);
            }
        }

        return {
            pdf,
            pageImages,
            isScanned: nonWhitespaceChars < Math.max(pdf.numPages * 60, 120),
            text: fixHebrewWordOrder(pages.join('\n')),
            rawPages: pages // preserve per-page text for image association
        };
    }

    async function renderPageImageData(page, scale = 1.3) {
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await page.render({ canvasContext: context, viewport }).promise;
        return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
    }

    async function callGeminiOcr(apiKey, imageData) {
        const endpoint = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
        const prompt = 'Extract all visible Hebrew question text exactly as written. Keep structure with question headers and options. Return plain text only.';
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        { inlineData: { mimeType: 'image/png', data: imageData } }
                    ]
                }]
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini request failed: ${response.status} ${errorText}`);
        }

        const payload = await response.json();
        const parts = payload.candidates?.[0]?.content?.parts || [];
        const text = parts.map((part) => part.text || '').join('\n').trim();
        if (!text) {
            throw new Error('Gemini returned empty OCR text.');
        }

        return text;
    }

    async function extractTextViaGemini(pdf, apiKey) {
        if (!apiKey) {
            throw new Error('לא נמצא פורמט נתמך');
        }

        const pages = [];
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
            setStatus(`סורק עמוד ${pageNumber}/${pdf.numPages} עם Gemini...`);
            const page = await pdf.getPage(pageNumber);
            const imageData = await renderPageImageData(page);
            const pageText = await callGeminiOcr(apiKey, imageData);
            pages.push(pageText);
        }

        return pages.join('\n');
    }

    function parseQuestionsFromText(text, rawPages, pageImages) {
        const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        // Build linePageMap from the same processed text that lines[] comes from.
        // We apply fixHebrewWordOrder per page and count non-empty lines to match the filter(Boolean).
        const filteredLinePageMap = [];
        if (rawPages && rawPages.length) {
            rawPages.forEach((pageText, pageIdx) => {
                const processedLines = fixHebrewWordOrder(pageText)
                    .split('\n')
                    .map(l => l.trim())
                    .filter(Boolean);
                for (let i = 0; i < processedLines.length; i++) {
                    filteredLinePageMap.push(pageIdx);
                }
            });
        }
        // Matches: 'שאלה מספר 1:', 'שאלה מספר :1', 'שאלה 1:', AND standalone lines like '1.' '1)' only at line start
        const qPattern = /(?:שאלה\s+(?:מספר\s+)?:?\d+\s*:?|\d+\s*:?\s*מספר\s+שאלה|^\d+\s*[\.\)]\s|^\d+\s*-\s)/;
        // Matches: 'א. text', 'א . text' (space between letter and dot from PDF.js visual layout)
        const ansPatternStart = /^([אבגד1-4])\s*[\.]\s*(.*)$|^([אבגד1-4])[\)]\s*(.*)$/;
        const ansPatternEnd = /^(.*)\s+([אבגד1-4])\s*[\.\)]$/;
        const noisePattern = /^עמוד\s+\d+\s+מתוך\s+\d+$/;

        const rawQuestions = [];
        let current = null;
        let stateMode = 0;

        function pushCurrent() {
            if (!current) return;
            rawQuestions.push(current);
            current = null;
        }

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line || noisePattern.test(line) || line.includes('קוד מבחן') || line.includes("מבחן מס") || line.includes('מבחן מס')) {
                continue;
            }

            const reversedLine = line.split(/\s+/).reverse().join(' ');

            if (qPattern.test(line) || qPattern.test(reversedLine)) {
                pushCurrent();
                current = { text: [], answers: [], lineIdx: i }; // use i, not indexOf
                stateMode = 1;
                continue;
            }

            if (!current) {
                continue;
            }

            // ansPatternStart has two capture groups: (letter)(text) OR (letter2)(text2)
            let match = line.match(ansPatternStart) || reversedLine.match(ansPatternStart);
            let endMatch = (!match) && (line.match(ansPatternEnd) || reversedLine.match(ansPatternEnd));

            if (match || endMatch) {
                stateMode = 2;
                let letter, answerText;
                if (match) {
                    // group 1+2 for 'א. text', group 3+4 for 'א) text'
                    letter = match[1] || match[3];
                    answerText = (match[2] || match[4] || '').trim();
                } else {
                    letter = endMatch[2];
                    answerText = (endMatch[1] || '').trim();
                }

                if ((letter === 'א' || letter === '1') && !answerText && current.text.length > 0) {
                    answerText = current.text.pop();
                }
                current.answers.push({ text: answerText ? [answerText] : [] });
                continue;
            }

            if (stateMode === 1) {
                current.text.push(line);
            } else if (stateMode === 2 && current.answers.length > 0) {
                current.answers[current.answers.length - 1].text.push(line);
            }
        }

        pushCurrent();

        const imageKeywords = /לפניכם|גרף|תרשים|תמונה|איור|מפה|ציור|דיאגרמה|צילום|מוצג/;

        const formatted = rawQuestions
            .map((q) => {
                const question = normalizeWhitespace(q.text.join(' '));
                const options = q.answers.map((a) => normalizeWhitespace(a.text.join(' '))).filter(Boolean);
                const obj = { question, options, correctIndex: 0 };

                // Attach image if the question text suggests one and the page has an embedded image
                if (pageImages && pageImages.length && imageKeywords.test(question)) {
                    const pageIdx = filteredLinePageMap[q.lineIdx] ?? 0;
                    // Search current page first, then adjacent pages
                    for (const pi of [pageIdx, pageIdx - 1, pageIdx + 1]) {
                        if (pi >= 0 && pi < pageImages.length && pageImages[pi]) {
                            obj.image = pageImages[pi];
                            break;
                        }
                    }
                }

                return obj;
            })
            .filter((q) => q.question && q.options.length >= 2);

        if (!formatted.length) {
            throw new Error('לא נמצאו שאלות בפורמט הנתמך.');
        }

        return formatted;
    }

    function parseCsvRows(csvText) {
        const rows = [];
        let row = [];
        let value = '';
        let inQuotes = false;

        for (let i = 0; i < csvText.length; i++) {
            const char = csvText[i];
            const next = csvText[i + 1];

            if (char === '"') {
                if (inQuotes && next === '"') {
                    value += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                row.push(value);
                value = '';
            } else if ((char === '\n' || char === '\r') && !inQuotes) {
                if (char === '\r' && next === '\n') i++;
                row.push(value);
                value = '';
                if (row.some((cell) => cell.trim() !== '')) rows.push(row);
                row = [];
            } else {
                value += char;
            }
        }

        if (value.length || row.length) {
            row.push(value);
            if (row.some((cell) => cell.trim() !== '')) rows.push(row);
        }

        return rows;
    }

    function extractAnswersForForm(csvText, formNumber) {
        const rows = parseCsvRows(csvText.replace(/^\uFEFF/, ''));
        let headers = null;
        let selectedRow = null;

        for (const row of rows) {
            if (!row.length) continue;
            if ((row[0] || '').includes('שאלון')) {
                headers = row;
                continue;
            }
            if (headers && (row[0] || '').trim() === formNumber.trim()) {
                selectedRow = row;
                break;
            }
        }

        if (!headers || !selectedRow) {
            throw new Error(`לא נמצאה שורת שאלון ${formNumber} בקובץ ה-CSV.`);
        }

        const answers = new Map();

        for (let i = 0; i < headers.length; i++) {
            const header = (headers[i] || '').trim();
            if (!header.startsWith('שאלה')) continue;

            const qNumMatch = header.match(/\d+/);
            if (!qNumMatch) continue;

            const questionNumber = Number(qNumMatch[0]);
            const rawCell = String(selectedRow[i] || '');

            const answerMatch = rawCell.match(/\((\d+)\)/);
            if (answerMatch) {
                answers.set(questionNumber, Number(answerMatch[1]) - 1);
                continue;
            }

            if (rawCell.includes('מבוטלת') || rawCell.includes('והת')) {
                answers.set(questionNumber, null);
            }
        }

        return answers;
    }

    function mergeAnswers(questions, answerMap) {
        return questions.map((question, index) => {
            const answer = answerMap.get(index + 1);
            if (typeof answer === 'number' && answer >= 0 && answer < question.options.length) {
                return { ...question, correctIndex: answer };
            }
            return { ...question };
        });
    }

    function renderPreview() {
        elements.preview.innerHTML = '';

        state.questions.forEach((question, index) => {
            const card = document.createElement('article');
            card.className = 'question-card';

            const questionRow = document.createElement('div');
            questionRow.className = 'row';
            questionRow.innerHTML = `<label>שאלה ${index + 1}</label>`;

            // Image thumbnail
            if (question.image) {
                const imgWrap = document.createElement('div');
                imgWrap.style.cssText = 'grid-column:1/-1;display:flex;align-items:center;gap:8px;margin-bottom:6px;';
                const thumb = document.createElement('img');
                thumb.src = question.image;
                thumb.style.cssText = 'max-height:120px;max-width:100%;border-radius:8px;border:1px solid var(--border-color);cursor:zoom-in;';
                thumb.title = 'לחץ להצגה מלאה';
                thumb.addEventListener('click', () => window.open(question.image, '_blank'));
                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.textContent = '✕ הסר תמונה';
                removeBtn.style.cssText = 'font-size:.8rem;padding:4px 8px;';
                removeBtn.addEventListener('click', () => {
                    delete state.questions[index].image;
                    imgWrap.remove();
                });
                imgWrap.append(thumb, removeBtn);
                card.appendChild(imgWrap);
            }

            const questionTextarea = document.createElement('textarea');
            questionTextarea.value = question.question;
            questionTextarea.addEventListener('input', () => {
                state.questions[index].question = questionTextarea.value;
            });
            questionRow.appendChild(questionTextarea);
            card.appendChild(questionRow);

            question.options.forEach((option, optIndex) => {
                const optionRow = document.createElement('div');
                optionRow.className = 'option-row';

                const radio = document.createElement('input');
                radio.type = 'radio';
                radio.name = `correct-${index}`;
                radio.checked = question.correctIndex === optIndex;
                radio.title = 'סמן תשובה נכונה';
                radio.addEventListener('change', () => {
                    state.questions[index].correctIndex = optIndex;
                });

                const optionInput = document.createElement('input');
                optionInput.type = 'text';
                optionInput.value = option;
                optionInput.addEventListener('input', () => {
                    state.questions[index].options[optIndex] = optionInput.value;
                });

                optionRow.append(radio, optionInput);
                card.appendChild(optionRow);
            });

            elements.preview.appendChild(card);
        });
    }

    async function getTemplateSources() {
        if (state.templateCache) {
            return state.templateCache;
        }

        const [indexHtml, styleCss, appJs] = await Promise.all([
            fetch('index.html').then((response) => response.text()),
            fetch('style.css').then((response) => response.text()),
            fetch('app.js').then((response) => response.text())
        ]);

        state.templateCache = { indexHtml, styleCss, appJs };
        return state.templateCache;
    }

    async function createStandaloneQuizHtml() {
        const cleanedQuestions = state.questions.map((q) => ({
            question: normalizeWhitespace(q.question),
            options: q.options.map((opt) => normalizeWhitespace(opt)),
            correctIndex: q.correctIndex,
            ...(q.image ? { image: q.image } : {}) // embed base64 image directly
        }));

        const { indexHtml, styleCss, appJs } = await getTemplateSources();
        const inlinedCssHtml = indexHtml.replace(
            /<link rel="stylesheet" href="style\.css">/,
            `<style>${styleCss}</style>`
        );

        const appScript = appJs.replace(/<\/(script)/gi, '<\\/$1');
        const payload = JSON.stringify(cleanedQuestions, null, 2);

        return inlinedCssHtml.replace(
            /<script src="app\.js"><\/script>/,
            `<script>window.__INLINE_QUESTIONS__=${payload};(function(){const originalFetch=window.fetch.bind(window);window.fetch=function(input,init){const url=typeof input==='string'?input:(input&&input.url)||'';if(typeof url==='string'&&/questions\\.json(?:\\?|$)/.test(url)){return Promise.resolve(new Response(JSON.stringify(window.__INLINE_QUESTIONS__),{headers:{'Content-Type':'application/json'}}));}return originalFetch(input,init);};})();</script><script>${appScript}</script>`
        );
    }

    async function runParse() {
        disableOutputActions(true);
        elements.preview.innerHTML = '';

        const pdf = elements.pdfFile.files?.[0];
        const csv = elements.csvFile.files?.[0];
        const formNumber = elements.formNumber.value.trim();

        if (!pdf) {
            throw new Error('יש לבחור קובץ PDF לפענוח.');
        }

        setStatus('קורא קובצי מקור...');

        let apiKey = elements.apiKey.value.trim();
        if (!apiKey && elements.passcode.value.trim()) {
            apiKey = await decryptEmbeddedApiKey(elements.passcode.value.trim());
            if (apiKey) {
                elements.apiKey.value = apiKey;
            }
        }

        const pdfBuffer = await pdf.arrayBuffer();
        let csvText = null;
        if (csv) {
            csvText = await csv.text();
            if (!formNumber) {
                throw new Error('אם הועלה קובץ CSV, יש להזין מספר שאלון.');
            }
        }

        setStatus('מחלץ טקסט מה-PDF...');
        const extracted = await extractPdfText(pdfBuffer);

        let examText = extracted.text;
        if (extracted.isScanned) {
            setStatus('זוהה PDF סרוק. מנסה חילוץ עם Gemini...');
            examText = await extractTextViaGemini(extracted.pdf, apiKey);
            examText = fixHebrewWordOrder(examText);
        }

        let parsedQuestions = parseQuestionsFromText(examText, extracted.rawPages, extracted.pageImages);

        if (csvText && formNumber) {
            const answerMap = extractAnswersForForm(csvText, formNumber);
            state.questions = mergeAnswers(parsedQuestions, answerMap);
        } else {
            // Optional CSV bypass: Default correct answer to index 0 ('א')
            state.questions = parsedQuestions.map(q => ({
                ...q,
                correctIndex: 0
            }));
        }

        renderPreview();
        disableOutputActions(false);
        setStatus(`הסתיים בהצלחה: ${state.questions.length} שאלות נטענו לעריכה.`);
    }

    elements.runParse.addEventListener('click', async () => {
        try {
            await runParse();
        } catch (error) {
            setStatus(error.message || 'אירעה שגיאה לא צפויה.', true);
        }
    });

    elements.downloadQuiz.addEventListener('click', async () => {
        try {
            setStatus('מכין קובץ HTML להורדה...');
            const html = await createStandaloneQuizHtml();
            const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = 'interactive_quiz.html';
            anchor.click();
            URL.revokeObjectURL(url);
            setStatus('הקובץ נוצר וההורדה התחילה.');
        } catch (error) {
            setStatus(error.message || 'נכשלה יצירת קובץ HTML.', true);
        }
    });

    elements.takeQuiz.addEventListener('click', async () => {
        try {
            setStatus('פותח תצוגת מבחן...');
            const html = await createStandaloneQuizHtml();
            const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank', 'noopener,noreferrer');
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
            setStatus('המבחן נפתח בלשונית חדשה.');
        } catch (error) {
            setStatus(error.message || 'לא ניתן היה לפתוח את המבחן.', true);
        }
    });
});
