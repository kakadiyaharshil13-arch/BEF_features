document.addEventListener('DOMContentLoaded', () => {
  try {
    // Main Tab Switching
    const mainTabBtns = document.querySelectorAll('[data-main-tab]');
    const containers = {
        'single': document.getElementById('single-evaluation-container'),
        'bulk': document.getElementById('bulk-evaluation-container'),
        'notes': document.getElementById('notes-container'),
        'jobs': document.getElementById('jobs-container'),
        'flashcards': document.getElementById('flashcards-container')
    };

    mainTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-main-tab');
            mainTabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            Object.values(containers).forEach(c => c.classList.add('hidden'));
            containers[target].classList.remove('hidden');

            // Always hide the global result container when switching features
            const resultContainer = document.getElementById('result-container');
            if (resultContainer) {
                resultContainer.classList.add('hidden');
            }

            if (target === 'jobs') {
                renderJobList();
            }
        });
    });

    // Tab Switching (Generic for Input Cards)
    const tabBtns = document.querySelectorAll('.tab-btn[data-tab]');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const card = btn.closest('.input-card');
            const targetId = btn.getAttribute('data-tab');
            if (!card || !targetId) return;
            
            card.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            card.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            const targetEl = document.getElementById(targetId);
            if (targetEl) targetEl.classList.remove('hidden');
        });
    });

    // Image Upload Handling
    function setupUpload(zoneId, inputId) {
        const zone = document.getElementById(zoneId);
        const input = document.getElementById(inputId);
        const placeholder = zone.querySelector('.upload-placeholder');
        const previewContainer = zone.querySelector('.preview-container');
        const previewImg = zone.querySelector('.image-preview');
        const removeBtn = zone.querySelector('.remove-btn');

        zone.addEventListener('click', () => input.click());

        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (re) => {
                    previewImg.src = re.target.result;
                    placeholder.classList.add('hidden');
                    previewContainer.classList.remove('hidden');
                };
                reader.readAsDataURL(file);
            }
        });

        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            input.value = '';
            placeholder.classList.remove('hidden');
            previewContainer.classList.add('hidden');
        });
    }

    setupUpload('question-upload-zone', 'question-file-input');
    setupUpload('answer-upload-zone', 'answer-file-input');

    // Bulk PDF Upload Setup
    const bulkZone = document.getElementById('bulk-upload-zone');
    const bulkInput = document.getElementById('bulk-file-input');
    if (bulkZone && bulkInput) {
        bulkZone.addEventListener('click', () => bulkInput.click());
        bulkInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const placeholder = bulkZone.querySelector('.upload-placeholder');
                const previewContainer = bulkZone.querySelector('.preview-container');
                const filename = document.getElementById('pdf-filename');
                
                filename.textContent = file.name;
                placeholder.classList.add('hidden');
                previewContainer.classList.remove('hidden');
            }
        });

        bulkZone.querySelector('.remove-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            bulkInput.value = '';
            bulkZone.querySelector('.upload-placeholder').classList.remove('hidden');
            bulkZone.querySelector('.preview-container').classList.add('hidden');
        });
    }

    // Char Counter
    const answerTextarea = document.getElementById('answer-textarea');
    const charCounter = document.getElementById('char-counter');
    if (answerTextarea && charCounter) {
        answerTextarea.addEventListener('input', () => {
            charCounter.textContent = `${answerTextarea.value.length} characters`;
        });
    }

    // System Prompt Toggle
    const promptToggle = document.getElementById('system-prompt-toggle');
    const promptContainer = document.getElementById('system-prompt-container');
    const promptChevron = document.getElementById('prompt-chevron');
    
    if (promptToggle) {
        promptToggle.addEventListener('click', () => {
            const isHidden = promptContainer.classList.contains('hidden');
            if (isHidden) {
                promptContainer.classList.remove('hidden');
                promptChevron.style.transform = 'rotate(180deg)';
            } else {
                promptContainer.classList.add('hidden');
                promptChevron.style.transform = 'rotate(0deg)';
            }
        });
    }

    // Bulk System Prompt Toggle
    const bulkPromptToggle = document.getElementById('bulk-system-prompt-toggle');
    const bulkPromptContainer = document.getElementById('bulk-system-prompt-container');
    const bulkPromptChevron = document.getElementById('bulk-prompt-chevron');
    
    if (bulkPromptToggle) {
        bulkPromptToggle.addEventListener('click', () => {
            const isHidden = bulkPromptContainer.classList.contains('hidden');
            if (isHidden) {
                bulkPromptContainer.classList.remove('hidden');
                bulkPromptChevron.style.transform = 'rotate(180deg)';
            } else {
                bulkPromptContainer.classList.add('hidden');
                bulkPromptChevron.style.transform = 'rotate(0deg)';
            }
        });
    }

    // Form Submission
    const form = document.getElementById('evaluatorForm');
    const submitBtn = document.getElementById('submitBtn');
    const btnText = submitBtn.querySelector('.btn-text');
    const spinner = submitBtn.querySelector('.spinner');
    const errorBox = document.getElementById('error-box');
    const resultContainer = document.getElementById('result-container');
    const resultCard = document.getElementById('result-card');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const qText = form.question_text.value.trim();
        const qFile = form.querySelector('#question-file-input').files[0];
        const aText = form.answer_text.value.trim();
        const aFile = form.querySelector('#answer-file-input').files[0];

        const qMode = document.querySelector('[data-tab="question-text"]').classList.contains('active') ? 'text' : 'image';
        const aMode = document.querySelector('[data-tab="answer-text"]').classList.contains('active') ? 'text' : 'image';
        const selectedLanguage = document.getElementById('language-select').value;
        const maxMarks = document.getElementById('max-marks-input').value;
        const systemPrompt = form.system_prompt.value.trim();

        if ((qMode === 'text' && !qText) || (qMode === 'image' && !qFile)) {
            alert("Please provide a question.");
            return;
        }
        if ((aMode === 'text' && !aText) || (aMode === 'image' && !aFile)) {
            alert("Please provide an answer.");
            return;
        }

        setLoading(true);
        errorBox.classList.add('hidden');
        resultContainer.classList.add('hidden');

        const formData = new FormData();
        if (qMode === 'text') formData.append('question_text', qText);
        else formData.append('question_image', qFile);
        
        if (aMode === 'text') formData.append('answer_text', aText);
        else formData.append('answer_image', aFile);

        formData.append('language', selectedLanguage);
        formData.append('max_marks', maxMarks);
        if (systemPrompt) formData.append('system_prompt', systemPrompt);

        try {
            const response = await fetch('/evaluate', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error("Evaluation failed");

            const data = await response.json();
            renderResult(data);
        } catch (err) {
            errorBox.textContent = `Error: ${err.message}. Please try again.`;
            errorBox.classList.remove('hidden');
        } finally {
            setLoading(false);
        }
    });

    // Bulk Form Submission
    const bulkForm = document.getElementById('bulkForm');
    const bulkSubmitBtn = document.getElementById('bulkSubmitBtn');
    
    if (bulkForm) {
        bulkForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const file = bulkInput.files[0];
            if (!file) {
                alert("Please upload a PDF file.");
                return;
            }

            const formData = new FormData(bulkForm);
            const systemPrompt = bulkForm.system_prompt.value.trim();
            if (systemPrompt) formData.append('system_prompt', systemPrompt);
            
            bulkSubmitBtn.disabled = true;
            bulkSubmitBtn.querySelector('.btn-text').textContent = 'Submitting...';
            bulkSubmitBtn.querySelector('.spinner').classList.remove('hidden');

            try {
                const resp = await fetch('/evaluate_pdf', {
                    method: 'POST',
                    body: formData
                });
                const data = await resp.json();
                
                // Store job ID
                const jobs = JSON.parse(localStorage.getItem('upsc_jobs') || '[]');
                jobs.push({
                    id: data.job_id,
                    available_at: data.available_at,
                    filename: file.name,
                    submitted_at: new Date().toISOString()
                });
                localStorage.setItem('upsc_jobs', JSON.stringify(jobs));
                
                alert("Bulk evaluation submitted! Results will be available in 2 hours. You can track status in 'My Evaluations'.");
                bulkForm.reset();
                bulkZone.querySelector('.upload-placeholder').classList.remove('hidden');
                bulkZone.querySelector('.preview-container').classList.add('hidden');
                
            } catch (err) {
                alert("Error submitting bulk evaluation: " + err.message);
            } finally {
            bulkSubmitBtn.disabled = false;
            bulkSubmitBtn.querySelector('.btn-text').textContent = 'Submit for Bulk Evaluation →';
            bulkSubmitBtn.querySelector('.spinner').classList.add('hidden');
        }
    });
}

