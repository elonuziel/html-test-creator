document.addEventListener('DOMContentLoaded', () => {

    // ── State ────────────────────────────────────────────────────────────────
    let questions = [];
    let currentQuestionIndex = 0;
    let userAnswers = []; // { selectedOptionId: number, isCorrect: boolean } | null
    let isImmediateFeedback = false;
    let reviewFilter = 'all'; // 'all' | 'wrong' | 'unanswered'
    let theme = localStorage.getItem('theme') || 'light';

    const STORAGE_KEY = 'quiz_answers_v1';

    // ── DOM Elements ─────────────────────────────────────────────────────────
    const setupScreen   = document.getElementById('setup-screen');
    const quizScreen    = document.getElementById('quiz-screen');
    const resultsScreen = document.getElementById('results-screen');

    const startBtn      = document.getElementById('start-btn');
    const resumeBtn     = document.getElementById('resume-btn');
    const resumeNotice  = document.getElementById('resume-notice');
    const prevBtn       = document.getElementById('prev-btn');
    const nextBtn       = document.getElementById('next-btn');
    const submitBtn     = document.getElementById('submit-btn');
    const restartBtn    = document.getElementById('restart-btn');

    const questionCounter   = document.getElementById('question-counter');
    const questionText      = document.getElementById('question-text');
    const questionImage     = document.getElementById('question-image');
    const optionsContainer  = document.getElementById('options-container');
    const progressBar       = document.getElementById('progress-bar');
    const feedbackMessage   = document.getElementById('feedback-message');
    const jumpBar           = document.getElementById('question-jump-bar');
    const zoomOverlay       = document.getElementById('zoom-overlay');
    const zoomImg           = document.getElementById('zoom-img');

    // Cropper Elements
    const openCropperBtn    = document.getElementById('open-cropper-btn');
    const cropperModal      = document.getElementById('cropper-modal');
    const closeCropperBtn   = document.getElementById('close-cropper-btn');
    const confirmCropBtn    = document.getElementById('confirm-crop-btn');
    const cropperImage      = document.getElementById('cropper-image');
    let cropperInstance     = null;
    let croppedImages       = {}; // Store crop data URLs per full image path
    const themeToggle    = document.getElementById('theme-toggle');
    const feedbackToggle = document.getElementById('immediate-feedback-toggle');
    const themeIcon      = document.getElementById('theme-icon');
    const filterBtns     = document.querySelectorAll('.filter-btn');

    // ── Theme ────────────────────────────────────────────────────────────────
    function setTheme(newTheme) {
        theme = newTheme;
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        if (theme === 'dark') {
            themeIcon.innerHTML = '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>';
        } else {
            themeIcon.innerHTML = '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path>';
        }
    }
    setTheme(theme);

    themeToggle.addEventListener('click', () => setTheme(theme === 'light' ? 'dark' : 'light'));
    feedbackToggle.addEventListener('change', e => { isImmediateFeedback = e.target.checked; });

    // ── localStorage Persistence ──────────────────────────────────────────────
    function saveProgress() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            answers: userAnswers,
            index: currentQuestionIndex
        }));
    }

    function loadProgress() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch(e) { return null; }
    }

    function clearProgress() {
        localStorage.removeItem(STORAGE_KEY);
    }

    // ── Parse URL Parameter ───────────────────────────────────────────────────
    const urlParams = new URLSearchParams(window.location.search);
    const testPath = urlParams.get('test');

    if (!testPath) {
        // No test selected: show exam selection menu
        setupScreen.classList.remove('active');
        const menuScreen = document.getElementById('menu-screen');
        if(menuScreen) menuScreen.classList.add('active');
        return; // Stop execution, don't fetch questions
    }

    // ── Fetch Questions ───────────────────────────────────────────────────────
    const jsonUrl = `../${testPath}/questions.json?v=` + new Date().getTime();
    fetch(jsonUrl)
        .then(r => {
            if (!r.ok) throw new Error("Could not load " + jsonUrl);
            return r.json();
        })
        .then(data => {
            questions = data.map(q => {
                const options = q.options.map((text, id) => ({ id, text }));
                // Fisher-Yates shuffle
                for (let i = options.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [options[i], options[j]] = [options[j], options[i]];
                }
                
                // Adjust relative image path if present
                let img = q.image;
                if (img && !img.startsWith('http')) {
                    img = `../${testPath}/${img}`;
                }

                return { ...q, options, image: img };
            });

            // Check for saved progress
            const saved = loadProgress();
            if (saved && saved.answers && saved.answers.length === questions.length) {
                resumeNotice.classList.remove('hidden');
            }
        })
        .catch(err => {
            console.error('Error loading questions:', err);
            questionText.innerHTML = `<span style="color:red">שגיאה בטעינת המבחן. אנא ודא שהנתיב נכון.</span>`;
            switchScreen(setupScreen, quizScreen);
        });

    // ── Image Zoom ────────────────────────────────────────────────────────────
    questionImage.addEventListener('click', () => {
        if (questionImage.classList.contains('hidden')) return;
        zoomImg.src = questionImage.src;
        zoomOverlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    });

    zoomOverlay.addEventListener('click', closeZoom);

    function closeZoom() {
        zoomOverlay.classList.add('hidden');
        document.body.style.overflow = '';
    }

    // ── Keyboard Navigation ───────────────────────────────────────────────────
    document.addEventListener('keydown', e => {
        // Close zoom
        if (e.key === 'Escape') {
            if (!zoomOverlay.classList.contains('hidden')) { closeZoom(); return; }
        }

        // Only act when quiz screen is active
        if (!quizScreen.classList.contains('active')) return;

        // Option selection: 1–9
        if (['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(e.key)) {
            const idx = parseInt(e.key) - 1;
            const opts = optionsContainer.querySelectorAll('.option');
            if (opts[idx] && !opts[idx].classList.contains('disabled')) {
                opts[idx].click();
            }
            return;
        }

        // Navigation (RTL: ArrowRight = go back/previous, ArrowLeft = go forward/next)
        if (e.key === 'ArrowRight') {
            if (!prevBtn.disabled) prevBtn.click();
        }
        if (e.key === 'ArrowLeft') {
            if (!nextBtn.classList.contains('hidden')) nextBtn.click();
            else if (!submitBtn.classList.contains('hidden')) submitBtn.click();
        }
    });

    // ── Screen Switching ──────────────────────────────────────────────────────
    function switchScreen(from, to) {
        from.classList.remove('active');
        to.classList.add('active');
    }

    // ── Start / Resume / Restart ──────────────────────────────────────────────
    startBtn.addEventListener('click', () => {
        clearProgress();
        userAnswers = new Array(questions.length).fill(null);
        currentQuestionIndex = 0;
        switchScreen(setupScreen, quizScreen);
        renderQuestion();
    });

    resumeBtn.addEventListener('click', () => {
        const saved = loadProgress();
        userAnswers = saved.answers;
        currentQuestionIndex = saved.index;
        switchScreen(setupScreen, quizScreen);
        renderQuestion();
    });

    restartBtn.addEventListener('click', () => {
        clearProgress();
        reviewFilter = 'all';
        filterBtns.forEach(b => {
            b.classList.toggle('active', b.dataset.filter === 'all');
        });
        switchScreen(resultsScreen, setupScreen);
    });

    // ── Navigation Buttons ────────────────────────────────────────────────────
    nextBtn.addEventListener('click', () => {
        if (currentQuestionIndex < questions.length - 1) {
            currentQuestionIndex++;
            renderQuestion();
        }
    });

    prevBtn.addEventListener('click', () => {
        if (currentQuestionIndex > 0) {
            currentQuestionIndex--;
            renderQuestion();
        }
    });

    submitBtn.addEventListener('click', () => {
        clearProgress();
        switchScreen(quizScreen, resultsScreen);
        renderResults();
    });

    // ── Jump Bar ──────────────────────────────────────────────────────────────
    function renderJumpBar() {
        jumpBar.innerHTML = '';
        questions.forEach((q, i) => {
            const btn = document.createElement('button');
            btn.className = 'jump-btn';
            btn.textContent = i + 1;
            btn.setAttribute('aria-label', `שאלה ${i + 1}`);

            const answer = userAnswers[i];
            if (answer) {
                if (isImmediateFeedback) {
                    btn.classList.add(answer.isCorrect ? 'answered-correct' : 'answered-wrong');
                } else {
                    btn.classList.add('answered-neutral');
                }
            }
            if (i === currentQuestionIndex) {
                btn.classList.add('current');
            }

            btn.addEventListener('click', () => {
                currentQuestionIndex = i;
                renderQuestion();
            });
            jumpBar.appendChild(btn);
        });
    }

    // ── Render Question ───────────────────────────────────────────────────────
    function renderQuestion() {
        const q = questions[currentQuestionIndex];
        const answered = userAnswers[currentQuestionIndex];

        questionCounter.textContent = `שאלה ${currentQuestionIndex + 1} מתוך ${questions.length}`;
        questionText.innerHTML = q.question;

        // Image
        if (q.image) {
            // Check if user has already cropped this image
            if (croppedImages[q.image]) {
                questionImage.src = croppedImages[q.image];
            } else {
                questionImage.src = q.image;
            }
            questionImage.dataset.fullSrc = q.image;
            questionImage.classList.remove('hidden');
            openCropperBtn.classList.remove('hidden');
        } else {
            questionImage.classList.add('hidden');
            openCropperBtn.classList.add('hidden');
            questionImage.src = '';
            questionImage.dataset.fullSrc = '';
        }

        // Progress bar
        progressBar.style.width = `${(currentQuestionIndex / questions.length) * 100}%`;

        // Feedback
        feedbackMessage.classList.add('hidden');
        feedbackMessage.className = 'feedback-message hidden';

        // Navigation buttons
        prevBtn.disabled = currentQuestionIndex === 0;
        const isLast = currentQuestionIndex === questions.length - 1;
        nextBtn.classList.toggle('hidden', isLast);
        submitBtn.classList.toggle('hidden', !isLast);

        // Options
        optionsContainer.innerHTML = '';
        q.options.forEach((option, posIndex) => {
            const btn = document.createElement('div');
            btn.className = 'option';
            btn.textContent = option.text;
            btn.setAttribute('data-key', posIndex + 1); // keyboard shortcut hint

            // Restore previous selection
            if (answered) {
                if (answered.selectedOptionId === option.id) btn.classList.add('selected');

                if (isImmediateFeedback) {
                    btn.classList.add('disabled');
                    if (option.id === q.correctIndex) btn.classList.add('correct');
                    else if (answered.selectedOptionId === option.id) btn.classList.add('incorrect');
                }
            }

            btn.addEventListener('click', () => handleOptionSelect(option.id, btn, q.correctIndex));
            optionsContainer.appendChild(btn);
        });

        // Show feedback if already answered
        if (answered && isImmediateFeedback) showFeedbackMessage(answered.isCorrect);

        // Update jump bar
        renderJumpBar();
    }

    // ── Handle Option Select ──────────────────────────────────────────────────
    function handleOptionSelect(selectedId, btnElement, correctId) {
        const answered = userAnswers[currentQuestionIndex];

        // Lock in immediate feedback mode
        if (isImmediateFeedback && answered) return;

        const isCorrect = selectedId === correctId;
        userAnswers[currentQuestionIndex] = { selectedOptionId: selectedId, isCorrect };
        saveProgress();

        // Update UI
        optionsContainer.querySelectorAll('.option').forEach(opt => opt.classList.remove('selected'));
        btnElement.classList.add('selected');

        if (isImmediateFeedback) {
            // Re-render to apply correct/incorrect styles cleanly
            renderQuestion();
        } else {
            // Just update jump bar dot
            renderJumpBar();
        }
    }

    // ── Feedback Message ──────────────────────────────────────────────────────
    function showFeedbackMessage(isCorrect) {
        feedbackMessage.classList.remove('hidden');
        if (isCorrect) {
            feedbackMessage.textContent = 'תשובה נכונה! כל הכבוד.';
            feedbackMessage.classList.add('success');
        } else {
            feedbackMessage.textContent = 'תשובה שגויה.';
            feedbackMessage.classList.add('error');
        }
    }

    // ── Review Filter Buttons ─────────────────────────────────────────────────
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            reviewFilter = btn.dataset.filter;
            renderReviewList();
        });
    });

    // ── Render Results ────────────────────────────────────────────────────────
    function renderResults() {
        const correctCount = userAnswers.filter(a => a && a.isCorrect).length;
        const total = questions.length;
        const percentage = Math.round((correctCount / total) * 100);

        document.getElementById('final-score').textContent = `${percentage}%`;
        document.getElementById('score-text').textContent =
            `ענית נכונה על ${correctCount} מתוך ${total} שאלות.`;

        const circle = document.querySelector('.score-circle');
        circle.style.background =
            `conic-gradient(var(--primary-color) ${percentage}%, var(--option-bg) 0%)`;

        renderReviewList();
    }

    function renderReviewList() {
        const reviewContainer = document.getElementById('review-container');
        reviewContainer.innerHTML = '';

        questions.forEach((q, i) => {
            const answer = userAnswers[i];
            const isCorrect = answer && answer.isCorrect;
            const isUnanswered = !answer;

            // Apply filter
            if (reviewFilter === 'wrong'      && (isCorrect || isUnanswered)) return;
            if (reviewFilter === 'unanswered' && !isUnanswered)                return;

            const div = document.createElement('div');
            div.className = 'review-item';

            let html = `<div class="review-question">${i + 1}. ${q.question}</div>`;

            q.options.forEach(opt => {
                let cls = 'review-option';
                if (opt.id === q.correctIndex)                              cls += ' correct';
                else if (answer && answer.selectedOptionId === opt.id)      cls += ' incorrect';
                html += `<div class="${cls}">${opt.text}</div>`;
            });

            if (isUnanswered) {
                html += `<div class="review-option incorrect">לא נענה</div>`;
            }

            div.innerHTML = html;
            reviewContainer.appendChild(div);
        });

        // Empty state message
        if (!reviewContainer.hasChildNodes()) {
            reviewContainer.innerHTML =
                `<p style="text-align:center;color:var(--text-secondary);padding:2rem;">אין שאלות להצגה בסינון זה.</p>`;
        }
    }

    // ── Cropper Logic ─────────────────────────────────────────────────────────
    openCropperBtn.addEventListener('click', () => {
        const fullSrc = questionImage.dataset.fullSrc;
        if (!fullSrc) return;

        cropperImage.src = fullSrc;
        cropperModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';

        // Initialize Cropper when image is loaded
        cropperImage.onload = () => {
            if (cropperInstance) cropperInstance.destroy();
            cropperInstance = new Cropper(cropperImage, {
                viewMode: 1,
                dragMode: 'crop',
                autoCropArea: 0.5,
                restore: false,
                guides: true,
                center: true,
                highlight: false,
                cropBoxMovable: true,
                cropBoxResizable: true,
                toggleDragModeOnDblclick: false,
            });
        };
    });

    function closeCropper() {
        cropperModal.classList.add('hidden');
        document.body.style.overflow = '';
        if (cropperInstance) {
            cropperInstance.destroy();
            cropperInstance = null;
        }
    }

    closeCropperBtn.addEventListener('click', closeCropper);

    confirmCropBtn.addEventListener('click', () => {
        if (!cropperInstance) return;
        
        // Get the cropped canvas
        const canvas = cropperInstance.getCroppedCanvas();
        if (canvas) {
            const dataUrl = canvas.toDataURL('image/png');
            const fullSrc = questionImage.dataset.fullSrc;
            
            // Save crop for this image
            croppedImages[fullSrc] = dataUrl;
            
            // Update UI
            questionImage.src = dataUrl;
        }
        
        closeCropper();
    });

});
