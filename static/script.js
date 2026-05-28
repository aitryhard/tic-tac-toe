// ── i18n ────────────────────────────────
const I18N = {
    en: {
        title: 'Tic Tac Toe',         vsPlayer: 'Create Room (vs Player)',
        vsAI: 'Play vs AI',           roomCode: 'Room code',
        join: 'Join',                 copied: 'Copied!',
        copyTitle: 'Copy room code',  restart: 'Restart',           leave: 'Leave',
        yourTurn: 'Your turn',        aiThinking: 'AI thinking...',
        waiting: 'Waiting for opponent...',  spectating: 'Spectating...',
        wins: 'wins!',               draw: 'Draw!',
        disconnected: 'Disconnected', connError: 'Connection error',
        failRoom: 'Failed to create room',  errPrefix: 'Error: ',
        turn: "'s turn",             timeoutAI: "Time's up! AI wins!",
        timeoutPvP: "'s time is up! ",
    },
    ru: {
        title: 'Крестики Нолики',     vsPlayer: 'Комната (vs Игрок)',
        vsAI: 'Играть с ИИ',          roomCode: 'Код комнаты',
        join: 'Войти',                copied: 'Скопировано!',
        copyTitle: 'Копировать код',  restart: 'Заново',            leave: 'Выйти',
        yourTurn: 'Ваш ход',          aiThinking: 'ИИ думает...',
        waiting: 'Ожидание соперника...',  spectating: 'Наблюдение...',
        wins: 'победил!',             draw: 'Ничья!',
        disconnected: 'Отключено',    connError: 'Ошибка соединения',
        failRoom: 'Ошибка создания комнаты', errPrefix: 'Ошибка: ',
        turn: ' ходит',              timeoutAI: 'Время вышло! ИИ победил!',
        timeoutPvP: ' — время вышло! ',
    }
};
let lang = localStorage.getItem('lang') === 'ru' ? 'ru' : 'en';
const t = key => I18N[lang][key] || key;

// ── Initialization ───────────────────────
let ws = null, player = null, roomCode = null, vsAI = false, gameActive = false;
let prevBoard = Array(9).fill(null);
let darkTheme = localStorage.getItem('theme') === 'dark';

const $ = id => document.getElementById(id);
const menu     = $('menu');
const gameDiv  = $('game');
const cells    = document.querySelectorAll('.cell');
const statusEl = $('status');
const copyBtn  = $('copy-btn');
const copyToast = $('copy-toast');
const roomCodeText = $('room-code-text');

// ── Sound ───────────────────────────
let audioCtx = null;
const ctx = () => { if (!audioCtx) audioCtx = new AudioContext(); return audioCtx; };

function beep(freq, dur, type = 'sine', vol = 0.08) {
    const a = ctx(), o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
    o.connect(g); g.connect(a.destination);
    o.start(a.currentTime); o.stop(a.currentTime + dur);
}
function drawSound(dur, vol = 0.03) {
    const a = ctx(), sr = a.sampleRate, len = Math.floor(sr * dur);
    const buf = a.createBuffer(1, len, sr), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
        const env = Math.min(i / (len * 0.01), 1, (len - i) / (len * 0.1));
        d[i] = (Math.random() * 2 - 1) * (0.5 + 0.5 * Math.sin(i * 0.4 + Math.sin(i * 0.15) * 2)) * env;
    }
    const s = a.createBufferSource(); s.buffer = buf;
    const g = a.createGain(); g.gain.value = vol;
    const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 4500; bp.Q.value = 0.6;
    const hp = a.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    s.connect(bp); bp.connect(hp); hp.connect(g); g.connect(a.destination); s.start();
}
function soundX()    { drawSound(0.06, 0.03); setTimeout(() => drawSound(0.06, 0.03), 300); }
function soundO()    { drawSound(0.28, 0.035); }
function soundWin()  { beep(660,0.1); setTimeout(()=>beep(880,0.1),100); setTimeout(()=>beep(1100,0.2,0.1),200); }
function soundClick(){ beep(200, 0.03, 'sine', 0.03); }
function soundCopy() { beep(1200,0.06,'sine',0.04); setTimeout(()=>beep(1600,0.06,'sine',0.04),60); }
function soundDraw() { beep(440, 0.15, 'triangle', 0.06); }
function soundLose() { beep(300,0.15,'sawtooth',0.04); setTimeout(()=>beep(220,0.2,'sawtooth',0.04),150); }
document.addEventListener('click', e => { if (e.target.closest('button')) soundClick(); });

