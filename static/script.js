const L = {
    en: {
        title: 'Tic Tac Toe',
        vsPlayer: 'Create Room (vs Player)',
        vsAI: 'Play vs AI',
        roomCode: 'Room code',
        join: 'Join',
        copied: 'Copied!',
        copyTitle: 'Copy room code',
        restart: 'Restart',
        leave: 'Leave',
        yourTurn: 'Your turn',
        aiThinking: 'AI thinking...',
        waiting: 'Waiting for opponent...',
        spectating: 'Spectating...',
        wins: 'wins!',
        draw: 'Draw!',
        disconnected: 'Disconnected',
        connError: 'Connection error',
        failRoom: 'Failed to create room',
        turn: "'s turn",
        errPrefix: 'Error: ',
        empty: 'Clipboard is empty',
        copyHint: 'Copy something to get started!',
    },
    ru: {
        title: 'Крестики Нолики',
        vsPlayer: 'Комната (vs Игрок)',
        vsAI: 'Играть с ИИ',
        roomCode: 'Код комнаты',
        join: 'Войти',
        copied: 'Скопировано!',
        copyTitle: 'Копировать код',
        restart: 'Заново',
        leave: 'Выйти',
        yourTurn: 'Ваш ход',
        aiThinking: 'ИИ думает...',
        waiting: 'Ожидание соперника...',
        spectating: 'Наблюдение...',
        wins: 'победил!',
        draw: 'Ничья!',
        disconnected: 'Отключено',
        connError: 'Ошибка соединения',
        failRoom: 'Ошибка создания комнаты',
        turn: ' ходит',
        errPrefix: 'Ошибка: ',
        empty: 'Буфер обмена пуст',
        copyHint: 'Скопируйте что-нибудь!',
    }
};

let lang = localStorage.getItem('lang') === 'ru' ? 'ru' : 'en';
function t(key) { return L[lang][key] || key; }

// === Sound system (Web Audio API) ===
let audioCtx = null;
function getAudio() { if (!audioCtx) audioCtx = new AudioContext(); return audioCtx; }

function beep(freq, duration, type = 'sine', vol = 0.08) {
    const ctx = getAudio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
}

function drawSound(duration, vol = 0.03) {
    const ctx = getAudio();
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * duration);
    const buf = ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    // Rapid scratch: dense noise modulated by fast LFO
    for (let i = 0; i < len; i++) {
        const env = Math.min(i / (len * 0.01), 1, (len - i) / (len * 0.1));
        // Fast amplitude modulation simulates pencil texture
        const lfo = 0.5 + 0.5 * Math.sin(i * 0.4 + Math.sin(i * 0.15) * 2);
        data[i] = (Math.random() * 2 - 1) * lfo * env;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    // Bandpass to isolate scratch frequencies
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 4500;
    bp.Q.value = 0.6;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    src.connect(bp);
    bp.connect(hp);
    hp.connect(gain);
    gain.connect(ctx.destination);
    src.start();
}
    }
    // Apply overall stroke envelope
    for (let i = 0; i < len; i++) {
        const env = Math.min(i / (len * 0.02), 1, (len - i) / (len * 0.1));
        data[i] *= env;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3500;
    const peak = ctx.createBiquadFilter();
    peak.type = 'peaking';
    peak.frequency.value = 6000;
    peak.Q.value = 1.5;
    peak.gain.value = 8;
    src.connect(hp);
    hp.connect(peak);
    peak.connect(gain);
    gain.connect(ctx.destination);
    src.start();
}

