/* Quaderno d'Inglese V16 — streaming Gemini, UI moderna, funzioni essenziali */
(function () {
  'use strict';

  const STORAGE = {
    key: 'quaderno_v16_gemini_key',
    settings: 'quaderno_v16_settings',
    vocab: 'quaderno_v16_vocab',
    theme: 'quaderno_v16_theme',
    oxfordCache: 'quaderno_v16_oxford_cache',
    stats: 'quaderno_v16_stats',
    dlgProgress: 'quaderno_v16_dlg_progress'
  };

  const FALLBACK_MODELS = [
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.7-flash',
    'gemini-3.8-flash'
  ];

  // ─── State ───────────────────────────────────────────────
  let talkHistory = [];
  let correctStreak = 0;
  let vocab = loadVocab();
  let oxfordIdx = 0;
  let oxfordFiltered = [];
  let currentRtSentence = '';
  let rtUsed = [];
  let abortController = null;
  let dialogueState = null; // { pack, lineIndex }
  let listenPackId = null; // null = mixed offline sentences
  let listenIndex = 0;
  let currentListenItem = null; // {en, it}
  let writePromptIndex = 0;

  // ─── Utils ───────────────────────────────────────────────
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const escapeHtml = (s) => {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  };

  function loadJSON(k, fallback) {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  }
  function saveJSON(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (_) {}
  }

  function loadStats() {
    return loadJSON(STORAGE.stats, {
      minutes: 0,
      sessions: 0,
      talkTurns: 0,
      rtDone: 0,
      lastDay: '',
      streak: 0,
      days: {}
    });
  }

  function touchStudy(minutes, kind) {
    const s = loadStats();
    const day = new Date().toISOString().slice(0, 10);
    if (s.lastDay && s.lastDay !== day) {
      const prev = new Date(s.lastDay + 'T12:00:00');
      const cur = new Date(day + 'T12:00:00');
      const diff = Math.round((cur - prev) / 86400000);
      s.streak = diff === 1 ? (s.streak || 0) + 1 : 1;
    } else if (!s.lastDay) {
      s.streak = 1;
    }
    s.lastDay = day;
    s.minutes = (s.minutes || 0) + (minutes || 0);
    if (kind === 'session') s.sessions = (s.sessions || 0) + 1;
    if (kind === 'talk') s.talkTurns = (s.talkTurns || 0) + 1;
    if (kind === 'rt') s.rtDone = (s.rtDone || 0) + 1;
    s.days = s.days || {};
    s.days[day] = (s.days[day] || 0) + (minutes || 1);
    saveJSON(STORAGE.stats, s);
    return s;
  }

  function getKey() {
    return (
      (localStorage.getItem(STORAGE.key) || '').trim() ||
      ($('#apiKey')?.value || '').trim()
    );
  }
  function getModel() {
    let m = ($('#model')?.value || '').trim() || 'gemini-3.6-flash';
    // Migra modelli non più disponibili
    if (/gemini-1\.5|gemini-2\.5-flash$|gemini-2\.0-flash-lite|flash-8b/i.test(m)) {
      m = 'gemini-3.6-flash';
      const sel = $('#model');
      if (sel) sel.value = m;
      try {
        const s = JSON.parse(localStorage.getItem(STORAGE.settings) || '{}');
        s.model = m;
        localStorage.setItem(STORAGE.settings, JSON.stringify(s));
      } catch (_) {}
    }
    return m;
  }
  function getLevel() {
    return $('#level')?.value || 'A1';
  }
  function getTopic() {
    return ($('#topic')?.value || '').trim();
  }
  function autoSpeak() {
    return $('#autoSpeak')?.checked !== false;
  }
  function speechRate() {
    return parseFloat($('#speechRate')?.value) || 0.95;
  }

  // ─── Theme ───────────────────────────────────────────────
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    const meta = $('#themeColorMeta');
    if (meta) meta.content = t === 'light' ? '#f0f4f8' : '#0b1220';
    localStorage.setItem(STORAGE.theme, t);
  }
  function initTheme() {
    const saved = localStorage.getItem(STORAGE.theme) || 'dark';
    applyTheme(saved);
  }

  // ─── Navigation ──────────────────────────────────────────

  function initWritePanel() {
    const chips = $('#writeChips');
    if (!chips) return;
    const prompts = window.WRITE_PROMPTS || [];
    if (!chips.dataset.ready) {
      chips.innerHTML = '';
      prompts.forEach((p, idx) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip' + (idx === writePromptIndex ? ' active' : '');
        b.textContent = p.title;
        b.addEventListener('click', () => {
          writePromptIndex = idx;
          chips.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
          b.classList.add('active');
          loadWritePrompt();
        });
        chips.appendChild(b);
      });
      chips.dataset.ready = '1';
    }
    loadWritePrompt();
  }

  function loadWritePrompt() {
    const prompts = window.WRITE_PROMPTS || [];
    if (!prompts.length) return;
    writePromptIndex = writePromptIndex % prompts.length;
    const p = prompts[writePromptIndex];
    if ($('#writeLevel')) $('#writeLevel').textContent = p.level || '';
    if ($('#writeTitle')) $('#writeTitle').textContent = p.title || '';
    if ($('#writePrompt')) $('#writePrompt').textContent = p.prompt_it || '';
    const tips = $('#writeTips');
    if (tips) {
      tips.innerHTML = '<p class="label">Consigli</p><ul>' +
        (p.tips || []).map((t) => '<li>' + t + '</li>').join('') + '</ul>';
    }
    if ($('#writeInput')) $('#writeInput').value = '';
    const fb = $('#writeFeedback');
    if (fb) { fb.hidden = true; fb.innerHTML = ''; }
    const chips = $('#writeChips');
    if (chips) {
      chips.querySelectorAll('.chip').forEach((c, i) => {
        c.classList.toggle('active', i === writePromptIndex);
      });
    }
  }

  function offlineWriteFeedback(p, text) {
    const lower = text.toLowerCase();
    const keys = p.keywords || [];
    const hit = keys.filter((k) => lower.includes(k.toLowerCase()));
    const score = keys.length ? Math.round((hit.length / keys.length) * 100) : 50;
    let msg = '';
    if (score >= 70) msg = 'Buon lavoro: hai usato diverse strutture utili.';
    else if (score >= 40) msg = 'Ok: prova ad aggiungere altre espressioni dai consigli.';
    else msg = 'Incompleta: rileggi i consigli e l’esempio, poi riprova.';
    const badge = score >= 70 ? 'ok' : score >= 40 ? 'mid' : 'low';
    return (
      '<div class="wf-card">' +
      '<div class="wf-badge ' + badge + '">Offline · ' + score + '%</div>' +
      '<p class="wf-msg">' + msg + '</p>' +
      (hit.length ? '<p class="wf-keys">Parole usate: <strong>' + hit.join(', ') + '</strong></p>' : '') +
      '<div class="wf-section"><span class="wf-label">Esempio modello</span>' +
      '<div class="wf-example">' + escapeHtml(p.example || '') + '</div></div>' +
      '<p class="wf-hint">Non deve essere identico: confronta idee e strutture.</p>' +
      '</div>'
    );
  }

  function writeSystem() {
    return (
      'Sei un insegnante di inglese per studenti italiani. ' +
      'Correggi il testo dello studente in modo chiaro e gentile. ' +
      'Rispondi SOLO in JSON valido con chiavi: ' +
      '{"score":0-100,"corrected":"versione corretta in inglese",' +
      '"translation":"traduzione italiana del testo corretto",' +
      '"tips":["consiglio 1","consiglio 2"],"praise":"frase breve di incoraggiamento in italiano"}. ' +
      'Non aggiungere markdown.'
    );
  }

  async function checkWriting() {
    const prompts = window.WRITE_PROMPTS || [];
    const p = prompts[writePromptIndex];
    if (!p) return;
    const text = ($('#writeInput')?.value || '').trim();
    const fb = $('#writeFeedback');
    if (!fb) return;
    if (!text) {
      fb.hidden = false;
      fb.innerHTML = '<p class="warn">Scrivi almeno una frase in inglese.</p>';
      return;
    }

    // Always show offline feedback first (instant)
    fb.hidden = false;
    fb.innerHTML = offlineWriteFeedback(p, text) +
      '<p class="hint" id="writeAiHint">Se online, Gemini può aggiungere correzione dettagliata…</p>';
    touchStudy();

    // Optional Gemini enrichment
    const key = (typeof getKey === 'function' ? getKey() : '') || ($('#apiKey')?.value || '').trim();
    if (!key) {
      const h = $('#writeAiHint');
      if (h) h.textContent = 'Aggiungi la API key in Impostazioni per la correzione AI.';
      return;
    }
    try {
      const userMsg =
        'Tema: ' + (p.title || '') + '\n' +
        'Consegna (IT): ' + (p.prompt_it || '') + '\n' +
        'Testo studente (EN):\n' + text + '\n' +
        'Esempio di riferimento:\n' + (p.example || '');
      const r = await callGemini(writeSystem(), userMsg);
      let data = r;
      if (typeof r === 'string') {
        try { data = JSON.parse(r); } catch (_) { data = {}; }
      }
      // callGemini may return object with fields already
      const score = data.score != null ? data.score : '';
      const corrected = data.corrected || data.sentence || '';
      const translation = data.translation || data.italian || data.trans || '';
      const tips = Array.isArray(data.tips) ? data.tips : [];
      const praise = data.praise || '';
      if (corrected || translation || tips.length) {
        fb.innerHTML =
          offlineWriteFeedback(p, text) +
          '<div class="wf-card ai">' +
          '<div class="wf-badge ok">Correzione AI' +
          (score !== '' ? ' · ' + score + '/100' : '') +
          '</div>' +
          (praise ? '<p class="wf-msg">' + escapeHtml(String(praise)) + '</p>' : '') +
          (corrected
            ? '<div class="wf-section"><span class="wf-label">Versione corretta (EN)</span>' +
              '<div class="wf-example">' + escapeHtml(String(corrected)) + '</div></div>'
            : '') +
          (translation
            ? '<div class="wf-section"><span class="wf-label">Traduzione (IT)</span>' +
              '<div class="wf-it">' + escapeHtml(String(translation)) + '</div></div>'
            : '') +
          (tips.length
            ? '<div class="wf-section"><span class="wf-label">Consigli</span><ul class="wf-tips">' +
              tips.map((t) => '<li>' + escapeHtml(String(t)) + '</li>').join('') +
              '</ul></div>'
            : '') +
          '</div>';
      }
    } catch (e) {
      const h = $('#writeAiHint');
      if (h) h.textContent = 'AI non disponibile: resta il feedback offline. (' + (e.message || 'errore') + ')';
    }
  }


  function showScreen(name) {
    // write is a learn tab, not a screen
    if (name === 'write') {
      name = 'learn';
      setTimeout(() => {
        const wb = Array.from(document.querySelectorAll('#learnTabs .seg')).find((x) => x.dataset.mode === 'write');
        if (wb) wb.click();
      }, 30);
    }
    $$('.screen').forEach((s) => s.classList.toggle('active', s.dataset.screen === name));
    $$('#bottomNav button').forEach((b) =>
      b.classList.toggle('active', b.dataset.screen === name)
    );
    if (name !== 'learn') clearOxfordAuto();
    if (name === 'learn') renderVocabList();
    if (name === 'home') updateHome();
    if (name === 'course') renderCourseList();
    if (name === 'repeat') {
      try { initListenChips(); } catch (_) {}
    }
  }

  // ─── Speech ──────────────────────────────────────────────
  let voiceEn = null;
  function refreshVoices() {
    if (!('speechSynthesis' in window)) return;
    const voices = speechSynthesis.getVoices();
    voiceEn =
      voices.find((v) => /^en/i.test(v.lang) && /google|natural|neural|microsoft/i.test(v.name)) ||
      voices.find((v) => /^en/i.test(v.lang)) ||
      null;
  }
  if ('speechSynthesis' in window) {
    refreshVoices();
    speechSynthesis.onvoiceschanged = refreshVoices;
  }
  function speak(text, lang = 'en-US') {
    if (!text || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text));
    u.lang = lang;
    u.rate = speechRate();
    if (voiceEn && /^en/i.test(lang)) u.voice = voiceEn;
    speechSynthesis.speak(u);
  }

  /** Pronuncia in sequenza senza cancellare le successive. items: [{text, lang}] */
  function speakSequence(items, onDone) {
    if (!('speechSynthesis' in window)) {
      if (onDone) setTimeout(onDone, 400);
      return;
    }
    speechSynthesis.cancel();
    const list = (items || []).filter((x) => x && x.text && String(x.text).trim());
    if (!list.length) {
      if (onDone) onDone();
      return;
    }
    let i = 0;
    const play = () => {
      if (i >= list.length) {
        if (onDone) onDone();
        return;
      }
      const item = list[i++];
      const u = new SpeechSynthesisUtterance(String(item.text).trim());
      u.lang = item.lang || 'en-US';
      u.rate = speechRate() * (item.lang && /^it/i.test(item.lang) ? 0.95 : 1);
      if (voiceEn && /^en/i.test(u.lang)) u.voice = voiceEn;
      u.onend = () => setTimeout(play, item.pauseAfter || 350);
      u.onerror = () => setTimeout(play, 200);
      speechSynthesis.speak(u);
    };
    play();
  }

  function speakOxfordPair(enWord, itText, onDone) {
    const it = String(itText || '')
      .replace(/^\(+|\)+$/g, '')
      .replace(/^(nessuna|traduzione).*/i, '')
      .trim();
    const items = [{ text: enWord, lang: 'en-US', pauseAfter: 450 }];
    if (it && it !== '…' && it !== '—' && !it.startsWith('(')) {
      // prendi solo la prima traduzione se multiple (slash)
      const firstIt = it.split('/')[0].split('·')[0].trim();
      if (firstIt) items.push({ text: firstIt, lang: 'it-IT', pauseAfter: 200 });
    }
    speakSequence(items, onDone);
  }

  // ─── Gemini core (streaming + non-streaming) ─────────────
  function extractJson(raw) {
    const text = String(raw || '').trim();
    if (!text) throw new Error('Risposta vuota da Gemini.');
    try {
      return JSON.parse(text);
    } catch (_) {}
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced) {
      try {
        return JSON.parse(fenced[1]);
      } catch (_) {}
    }
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(text.slice(first, last + 1));
      } catch (_) {}
    }
    throw new Error('Gemini non ha restituito JSON valido.');
  }

  function friendlyError(msg) {
    const m = String(msg || '').toLowerCase();
    if (/no longer available|update your code|gemini-2\.5|is not found|not supported for generatecontent|not found for api version/i.test(m))
      return 'Modello non disponibile. Vai in Impostazioni e scegli Gemini 3.6 Flash (o un altro 3.x).';
    if (/high demand|overloaded|try again later|temporarily unavailable/.test(m))
      return 'Gemini sovraccarico. Puoi continuare offline (Ripeti / Corso / Oxford). Riprova l’AI tra poco.';
    if (/resource_exhausted|rate limit|429/.test(m))
      return 'Limite richieste Gemini. Usa le funzioni offline oppure attendi 1–2 minuti.';
    if (/api key|401|403|invalid|permission/.test(m))
      return 'API Key non valida o mancante. Controllala in Impostazioni → Gemini.';
    if (/network|failed to fetch|offline/i.test(m))
      return 'Nessuna connessione. Le funzioni offline restano disponibili.';
    // evita dump tecnici lunghi
    if (m.length > 160) return 'Errore Gemini. Prova un altro modello in Impostazioni o usa la modalità offline.';
    return String(msg || 'Gemini non disponibile.');
  }

  function isRetryable(msg, status) {
    const m = String(msg || '').toLowerCase();
    return (
      status === 429 ||
      status === 500 ||
      status === 502 ||
      status === 503 ||
      status === 504 ||
      /high demand|resource_exhausted|overloaded|rate limit|unavailable|try again/.test(m)
    );
  }

  function isModelUnavailable(msg, status) {
    const m = String(msg || '').toLowerCase();
    return (
      status === 404 ||
      status === 400 ||
      /is not found|no longer available|not supported for generatecontent|not found for api version/.test(m)
    );
  }

  function buildContents(userText, history) {
    const contents = (history || []).map((h) => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: String(h.text || '') }]
    }));
    contents.push({ role: 'user', parts: [{ text: String(userText || '') }] });
    return contents;
  }

  /**
   * Streaming call. onChunk(accumulatedText) is called as text arrives.
   * Returns parsed JSON (via extractJson) at the end.
   */
  async function callGeminiStream(systemPrompt, userText, history, onChunk) {
    const key = getKey();
    if (!key) throw new Error('Inserisci la API Key nelle Impostazioni.');

    const preferred = getModel();
    const models = [preferred, ...FALLBACK_MODELS.filter((m) => m !== preferred)];
    const contents = buildContents(userText, history);
    let lastError = null;

    abortController = new AbortController();

    for (const model of models) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const url =
            'https://generativelanguage.googleapis.com/v1beta/models/' +
            encodeURIComponent(model) +
            ':streamGenerateContent?alt=sse&key=' +
            encodeURIComponent(key);

          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: abortController.signal,
            body: JSON.stringify({
              contents,
              systemInstruction: { parts: [{ text: String(systemPrompt || '') }] },
              generationConfig: {
                responseMimeType: 'application/json',
                maxOutputTokens: 512,
                temperature: 0.6
              }
            })
          });

          if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            const errMsg = d.error?.message || `Gemini (${res.status})`;
            if (res.status === 401 || res.status === 403)
              throw new Error('API Key Gemini non valida o non autorizzata.');
            // Modello non disponibile → passa subito al successivo
            if (isModelUnavailable(errMsg, res.status)) {
              lastError = new Error(errMsg);
              break;
            }
            if (isRetryable(errMsg, res.status)) {
              lastError = new Error(errMsg);
              if (attempt < 2) {
                await sleep(350 * Math.pow(2, attempt));
                continue;
              }
              break; // next model
            }
            lastError = new Error(errMsg);
            break;
          }

          // Read SSE stream
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let fullText = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            // Parse SSE: lines starting with "data: "
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // keep incomplete line

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) continue;
              const payload = trimmed.slice(5).trim();
              if (!payload || payload === '[DONE]') continue;
              try {
                const obj = JSON.parse(payload);
                if (obj.promptFeedback?.blockReason) {
                  throw new Error('Richiesta bloccata (safety): ' + obj.promptFeedback.blockReason);
                }
                const piece =
                  obj.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
                if (piece) {
                  fullText += piece;
                  if (typeof onChunk === 'function') onChunk(fullText);
                }
              } catch (e) {
                if (e.message && e.message.includes('safety')) throw e;
                // ignore partial JSON parse of SSE frame
              }
            }
          }

          if (!fullText.trim()) throw new Error('Risposta vuota da Gemini.');

          window.__lastGeminiModel = model;
          const hint = $('#topModelHint');
          if (hint) hint.textContent = model.replace(/^gemini-/, '');
          window.dispatchEvent(
            new CustomEvent('gemini:model-used', { detail: { model } })
          );

          return extractJson(fullText);
        } catch (e) {
          if (e.name === 'AbortError') throw e;
          lastError = e;
          const msg = e.message || String(e);
          if (/API Key|safety/i.test(msg)) throw e;
          if (/network|failed to fetch|TypeError/i.test(msg) || e.name === 'TypeError') {
            if (attempt < 2) {
              await sleep(350 * Math.pow(2, attempt));
              continue;
            }
          }
          break; // try next model
        }
      }
    }

    throw lastError || new Error('Gemini non disponibile.');
  }

  /** Non-streaming fallback (same API without stream) for simple one-shot JSON */
  async function callGemini(systemPrompt, userText, history) {
    return callGeminiStream(systemPrompt, userText, history, null);
  }

  // ─── Vocab / SRS ─────────────────────────────────────────
  function loadVocab() {
    return loadJSON(STORAGE.vocab, []);
  }
  function saveVocab() {
    saveJSON(STORAGE.vocab, vocab);
    updateHome();
  }

  function addVocab(word, translation, note, source) {
    word = String(word || '').trim();
    if (!word) return;
    const existing = vocab.find((v) => v.word.toLowerCase() === word.toLowerCase());
    if (existing) {
      if (translation) existing.translation = translation;
      if (note) existing.note = note;
      saveVocab();
      return;
    }
    vocab.unshift({
      id: 'v' + Date.now(),
      word,
      translation: translation || '',
      note: note || '',
      source: source || '',
      interval: 0,
      repetitions: 0,
      easiness: 2.5,
      due: Date.now()
    });
    saveVocab();
  }

  function dueCards() {
    const now = Date.now();
    return vocab.filter((v) => !v.due || v.due <= now);
  }

  function rateCard(card, quality) {
    // SM-2 simplified
    let { easiness, interval, repetitions } = card;
    if (quality < 3) {
      repetitions = 0;
      interval = 0;
    } else {
      if (repetitions === 0) interval = 1;
      else if (repetitions === 1) interval = 3;
      else interval = Math.round(interval * easiness);
      repetitions += 1;
    }
    easiness = Math.max(1.3, easiness + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
    card.easiness = easiness;
    card.interval = interval;
    card.repetitions = repetitions;
    card.due = Date.now() + interval * 24 * 60 * 60 * 1000;
    saveVocab();
  }

  // ─── Home ────────────────────────────────────────────────
  function updateHome() {
    const st = loadStats();
    $('#statWords').textContent = vocab.length;
    $('#statDue').textContent = dueCards().length;
    const streakEl = $('#statStreak');
    if (streakEl) streakEl.textContent = st.streak || 0;
    // optional extra stats if elements exist
    const m = $('#statMinutes');
    if (m) m.textContent = Math.round(st.minutes || 0);
    const cbadge = $('#courseProgressBadge');
    if (cbadge && window.COURSE_A1) {
      const prog = loadCourseProgress();
      const total = window.COURSE_A1.lessons.length;
      const done = Object.keys(prog.done || {}).length;
      cbadge.textContent = done + '/' + total;
    }
    const tip = $('#homeTipText');
    const courseProg = loadCourseProgress();
    const courseTotal = (window.COURSE_A1 && window.COURSE_A1.lessons) ? window.COURSE_A1.lessons.length : 0;
    const courseDone = courseTotal ? Object.keys(courseProg.done || {}).length : 0;
    const homeCourseSub = $('#homeCourseSub');
    if (homeCourseSub && courseTotal) {
      homeCourseSub.textContent =
        courseDone >= courseTotal
          ? 'Completato · puoi ripetere'
          : courseDone + '/' + courseTotal + ' lezioni · continua';
    }
    if (!getKey()) {
      tip.textContent = 'Inizia dal Corso in alto (offline). Per l’AI aggiungi la chiave Gemini in Impostazioni.';
    } else if (courseDone < courseTotal) {
      tip.textContent = `Corso: ${courseDone}/${courseTotal} lezioni. Tocca la card in alto per continuare.`;
    } else if (dueCards().length > 0) {
      tip.textContent = `Hai ${dueCards().length} parole da ripassare oggi.`;
    } else {
      tip.textContent = 'Corso completato. Prova Oxford o una conversazione.';
    }
  }

  // ─── Talk (Conversazione) ────────────────────────────────
  function talkSystem() {
    const lvl = getLevel();
    const tp = getTopic();
    return (
      `Insegnante inglese per studente italiano livello ${lvl}.` +
      (tp ? ` Tema: ${tp}.` : '') +
      ' Correggi errori. reply: 1-2 frasi in inglese. translation: traduzione italiana di reply. why in italiano. ' +
      'SOLO JSON: {"corrections":[{"wrong":"","right":"","why":""}],"reply":"","translation":""}'
    );
  }

  function addTalkBubble(role, text, streaming, translation) {
    const empty = $('#talkEmpty');
    if (empty) empty.remove();
    const thread = $('#talkThread');
    const div = document.createElement('div');
    div.className = 'msg ' + (role === 'user' ? 'user' : 'ai') + (streaming ? ' streaming' : '');
    const body = document.createElement('div');
    body.className = 'msg-body';
    body.textContent = text || '';
    div.appendChild(body);
    if (role === 'ai' && translation) {
      const tr = document.createElement('div');
      tr.className = 'msg-it';
      tr.textContent = translation;
      div.appendChild(tr);
    }
    if (role === 'ai' && !streaming) {
      const btn = document.createElement('button');
      btn.className = 'speak';
      btn.type = 'button';
      btn.textContent = '🔊';
      btn.onclick = () => speak(text);
      div.appendChild(btn);
    }
    thread.appendChild(div);
    thread.scrollTop = thread.scrollHeight;
    return div;
  }

  function setTalkBubbleContent(bubble, text, translation) {
    if (!bubble) return;
    let body = bubble.querySelector('.msg-body');
    if (!body) {
      // legacy bubble with only textContent
      body = document.createElement('div');
      body.className = 'msg-body';
      const speakBtn = bubble.querySelector('.speak');
      bubble.textContent = '';
      bubble.appendChild(body);
      if (speakBtn) bubble.appendChild(speakBtn);
    }
    body.textContent = text || '';
    let tr = bubble.querySelector('.msg-it');
    if (translation) {
      if (!tr) {
        tr = document.createElement('div');
        tr.className = 'msg-it';
        const speakBtn = bubble.querySelector('.speak');
        if (speakBtn) bubble.insertBefore(tr, speakBtn);
        else body.after(tr);
      }
      tr.textContent = translation;
      tr.hidden = false;
    } else if (tr) {
      tr.remove();
    }
  }

  function addCorrections(corrections) {
    const thread = $('#talkThread');
    if (!corrections || !corrections.length) {
      const ok = document.createElement('div');
      ok.className = 'all-ok';
      ok.textContent = '✓ Tutto corretto — bravo!';
      thread.appendChild(ok);
      correctStreak++;
    } else {
      correctStreak = 0;
      corrections.forEach((c) => {
        const block = document.createElement('div');
        block.className = 'correction';
        block.innerHTML =
          '<span class="wrong">' +
          escapeHtml(c.wrong) +
          '</span><span class="right">' +
          escapeHtml(c.right) +
          '</span><div class="why">' +
          escapeHtml(c.why || '') +
          '</div>';
        thread.appendChild(block);
        if (c.right) addVocab(c.right, '', c.why || '', 'conversazione');
      });
    }
    updateHome();
  }

  function setTalkStatus(msg, isError, loading) {
    const el = $('#talkStatus');
    el.classList.toggle('error', !!isError);
    el.innerHTML = '';
    if (loading) {
      const sp = document.createElement('span');
      sp.className = 'spinner';
      el.appendChild(sp);
    }
    if (msg) {
      const t = document.createElement('span');
      t.textContent = msg;
      el.appendChild(t);
    }
  }



  function loadDlgProgress() {
    return loadJSON(STORAGE.dlgProgress, {});
  }
  function saveDlgProgress(p) {
    saveJSON(STORAGE.dlgProgress, p);
  }
  function dlgKey(pack) {
    return String((pack && pack.title) || '').trim().toLowerCase();
  }
  function markDialogueDone(pack) {
    if (!pack) return;
    const p = loadDlgProgress();
    p[dlgKey(pack)] = { done: true, at: Date.now() };
    saveDlgProgress(p);
  }
  function isDialogueDone(pack) {
    return !!(loadDlgProgress()[dlgKey(pack)] || {}).done;
  }

  /** Valutazione offline leggera (zero Gemini): confronto con lo hint */
  function offlineScoreUtterance(spoken, expected) {
    const a = normalizeSpeech(spoken);
    const b = normalizeSpeech(expected);
    if (!a || !b) return { pct: 0, ok: false };
    if (a === b) return { pct: 100, ok: true };
    const wa = a.split(' ').filter(Boolean);
    const wb = b.split(' ').filter(Boolean);
    if (!wb.length) return { pct: 0, ok: false };
    let hit = 0;
    wb.forEach((w) => {
      if (wa.includes(w) || wa.some((x) => softMatch(x, w))) hit++;
    });
    const pct = Math.round((hit / wb.length) * 100);
    return { pct, ok: pct >= 55 };
  }

  function showDialogueFeedback(spoken, expected) {
    const thread = $('#talkThread');
    if (!thread) return;
    const { pct, ok } = offlineScoreUtterance(spoken, expected);
    const box = document.createElement('div');
    box.className = 'dlg-feedback ' + (ok ? 'ok' : 'mid');
    const it = (window.DIALOGUE_IT || {})[expected] || '';
    box.innerHTML =
      '<div class="dlg-fb-score">' +
      (ok ? '✓' : '·') +
      ' Somiglianza ~' +
      pct +
      '%</div>' +
      '<div class="dlg-fb-exp"><span class="k">Modello</span> ' +
      escapeHtml(expected) +
      '</div>' +
      (it ? '<div class="dlg-fb-it">' + escapeHtml(it) + '</div>' : '') +
      '<div class="dlg-fb-hint">Non deve essere identico: l\'importante è farsi capire.</div>';
    thread.appendChild(box);
    thread.scrollTop = thread.scrollHeight;
  }

  function allDialoguePacks() {
    const packs = window.DIALOGUE_PACKS || {};
    const out = [];
    for (const level of Object.keys(packs)) {
      (packs[level] || []).forEach((p, i) => {
        out.push({ level, index: i, title: p.title, pack: p });
      });
    }
    return out;
  }

  function pickDialoguePack() {
    const packs = window.DIALOGUE_PACKS || {};
    const level = getLevel();
    let list = packs[level] || packs.A1 || [];
    if (!list.length) list = Object.values(packs).flat();
    if (!list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  function toggleDialoguePicker() {
    const box = $('#dlgPicker');
    if (!box) return;
    if (!box.hidden) {
      box.hidden = true;
      return;
    }
    renderDialoguePicker();
    box.hidden = false;
  }

  function renderDialoguePicker() {
    const list = $('#dlgPickerList');
    if (!list) return;
    const items = allDialoguePacks();
    if (!items.length) {
      list.innerHTML = '<p class="hint">Nessun dialogo disponibile.</p>';
      return;
    }
    const byLevel = {};
    items.forEach((it) => {
      if (!byLevel[it.level]) byLevel[it.level] = [];
      byLevel[it.level].push(it);
    });
    list.innerHTML = Object.keys(byLevel)
      .sort()
      .map((lv) => {
        const rows = byLevel[lv]
          .map(
            (it) =>
              '<button type="button" class="dlg-pick-btn' +
              (isDialogueDone(it.pack) ? ' done' : '') +
              '" data-level="' +
              escapeHtml(it.level) +
              '" data-index="' +
              it.index +
              '"><span class="dlg-lv">' +
              escapeHtml(lv) +
              '</span><span class="dlg-title">' +
              escapeHtml(it.title) +
              '</span>' +
              (isDialogueDone(it.pack) ? '<span class="dlg-done">✓</span>' : '') +
              '</button>'
          )
          .join('');
        return '<div class="dlg-group"><div class="dlg-group-label">' + escapeHtml(lv) + '</div>' + rows + '</div>';
      })
      .join('');
    list.querySelectorAll('.dlg-pick-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const level = btn.dataset.level;
        const index = parseInt(btn.dataset.index, 10);
        const pack = (window.DIALOGUE_PACKS[level] || [])[index];
        if (pack) startOfflineDialogue(pack);
        const box = $('#dlgPicker');
        if (box) box.hidden = true;
      });
    });
  }

  function startOfflineDialogue(pack) {
    if (!pack) pack = pickDialoguePack();
    if (!pack) {
      setTalkStatus('Nessun dialogo offline disponibile.', true);
      return;
    }
    dialogueState = { pack, lineIndex: 0 };
    const empty = $('#talkEmpty');
    if (empty) empty.remove();
    const thread = $('#talkThread');
    const title = document.createElement('div');
    title.className = 'dlg-hint';
    title.innerHTML =
      '<b>Dialogo offline:</b> ' +
      escapeHtml(pack.title) +
      ' — rispondi con le tue parole o usa 💡 Suggerimento';
    thread.appendChild(title);
    advanceDialogueAI();
  }


  function dialogueIt(line) {
    if (!line) return '';
    if (line.it || line.translation) return line.it || line.translation;
    const map = window.DIALOGUE_IT || {};
    const t = String(line.text || '').trim();
    return map[t] || map[t.toLowerCase()] || '';
  }

  function advanceDialogueAI() {
    if (!dialogueState) return;
    const { pack } = dialogueState;
    const thread = $('#talkThread');
    while (dialogueState.lineIndex < pack.lines.length) {
      const line = pack.lines[dialogueState.lineIndex];
      dialogueState.lineIndex++;
      if (line.role === 'ai') {
        addTalkBubble('ai', line.text, false, dialogueIt(line));
        talkHistory.push({ role: 'model', text: line.text });
        if (autoSpeak()) {
          // Voce dialogo: inglese chiaro, un filo più lento
          speak(line.text, 'en-GB');
        }
      } else if (line.role === 'user_hint') {
        // stop and wait for user; store current hint
        dialogueState.currentHint = line.text;
        setTalkStatus('💡 Tocca Suggerimento se serve aiuto, poi scrivi o parla.');
        return;
      }
    }
    // finished
    const done = document.createElement('div');
    done.className = 'all-ok';
    done.textContent = '✓ Dialogo completato — bravo!';
    thread.appendChild(done);
    try { markDialogueDone(pack); } catch (_) {}
    dialogueState = null;
    setTalkStatus('');
    touchStudy(3, 'talk');
  }

  function showDialogueHint() {
    if (!dialogueState || !dialogueState.currentHint) {
      // free starter from CONV_STARTERS
      const starters = window.CONV_STARTERS || {};
      const list = starters[getLevel()] || starters.A1 || [];
      if (!list.length) {
        setTalkStatus('Nessun suggerimento disponibile.', true);
        return;
      }
      const s = list[Math.floor(Math.random() * list.length)];
      $('#talkInput').value = s;
      $('#talkSend').disabled = false;
      autoResize($('#talkInput'));
      setTalkStatus('💡 Frase suggerita inserita — puoi modificarla e inviare.');
      return;
    }
    $('#talkInput').value = dialogueState.currentHint;
    $('#talkSend').disabled = false;
    autoResize($('#talkInput'));
    setTalkStatus('💡 Suggerimento del dialogo inserito.');
  }

  async function sendTalk() {
    const input = $('#talkInput');
    const text = input.value.trim();
    if (!text) return;
    const sendBtn = $('#talkSend');
    sendBtn.disabled = true;
    input.disabled = true;
    addTalkBubble('user', text);
    input.value = '';
    autoResize(input);

    // Dialogo offline: non chiamare Gemini, avanza lo script
    if (dialogueState) {
      talkHistory.push({ role: 'user', text });
      const expected = dialogueState.currentHint || '';
      dialogueState.currentHint = null;
      if (expected) {
        try { showDialogueFeedback(text, expected); } catch (_) {}
      }
      setTalkStatus('⚡ Dialogo offline');
      sendBtn.disabled = false;
      input.disabled = false;
      input.focus();
      advanceDialogueAI();
      return;
    }

    setTalkStatus('Gemini sta rispondendo…', false, true);

    // Placeholder bubble for streaming
    const bubble = addTalkBubble('ai', '…', true);

    try {
      // Try to show progressive text while streaming (raw JSON builds up)
      const result = await callGeminiStream(talkSystem(), text, talkHistory, (acc) => {
        const m = acc.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (m) {
          try {
            setTalkBubbleContent(bubble, JSON.parse('"' + m[1] + '"'), '');
          } catch {
            setTalkBubbleContent(bubble, m[1], '');
          }
        } else {
          setTalkBubbleContent(bubble, 'Scrivendo…', '');
        }
        $('#talkThread').scrollTop = $('#talkThread').scrollHeight;
      });

      talkHistory.push({ role: 'user', text });
      bubble.classList.remove('streaming');
      const reply = result.reply || '(nessuna risposta)';
      const translation = result.translation || result.italian || result.trans || '';
      setTalkBubbleContent(bubble, reply, translation);
      if (!bubble.querySelector('.speak')) {
        const btn = document.createElement('button');
        btn.className = 'speak';
        btn.type = 'button';
        btn.textContent = '🔊';
        btn.onclick = () => speak(reply);
        bubble.appendChild(btn);
      } else {
        bubble.querySelector('.speak').onclick = () => speak(reply);
      }

      // Insert corrections before the reply bubble
      const thread = $('#talkThread');
      const temp = document.createDocumentFragment();
      // We'll prepend corrections visually by re-ordering: remove bubble, add corrections, re-add bubble
      thread.removeChild(bubble);
      if (!result.corrections || !result.corrections.length) {
        const ok = document.createElement('div');
        ok.className = 'all-ok';
        ok.textContent = '✓ Tutto corretto — bravo!';
        thread.appendChild(ok);
        correctStreak++;
      } else {
        correctStreak = 0;
        result.corrections.forEach((c) => {
          const block = document.createElement('div');
          block.className = 'correction';
          block.innerHTML =
            '<span class="wrong">' +
            escapeHtml(c.wrong) +
            '</span><span class="right">' +
            escapeHtml(c.right) +
            '</span><div class="why">' +
            escapeHtml(c.why || '') +
            '</div>';
          thread.appendChild(block);
          if (c.right) addVocab(c.right, '', c.why || '', 'conversazione');
        });
      }
      thread.appendChild(bubble);
      talkHistory.push({ role: 'model', text: reply });
      touchStudy(2, 'talk');
      if (autoSpeak()) speak(reply);
      setTalkStatus('');
      updateHome();
    } catch (e) {
      if (e.name === 'AbortError') {
        setTalkStatus('Annullato');
      } else {
        bubble.classList.remove('streaming');
        bubble.textContent = '⚠️ ' + friendlyError(e.message);
        setTalkStatus(friendlyError(e.message), true);
      }
    } finally {
      sendBtn.disabled = false;
      input.disabled = false;
      input.focus();
      abortController = null;
    }
  }

  // ─── Repeat & Translate ──────────────────────────────────
  function rtSystem() {
    const d = parseInt($('#rtDiff')?.value || '3', 10);
    let desc = 'frase molto semplice, 4-6 parole, presente semplice';
    if (d > 3 && d <= 6) desc = 'frase semplice, 6-9 parole, può usare passato o futuro';
    if (d > 6) desc = 'frase moderatamente complessa, 9-14 parole, con un connettivo';
    return (
      'Generi frasi in inglese per uno studente italiano di livello ' +
      getLevel() +
      ' che deve ripeterle ad alta voce. Difficoltà: ' +
      desc +
      '. Evita queste frasi già usate: ' +
      (rtUsed.slice(-6).join(' | ') || 'nessuna') +
      '. Rispondi SOLO JSON: {"sentence":"..."}'
    );
  }

  function setRtStatus(msg, isError, loading) {
    const el = $('#rtStatus');
    el.classList.toggle('error', !!isError);
    el.innerHTML = '';
    if (loading) {
      const sp = document.createElement('span');
      sp.className = 'spinner';
      el.appendChild(sp);
    }
    if (msg) {
      const t = document.createElement('span');
      t.textContent = msg;
      el.appendChild(t);
    }
  }

  function pickOfflineSentence() {
    const bank = window.SENTENCE_BANK || {};
    const level = getLevel();
    const diff = parseInt($('#rtDiff')?.value || '3', 10);
    const byLevel = bank[level] || bank.A1 || {};
    // nearest difficulty key
    const keys = Object.keys(byLevel).map(Number).sort((a, b) => a - b);
    if (!keys.length) return null;
    let best = keys[0];
    for (const k of keys) {
      if (Math.abs(k - diff) < Math.abs(best - diff)) best = k;
    }
    let pool = byLevel[best] || [];
    // fallback: flatten all levels
    if (!pool.length) {
      pool = Object.values(byLevel).flat();
    }
    if (!pool.length) {
      const a1 = bank.A1 || {};
      pool = Object.values(a1).flat();
    }
    const available = pool.filter((s) => !rtUsed.includes(s));
    const list = available.length ? available : pool;
    if (!list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  function showListenItem(item, packTitle) {
    currentListenItem = item;
    currentRtSentence = item.en;
    $('#rtSentence').textContent = item.en;
    const itEl = $('#rtItTrans');
    if (itEl) {
      itEl.textContent = item.it || '';
      itEl.hidden = true;
    }
    if ($('#rtPackLabel')) $('#rtPackLabel').textContent = packTitle || 'Frase';
    $('#rtResult').hidden = true;
    setRtStatus('⚡ Ascolto offline');
    speak(item.en);
  }

  function nextListenFromPack() {
    const packs = window.LISTEN_PACKS || [];
    let pack = packs.find((p) => p.id === listenPackId);
    if (!pack && packs.length) {
      // mixed: flatten
      const all = packs.flatMap((p) => p.items.map((it) => ({ ...it, _title: p.title })));
      if (!all.length) return false;
      listenIndex = listenIndex % all.length;
      const item = all[listenIndex++];
      showListenItem(item, item._title || 'Viaggio');
      return true;
    }
    if (!pack || !pack.items?.length) return false;
    listenIndex = listenIndex % pack.items.length;
    showListenItem(pack.items[listenIndex++], pack.title);
    return true;
  }

  function initListenChips() {
    const row = $('#listenChips');
    if (!row || row.dataset.ready) return;
    const packs = window.LISTEN_PACKS || [];
    row.innerHTML = '';
    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'chip active';
    allBtn.textContent = 'Tutti';
    allBtn.addEventListener('click', () => {
      listenPackId = null;
      listenIndex = 0;
      row.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      allBtn.classList.add('active');
      generateRtSentence();
    });
    row.appendChild(allBtn);
    packs.forEach((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = p.title;
      b.addEventListener('click', () => {
        listenPackId = p.id;
        listenIndex = 0;
        row.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
        b.classList.add('active');
        generateRtSentence();
      });
      row.appendChild(b);
    });
    row.dataset.ready = '1';
  }

  async function generateRtSentence() {
    setRtStatus('Genero frase…', false, true);
    $('#rtResult').hidden = true;
    $('#rtSentence').textContent = '…';
    const preferOffline = $('#offlineSentences')?.checked !== false;

    // 0) Listen pack (travel phrases with IT)
    if (preferOffline && (listenPackId || window.LISTEN_PACKS?.length)) {
      if (nextListenFromPack()) return;
    }

    // 1) Offline first (instant)
    if (preferOffline) {
      const offline = pickOfflineSentence();
      if (offline) {
        currentRtSentence = offline;
        currentListenItem = null;
        rtUsed.push(offline);
        if (rtUsed.length > 40) rtUsed = rtUsed.slice(-40);
        $('#rtSentence').textContent = currentRtSentence;
        const itEl = $('#rtItTrans');
        if (itEl) { itEl.textContent = ''; itEl.hidden = true; }
        if ($('#rtPackLabel')) $('#rtPackLabel').textContent = 'Frase libera';
        setRtStatus('⚡ Frase offline');
        speak(currentRtSentence);
        return;
      }
    }

    // 2) Gemini fallback
    try {
      const r = await callGemini(rtSystem(), 'Genera una nuova frase.');
      currentRtSentence = r.sentence || '';
      rtUsed.push(currentRtSentence);
      $('#rtSentence').textContent = currentRtSentence;
      setRtStatus('');
      speak(currentRtSentence);
    } catch (e) {
      // last resort offline even if toggle off
      const offline = pickOfflineSentence();
      if (offline) {
        currentRtSentence = offline;
        rtUsed.push(offline);
        $('#rtSentence').textContent = currentRtSentence;
        setRtStatus('⚡ Offline (Gemini non disponibile)');
        speak(currentRtSentence);
      } else {
        setRtStatus(friendlyError(e.message), true);
        $('#rtSentence').textContent = '—';
      }
    }
  }

  function normalizeSpeech(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[.,!?;:'"¿¡]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Piccole correzioni tipiche STT
  function softMatch(a, b) {
    if (a === b) return true;
    const pairs = [
      ['a', 'the'], ['the', 'a'],
      ['its', "it's"], ["it's", 'its'],
      ['there', 'their'], ['their', 'there'],
      ['to', 'two'], ['two', 'to'],
      ['for', 'four'], ['four', 'for']
    ];
    for (const [x, y] of pairs) {
      if ((a === x && b === y) || (a === y && b === x)) return true;
    }
    // prefisso comune (es. lunch/lounge confusione parziale)
    if (a.length >= 4 && b.length >= 4 && (a.startsWith(b.slice(0, 3)) || b.startsWith(a.slice(0, 3))))
      return a.length - b.length <= 2 && b.length - a.length <= 2;
    return false;
  }

  function offlineEvaluate(target, spoken) {
    const a = normalizeSpeech(target).split(' ').filter(Boolean);
    const b = normalizeSpeech(spoken).split(' ').filter(Boolean);
    if (!a.length) return { ok: false, feedback: 'Nessuna frase target.' };
    if (normalizeSpeech(target) === normalizeSpeech(spoken)) {
      return { ok: true, translation: '(offline)', feedback: 'Perfetto — corrispondenza esatta.' };
    }
    let hits = 0;
    const used = new Set();
    for (const w of b) {
      let found = -1;
      for (let i = 0; i < a.length; i++) {
        if (used.has(i)) continue;
        if (a[i] === w || softMatch(a[i], w)) {
          found = i;
          break;
        }
      }
      if (found >= 0) {
        hits++;
        used.add(found);
      }
    }
    const ratio = hits / a.length;
    // penalità leggera se ordine molto diverso
    let orderBonus = 0;
    let last = -1;
    let ordered = 0;
    for (const w of b) {
      const i = a.findIndex((x, idx) => (x === w || softMatch(x, w)) && idx >= last);
      if (i >= 0) {
        ordered++;
        last = i;
      }
    }
    const orderRatio = b.length ? ordered / Math.max(a.length, b.length) : 0;
    const score = ratio * 0.75 + orderRatio * 0.25;
    const ok = score >= 0.65;
    const pct = Math.round(score * 100);
    return {
      ok,
      translation: '(valutazione offline ~' + pct + '%)',
      feedback: ok
        ? 'Buona ripetizione offline (' + pct + '%).'
        : 'Riprova offline (' + pct + '%). Controlla le parole mancanti.'
    };
  }

  async function evaluateRt(spoken) {
    setRtStatus('Valuto…', false, true);
    try {
      const sys =
        'Valuti la ripetizione di uno studente italiano. Frase target: "' +
        currentRtSentence +
        '". Trascrizione microfono: "' +
        spoken +
        '". Sii tollerante con piccoli errori di riconoscimento vocale. Rispondi SOLO JSON: {"ok":true|false,"translation":"traduzione IT","feedback":"breve commento in italiano"}';
      const r = await callGemini(sys, 'Valuta.');
      $('#rtSaid').textContent = spoken;
      $('#rtTrans').textContent = r.translation || '';
      $('#rtVerdict').textContent = r.ok
        ? '✓ Bene! ' + (r.feedback || '')
        : '△ ' + (r.feedback || 'Riprova');
      $('#rtVerdict').style.color = r.ok ? 'var(--ok)' : 'var(--warn)';
      $('#rtResult').hidden = false;
      setRtStatus('');
      if (r.ok) correctStreak++;
      touchStudy(1, 'rt');
      updateHome();
    } catch (e) {
      // Offline fallback evaluation
      const r = offlineEvaluate(currentRtSentence, spoken);
      $('#rtSaid').textContent = spoken;
      $('#rtTrans').textContent = r.translation || '';
      $('#rtVerdict').textContent = r.ok
        ? '✓ ' + r.feedback
        : '△ ' + r.feedback;
      $('#rtVerdict').style.color = r.ok ? 'var(--ok)' : 'var(--warn)';
      $('#rtResult').hidden = false;
      setRtStatus('⚡ Valutazione offline');
      if (r.ok) correctStreak++;
      touchStudy(1, 'rt');
      updateHome();
    }
  }

  // ─── Review ──────────────────────────────────────────────
  let currentReview = null;

  function nextReview() {
    const due = dueCards();
    const card = $('#reviewCard');
    const empty = $('#reviewEmpty');
    if (!due.length) {
      currentReview = null;
      $('#reviewWord').textContent = '—';
      $('#reviewMeta').textContent = 'Nessuna parola';
      $('#reviewTrans').hidden = true;
      $('#reviewRevealRow').hidden = false;
      $('#reviewRates').hidden = true;
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    currentReview = due[Math.floor(Math.random() * due.length)];
    $('#reviewMeta').textContent =
      (currentReview.source || 'vocab') + ' · due: ' + due.length;
    $('#reviewWord').textContent = currentReview.word;
    $('#reviewTrans').textContent =
      currentReview.translation || currentReview.note || '(nessuna traduzione)';
    $('#reviewTrans').hidden = true;
    $('#reviewRevealRow').hidden = false;
    $('#reviewRates').hidden = true;
  }

  // ─── Oxford ──────────────────────────────────────────────
  function oxfordCards() {
    const data = window.OXFORD_3000;
    if (!data || !Array.isArray(data.cards)) return [];
    return data.cards;
  }

  function filterOxford() {
    const level = $('#oxfordLevel')?.value || 'A1';
    const all = oxfordCards();
    oxfordFiltered =
      level === 'all'
        ? all
        : all.filter((c) => {
            const lv = c.cefr || c.cefrLevels || c.level;
            if (Array.isArray(lv)) return lv.includes(level);
            return String(lv || '').includes(level);
          });
    if (!oxfordFiltered.length) oxfordFiltered = all;
    oxfordIdx = Math.floor(Math.random() * oxfordFiltered.length);
  }

  function oxfordCache() {
    return loadJSON(STORAGE.oxfordCache, {});
  }
  function saveOxfordCache(cache) {
    saveJSON(STORAGE.oxfordCache, cache);
  }

  function lookupOfflineOxford(word) {
    const dict = window.OXFORD_IT || {};
    const k = String(word || '').toLowerCase().trim();
    if (dict[k]) return dict[k];
    // try without articles / first token
    const first = k.split(',')[0].trim();
    if (dict[first]) return dict[first];
    return null;
  }

  let oxfordAutoTimer = null;
  let oxfordAutoToken = 0;

  function clearOxfordAuto() {
    if (oxfordAutoTimer) {
      clearTimeout(oxfordAutoTimer);
      oxfordAutoTimer = null;
    }
    oxfordAutoToken++;
  }

  /** Dopo EN+IT: se auto ON aspetta a lungo e passa avanti; se OFF lascia decidere all'utente */
  function afterOxfordSpoken(token) {
    const hint = $('#oxfordAutoHint');
    const auto = $('#oxfordAuto')?.checked === true;
    if (!auto) {
      if (hint) {
        hint.textContent =
          (oxfordIdx + 1) +
          '/' +
          Math.max(1, oxfordFiltered.length) +
          ' · Ascolta, poi + Vocabolario oppure Prossima';
      }
      return;
    }
    if (hint) hint.textContent = 'Auto: prossima tra pochi secondi… (tocca per annullare)';
    // Tempo lungo per decidere / ascoltare
    oxfordAutoTimer = setTimeout(() => {
      if (token !== oxfordAutoToken) return;
      if ($('#oxfordAuto')?.checked !== true) return;
      oxfordIdx = (oxfordIdx + 1) % Math.max(1, oxfordFiltered.length);
      showOxfordCard();
    }, 6500);
  }

  function playOxfordAudio(enWord, itText) {
    const token = ++oxfordAutoToken;
    const hint = $('#oxfordAutoHint');
    if (hint) {
      hint.textContent =
        (oxfordIdx + 1) +
        '/' +
        Math.max(1, oxfordFiltered.length) +
        ' · Pronuncio inglese e italiano…';
    }
    speakOxfordPair(enWord, itText, () => afterOxfordSpoken(token));
  }

  async function showOxfordCard() {
    clearOxfordAuto();
    if (!oxfordFiltered.length) filterOxford();
    if (!oxfordFiltered.length) return;
    // clamp index
    oxfordIdx = ((oxfordIdx % oxfordFiltered.length) + oxfordFiltered.length) % oxfordFiltered.length;
    const c = oxfordFiltered[oxfordIdx];
    if (!c) return;
    $('#oxfordWord').textContent = c.word || '—';
    const posBits = [c.pos || '', c.cefr || (Array.isArray(c.cefrLevels) ? c.cefrLevels.join(',') : '')]
      .filter(Boolean)
      .join(' · ');
    $('#oxfordPos').textContent = posBits || '—';
    // progress within filtered set
    const hint = $('#oxfordAutoHint');
    if (hint) {
      hint.textContent = oxfordIdx + 1 + '/' + oxfordFiltered.length + ' · carico…';
    }
    $('#oxfordTrans').textContent = '…';
    $('#oxfordEx').textContent = '';

    const cache = oxfordCache();
    const key = (c.word || '').toLowerCase();
    const preferOffline = $('#offlineOxford')?.checked !== false;

    const finish = (translation, example) => {
      $('#oxfordTrans').textContent = translation || '—';
      $('#oxfordEx').textContent = example || '';
      // Pronuncia solo se il pannello Oxford è attivo e l'utente ha chiesto una carta
      const oxPanel = document.querySelector('.learn-panel[data-mode="oxford"]');
      const oxActive = oxPanel && oxPanel.classList.contains('active');
      const learnActive = document.querySelector('.screen[data-screen="learn"]')?.classList.contains('active');
      if (oxActive && learnActive) {
        playOxfordAudio(c.word, translation || '');
      } else if ($('#oxfordAutoHint')) {
        $('#oxfordAutoHint').textContent =
          (oxfordIdx + 1) + '/' + Math.max(1, oxfordFiltered.length) +
          ' · Tocca 🔊 EN+IT per ascoltare';
      }
    };

    // 1) localStorage cache
    if (cache[key]) {
      finish(cache[key].translation, cache[key].example);
      return;
    }

    // 2) Offline dictionary (instant)
    if (preferOffline) {
      const off = lookupOfflineOxford(c.word);
      if (off) {
        cache[key] = {
          translation: off.translation || '',
          example: off.example || '',
          source: 'offline'
        };
        saveOxfordCache(cache);
        finish(off.translation, off.example);
        return;
      }
    }

    if (!getKey()) {
      $('#oxfordTrans').textContent = '(nessuna traduzione offline — configura Gemini)';
      const oxPanel = document.querySelector('.learn-panel[data-mode="oxford"]');
      const oxActive = oxPanel && oxPanel.classList.contains('active');
      const learnActive = document.querySelector('.screen[data-screen="learn"]')?.classList.contains('active');
      if (oxActive && learnActive) playOxfordAudio(c.word, '');
      return;
    }

    // 3) Gemini
    try {
      const sys =
        'Traduci in italiano e dai un esempio breve in inglese per uno studente A2. Rispondi SOLO JSON: {"translation":"...","example":"..."}';
      const r = await callGemini(
        sys,
        `Parola: ${c.word}\nPOS: ${c.pos || ''}\nCEFR: ${c.cefr || (c.cefrLevels || []).join(',')}`
      );
      cache[key] = {
        translation: r.translation || '',
        example: r.example || '',
        source: 'gemini'
      };
      saveOxfordCache(cache);
      finish(r.translation, r.example);
    } catch (e) {
      const off = lookupOfflineOxford(c.word);
      if (off) finish(off.translation, off.example);
      else {
        $('#oxfordTrans').textContent = '(traduzione non disponibile)';
        playOxfordAudio(c.word, '');
      }
    }
  }

  // ─── Tutor ───────────────────────────────────────────────
  function addTutorMsg(role, text, streaming) {
    const thread = $('#tutorThread');
    const empty = thread.querySelector('.empty-chat');
    if (empty) empty.remove();
    const div = document.createElement('div');
    div.className = 'msg ' + (role === 'user' ? 'user' : 'ai') + (streaming ? ' streaming' : '');
    div.textContent = text;
    thread.appendChild(div);
    thread.scrollTop = thread.scrollHeight;
    return div;
  }

  async function sendTutor(text) {
    if (!text) return;
    $('#tutorInput').value = '';
    autoResize($('#tutorInput'));
    addTutorMsg('user', text);
    const bubble = addTutorMsg('ai', '…', true);
    $('#tutorStatus').textContent = '';
    const sp = document.createElement('span');
    sp.className = 'spinner';
    $('#tutorStatus').appendChild(sp);
    $('#tutorStatus').appendChild(document.createTextNode(' Streaming…'));

    try {
      const sys = `Sei un tutor di inglese per uno studente italiano di livello ${getLevel()}. Rispondi in modo chiaro e incoraggiante. Se correggi, spiega in italiano. Se fai domande, aspetta la risposta. Puoi rispondere in testo libero (non serve JSON).`;
      // For tutor free text we still request without forced JSON for better streaming UX
      // Reuse stream but without responseMimeType JSON — override via custom call
      const key = getKey();
      if (!key) throw new Error('Inserisci la API Key nelle Impostazioni.');
      const model = getModel();
      const url =
        'https://generativelanguage.googleapis.com/v1beta/models/' +
        encodeURIComponent(model) +
        ':streamGenerateContent?alt=sse&key=' +
        encodeURIComponent(key);
      abortController = new AbortController();
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text }] }],
          systemInstruction: { parts: [{ text: sys }] }
        })
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error?.message || 'Errore Gemini ' + res.status);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const payload = t.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const obj = JSON.parse(payload);
            const piece =
              obj.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
            if (piece) {
              full += piece;
              bubble.textContent = full;
              $('#tutorThread').scrollTop = $('#tutorThread').scrollHeight;
            }
          } catch (_) {}
        }
      }
      bubble.classList.remove('streaming');
      if (!full) bubble.textContent = '(vuoto)';
      if (autoSpeak() && full) speak(full);
      $('#tutorStatus').textContent = '';
    } catch (e) {
      bubble.classList.remove('streaming');
      bubble.textContent = '⚠️ ' + friendlyError(e.message);
      $('#tutorStatus').textContent = '';
    } finally {
      abortController = null;
    }
  }

  // ─── Vocab list UI ───────────────────────────────────────
  function renderVocabList() {
    const list = $('#vocabList');
    if (!vocab.length) {
      list.innerHTML = '<p class="hint center">Nessuna parola salvata.</p>';
      return;
    }
    list.innerHTML = vocab
      .map(
        (v) =>
          `<div class="vocab-item" data-id="${escapeHtml(v.id)}">
            <div><strong>${escapeHtml(v.word)}</strong>
            <div class="meta">${escapeHtml(v.translation || v.note || '')}</div></div>
            <button type="button" data-del="${escapeHtml(v.id)}" title="Elimina">✕</button>
          </div>`
      )
      .join('');
  }

  // ─── Settings helpers ────────────────────────────────────
  function updateKeyStatus() {
    const ok = !!getKey();
    $('#keyStatus').textContent = ok
      ? '● Chiave salvata su questo dispositivo'
      : 'Chiave non configurata';
    $('#keyStatus').style.color = ok ? 'var(--ok)' : 'var(--muted)';
  }

  function loadSettings() {
    const s = loadJSON(STORAGE.settings, {});
    if (s.level) $('#level').value = s.level;
    if (s.topic) $('#topic').value = s.topic;
    if (s.model) $('#model').value = s.model;
    if (typeof s.autoSpeak === 'boolean') $('#autoSpeak').checked = s.autoSpeak;
    if (typeof s.offlineSentences === 'boolean' && $('#offlineSentences'))
      $('#offlineSentences').checked = s.offlineSentences;
    if (typeof s.offlineOxford === 'boolean' && $('#offlineOxford'))
      $('#offlineOxford').checked = s.offlineOxford;
    if (s.speechRate) {
      $('#speechRate').value = s.speechRate;
      $('#rateVal').textContent = s.speechRate;
    }
    const k = getKey();
    if (k) $('#apiKey').value = k;
    updateKeyStatus();
  }

  function saveSettings() {
    saveJSON(STORAGE.settings, {
      level: getLevel(),
      topic: getTopic(),
      model: getModel(),
      autoSpeak: autoSpeak(),
      speechRate: speechRate(),
      offlineSentences: $('#offlineSentences')?.checked !== false,
      offlineOxford: $('#offlineOxford')?.checked !== false
    });
  }

  function autoResize(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.min(120, ta.scrollHeight) + 'px';
  }

  // ─── Speech recognition helper ───────────────────────────
  function startRecognition(lang, onResult, onError) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      onError && onError('Riconoscimento vocale non disponibile');
      return null;
    }
    const r = new SR();
    r.lang = lang || 'en-US';
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => onResult(e.results[0][0].transcript);
    r.onerror = () => onError && onError('Non ho sentito bene');
    try {
      r.start();
    } catch (e) {
      onError && onError(e.message);
    }
    return r;
  }


  // ─── Course A1 ───────────────────────────────────────────
  const COURSE_KEY = 'quaderno_v16_course';
  function loadCourseProgress() {
    return loadJSON(COURSE_KEY, { done: {}, quiz: {} });
  }
  function saveCourseProgress(p) {
    saveJSON(COURSE_KEY, p);
  }

  let currentLesson = null;
  let quizIndex = 0;
  let quizScore = 0;

  let courseUnitFilter = 'all';

  function courseUnitsMeta() {
    return [
      { id: 'all', label: 'Tutte' },
      { id: 'a1a', label: 'A1 · basi', range: [0, 7] },
      { id: 'a1b', label: 'A1 · vita', range: [8, 15] },
      { id: 'a2a', label: 'A2 · grammatica', range: [16, 23] },
      { id: 'a2b', label: 'A2 · situazioni', range: [24, 31] },
      { id: 'b1', label: 'B1', range: [32, 36] },
      { id: 'b2', label: 'B2', range: [37, 41] }
    ];
  }

  function renderCourseList() {
    const data = window.COURSE_A1;
    const list = $('#courseList');
    const lessonView = $('#courseLesson');
    const overview = $('#courseOverview');
    if (!data || !list) return;
    if (overview) overview.hidden = false;
    if (lessonView) lessonView.hidden = true;
    list.hidden = false;
    const unitsEl = $('#courseUnits');
    if (unitsEl) {
      unitsEl.innerHTML = courseUnitsMeta()
        .map(
          (u) =>
            '<button type="button" class="course-unit' +
            (courseUnitFilter === u.id ? ' active' : '') +
            '" data-unit="' +
            u.id +
            '">' +
            escapeHtml(u.label) +
            '</button>'
        )
        .join('');
    }
    const prog = loadCourseProgress();
    const total = data.lessons.length;
    const doneCount = data.lessons.filter((l) => prog.done[l.id]).length;
    const pct = total ? Math.round((doneCount / total) * 100) : 0;
    const badge = $('#courseProgressBadge');
    if (badge) badge.textContent = doneCount + '/' + total;
    const ring = $('#courseRingPct');
    if (ring) ring.textContent = pct + '%';
    const bar = $('#courseProgressBar');
    if (bar) bar.style.width = pct + '%';
    const heroTitle = $('#courseHeroTitle');
    if (heroTitle) heroTitle.textContent = doneCount + ' di ' + total + ' lezioni completate';
    const hint = $('#courseHeroHint');
    if (hint) {
      hint.textContent =
        doneCount >= total
          ? 'Percorso completato. Puoi ripetere le lezioni quando vuoi.'
          : 'Struttura: 1) Parole  2) Frasi  3) Quiz. Tutto offline.';
    }
    const cont = $('#courseContinue');
    if (cont) {
      const next = data.lessons.find((l) => !prog.done[l.id]) || data.lessons[0];
      cont.textContent = doneCount ? 'Continua: ' + next.title : 'Inizia: ' + next.title;
      cont.onclick = () => openLesson(next.id);
    }

    let lessons = data.lessons.map((l, i) => ({ l, i }));
    const unit = courseUnitsMeta().find((u) => u.id === courseUnitFilter);
    if (unit && unit.range) {
      lessons = lessons.filter(({ i }) => i >= unit.range[0] && i <= unit.range[1]);
    }

    list.innerHTML = lessons
      .map(({ l, i }) => {
        const done = !!prog.done[l.id];
        const qs = prog.quiz[l.id];
        const sub = done
          ? qs
            ? 'Completata · quiz ' + qs.score + '/' + qs.total
            : 'Completata'
          : l.words.length + ' parole · ' + l.phrases.length + ' frasi · quiz';
        return (
          '<button type="button" class="course-item' +
          (done ? ' done' : '') +
          '" data-lesson="' +
          l.id +
          '"><span class="ci-num">' +
          (done ? '✓' : i + 1) +
          '</span><span style="flex:1"><strong>' +
          escapeHtml(l.title) +
          '</strong><small>' +
          escapeHtml(sub) +
          '</small></span></button>'
        );
      })
      .join('');
  }


  function showCourseOverview() {
    const ov = $('#courseOverview');
    const les = $('#courseLesson');
    if (ov) ov.hidden = false;
    if (les) les.hidden = true;
    renderCourseList();
  }

  function setCourseStep(n) {
    n = String(n);
    $$('#courseSteps .lstep').forEach((b) => {
      const s = b.dataset.cstep;
      b.classList.toggle('active', s === n);
      if (parseInt(s, 10) < parseInt(n, 10)) b.classList.add('done');
      else if (s !== n) b.classList.remove('done');
    });
    const s1 = $('#courseStep1');
    const s2 = $('#courseStep2');
    const s3 = $('#courseStep3');
    const s4 = $('#courseStep4');
    if (s1) s1.hidden = n !== '1';
    if (s2) s2.hidden = n !== '2';
    if (s3) s3.hidden = n !== '3';
    if (s4) s4.hidden = n !== '4';
    if (n === '2') setupPractice();
    if (n === '3') {
      quizIndex = 0;
      quizScore = 0;
      renderQuizQ();
    }
    if (n === '4') {
      const total = currentLesson ? currentLesson.quiz.length : 0;
      if ($('#courseCompleteTitle'))
        $('#courseCompleteTitle').textContent = currentLesson ? currentLesson.title : 'Lezione';
      if ($('#courseCompleteScore'))
        $('#courseCompleteScore').textContent = total
          ? 'Quiz: ' + quizScore + '/' + total + ' — tocca Completa per salvare.'
          : 'Tocca Completa per salvare il progresso.';
    }
  }

  let practiceIdx = 0;

  function setupPractice() {
    if (!currentLesson || !currentLesson.phrases.length) return;
    practiceIdx = practiceIdx % currentLesson.phrases.length;
    const p = currentLesson.phrases[practiceIdx];
    if ($('#coursePracticeEn')) $('#coursePracticeEn').textContent = p;
    if ($('#coursePracticePrompt'))
      $('#coursePracticePrompt').textContent = 'Ripeti: “' + p + '”';
    if ($('#coursePracticeIt')) $('#coursePracticeIt').textContent = '';
    if ($('#coursePracticeResult')) $('#coursePracticeResult').textContent = '';
  }

  function openLesson(id) {
    const data = window.COURSE_A1;
    if (!data) return;
    const lesson = data.lessons.find((l) => l.id === id);
    if (!lesson) return;
    currentLesson = lesson;
    quizIndex = 0;
    quizScore = 0;
    practiceIdx = 0;

    const ov = $('#courseOverview');
    const view = $('#courseLesson');
    if (ov) ov.hidden = true;
    if (view) {
      view.hidden = false;
      try {
        view.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (_) {}
    }

    const idx = data.lessons.findIndex((l) => l.id === id);
    if ($('#courseDayLabel')) $('#courseDayLabel').textContent = 'LEZIONE ' + (idx + 1);
    if ($('#courseLessonTitle')) $('#courseLessonTitle').textContent = lesson.title;
    if ($('#courseLessonDesc'))
      $('#courseLessonDesc').textContent =
        lesson.words.length +
        ' parole · ' +
        lesson.phrases.length +
        ' frasi · quiz. Tocca per ascoltare.';

    if ($('#courseWordChips')) {
      $('#courseWordChips').innerHTML = lesson.words
        .map(
          (w) =>
            '<button type="button" class="word-chip" data-en="' +
            escapeHtml(w.en) +
            '" data-it="' +
            escapeHtml(w.it) +
            '"><strong>' +
            escapeHtml(w.en) +
            '</strong><small>' +
            escapeHtml(w.it) +
            '</small></button>'
        )
        .join('');
    }

    if ($('#coursePhraseList')) {
      $('#coursePhraseList').innerHTML = lesson.phrases
        .map(
          (p) =>
            '<div class="phrase-card"><div><div class="en">' +
            escapeHtml(p) +
            '</div></div><button type="button" data-speak-en="' +
            escapeHtml(p) +
            '" aria-label="Ascolta">🔊</button></div>'
        )
        .join('');
    }

    setCourseStep('1');
  }

  function renderQuizQ() {
    const box = $('#courseQuiz');
    if (!box || !currentLesson) return;
    if (quizIndex >= currentLesson.quiz.length) {
      const total = currentLesson.quiz.length;
      box.innerHTML =
        '<div class="quiz-score">Punteggio: ' +
        quizScore +
        '/' +
        total +
        '</div><p class="hint center">Ottimo. Passa a Completa per salvare.</p><button type="button" class="primary-btn" id="quizToComplete" style="width:100%">Vai a Completa →</button>';
      $('#quizToComplete')?.addEventListener('click', () => setCourseStep('4'));
      setTimeout(() => setCourseStep('4'), 600);
      return;
    }
    const item = currentLesson.quiz[quizIndex];
    box.innerHTML =
      '<div class="quiz-q">' +
      (quizIndex + 1) +
      '. ' +
      escapeHtml(item.q) +
      '</div>' +
      item.options
        .map(
          (o, i) =>
            '<button type="button" class="quiz-opt" data-qi="' +
            i +
            '">' +
            escapeHtml(o) +
            '</button>'
        )
        .join('');
    $$('.quiz-opt', box).forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.qi, 10);
        const correct = i === item.a;
        if (correct) quizScore++;
        btn.classList.add(correct ? 'correct' : 'wrong');
        $$('.quiz-opt', box).forEach((b) => {
          b.disabled = true;
          if (parseInt(b.dataset.qi, 10) === item.a) b.classList.add('correct');
        });
        setTimeout(() => {
          quizIndex++;
          renderQuizQ();
        }, 650);
      });
    });
  }

  // ─── Wire events ─────────────────────────────────────────
  function init() {
    try { initTheme(); } catch (e) { console.warn(e); }
    try { loadSettings(); } catch (e) { console.warn(e); }
    try { filterOxford(); } catch (e) { console.warn(e); }

    // Nav FIRST so UI always works even if other init fails
    $$('#bottomNav button').forEach((b) =>
      b.addEventListener('click', () => showScreen(b.dataset.screen))
    );
    $$('[data-go]').forEach((b) =>
      b.addEventListener('click', () => showScreen(b.dataset.go))
    );

    try { updateHome(); } catch (e) { console.warn(e); }
    try { nextReview(); } catch (e) { console.warn(e); }
    // Oxford: NON avviare audio/carta all'apertura app — solo quando l'utente apre Oxford
    try { filterOxford(); } catch (e) { console.warn(e); }
    try {
      if ($('#oxfordAuto')) $('#oxfordAuto').checked = false;
      const ow = $('#oxfordWord');
      if (ow && (ow.textContent === '—' || !ow.textContent.trim())) {
        $('#oxfordWord').textContent = 'Tocca «Prossima» per iniziare';
        if ($('#oxfordTrans')) $('#oxfordTrans').textContent = '';
        if ($('#oxfordPos')) $('#oxfordPos').textContent = 'Oxford pronto';
        if ($('#oxfordAutoHint')) {
          const n = (oxfordFiltered || []).length || (oxfordCards() || []).length;
          $('#oxfordAutoHint').textContent =
            n + ' parole nel filtro · auto disattivato · scegli il livello e Prossima';
        }
      }
    } catch (e) { console.warn(e); }

    // Theme
    $('#themeToggle').addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') || 'dark';
      applyTheme(cur === 'dark' ? 'light' : 'dark');
    });

    // Talk
    const talkInput = $('#talkInput');
    talkInput.addEventListener('input', () => {
      autoResize(talkInput);
      $('#talkSend').disabled = !talkInput.value.trim();
    });
    talkInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendTalk();
      }
    });
    $('#talkSend').addEventListener('click', sendTalk);
    $('#clearTalk').addEventListener('click', () => {
      talkHistory = [];
      dialogueState = null;
      $('#talkThread').innerHTML =
        '<div class="empty-chat" id="talkEmpty">Scrivi o detta una frase in inglese per iniziare.</div>';
      setTalkStatus('');
    });
    $('#dlgStart')?.addEventListener('click', () => toggleDialoguePicker());
    $('#dlgRandom')?.addEventListener('click', () => startOfflineDialogue());
    $('#dlgNextHint')?.addEventListener('click', showDialogueHint);
    let talkRec = null;
    $('#talkMic').addEventListener('click', () => {
      const btn = $('#talkMic');
      if (btn.classList.contains('recording') && talkRec) {
        talkRec.stop();
        btn.classList.remove('recording');
        return;
      }
      btn.classList.add('recording');
      talkRec = startRecognition(
        'en-US',
        (t) => {
          btn.classList.remove('recording');
          talkInput.value = (talkInput.value + ' ' + t).trim();
          $('#talkSend').disabled = !talkInput.value.trim();
          autoResize(talkInput);
        },
        () => btn.classList.remove('recording')
      );
    });

    // Repeat
    $('#rtDiff').addEventListener('input', () => {
      const v = $('#rtDiff').value;
      $('#rtDiffVal').textContent = v;
      $('#rtDiffBadge').textContent = 'Diff. ' + v + '/10';
    });
    $('#rtNew').addEventListener('click', generateRtSentence);
    $('#rtListen').addEventListener('click', () => {
      if (currentRtSentence) speak(currentRtSentence);
    });
    $('#rtListenBoth')?.addEventListener('click', () => {
      if (!currentRtSentence) return;
      const it = currentListenItem?.it || $('#rtItTrans')?.textContent || '';
      if (it) {
        speakSequence([
          { text: currentRtSentence, lang: 'en-GB', pauseAfter: 400 },
          { text: it, lang: 'it-IT', pauseAfter: 200 }
        ]);
      } else speak(currentRtSentence);
    });
    $('#rtShowIt')?.addEventListener('click', () => {
      const itEl = $('#rtItTrans');
      if (!itEl) return;
      if (!currentListenItem?.it && !itEl.textContent) {
        setRtStatus('Traduzione disponibile nei temi viaggio');
        return;
      }
      itEl.hidden = !itEl.hidden;
      if (!itEl.hidden && currentListenItem?.it) itEl.textContent = currentListenItem.it;
    });
    let rtRec = null;
    $('#rtMic').addEventListener('click', () => {
      if (!currentRtSentence) {
        setRtStatus('Genera prima una frase.', true);
        return;
      }
      const btn = $('#rtMic');
      if (btn.classList.contains('recording') && rtRec) {
        rtRec.stop();
        btn.classList.remove('recording');
        return;
      }
      btn.classList.add('recording');
      $('#rtHint').textContent = 'Ascolto…';
      rtRec = startRecognition(
        'en-US',
        (t) => {
          btn.classList.remove('recording');
          $('#rtHint').textContent = 'Hai detto: “' + t + '”';
          evaluateRt(t);
        },
        (err) => {
          btn.classList.remove('recording');
          $('#rtHint').textContent = err || 'Riprova';
        }
      );
    });

    // Learn tabs
    $$('#learnTabs .seg').forEach((b) =>
      b.addEventListener('click', () => {
        $$('#learnTabs .seg').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        $$('.learn-panel').forEach((p) =>
          p.classList.toggle('active', p.dataset.mode === b.dataset.mode)
        );
        if (b.dataset.mode === 'review') nextReview();
        if (b.dataset.mode === 'list') renderVocabList();
        if (b.dataset.mode === 'write') initWritePanel();
        if (b.dataset.mode === 'oxford') {
          if ($('#oxfordAuto')) $('#oxfordAuto').checked = false;
          clearOxfordAuto();
          // carica carta senza forzare auto-avanzo; audio solo se già su Oxford
          showOxfordCard();
        }
      })
    );

    $('#writeCheck')?.addEventListener('click', checkWriting);
    $('#writeExample')?.addEventListener('click', () => {
      const p = (window.WRITE_PROMPTS || [])[writePromptIndex];
      if (!p) return;
      if ($('#writeInput')) $('#writeInput').value = p.example || '';
      const fb = $('#writeFeedback');
      if (fb) {
        fb.hidden = false;
        fb.innerHTML = '<p class="hint">Esempio caricato. Puoi modificarlo e premere Controlla.</p>';
      }
    });
    $('#writeNext')?.addEventListener('click', () => {
      const prompts = window.WRITE_PROMPTS || [];
      if (!prompts.length) return;
      writePromptIndex = (writePromptIndex + 1) % prompts.length;
      loadWritePrompt();
    });

    $('#reviewReveal').addEventListener('click', () => {
      if (!currentReview) return;
      $('#reviewTrans').hidden = false;
      $('#reviewRevealRow').hidden = true;
      $('#reviewRates').hidden = false;
      speak(currentReview.word);
    });
    $$('#reviewRates .rate-btn').forEach((b) =>
      b.addEventListener('click', () => {
        if (!currentReview) return;
        rateCard(currentReview, parseInt(b.dataset.q, 10));
        nextReview();
      })
    );

    $('#oxfordLevel').addEventListener('change', () => {
      filterOxford();
      showOxfordCard();
    });
    const goNextOxford = () => {
      clearOxfordAuto();
      try {
        if ('speechSynthesis' in window) speechSynthesis.cancel();
      } catch (_) {}
      oxfordIdx = (oxfordIdx + 1) % Math.max(1, oxfordFiltered.length);
      showOxfordCard();
    };
    $('#oxfordNext').addEventListener('click', goNextOxford);
    $('#oxfordNext2')?.addEventListener('click', goNextOxford);
    $('#oxfordAuto')?.addEventListener('change', () => {
      const hint = $('#oxfordAutoHint');
      if ($('#oxfordAuto').checked) {
        if (hint) hint.textContent = 'Auto lento attivo: dopo EN+IT aspetta ~6s e passa avanti';
      } else {
        clearOxfordAuto();
        if (hint) hint.textContent = 'Auto spento — scegli tu: + Vocabolario o Prossima';
      }
    });
    $('#oxfordLevel')?.addEventListener('change', () => clearOxfordAuto());
    $('#oxfordSpeak').addEventListener('click', () => {
      clearOxfordAuto();
      const w = $('#oxfordWord').textContent;
      const t = $('#oxfordTrans').textContent;
      if (w && w !== '—') playOxfordAudio(w, t || '');
    });
    // Tocco sulla card annulla auto-avanza
    $('#oxfordCard')?.addEventListener('click', () => {
      if ($('#oxfordAuto')?.checked) {
        /* non cancellare al primo tocco sui bottoni: gestito dai bottoni */
      }
    });
    $('#oxfordAdd').addEventListener('click', () => {
      const w = $('#oxfordWord').textContent;
      const t = $('#oxfordTrans').textContent;
      if (w && w !== '—') {
        addVocab(w, t.startsWith('(') ? '' : t, $('#oxfordEx').textContent, 'oxford');
        $('#oxfordAdd').textContent = '✓ Aggiunta';
        setTimeout(() => {
          $('#oxfordAdd').textContent = '+ Vocabolario';
        }, 1200);
      }
    });

    $('#manualAdd').addEventListener('click', () => {
      const w = $('#manualWord').value.trim();
      const t = $('#manualTrans').value.trim();
      if (!w) return;
      addVocab(w, t, '', 'manuale');
      $('#manualWord').value = '';
      $('#manualTrans').value = '';
      renderVocabList();
    });
    $('#vocabList').addEventListener('click', (e) => {
      const id = e.target.dataset.del;
      if (!id) return;
      vocab = vocab.filter((v) => v.id !== id);
      saveVocab();
      renderVocabList();
    });

    // Tutor
    $('#tutorSend').addEventListener('click', () => sendTutor($('#tutorInput').value.trim()));
    $('#tutorInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendTutor($('#tutorInput').value.trim());
      }
    });
    $('#tutorInput').addEventListener('input', () => autoResize($('#tutorInput')));
    $$('#tutorChips button').forEach((b) =>
      b.addEventListener('click', () => {
        const p = b.dataset.prompt || '';
        if (/Correggi frase/.test(b.textContent)) {
          $('#tutorInput').value = p;
          $('#tutorInput').focus();
        } else {
          sendTutor(p);
        }
      })
    );
    $('#tutorReset').addEventListener('click', () => {
      $('#tutorThread').innerHTML =
        '<div class="empty-chat">Premi un prompt rapido o scrivi una domanda.</div>';
      $('#tutorStatus').textContent = '';
    });

    // Settings
    $('#saveKey').addEventListener('click', () => {
      const v = $('#apiKey').value.trim();
      if (v) localStorage.setItem(STORAGE.key, v);
      else localStorage.removeItem(STORAGE.key);
      updateKeyStatus();
      updateHome();
      alert(v ? 'Chiave salvata.' : 'Chiave rimossa.');
    });
    $('#clearKey').addEventListener('click', () => {
      localStorage.removeItem(STORAGE.key);
      $('#apiKey').value = '';
      updateKeyStatus();
      updateHome();
    });
    $('#verifyKey').addEventListener('click', async () => {
      const status = $('#keyStatus');
      status.textContent = 'Verifica in corso…';
      try {
        const key = getKey();
        if (!key) throw new Error('Nessuna chiave');
        const r = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(key)
        );
        if (!r.ok) throw new Error('Key non valida (' + r.status + ')');
        status.textContent = '● Gemini OK — modelli disponibili';
        status.style.color = 'var(--ok)';
      } catch (e) {
        status.textContent = '✗ ' + friendlyError(e.message);
        status.style.color = 'var(--danger)';
      }
    });
    ['level', 'topic', 'model', 'autoSpeak', 'speechRate', 'offlineSentences', 'offlineOxford'].forEach((id) => {
      const el = $('#' + id);
      if (!el) return;
      el.addEventListener('change', saveSettings);
      el.addEventListener('input', () => {
        if (id === 'speechRate') $('#rateVal').textContent = el.value;
        saveSettings();
      });
    });

    $('#exportData').addEventListener('click', () => {
      const blob = new Blob(
        [JSON.stringify({ vocab, settings: loadJSON(STORAGE.settings, {}), version: 16 }, null, 2)],
        { type: 'application/json' }
      );
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'quaderno-inglese-backup.json';
      a.click();
    });
    $('#importData').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (Array.isArray(data.vocab)) {
          vocab = data.vocab;
          saveVocab();
        }
        if (data.settings) {
          saveJSON(STORAGE.settings, data.settings);
          loadSettings();
        }
        alert('Import completato.');
        renderVocabList();
        nextReview();
      } catch {
        alert('File non valido.');
      }
    });
    $('#wipeData').addEventListener('click', () => {
      if (!confirm('Cancellare vocabolario e impostazioni?')) return;
      vocab = [];
      saveVocab();
      localStorage.removeItem(STORAGE.settings);
      localStorage.removeItem(STORAGE.oxfordCache);
      renderVocabList();
      nextReview();
      alert('Dati azzerati.');
    });

    // Course
    $('#courseList')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-lesson]');
      if (btn) openLesson(btn.dataset.lesson);
    });
    $('#courseBack')?.addEventListener('click', showCourseOverview);
    $('#courseUnits')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-unit]');
      if (!b) return;
      courseUnitFilter = b.dataset.unit;
      renderCourseList();
    });
    $$('#courseSteps .lstep').forEach((b) =>
      b.addEventListener('click', () => setCourseStep(b.dataset.cstep))
    );
    $('#courseToStep2')?.addEventListener('click', () => setCourseStep('2'));
    $('#courseToStep3')?.addEventListener('click', () => setCourseStep('3'));
    $('#courseWordChips')?.addEventListener('click', (e) => {
      const chip = e.target.closest('.word-chip');
      if (!chip) return;
      playOxfordAudio(chip.dataset.en, chip.dataset.it || '');
    });
    $('#coursePhraseList')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-speak-en]');
      if (btn) speak(btn.dataset.speakEn);
    });
    $('#coursePracticeListen')?.addEventListener('click', () => {
      const t = $('#coursePracticeEn')?.textContent;
      if (t && t !== '—') speak(t);
    });
    $('#coursePracticeNext')?.addEventListener('click', () => {
      if (!currentLesson) return;
      practiceIdx = (practiceIdx + 1) % currentLesson.phrases.length;
      setupPractice();
    });
    let courseRec = null;
    $('#coursePracticeSpeak')?.addEventListener('click', () => {
      const target = $('#coursePracticeEn')?.textContent || '';
      const btn = $('#coursePracticeSpeak');
      if (!target || target === '—') return;
      if (btn.classList.contains('recording') && courseRec) {
        courseRec.stop();
        btn.classList.remove('recording');
        return;
      }
      btn.classList.add('recording');
      $('#coursePracticeResult').textContent = 'Ascolto…';
      courseRec = startRecognition(
        'en-US',
        (t) => {
          btn.classList.remove('recording');
          const r = offlineEvaluate(target, t);
          $('#coursePracticeResult').textContent =
            (r.ok ? '✓ ' : '✗ ') + r.feedback + ' — Hai detto: “' + t + '”';
        },
        (err) => {
          btn.classList.remove('recording');
          $('#coursePracticeResult').textContent = err || 'Riprova';
        }
      );
    });
    function completeCurrentLesson() {
      if (!currentLesson) return;
      const prog = loadCourseProgress();
      prog.done[currentLesson.id] = true;
      prog.quiz[currentLesson.id] = {
        score: quizScore,
        total: currentLesson.quiz.length
      };
      saveCourseProgress(prog);
      updateHome();
      showCourseOverview();
    }
    $('#courseCompleteBtn')?.addEventListener('click', completeCurrentLesson);
    $('#courseJumpComplete')?.addEventListener('click', () => setCourseStep('4'));
    const listenAll = () => {
      if (!currentLesson) return;
      const items = [];
      currentLesson.words.forEach((w) => {
        items.push({ text: w.en, lang: 'en-US', pauseAfter: 300 });
        items.push({ text: (w.it || '').split('/')[0].trim(), lang: 'it-IT', pauseAfter: 250 });
      });
      currentLesson.phrases.forEach((p) => {
        items.push({ text: p, lang: 'en-US', pauseAfter: 500 });
      });
      speakSequence(items.filter((x) => x.text));
    };
    $('#courseListenAll')?.addEventListener('click', listenAll);
    $('#courseListenAll2')?.addEventListener('click', listenAll);

    // Install PWA
    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      const btn = $('#installBtn');
      if (btn) btn.style.display = 'block';
      const hint = $('#installHint');
      if (hint) hint.textContent = 'Puoi installare Quaderno come app.';
    });
    $('#installBtn')?.addEventListener('click', async () => {
      if (!deferredPrompt) {
        alert('Usa il menu del browser → Aggiungi a schermata Home.');
        return;
      }
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      const btn = $('#installBtn');
      if (btn) btn.style.display = 'none';
    });

    // Backup rapido
    $('#backupNow')?.addEventListener('click', () => {
      const blob = new Blob(
        [
          JSON.stringify(
            {
              vocab,
              settings: loadJSON(STORAGE.settings, {}),
              course: loadCourseProgress(),
              oxfordCache: oxfordCache(),
              version: 16.3,
              exportedAt: new Date().toISOString()
            },
            null,
            2
          )
        ],
        { type: 'application/json' }
      );
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'quaderno-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
    });

    // SW
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
