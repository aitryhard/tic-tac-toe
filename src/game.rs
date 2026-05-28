use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct GameState {
    pub board: [Option<String>; 9],
    pub current_turn: String,
    pub winner: Option<String>,
    pub draw: bool,
    pub win_line: Vec<usize>,
}

#[derive(Debug, Clone)]
pub struct Game {
    pub board: [Option<char>; 9],
    pub current_turn: char,
    pub winner: Option<char>,
    pub draw: bool,
    pub win_line: Vec<usize>,
    pub vs_ai: bool,
}

const WIN_COMBOS: [[usize; 3]; 8] = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
];

impl Game {
    pub fn new(vs_ai: bool) -> Self {
        Self {
            board: [None; 9],
            current_turn: 'X',
            winner: None,
            draw: false,
            win_line: Vec::new(),
            vs_ai,
        }
    }

    pub fn state(&self) -> GameState {
        GameState {
            board: self.board.map(|c| c.map(|c| c.to_string())),
            current_turn: self.current_turn.to_string(),
            winner: self.winner.map(|c| c.to_string()),
            draw: self.draw,
            win_line: self.win_line.clone(),
        }
    }

    pub fn make_move(&mut self, pos: usize, player: char) -> Result<(), String> {
        if player != self.current_turn {
            return Err("not your turn".into());
        }
        if self.winner.is_some() || self.draw {
            return Err("game is over".into());
        }
        if pos > 8 || self.board[pos].is_some() {
            return Err("invalid move".into());
        }

        self.board[pos] = Some(player);

        if let Some((w, line)) = check_winner(&self.board) {
            self.winner = Some(w);
            self.win_line = line;
        } else if self.board.iter().all(|c| c.is_some()) {
            self.draw = true;
        } else {
            self.current_turn = if player == 'X' { 'O' } else { 'X' };
        }

        Ok(())
    }

    pub fn ai_move(&mut self) -> Option<usize> {
        if self.winner.is_some() || self.draw {
            return None;
        }
        let player = self.current_turn;
        let pos = minimax(&self.board, player);
        if let Some(p) = pos {
            self.make_move(p, player).ok();
        }
        pos
    }

    pub fn reset(&mut self) {
        self.board = [None; 9];
        self.current_turn = 'X';
        self.winner = None;
        self.draw = false;
        self.win_line = Vec::new();
    }
}

fn check_winner(board: &[Option<char>; 9]) -> Option<(char, Vec<usize>)> {
    for combo in &WIN_COMBOS {
        let a = board[combo[0]];
        let b = board[combo[1]];
        let c = board[combo[2]];
        if let (Some(pa), Some(pb), Some(pc)) = (a, b, c) {
            if pa == pb && pb == pc {
                return Some((pa, combo.to_vec()));
            }
        }
    }
    None
}

fn minimax(board: &[Option<char>; 9], ai_player: char) -> Option<usize> {
    let opponent = if ai_player == 'X' { 'O' } else { 'X' };
    let mut best_score = i32::MIN;
    let mut best_positions = Vec::new();

    for i in 0..9 {
        if board[i].is_none() {
            let mut new_board = *board;
            new_board[i] = Some(ai_player);

            let score = minimax_score(&new_board, 0, false, ai_player, opponent, i32::MIN, i32::MAX);

            if score > best_score {
                best_score = score;
                best_positions.clear();
                best_positions.push(i);
            } else if score == best_score {
                best_positions.push(i);
            }
        }
    }

    if best_positions.is_empty() {
        None
    } else {
        Some(best_positions[rand::random::<usize>() % best_positions.len()])
    }
}

fn minimax_score(
    board: &[Option<char>; 9],
    depth: usize,
    is_maximizing: bool,
    ai: char,
    human: char,
    mut alpha: i32,
    mut beta: i32,
) -> i32 {
    if let Some((w, _)) = check_winner(board) {
        return if w == ai { 10 - depth as i32 } else { depth as i32 - 10 };
    }
    if board.iter().all(|c| c.is_some()) {
        return 0;
    }

    let current = if is_maximizing { ai } else { human };

    if is_maximizing {
        let mut best = i32::MIN;
        for i in 0..9 {
            if board[i].is_none() {
                let mut new_board = *board;
                new_board[i] = Some(current);
                let score = minimax_score(&new_board, depth + 1, false, ai, human, alpha, beta);
                best = best.max(score);
                alpha = alpha.max(best);
                if beta <= alpha {
                    break;
                }
            }
        }
        best
    } else {
        let mut best = i32::MAX;
        for i in 0..9 {
            if board[i].is_none() {
                let mut new_board = *board;
                new_board[i] = Some(current);
                let score = minimax_score(&new_board, depth + 1, true, ai, human, alpha, beta);
                best = best.min(score);
                beta = beta.min(best);
                if beta <= alpha {
                    break;
                }
            }
        }
        best
    }
}