// Notes Form Submission
const notesForm = document.getElementById('notesForm');
const notesSubmitBtn = document.getElementById('notesSubmitBtn');

if (notesForm) {
    notesForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const topic = notesForm.topic.value.trim();
        const language = notesForm.language.value;

        if (!topic) return;

        notesSubmitBtn.disabled = true;
        notesSubmitBtn.querySelector('.btn-text').textContent = 'Generating Notes...';
        notesSubmitBtn.querySelector('.spinner').classList.remove('hidden');
        errorBox.classList.add('hidden');
        resultContainer.classList.add('hidden');

        const formData = new FormData();
        formData.append('topic', topic);
        formData.append('language', language);

        try {
            const resp = await fetch('/generate_notes', {
                method: 'POST',
                body: formData
            });
            const data = await resp.json();
            
            if (data.result) {
                renderNotesResult(data.result, topic);
            } else {
                throw new Error("Failed to generate notes");
            }
        } catch (err) {
            errorBox.textContent = `Error: ${err.message}`;
            errorBox.classList.remove('hidden');
        } finally {
            notesSubmitBtn.disabled = false;
            notesSubmitBtn.querySelector('.btn-text').textContent = 'Generate Full Notes →';
            notesSubmitBtn.querySelector('.spinner').classList.add('hidden');
        }
    });
}

