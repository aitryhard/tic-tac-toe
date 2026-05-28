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

document.getElementById('btn-vs-player').onclick = () => createRoom(false);
document.getElementById('btn-vs-ai').onclick = () => createRoom(true);
document.getElementById('btn-join').onclick = joinRoom;
document.getElementById('btn-restart').onclick = () => send({ type: 'restart' });
document.getElementById('btn-leave').onclick = leave;
document.getElementById('room-code-input').onkeydown = (e) => { if (e.key === 'Enter') joinRoom(); };

document.querySelectorAll('.theme-btn').forEach(btn => btn.onclick = toggleTheme);

applyTheme();

cells.forEach(cell => {
    cell.onclick = () => {
        if (!gameActive) return;
        send({ type: 'move', position: parseInt(cell.dataset.i) });
    };
});

function applyTheme() {
    if (darkTheme) {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.querySelectorAll('.theme-btn').forEach(b => b.textContent = '☀️');
    } else {
        document.documentElement.removeAttribute('data-theme');
        document.querySelectorAll('.theme-btn').forEach(b => b.textContent = '🌙');
    }
    localStorage.setItem('theme', darkTheme ? 'dark' : 'light');
}

function toggleTheme() {
    darkTheme = !darkTheme;
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
    } catch (e) {
        statusEl.textContent = 'Failed to create room';
    }
}

function joinRoom() {
    const code = document.getElementById('room-code-input').value.trim().toUpperCase();
    if (code.length < 4) return;
    roomCode = code;
    vsAI = false;
    connect();
}

function connect() {
    closeWs();
    menu.style.display = 'none';
    gameDiv.style.display = 'flex';
    roomLabel.textContent = roomCode;

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${location.host}/ws/${roomCode}`);

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
    };
    ws.onclose = () => { statusEl.textContent = 'Disconnected'; gameActive = false; };
    ws.onerror = () => { statusEl.textContent = 'Connection error'; };
}

function handleMessage(msg) {
    switch (msg.type) {
        case 'joined':
            player = msg.player;
            vsAI = msg.vs_ai;
            statusEl.textContent = player === 'spectator' ? 'Spectating...' : 'Waiting for opponent...';
            break;
        case 'game_start':
            prevBoard = [...msg.state.board];
            renderBoard(msg.state, false);
            gameActive = !vsAI || player === 'X';
            statusEl.textContent = vsAI
                ? (player === 'X' ? 'Your turn' : 'AI thinking...')
                : "X's turn";
            break;
        case 'game_state':
            renderBoard(msg.state, true);
            if (msg.state.winner) {
                statusEl.textContent = `${msg.state.winner} wins!`;
                gameActive = false;
            } else if (msg.state.draw) {
                statusEl.textContent = 'Draw!';
                gameActive = false;
            } else {
                const myTurn = msg.state.current_turn === player;
                gameActive = vsAI ? (myTurn && player !== 'spectator') : player !== 'spectator';
                statusEl.textContent = vsAI
                    ? (myTurn ? 'Your turn' : 'AI thinking...')
                    : `${msg.state.current_turn}'s turn`;
            }
            break;
        case 'error':
            statusEl.textContent = 'Error: ' + msg.message;
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
            if (animate) {
                cell.classList.add(val.toLowerCase(), 'anim');
            } else {
                cell.classList.add(val.toLowerCase());
            }
        } else {
            cell.classList.remove('taken');
        }
    });

    prevBoard = [...state.board];

    if (state.win_line && state.win_line.length > 0) {
        state.win_line.forEach(i => cells[i].classList.add('win'));
    }
}

function send(data) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

function closeWs() { if (ws) { ws.close(); ws = null; } }

function leave() {
    closeWs();
    gameDiv.style.display = 'none';
    menu.style.display = 'flex';
    player = null;
    roomCode = null;
    gameActive = false;
    prevBoard = Array(9).fill(null);
    cells.forEach(c => { c.className = 'cell'; });
}