function soundX() { drawSound(0.06, 0.03); setTimeout(() => drawSound(0.06, 0.03), 300); }
function soundO() { drawSound(0.28, 0.035); }
function soundWin() {
    beep(660, 0.1, 'sine', 0.08);
    setTimeout(() => beep(880, 0.1, 'sine', 0.08), 100);
    setTimeout(() => beep(1100, 0.2, 'sine', 0.1), 200);
}
function soundClick() { beep(200, 0.03, 'sine', 0.03); }
function soundCopy() { beep(1200, 0.06, 'sine', 0.04); setTimeout(() => beep(1600, 0.06, 'sine', 0.04), 60); }
function soundDraw() { beep(440, 0.15, 'triangle', 0.06); }
function soundLose() { beep(300, 0.15, 'sawtooth', 0.04); setTimeout(() => beep(220, 0.2, 'sawtooth', 0.04), 150); }

function setTitle() {
    const title = document.getElementById('title');
    const text = t('title');
    title.innerHTML = '';
    const words = text.split(' ');
    words.forEach((word, wi) => {
        word.split('').forEach((ch, ci) => {
            const span = document.createElement('span');
            span.textContent = ch;
            const delay = (wi === 0 ? ci : 3 + wi + ci) * 0.05;
            span.style.animationDelay = delay + 's';
            title.appendChild(span);
        });
        if (wi < words.length - 1) {
            const s = document.createElement('span');
            s.className = 'space';
            title.appendChild(s);
        }
    });
}

function applyLang() {
    localStorage.setItem('lang', lang);
    setTitle();
    document.querySelectorAll('.lang-btn').forEach(b => b.textContent = lang.toUpperCase());
    document.getElementById('btn-vs-player').textContent = t('vsPlayer');
    document.getElementById('btn-vs-ai').textContent = t('vsAI');
    document.getElementById('room-code-input').placeholder = t('roomCode');
    document.getElementById('btn-join').textContent = t('join');
    document.getElementById('copy-btn').title = t('copyTitle');
    document.getElementById('copy-toast').textContent = t('copied');
    document.getElementById('btn-restart').textContent = t('restart');
    document.getElementById('btn-leave').textContent = t('leave');
}

let ws = null;
let player = null;
let roomCode = null;
let vsAI = false;
let gameActive = false;
let prevBoard = Array(9).fill(null);
let darkTheme = localStorage.getItem('theme') === 'dark';

const menu = document.getElementById('menu');
const gameDiv = document.getElementById('game');
const cells = document.querySelectorAll('.cell');
const statusEl = document.getElementById('status');
const roomCodeText = document.getElementById('room-code-text');
const copyBtn = document.getElementById('copy-btn');
const copyToast = document.getElementById('copy-toast');

function setStatus(text) {
    statusEl.classList.remove('pop');
    void statusEl.offsetHeight;
    statusEl.textContent = text;
    statusEl.classList.add('pop');
}

copyBtn.onclick = async () => {
    try {
        await navigator.clipboard.writeText(roomCode);
        soundCopy();
        copyToast.classList.remove('show');
        void copyToast.offsetHeight;
        copyToast.classList.add('show');
    } catch (_) {}
};

document.getElementById('btn-vs-player').onclick = () => createRoom(false);
document.getElementById('btn-vs-ai').onclick = () => createRoom(true);
document.getElementById('btn-join').onclick = joinRoom;
document.getElementById('btn-restart').onclick = () => send({ type: 'restart' });
document.getElementById('btn-leave').onclick = leave;
document.getElementById('room-code-input').onkeydown = (e) => { if (e.key === 'Enter') joinRoom(); };

document.querySelectorAll('.theme-btn').forEach(btn => btn.onclick = toggleTheme);
applyTheme();

document.querySelectorAll('.lang-btn').forEach(btn => btn.onclick = toggleLang);
applyLang();

cells.forEach(cell => {
    cell.onclick = () => {
        if (!gameActive) return;
        send({ type: 'move', position: parseInt(cell.dataset.i) });
    };
});

document.addEventListener('click', e => {
    if (e.target.closest('button')) soundClick();
});