// ── Timer ───────────────────────────
const timerBar  = $('timer-bar');
const timerFill = $('timer-fill');
let timerInterval = null, timerLeft = 0;
const TIMER_SEC = 10;

function startTimer() {
    clearTimer();
    timerLeft = TIMER_SEC;
    timerBar.style.opacity = '1';
    timerInterval = setInterval(() => {
        timerLeft -= 0.05;
        const pct = Math.max(0, Math.min(1, timerLeft / TIMER_SEC));
        timerFill.style.width = (pct * 100) + '%';
        timerFill.style.background = `hsl(${pct * 120}, 70%, 50%)`;
        if (timerLeft <= 0) {
            clearTimer();
            if (!gameActive) return;
            gameActive = false;
            setStatus(vsAI ? t('timeoutAI') : player + t('timeoutPvP') + (player=='X'?'O':'X') + ' wins!');
            soundLose();
        }
    }, 50);
}
function clearTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    timerBar.style.opacity = '0';
}

// ── Theme & Language ────────────────
function applyTheme() {
    if (darkTheme) document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('theme', darkTheme ? 'dark' : 'light');
}
function toggleTheme() {
    soundClick();
    darkTheme = !darkTheme;
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.add('spin'));
    setTimeout(applyTheme, 250);
    setTimeout(() => document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('spin')), 500);
}

function setTitle() {
    const el = $('title'); el.innerHTML = '';
    const words = t('title').split(' ');
    words.forEach((word, wi) => {
        [...word].forEach((ch, ci) => {
            const s = document.createElement('span'); s.textContent = ch;
            s.style.animationDelay = ((wi ? 3 + wi + ci : ci) * 0.05) + 's';
            el.appendChild(s);
        });
        if (wi < words.length - 1) { const sp = document.createElement('span'); sp.className = 'space'; el.appendChild(sp); }
    });
}
function applyLang() {
    localStorage.setItem('lang', lang);
    setTitle();
    document.querySelectorAll('.lang-btn').forEach(b => b.textContent = lang.toUpperCase());
    $('btn-vs-player').textContent = t('vsPlayer');
    $('btn-vs-ai').textContent     = t('vsAI');
    $('room-code-input').placeholder = t('roomCode');
    $('btn-join').textContent     = t('join');
    $('copy-btn').title           = t('copyTitle');
    $('copy-toast').textContent   = t('copied');
    $('btn-restart').textContent  = t('restart');
    $('btn-leave').textContent    = t('leave');
}
function toggleLang() { soundClick(); lang = lang === 'en' ? 'ru' : 'en'; applyLang(); }

document.querySelectorAll('.theme-btn').forEach(b => b.onclick = toggleTheme);
applyTheme();
document.querySelectorAll('.lang-btn').forEach(b => b.onclick = toggleLang);
applyLang();

// ── Network ──────────────────────────
function send(data) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); }
function closeWs() { if (ws) { ws.close(); ws = null; } }

