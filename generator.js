const pdfInput = document.getElementById('pdf-file');
const csvInput = document.getElementById('csv-file');
const formInput = document.getElementById('form-number');
const parseBtn = document.getElementById('parse-btn');
const downloadBtn = document.getElementById('download-btn');
const statusEl = document.getElementById('status');
const previewEl = document.getElementById('preview');

let parsedQuestions = [];

function setStatus(text) {
    statusEl.textContent = text;
}

function parseCsvLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === ',' && !inQuotes) {
            values.push(current);
            current = '';
        } else {
            current += ch;
        }
    }

    values.push(current);
    return values;
}

function extractAnswersFromCsv(csvText, formNum) {
    const rows = csvText
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .map(parseCsvLine);

    let headers = null;
    let targetRow = null;

    for (const row of rows) {
        if (!row.length) continue;
        if ((row[0] || '').includes('שאלון')) {
            headers = row;
            continue;
        }
        if (headers && row[0] === formNum) {
            targetRow = row;
            break;
        }
    }

    if (!headers || !targetRow) {
        throw new Error(`לא נמצאו תשובות לשאלון ${formNum} בקובץ CSV.`);
    }

    const answerMap = {};
    headers.forEach((headerCell, i) => {
        const header = (headerCell || '').trim();
        if (!header.startsWith('שאלה')) return;

        const qNumMatch = header.match(/\d+/);
        if (!qNumMatch) return;

        const cell = targetRow[i] || '';
        const answerMatch = cell.match(/\((\d+)\)/);
        if (answerMatch) {
            answerMap[qNumMatch[0]] = Number(answerMatch[1]) - 1;
        } else if (cell.includes('והת') || cell.includes('מבוטלת')) {
            answerMap[qNumMatch[0]] = null;
        }
    });

    return answerMap;
}

async function extractPdfText(file) {
    const pdfjs = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';

    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjs.getDocument({ data: bytes }).promise;
    const chunks = [];

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str || '').join('\n');
        chunks.push(pageText);
    }

    return chunks.join('\n');
}

function parseQuestionsFromText(text) {
    const blocks = text.match(/שאלה מספר \d+:[\s\S]*?(?=שאלה מספר \d+:|$)/g) || [];
    const questions = [];

    for (const block of blocks) {
        const lines = block
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean)
            .filter(line => !/^עמוד \d+ מתוך \d+$/.test(line) && !line.includes('קוד מבחן') && !line.includes("מבחן מס'"));

        if (!lines.length) continue;

        const title = lines[0];
        const titleMatch = title.match(/שאלה מספר (\d+):/);
        if (!titleMatch) continue;

        const optionIndexes = [];
        for (let i = 1; i < lines.length; i++) {
            if (/^[אבגד]\./.test(lines[i])) optionIndexes.push(i);
        }

        if (optionIndexes.length < 4) continue;

        const questionLines = lines.slice(1, optionIndexes[0]);
        const options = [];
        for (let i = 0; i < optionIndexes.length; i++) {
            const start = optionIndexes[i];
            const end = optionIndexes[i + 1] || lines.length;
            const segment = lines.slice(start, end);
            if (!segment.length) continue;
            segment[0] = segment[0].replace(/^[אבגד]\.\s*/, '');
            options.push(segment.join(' ').trim());
        }

        if (options.length === 4) {
            questions.push({
                questionNumber: titleMatch[1],
                question: questionLines.join(' ').trim(),
                options,
                correctIndex: 0
            });
        }
    }

    return questions;
}

function renderPreview(questions) {
    previewEl.innerHTML = '';
    questions.forEach((q, i) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'question-card';
        const optionsHtml = q.options
            .map((opt, idx) => `<li${idx === q.correctIndex ? ' style="font-weight:700;"' : ''}>${opt}</li>`)
            .join('');

        wrapper.innerHTML = `<strong>${i + 1}. ${q.question}</strong><ul>${optionsHtml}</ul>`;
        previewEl.appendChild(wrapper);
    });
}

parseBtn.addEventListener('click', async () => {
    setStatus('');
    downloadBtn.disabled = true;
    previewEl.innerHTML = '';

    const pdfFile = pdfInput.files?.[0];
    const csvFile = csvInput.files?.[0];
    const formNum = formInput.value.trim();

    if (!pdfFile || !csvFile || !formNum) {
        setStatus('יש לבחור PDF, CSV ומספר שאלון.');
        return;
    }

    try {
        setStatus('מעבד קבצים...');
        const [pdfText, csvText] = await Promise.all([extractPdfText(pdfFile), csvFile.text()]);

        const questions = parseQuestionsFromText(pdfText);
        if (!questions.length) {
            setStatus('לא נמצאו שאלות בפורמט נתמך.');
            return;
        }

        const answerMap = extractAnswersFromCsv(csvText, formNum);
        parsedQuestions = questions.map(q => ({
            question: q.question,
            options: q.options,
            correctIndex: answerMap[q.questionNumber] ?? 0
        }));

        renderPreview(parsedQuestions);
        downloadBtn.disabled = false;
        setStatus(`הושלם: נמצאו ${parsedQuestions.length} שאלות.`);
    } catch (error) {
        console.error(error);
        setStatus(`שגיאה: ${error.message}`);
    }
});

downloadBtn.addEventListener('click', () => {
    const payload = JSON.stringify(parsedQuestions, null, 2);
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'questions.json';
    link.click();
    URL.revokeObjectURL(link.href);
});
