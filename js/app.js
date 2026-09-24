/* Quaderno d'Inglese V16 — streaming Gemini, UI moderna, funzioni essenziali */
(function () {
  'use strict';

  const STORAGE = {
    key: 'quaderno_v16_gemini_key',
    settings: 'quaderno_v16_settings',
    vocab: 'quaderno_v16_vocab',
    theme: 'quaderno_v16_theme',
    oxfordCache: 'quaderno_v16_oxford_cache'
  };

  const FALLBACK_MODELS = [
    'gemini-3.6-flash',
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite'
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
  function showScreen(name) {
    $$('.screen').forEach((s) => s.classList.toggle('active', s.dataset.screen === name));
    $$('#bottomNav button').forEach((b) =>
      b.classList.toggle('active', b.dataset.screen === name)
    );
    if (name === 'learn') renderVocabList();
    if (name === 'home') updateHome();
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
    if (/no longer available|update your code|gemini-2\.5|is not found|not supported for generatecontent/i.test(m))
      return 'Modello non disponibile. Nelle Impostazioni scegli gemini-3.6-flash e riprova.';
    if (/high demand|overloaded|try again later|temporarily unavailable/.test(m))
      return 'Gemini è momentaneamente sovraccarico. Riprova tra poco.';
    if (/resource_exhausted|rate limit|429/.test(m))
      return 'Limite richieste raggiunto. Attendi un attimo e riprova.';
    if (/api key|401|403|invalid|permission/.test(m))
      return 'API Key non valida. Controllala nelle Impostazioni.';
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
              generationConfig: { responseMimeType: 'application/json' }
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
                await sleep(600 * Math.pow(2, attempt));
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
              await sleep(600 * Math.pow(2, attempt));
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
    $('#statWords').textContent = vocab.length;
    $('#statDue').textContent = dueCards().length;
    $('#statStreak').textContent = correctStreak;
    const tip = $('#homeTipText');
    if (!getKey()) {
      tip.textContent = 'Configura la chiave Gemini nelle Impostazioni per attivare l’AI.';
    } else if (dueCards().length > 0) {
      tip.textContent = `Hai ${dueCards().length} parole da ripassare oggi.`;
    } else {
      tip.textContent = 'Inizia una conversazione o esplora Oxford 3000.';
    }
  }

  // ─── Talk (Conversazione) ────────────────────────────────
  function talkSystem() {
    const lvl = getLevel();
    const tp = getTopic();
    return [
      `Sei un insegnante d'inglese paziente e incoraggiante, madrelingua, che conversa con uno studente italiano di livello ${lvl}.`,
      'Parli SOLO dopo che lo studente ha scritto una frase completa.',
      'Per ogni turno:',
      '1. Individua errori grammaticali, lessicali o di naturalezza.',
      '2. Continua la conversazione in modo naturale' +
        (tp ? `, sul tema: ${tp}` : '') +
        ', ponendo domande brevi.',
      '3. La reply deve essere in inglese, 1-3 frasi, adatta al livello.',
      '4. Le spiegazioni (why) in ITALIANO, brevi e chiare.',
      '5. Se la frase è corretta, corrections è un array vuoto.',
      'Rispondi SOLO con JSON valido, senza markdown:',
      '{"corrections":[{"wrong":"...","right":"...","why":"..."}],"reply":"..."}'
    ].join('\n');
  }

  function addTalkBubble(role, text, streaming) {
    const empty = $('#talkEmpty');
    if (empty) empty.remove();
    const thread = $('#talkThread');
    const div = document.createElement('div');
    div.className = 'msg ' + (role === 'user' ? 'user' : 'ai') + (streaming ? ' streaming' : '');
    div.textContent = text;
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


  function pickDialoguePack() {
    const packs = window.DIALOGUE_PACKS || {};
    const level = getLevel();
    let list = packs[level] || packs.A1 || [];
    if (!list.length) {
      list = Object.values(packs).flat();
    }
    if (!list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  function startOfflineDialogue() {
    const pack = pickDialoguePack();
    if (!pack) {
      setTalkStatus('Nessun dialogo offline disponibile.', true);
      return;
    }
    dialogueState = { pack, lineIndex: 0 };
    const empty = $('#talkEmpty');
    if (empty) empty.remove();
    // show title
    const thread = $('#talkThread');
    const title = document.createElement('div');
    title.className = 'dlg-hint';
    title.innerHTML = '<b>Dialogo offline:</b> ' + escapeHtml(pack.title) + ' — rispondi con le tue parole o usa 💡 Suggerimento';
    thread.appendChild(title);
    // play first AI lines until a user_hint
    advanceDialogueAI();
  }

  function advanceDialogueAI() {
    if (!dialogueState) return;
    const { pack } = dialogueState;
    const thread = $('#talkThread');
    while (dialogueState.lineIndex < pack.lines.length) {
      const line = pack.lines[dialogueState.lineIndex];
      dialogueState.lineIndex++;
      if (line.role === 'ai') {
        addTalkBubble('ai', line.text, false);
        talkHistory.push({ role: 'model', text: line.text });
        if (autoSpeak()) speak(line.text);
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
    dialogueState = null;
    setTalkStatus('');
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
      dialogueState.currentHint = null;
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
        // Try to extract partial "reply" for nicer UX
        const m = acc.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (m) {
          try {
            bubble.textContent = JSON.parse('"' + m[1] + '"');
          } catch {
            bubble.textContent = m[1];
          }
        } else {
          bubble.textContent = 'Scrivendo…';
        }
        $('#talkThread').scrollTop = $('#talkThread').scrollHeight;
      });

      talkHistory.push({ role: 'user', text });
      bubble.classList.remove('streaming');
      bubble.textContent = '';
      const reply = result.reply || '(nessuna risposta)';
      bubble.textContent = reply;
      const btn = document.createElement('button');
      btn.className = 'speak';
      btn.type = 'button';
      btn.textContent = '🔊';
      btn.onclick = () => speak(reply);
      bubble.appendChild(btn);

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

  async function generateRtSentence() {
    setRtStatus('Genero frase…', false, true);
    $('#rtResult').hidden = true;
    $('#rtSentence').textContent = '…';
    const preferOffline = $('#offlineSentences')?.checked !== false;

    // 1) Offline first (instant)
    if (preferOffline) {
      const offline = pickOfflineSentence();
      if (offline) {
        currentRtSentence = offline;
        rtUsed.push(offline);
        if (rtUsed.length > 40) rtUsed = rtUsed.slice(-40);
        $('#rtSentence').textContent = currentRtSentence;
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
      .replace(/[.,!?;:'"]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function offlineEvaluate(target, spoken) {
    const a = normalizeSpeech(target).split(' ').filter(Boolean);
    const b = normalizeSpeech(spoken).split(' ').filter(Boolean);
    if (!a.length) return { ok: false, feedback: 'Nessuna frase target.' };
    let hits = 0;
    const used = new Set();
    for (const w of b) {
      const i = a.findIndex((x, idx) => x === w && !used.has(idx));
      if (i >= 0) {
        hits++;
        used.add(i);
      }
    }
    const ratio = hits / a.length;
    const ok = ratio >= 0.7 || normalizeSpeech(target) === normalizeSpeech(spoken);
    return {
      ok,
      translation: '(valutazione offline)',
      feedback: ok
        ? 'Buona ripetizione (controllo offline).'
        : 'Riprova: alcune parole non coincidono (controllo offline).'
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

  async function showOxfordCard() {
    if (!oxfordFiltered.length) filterOxford();
    const c = oxfordFiltered[oxfordIdx % oxfordFiltered.length];
    if (!c) return;
    $('#oxfordWord').textContent = c.word || '—';
    $('#oxfordPos').textContent =
      (c.pos || '') + (c.cefr ? ' · ' + c.cefr : c.cefrLevels ? ' · ' + c.cefrLevels.join(',') : '');
    $('#oxfordTrans').textContent = '…';
    $('#oxfordEx').textContent = '';

    const cache = oxfordCache();
    const key = (c.word || '').toLowerCase();
    const preferOffline = $('#offlineOxford')?.checked !== false;

    // 1) localStorage cache
    if (cache[key]) {
      $('#oxfordTrans').textContent = cache[key].translation || '—';
      $('#oxfordEx').textContent = cache[key].example || '';
      return;
    }

    // 2) Offline dictionary (instant)
    if (preferOffline) {
      const off = lookupOfflineOxford(c.word);
      if (off) {
        $('#oxfordTrans').textContent = off.translation || '—';
        $('#oxfordEx').textContent = off.example || '';
        cache[key] = { translation: off.translation || '', example: off.example || '', source: 'offline' };
        saveOxfordCache(cache);
        return;
      }
    }

    if (!getKey()) {
      $('#oxfordTrans').textContent = '(nessuna traduzione offline — configura Gemini)';
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
      $('#oxfordTrans').textContent = r.translation || '—';
      $('#oxfordEx').textContent = r.example || '';
      cache[key] = { translation: r.translation || '', example: r.example || '', source: 'gemini' };
      saveOxfordCache(cache);
    } catch (e) {
      const off = lookupOfflineOxford(c.word);
      if (off) {
        $('#oxfordTrans').textContent = off.translation || '—';
        $('#oxfordEx').textContent = off.example || '';
      } else {
        $('#oxfordTrans').textContent = '(traduzione non disponibile)';
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

  // ─── Wire events ─────────────────────────────────────────
  function init() {
    initTheme();
    loadSettings();
    filterOxford();
    updateHome();
    nextReview();
    showOxfordCard();

    // Nav
    $$('#bottomNav button').forEach((b) =>
      b.addEventListener('click', () => showScreen(b.dataset.screen))
    );
    $$('[data-go]').forEach((b) =>
      b.addEventListener('click', () => showScreen(b.dataset.go))
    );

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
    $('#dlgStart')?.addEventListener('click', startOfflineDialogue);
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
      })
    );

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
    $('#oxfordNext').addEventListener('click', () => {
      oxfordIdx = (oxfordIdx + 1) % Math.max(1, oxfordFiltered.length);
      showOxfordCard();
    });
    $('#oxfordSpeak').addEventListener('click', () => {
      const w = $('#oxfordWord').textContent;
      if (w && w !== '—') speak(w);
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

    // SW
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