function applyTheme() {
    if (darkTheme) {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
    localStorage.setItem('theme', darkTheme ? 'dark' : 'light');
}

function toggleTheme() {
    soundClick();
    darkTheme = !darkTheme;
    document.querySelectorAll('.theme-btn').forEach(btn => btn.classList.add('spin'));
    setTimeout(() => applyTheme(), 250);
    setTimeout(() => {
        document.querySelectorAll('.theme-btn').forEach(btn => btn.classList.remove('spin'));
    }, 500);
}

function toggleLang() {
    soundClick();
    lang = lang === 'en' ? 'ru' : 'en';
    applyLang();
}

async function createRoom(vsAi) {
    try {
        const res = await fetch('/api/room', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vs_ai: vsAi }),
        });
        const data = await res.json();
        if (data.code) { roomCode = data.code; vsAI = vsAi; connect(); }
    } catch (e) { setStatus(t('failRoom')); }
}

function joinRoom() {
    const code = document.getElementById('room-code-input').value.trim().toUpperCase();
    if (code.length < 4) return;
    roomCode = code; vsAI = false; connect();
}

function connect() {
    closeWs();
    menu.style.display = 'none';
    gameDiv.style.display = 'flex';
    roomCodeText.textContent = roomCode;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${location.host}/ws/${roomCode}`);
    ws.onmessage = (event) => { const msg = JSON.parse(event.data); handleMessage(msg); };
    ws.onclose = () => { setStatus(t('disconnected')); gameActive = false; };
    ws.onerror = () => { setStatus(t('connError')); };
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
            setStatus(vsAI ? (player === 'X' ? t('yourTurn') : t('aiThinking')) : 'X' + t('turn'));
            break;
        case 'game_state':
            renderBoard(msg.state, true);
            if (msg.state.winner) {
                setStatus(`${msg.state.winner} ` + t('wins')); gameActive = false;
                if (msg.state.winner === player) { confetti(); soundWin(); }
                else { soundLose(); }
            }
            else if (msg.state.draw) { setStatus(t('draw')); gameActive = false; soundDraw(); }
            else {
                const myTurn = msg.state.current_turn === player;
                gameActive = vsAI ? (myTurn && player !== 'spectator') : player !== 'spectator';
                setStatus(vsAI ? (myTurn ? t('yourTurn') : t('aiThinking')) : msg.state.current_turn + t('turn'));
            }
            break;
        case 'error': setStatus(t('errPrefix') + msg.message); break;
    }
}

function renderBoard(state, animate) {
    state.board.forEach((val, i) => {
        const cell = cells[i];
        if (val === prevBoard[i]) return;
        cell.classList.remove('x', 'o', 'anim', 'win');
        if (val) {
            cell.classList.add('taken', val.toLowerCase());
            if (animate) {
                cell.classList.add('anim');
                if (val === 'X') soundX(); else soundO();
            }
        } else { cell.classList.remove('taken'); }
    });
    prevBoard = [...state.board];
    if (state.win_line && state.win_line.length > 0) {
        state.win_line.forEach(i => cells[i].classList.add('win'));
    }
}

function send(data) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); }
function closeWs() { if (ws) { ws.close(); ws = null; } }

function leave() {
    closeWs();
    gameDiv.style.display = 'none';
    menu.style.display = 'flex';
    player = null; roomCode = null; gameActive = false;
    prevBoard = Array(9).fill(null);
    cells.forEach(c => { c.className = 'cell'; });
}

function confetti() {
    const colors = ['#22c55e', '#eab308', '#ef4444', '#3b82f6'];
    for (let i = 0; i < 100; i++) {
        const el = document.createElement('div');
        el.className = 'confetti-piece';
        el.style.left = Math.random() * 100 + '%';
        el.style.animationDelay = Math.random() * 1.5 + 's';
        el.style.animationDuration = 2 + Math.random() * 2.5 + 's';
        el.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        el.style.width = (6 + Math.random() * 8) + 'px';
        el.style.height = (6 + Math.random() * 8) + 'px';
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 4500);
    }
}