function renderNotesResult(markdown, topic) {
    resultCard.innerHTML = `
        <div style="text-align: center; margin-bottom: 30px;">
            <h2 style="color: var(--primary-orange); font-size: 28px; margin-bottom: 10px;">Mains Notes</h2>
            <p style="color: var(--text-muted); font-size: 18px;">Topic: ${topic}</p>
        </div>
        <div class="notes-display result-content">
            ${marked.parse(markdown)}
        </div>
        <div style="margin-top: 30px; text-align: center;">
            <button class="btn-outline" onclick="window.print()">Download as PDF / Print</button>
        </div>
    `;
    resultContainer.classList.remove('hidden');
    resultContainer.scrollIntoView({ behavior: 'smooth' });
}

    function renderJobList() {
        const jobList = document.getElementById('job-list');
        const jobs = JSON.parse(localStorage.getItem('upsc_jobs') || '[]');
        
        if (jobs.length === 0) {
            jobList.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">No evaluations submitted yet.</p>';
            return;
        }

        let html = '<div style="display: flex; flex-direction: column; gap: 15px;">';
        jobs.slice().reverse().forEach(job => {
            const availableDate = new Date(job.available_at);
            const isAvailable = new Date() >= availableDate;
            
            html += `
                <div class="job-item" style="padding: 20px; border: 1px solid #eee; border-radius: 12px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight: 700; margin-bottom: 5px;">${job.filename}</div>
                        <div style="font-size: 13px; color: var(--text-muted);">Submitted: ${new Date(job.submitted_at).toLocaleString()}</div>
                        <div style="font-size: 13px; color: ${isAvailable ? 'green' : 'orange'}; font-weight: 600;">
                            ${isAvailable ? 'Results Ready' : 'Available at: ' + availableDate.toLocaleTimeString()}
                        </div>
                    </div>
                    <button class="btn-secondary" onclick="viewJob('${job.id}')" ${!isAvailable ? 'disabled' : ''} style="padding: 8px 15px; font-size: 14px;">
                        ${isAvailable ? 'View Results' : 'Waiting...'}
                    </button>
                </div>
            `;
        });
        html += '</div>';
        jobList.innerHTML = html;
    }

    window.viewJob = async (jobId) => {
        try {
            const resp = await fetch(`/job_status/${jobId}`);
            const data = await resp.json();
            
            if (data.status === 'completed' && data.is_available) {
                renderBulkResults(data.results);
            } else if (!data.is_available) {
                alert(data.message);
            } else {
                alert("Evaluation still in progress. Status: " + data.status);
            }
        } catch (err) {
            alert("Error fetching results: " + err.message);
        }
    };

    function renderBulkResults(results) {
        let html = `<h2 style="color: var(--primary-orange); margin-bottom: 30px; text-align: center;">Bulk Evaluation Results</h2>
                    <div style="display: flex; flex-direction: column; gap: 40px;">`;
        
        results.forEach(res => {
            let data = {};
            try {
                data = JSON.parse(res.result);
            } catch(e) {
                data = { evaluation: res.result };
            }

            html += `
                <div class="bulk-item" style="border-bottom: 2px solid #eee; padding-bottom: 30px;">
                    <h3 style="color: var(--secondary-teal); margin-bottom: 15px;">Question ${res.index}</h3>
                    <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin-bottom: 20px; font-style: italic;">
                        ${res.question}
                    </div>
                    <div class="score-display" style="padding: 10px; margin-bottom: 15px; display: inline-block;">
                        <span class="score-label" style="font-size: 12px;">Score: ${data.score || 'N/A'}</span>
                    </div>
                    <div class="result-content">
                        <strong>Evaluation:</strong>
                        ${marked.parse(data.evaluation || '')}
                        <details style="margin-top: 15px;">
                            <summary style="cursor: pointer; color: var(--primary-orange); font-weight: 600;">Show Mistakes & Ideal Answer</summary>
                            <div style="margin-top: 10px; padding: 15px; background: #fffaf0; border-radius: 8px;">
                                <strong>Mistakes:</strong>
                                ${marked.parse(data.mistakes || '')}
                                <hr style="margin: 15px 0;">
                                <strong>Ideal Answer:</strong>
                                ${marked.parse(data.ideal_answer || '')}
                            </div>
                        </details>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        resultCard.innerHTML = html;
        resultContainer.classList.remove('hidden');
        resultContainer.scrollIntoView({ behavior: 'smooth' });
    }

    function setLoading(isLoading) {
        submitBtn.disabled = isLoading;
        if (isLoading) {
            btnText.textContent = 'Evaluating...';
            spinner.classList.remove('hidden');
        } else {
            btnText.textContent = 'Evaluate My Answer →';
            spinner.classList.add('hidden');
        }
    }

    function renderResult(data) {
        const score = data.score || "N/A";
        const evaluation = data.evaluation || "";
        const mistakes = data.mistakes || "";
        const ideal = data.ideal_answer || "";

        let html = `
            <div class="score-display">
                <span class="score-label">Your UPSC Score</span>
                <div class="score-value">${score}</div>
            </div>
            
            <div class="result-section">
                <h3>📋 Evaluation</h3>
                <div class="result-content">${marked.parse(evaluation)}</div>
            </div>

            <div id="mistakes-section" class="result-section hidden">
                <h3>⚠️ Mistakes & Improvements</h3>
                <div class="result-content">${marked.parse(mistakes)}</div>
            </div>

            <div id="ideal-section" class="result-section hidden">
                <h3>✅ Ideal Answer</h3>
                <div class="result-content">${marked.parse(ideal)}</div>
            </div>

            <div class="action-buttons" id="action-buttons">
                <button type="button" class="btn-secondary" id="showMistakesBtn">What was the mistake?</button>
                <button type="button" class="btn-outline" id="showIdealBtn">Show Ideal Answer</button>
            </div>
        `;

        resultCard.innerHTML = html;
        resultContainer.classList.remove('hidden');
        resultContainer.scrollIntoView({ behavior: 'smooth' });

        // Add event listeners for new buttons
        document.getElementById('showMistakesBtn').addEventListener('click', function() {
            const section = document.getElementById('mistakes-section');
            section.classList.remove('hidden');
            this.style.display = 'none';
            section.scrollIntoView({ behavior: 'smooth' });
        });

        document.getElementById('showIdealBtn').addEventListener('click', function() {
            const section = document.getElementById('ideal-section');
            section.classList.remove('hidden');
            this.style.display = 'none';
            section.scrollIntoView({ behavior: 'smooth' });
        });
    }

    document.getElementById('resetBtn').addEventListener('click', () => {
        form.reset();
        document.querySelectorAll('.preview-container').forEach(p => p.classList.add('hidden'));
        document.querySelectorAll('.upload-placeholder').forEach(p => p.classList.remove('hidden'));
        resultContainer.classList.add('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // ============================================================
    //  FLASHCARD ENGINE
    // ============================================================

    let fc = {
      cards: [],
      active: [],
      index: 0,
      flipped: false,
      incorrect: new Set(),
      correct: new Set(),
      testMode: false,
      title: '',
      id: null,
      language: 'English'
    };

    // --- Sub-Tab Switching (Generate / Saved / Stats) ---
    document.querySelectorAll('[data-fc-tab]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const target = btn.getAttribute('data-fc-tab');
        document.querySelectorAll('[data-fc-tab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        document.querySelectorAll('.fc-sub-container').forEach(c => c.classList.add('hidden'));
        
        if (target === 'generate') document.getElementById('flashcard-input-panel').classList.remove('hidden');
        if (target === 'saved') {
          document.getElementById('fc-saved-panel').classList.remove('hidden');
          loadSavedSets();
        }
        if (target === 'stats') {
          document.getElementById('fc-performance-panel').classList.remove('hidden');
          loadPerformance();
        }
      });
    });

    // --- Source Tab Switch ---
    document.querySelectorAll('[data-fc-src]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-fc-src]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const src = btn.getAttribute('data-fc-src');
        document.getElementById('fc-topic-input').classList.toggle('hidden', src !== 'topic');
        document.getElementById('fc-content-input').classList.toggle('hidden', src !== 'content');
        
        if (src === 'content') {
            document.getElementById('fc-num-cards').value = "0";
        }
      });
    });

    // --- Generate Button ---
    document.getElementById('fc-generate-btn')?.addEventListener('click', async () => {
      const btn = document.getElementById('fc-generate-btn');
      const btnText = btn.querySelector('.btn-text');
      const spinner = btn.querySelector('.spinner');

      const isTopic = document.querySelector('[data-fc-src].active')?.getAttribute('data-fc-src') === 'topic';
      const topic   = document.getElementById('fc-topic').value.trim();
      const content = document.getElementById('fc-content').value.trim();
      const numCards = parseInt(document.getElementById('fc-num-cards').value);
      const language = document.getElementById('fc-language').value;

      if (isTopic && !topic) { alert('Please enter a topic.'); return; }
      if (!isTopic && !content) { alert('Please paste some content.'); return; }

      btnText.textContent = 'Generating\u2026';
      spinner.classList.remove('hidden');
      btn.disabled = true;

      try {
        const formData = new FormData();
        if (isTopic) formData.append('topic', topic);
        else         formData.append('content', content);
        formData.append('num_cards', numCards);
        formData.append('language', language);

        const resp = await fetch('/generate_flashcards', { method: 'POST', body: formData });
        if (!resp.ok) throw new Error('Generation failed');
        const data = await resp.json();

        if (!data.cards || data.cards.length === 0) throw new Error('No cards generated');

        console.log('Flashcards generated, attempting to save to MongoDB...');

        // Save to MongoDB
        let savedId = null;
        try {
            const saveResp = await fetch('/api/save_flashcard_set', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: data.title || (isTopic ? topic : 'Flashcard Set'),
                    language: language,
                    cards: data.cards
                })
            });
            
            if (saveResp.ok) {
                const saveResult = await saveResp.json();
                savedId = saveResult.id;
                console.log('Successfully saved to MongoDB with ID:', savedId);
            } else {
                const errorData = await saveResp.json();
                console.error('MongoDB Save Error:', errorData);
            }
        } catch (saveErr) {
            console.error('Failed to connect to save API:', saveErr);
        }

        fcInit(data.cards, data.title || (isTopic ? topic : 'Flashcard Set'), savedId, language);
      } catch (err) {
        alert('Error: ' + err.message);
      } finally {
        btnText.textContent = '\u2728 Generate Flashcards';
        spinner.classList.add('hidden');
        btn.disabled = false;
      }
    });

    // --- Init ---
    function fcInit(cards, title, id = null, language = 'English') {
      fc.cards    = cards;
      fc.title    = title;
      fc.id       = id;
      fc.language = language;
      fc.active   = cards.map((_, i) => i);
      fc.index    = 0;
      fc.flipped  = false;
      fc.incorrect = new Set();
      fc.correct   = new Set();
      fc.testMode  = false;

      document.getElementById('fc-set-title').textContent = title;
      document.getElementById('fc-mode-label').textContent = `Studying all ${cards.length} cards`;
      document.getElementById('fc-incorrect-count').textContent = '0';
      document.getElementById('fc-correct-count').textContent   = '0';
      document.getElementById('fc-completion').classList.add('hidden');
      document.getElementById('fc-card-wrapper').style.display = 'block';

      document.querySelectorAll('.fc-sub-container').forEach(c => c.classList.add('hidden'));
      document.getElementById('flashcard-viewer').classList.remove('hidden');

      fcRender();
    }

    // --- Render current card ---
    function fcRender() {
      const card = document.getElementById('fc-card');
      card.style.transition = 'none';
      card.classList.remove('is-flipped');
      fc.flipped = false;
      setTimeout(() => { card.style.transition = ''; }, 20);

      const cardIndex = fc.active[fc.index];
      const data = fc.cards[cardIndex];
      const total = fc.active.length;
      const pos   = fc.index + 1;

      document.getElementById('fc-question-text').textContent = data.question;
      document.getElementById('fc-answer-text').textContent   = data.answer;
      document.getElementById('fc-counter').textContent      = `${pos} / ${total}`;
      document.getElementById('fc-counter-back').textContent = `${pos} / ${total}`;

      const pct = total > 1 ? ((pos - 1) / (total - 1)) * 100 : 100;
      document.getElementById('fc-progress-bar').style.width = pct + '%';

      document.getElementById('fc-completion').classList.add('hidden');
      document.getElementById('fc-card-wrapper').style.display = 'block';
    }

    // --- Flip ---
    window.fcFlipCard = () => {
      const card = document.getElementById('fc-card');
      fc.flipped = !fc.flipped;
      card.classList.toggle('is-flipped', fc.flipped);
    };

    // --- Navigation ---
    window.fcNext = () => {
      if (fc.index < fc.active.length - 1) {
        fc.index++;
        fcRender();
      } else {
        fcShowCompletion();
      }
    };

    window.fcPrev = () => {
      if (fc.index > 0) {
        fc.index--;
        fcRender();
      }
    };

    // --- Mark Correct / Incorrect ---
    window.fcMarkCorrect = () => {
      const cardIndex = fc.active[fc.index];
      fc.correct.add(cardIndex);
      fc.incorrect.delete(cardIndex);
      fcUpdateCounts();
      fcNext();
    };

    window.fcMarkIncorrect = () => {
      const cardIndex = fc.active[fc.index];
      fc.incorrect.add(cardIndex);
      fc.correct.delete(cardIndex);
      fcUpdateCounts();
      fcNext();
    };

    function fcUpdateCounts() {
      document.getElementById('fc-incorrect-count').textContent = fc.incorrect.size;
      document.getElementById('fc-correct-count').textContent   = fc.correct.size;
    }

    // --- Shuffle ---
    window.fcShuffle = () => {
      for (let i = fc.active.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [fc.active[i], fc.active[j]] = [fc.active[j], fc.active[i]];
      }
      fc.index = 0;
      fcRender();
    };

    // --- Restart ---
    window.fcRestart = () => {
      fc.active    = fc.cards.map((_, i) => i);
      fc.index     = 0;
      fc.incorrect = new Set();
      fc.correct   = new Set();
      fc.testMode  = false;
      document.getElementById('fc-mode-label').textContent = `Studying all ${fc.cards.length} cards`;
      fcUpdateCounts();
      fcRender();
    };

    // --- Test Mode ---
    window.fcStartTestMode = () => {
      if (fc.incorrect.size === 0) {
        alert('No incorrect cards to test! Mark some cards as incorrect first.');
        return;
      }
      fc.testMode = true;
      fc.active   = [...fc.incorrect];
      fc.index    = 0;

      fc.active.forEach(idx => {
        fc.incorrect.delete(idx);
        fc.correct.delete(idx);
      });
      fcUpdateCounts();

      document.getElementById('fc-mode-label').textContent = `🎯 Testing ${fc.active.length} incorrect card${fc.active.length > 1 ? 's' : ''}`;
      document.getElementById('fc-completion').classList.add('hidden');
      document.getElementById('fc-card-wrapper').style.display = 'block';
      fcRender();
    };

    // --- Completion Screen ---
    async function fcShowCompletion() {
      document.getElementById('fc-card-wrapper').style.display = 'none';
      
      const total     = fc.cards.length;
      const correct   = fc.correct.size;
      const incorrect = fc.incorrect.size;

      document.getElementById('fc-final-score').textContent =
        `\u2714 ${correct} correct  |  \u2718 ${incorrect} incorrect  |  ${total - correct - incorrect} unmarked`;

      const retryBtn = document.getElementById('fc-retry-incorrect-btn');
      retryBtn.style.display = fc.incorrect.size > 0 ? 'inline-block' : 'none';

      document.getElementById('fc-completion').classList.remove('hidden');

      // Save Session to MongoDB
      try {
        await fetch('/api/save_session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            set_id: fc.id || 'temp',
            set_title: fc.title,
            correct_count: correct,
            incorrect_count: incorrect,
            total_cards: total,
            incorrect_indices: Array.from(fc.incorrect)
          })
        });
      } catch (err) {
        console.error('Failed to save study session:', err);
      }
    }

    // --- MongoDB Loading Logic ---
    async function loadSavedSets() {
      const container = document.getElementById('fc-saved-list');
      container.innerHTML = '<p style="color: #888; text-align: center; grid-column: 1/-1;">Loading saved sets...</p>';

      try {
        const [setsResp, statsResp] = await Promise.all([
          fetch('/api/flashcard_sets'),
          fetch('/api/performance')
        ]);
        const sets = await setsResp.json();
        const stats = await statsResp.json();

        if (sets.length === 0) {
          container.innerHTML = '<p style="color: #888; text-align: center; grid-column: 1/-1;">No saved sets found. Generate some first!</p>';
          return;
        }

        // Map latest session to each set
        const setStats = {};
        stats.forEach(s => {
          if (!setStats[s.set_id]) setStats[s.set_id] = s;
        });

        container.innerHTML = sets.map(s => {
          const lastSession = setStats[s._id];
          // Robust check for wrong cards
          const hasWrong = lastSession && (
            (lastSession.incorrect_indices && lastSession.incorrect_indices.length > 0) ||
            (lastSession.incorrect_count > 0)
          );
          
          console.log(`Set: ${s.title}, Last Session:`, lastSession);

          return `
            <div class="job-item" style="padding: 20px; border: 1px solid #eee; border-radius: 15px; background: white; display: flex; flex-direction: column; gap: 12px; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 4px 12px rgba(0,0,0,0.03);"
                 onmouseover="this.style.transform='translateY(-5px)'; this.style.boxShadow='0 12px 25px rgba(0,0,0,0.08)';" 
                 onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.03)';">
              <div>
                <div style="font-weight: 700; color: var(--primary-orange); font-size: 16px; margin-bottom: 4px;">${s.title}</div>
                <div style="font-size: 13px; color: #666;">${s.cards.length} Cards • ${s.language}</div>
              </div>
              
              ${lastSession ? `
                <div style="background: #fff8f8; padding: 10px 12px; border-radius: 10px; font-size: 13px; border: 1px solid #ffebeb;">
                  <span style="color: #888;">Last Performance:</span> 
                  <b style="color: ${lastSession.incorrect_count === 0 ? '#2ecc71' : '#e74c3c'}; font-size: 15px;">
                    ${lastSession.correct_count}/${lastSession.total_cards} Correct
                  </b>
                </div>
              ` : ''}

              <div style="display: flex; gap: 10px; margin-top: auto; padding-top: 10px;">
                <button class="fc-ctrl-btn fc-ctrl-btn--orange" style="flex: 1; font-size: 14px; padding: 10px 0;" onclick="viewSavedSet('${s._id}')">
                  Study All
                </button>
                ${hasWrong ? `
                  <button class="fc-ctrl-btn" style="flex: 1; font-size: 14px; padding: 10px 0; background: #fff1f1; border-color: #ffcccc; color: #e74c3c; font-weight: 700;" 
                          onclick="viewSavedSetIncorrect('${s._id}')">
                    Retry Wrong (${lastSession.incorrect_indices ? lastSession.incorrect_indices.length : lastSession.incorrect_count})
                  </button>
                ` : ''}
              </div>
            </div>
          `;
        }).join('');

        window.savedSetsCache = sets;
        window.setStatsCache = setStats;
      } catch (err) {
        container.innerHTML = `<p style="color: red; text-align: center; grid-column: 1/-1;">Error: ${err.message}</p>`;
      }
    }

    window.viewSavedSet = (id) => {
      const s = window.savedSetsCache.find(x => x._id === id);
      if (s) {
        fcInit(s.cards, s.title, s._id, s.language);
      }
    };

    window.viewSavedSetIncorrect = (id) => {
      const s = window.savedSetsCache.find(x => x._id === id);
      const stats = window.setStatsCache[id];
      if (s && stats) {
        if (!stats.incorrect_indices || stats.incorrect_indices.length === 0) {
          alert("Sorry, this is an older session that didn't save which specific cards were wrong. Please complete a 'Study All' session first!");
          return;
        }
        fcInit(s.cards, s.title, s._id, s.language);
        // Immediately switch to test mode for those indices
        fc.testMode = true;
        fc.active   = [...stats.incorrect_indices];
        fc.index    = 0;
        fc.active.forEach(idx => {
          fc.incorrect.delete(idx);
          fc.correct.delete(idx);
        });
        fcUpdateCounts();
        document.getElementById('fc-mode-label').textContent = `🎯 Retrying ${fc.active.length} cards from last time`;
        fcRender();
      }
    };

    async function loadPerformance() {
      const summary = document.getElementById('fc-stats-summary');
      const list = document.getElementById('fc-performance-list');
      
      summary.innerHTML = '<p style="width:100%">Loading stats...</p>';
      list.innerHTML = '';

      try {
        const resp = await fetch('/api/performance');
        const sessions = await resp.json();

        if (sessions.length === 0) {
          summary.innerHTML = '';
          list.innerHTML = '<p style="color: #888; text-align: center; padding: 40px;">No study history yet. Start studying your flashcards!</p>';
          return;
        }

        const totalSessions = sessions.length;
        const totalCorrect = sessions.reduce((acc, s) => acc + s.correct_count, 0);
        const totalIncorrect = sessions.reduce((acc, s) => acc + s.incorrect_count, 0);
        const avgAccuracy = Math.round((totalCorrect / (totalCorrect + totalIncorrect || 1)) * 100);

        summary.innerHTML = `
          <div style="flex: 1; padding: 15px; background: #fff8f0; border-radius: 12px;">
            <div style="font-size: 24px; font-weight: 800; color: var(--primary-orange);">${totalSessions}</div>
            <div style="font-size: 12px; color: #888; text-transform: uppercase;">Sessions</div>
          </div>
          <div style="flex: 1; padding: 15px; background: #f0fff8; border-radius: 12px;">
            <div style="font-size: 24px; font-weight: 800; color: #2ecc71;">${avgAccuracy}%</div>
            <div style="font-size: 12px; color: #888; text-transform: uppercase;">Accuracy</div>
          </div>
          <div style="flex: 1; padding: 15px; background: #f8f0ff; border-radius: 12px;">
            <div style="font-size: 24px; font-weight: 800; color: #9b59b6;">${totalCorrect}</div>
            <div style="font-size: 12px; color: #888; text-transform: uppercase;">Correct</div>
          </div>
        `;

        list.innerHTML = sessions.map(s => `
          <div style="padding: 12px; border-bottom: 1px solid #f9f9f9; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-weight: 600; font-size: 14px;">${s.set_title}</div>
              <div style="font-size: 12px; color: #999;">${new Date(s.timestamp).toLocaleString()}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-weight: 700; color: ${s.correct_count >= s.incorrect_count ? '#2ecc71' : '#e74c3c'};">
                ${s.correct_count} / ${s.total_cards}
              </div>
              <div style="font-size: 11px; color: #aaa;">${Math.round((s.correct_count/s.total_cards)*100)}% correct</div>
            </div>
          </div>
        `).join('');

      } catch (err) {
        summary.innerHTML = `<p style="color: red;">Error: ${err.message}</p>`;
      }
    }

    // --- Button Wiring ---
    document.getElementById('fc-shuffle-btn')?.addEventListener('click', fcShuffle);
    document.getElementById('fc-test-btn')?.addEventListener('click', fcStartTestMode);
    document.getElementById('fc-restart-btn')?.addEventListener('click', fcRestart);
    document.getElementById('fc-new-btn')?.addEventListener('click', () => {
      document.getElementById('flashcard-viewer').classList.add('hidden');
      document.getElementById('flashcard-input-panel').classList.remove('hidden');
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      const viewer = document.getElementById('flashcard-viewer');
      if (!viewer || viewer.classList.contains('hidden')) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

      switch(e.key) {
        case 'ArrowRight': case 'l': window.fcNext();          break;
        case 'ArrowLeft':  case 'h': window.fcPrev();          break;
        case ' ':          e.preventDefault(); window.fcFlipCard(); break;
        case 'g':          window.fcMarkCorrect();             break;
        case 'b':          window.fcMarkIncorrect();           break;
      }
    });

    console.log("Active Recall initialized successfully.");
  } catch (e) {
    console.error("Critical JS Error:", e);
    alert("Critical JS Error: " + e.message);
  }
});
