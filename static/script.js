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
const roomLabel = document.getElementById('room-label');

function setStatus(text) {
    statusEl.classList.remove('pop');
    void statusEl.offsetHeight;
    statusEl.textContent = text;
    statusEl.classList.add('pop');
}

const roomCodeText = document.getElementById('room-code-text');
const copyBtn = document.getElementById('copy-btn');
const copyToast = document.getElementById('copy-toast');

copyBtn.innerHTML = '<svg viewBox="0 0 20 20" width="14" height="14"><rect x="5.5" y="7.5" width="10" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M4 4.5V16a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2H6a2 2 0 0 0-2 2z" fill="currentColor"/></svg>';

copyBtn.onclick = async () => {
    try {
        await navigator.clipboard.writeText(roomCode);
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
document.querySelectorAll('.theme-btn').forEach(b => b.innerHTML = darkTheme ? sunSVG : moonSVG);

// Force button hover via JS for guaranteed animation
document.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('mouseenter', () => btn.classList.add('btn-hover'));
    btn.addEventListener('mouseleave', () => btn.classList.remove('btn-hover'));
    btn.addEventListener('mousedown', () => btn.classList.add('btn-active'));
    btn.addEventListener('mouseup', () => btn.classList.remove('btn-active'));
    btn.addEventListener('mouseleave', () => btn.classList.remove('btn-active'));
});

cells.forEach(cell => {
    cell.onclick = () => {
        if (!gameActive) return;
        send({ type: 'move', position: parseInt(cell.dataset.i) });
    };
});

const sunSVG = '<svg viewBox="0 0 20 20" width="16" height="16"><circle cx="10" cy="10" r="4.5" fill="currentColor"/><line x1="10" y1="1" x2="10" y2="3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="10" y1="16.5" x2="10" y2="19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="1" y1="10" x2="3.5" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="16.5" y1="10" x2="19" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="3.8" y1="3.8" x2="5.5" y2="5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="14.5" y1="14.5" x2="16.2" y2="16.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="3.8" y1="16.2" x2="5.5" y2="14.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="14.5" y1="5.5" x2="16.2" y2="3.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
const moonSVG = '<svg viewBox="0 0 20 20" width="16" height="16"><path d="M14.5 2.5a8.5 8.5 0 1 0 3 11.5 9 9 0 0 1-3-11.5z" fill="currentColor" stroke="currentColor" stroke-width="0.5" stroke-linecap="round"/></svg>';

function applyTheme() {
    if (darkTheme) {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
    localStorage.setItem('theme', darkTheme ? 'dark' : 'light');
}

function toggleTheme() {
    darkTheme = !darkTheme;
    const nextIcon = darkTheme ? sunSVG : moonSVG;
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.add('spin');
        setTimeout(() => { btn.innerHTML = nextIcon; }, 200);
        setTimeout(() => { btn.classList.remove('spin'); }, 600);
    });
    applyTheme();
}

async function createRoom(vsAi) {
    try {
        const res = await fetch('/api/room', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vs_ai: vsAi }),
        });
        const data = await res.json();
        if (data.code) {
            roomCode = data.code;
            vsAI = vsAi;
            connect();
        }
    } catch (e) { setStatus('Failed to create room'); }
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

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
    };
    ws.onclose = () => { setStatus('Disconnected'); gameActive = false; };
    ws.onerror = () => { setStatus('Connection error'); };
}

function handleMessage(msg) {
    switch (msg.type) {
        case 'joined':
            player = msg.player; vsAI = msg.vs_ai;
            setStatus(player === 'spectator' ? 'Spectating...' : 'Waiting for opponent...');
            break;
        case 'game_start':
            prevBoard = [...msg.state.board];
            renderBoard(msg.state, false);
            gameActive = !vsAI || player === 'X';
            setStatus(vsAI ? (player === 'X' ? 'Your turn' : 'AI thinking...') : "X's turn");
            break;
        case 'game_state':
            renderBoard(msg.state, true);
            if (msg.state.winner) { setStatus(`${msg.state.winner} wins!`); gameActive = false; }
            else if (msg.state.draw) { setStatus('Draw!'); gameActive = false; }
            else {
                const myTurn = msg.state.current_turn === player;
                gameActive = vsAI ? (myTurn && player !== 'spectator') : player !== 'spectator';
                setStatus(vsAI ? (myTurn ? 'Your turn' : 'AI thinking...') : `${msg.state.current_turn}'s turn`);
            }
            break;
        case 'error':
            setStatus('Error: ' + msg.message);
            break;
    }
}

function renderBoard(state, animate) {
    state.board.forEach((val, i) => {
        const cell = cells[i];
        if (val === prevBoard[i]) return;
        cell.classList.remove('x', 'o', 'anim', 'win');
        if (val) {
            cell.classList.add('taken');
            cell.classList.add(val.toLowerCase());
            if (animate) cell.classList.add('anim');
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