function connect() {
    closeWs();
    menu.style.display = 'none'; gameDiv.style.display = 'flex';
    roomCodeText.textContent = roomCode;
    ws = new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws/${roomCode}`);
    ws.onmessage = e => handleMessage(JSON.parse(e.data));
    ws.onclose   = () => { setStatus(t('disconnected')); gameActive = false; clearTimer(); };
    ws.onerror   = () => { setStatus(t('connError')); };
}

async function createRoom(vs) {
    try {
        const res = await fetch('/api/room', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({vs_ai:vs}) });
        const data = await res.json();
        if (data.code) { roomCode = data.code; vsAI = vs; connect(); }
    } catch(_) { setStatus(t('failRoom')); }
}

function joinRoom() {
    const c = $('room-code-input').value.trim().toUpperCase();
    if (c.length < 4) return;
    roomCode = c; vsAI = false; connect();
}

function leave() {
    closeWs(); clearTimer();
    gameDiv.style.display = 'none'; menu.style.display = 'flex';
    player = null; roomCode = null; gameActive = false;
    prevBoard = Array(9).fill(null);
    cells.forEach(c => c.className = 'cell');
}

// ── Game Rendering ────────────────────
function setStatus(text, html) {
    statusEl.classList.remove('pop');
    void statusEl.offsetHeight;
    if (html) statusEl.innerHTML = text; else statusEl.textContent = text;
    statusEl.classList.add('pop');
}

function renderBoard(state, animate) {
    state.board.forEach((val, i) => {
        const cell = cells[i];
        if (val === prevBoard[i]) return;
        cell.classList.remove('x', 'o', 'anim', 'win');
        if (val) {
            cell.classList.add('taken', val.toLowerCase());
            if (animate) { cell.classList.add('anim'); (val==='X' ? soundX : soundO)(); }
        } else cell.classList.remove('taken');
    });
    prevBoard = [...state.board];
    if (state.win_line?.length) state.win_line.forEach(i => cells[i].classList.add('win'));
}

function handleMessage(msg) {
    switch (msg.type) {
        case 'joined':
            player = msg.player; vsAI = msg.vs_ai;
            setStatus(player === 'spectator' ? t('spectating') : t('waiting'));
            break;
        case 'game_start':
            prevBoard = [...msg.state.board];
            renderBoard(msg.state, false);
            gameActive = !vsAI || player === 'X';
            if (gameActive) startTimer();
            setStatus(vsAI ? (player==='X'?t('yourTurn'):t('aiThinking')) : 'X'+t('turn'));
            break;
        case 'game_state':
            renderBoard(msg.state, true);
            if (msg.state.winner) {
                setStatus(`<span class="win-${msg.state.winner.toLowerCase()}">${msg.state.winner}</span> ${t('wins')}`, true);
                gameActive = false; clearTimer();
                if (msg.state.winner === player) { confetti(); soundWin(); } else soundLose();
            } else if (msg.state.draw) {
                setStatus(t('draw')); gameActive = false; soundDraw(); clearTimer();
            } else {
                const myTurn = msg.state.current_turn === player;
                gameActive = vsAI ? (myTurn && player !== 'spectator') : player !== 'spectator';
                if (gameActive) startTimer(); else clearTimer();
                setStatus(vsAI ? (myTurn?t('yourTurn'):t('aiThinking')) : msg.state.current_turn+t('turn'));
            }
            break;
        case 'error': setStatus(t('errPrefix') + msg.message); break;
    }
}

// ── Confetti ─────────────────────────
function confetti() {
    const cols = ['#22c55e','#eab308','#ef4444','#3b82f6'];
    for (let i = 0; i < 100; i++) {
        const el = document.createElement('div'); el.className = 'confetti-piece';
        el.style.left = Math.random()*100 + '%';
        el.style.animationDelay = Math.random()*1.5 + 's';
        el.style.animationDuration = 2+Math.random()*2.5 + 's';
        el.style.backgroundColor = cols[Math.floor(Math.random()*cols.length)];
        el.style.width = (6+Math.random()*8)+'px';
        el.style.height = (6+Math.random()*8)+'px';
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 4500);
    }
}

// ── Event Bindings ───────────────────
$('btn-vs-player').onclick = () => createRoom(false);
$('btn-vs-ai').onclick     = () => createRoom(true);
$('btn-join').onclick      = joinRoom;
$('btn-restart').onclick   = () => send({ type: 'restart' });
$('btn-leave').onclick     = leave;
$('room-code-input').onkeydown = e => { if (e.key === 'Enter') joinRoom(); };
$('btn-share').onclick = () => {
    navigator.clipboard.writeText(`${location.origin}/?room=${roomCode}`).then(() => {
        soundCopy();
        copyToast.classList.remove('show');
        void copyToast.offsetHeight;
        copyToast.textContent = t('copied');
        copyToast.classList.add('show');
    }).catch(()=>{});
};
copyBtn.onclick = async () => {
    try {
        await navigator.clipboard.writeText(roomCode);
        soundCopy();
        copyToast.classList.remove('show');
        void copyToast.offsetHeight;
        copyToast.classList.add('show');
    } catch(_) {}
};
cells.forEach(c => c.onclick = () => { if (gameActive) send({ type:'move', position:+c.dataset.i }); });

// ── Auto-join ────────────────────────
const autoCode = new URLSearchParams(location.search).get('room');
if (autoCode) { roomCode = autoCode; vsAI = false; connect(); }
