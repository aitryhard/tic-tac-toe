use std::collections::HashMap;

use rand::Rng;

use crate::game::Game;

#[derive(Debug, Clone, PartialEq)]
pub enum PlayerId {
    X,
    O,
    Spectator,
}

#[derive(Debug, Clone)]
pub struct Room {
    pub code: String,
    pub game: Game,
    pub x_player: Option<String>,
    pub o_player: Option<String>,
}

#[derive(Debug, Clone)]
pub struct RoomManager {
    rooms: HashMap<String, Room>,
}

fn generate_code() -> String {
    let chars: Vec<char> = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".chars().collect();
    let mut rng = rand::thread_rng();
    (0..6).map(|_| chars[rng.gen_range(0..chars.len())]).collect()
}

impl RoomManager {
    pub fn new() -> Self {
        Self {
            rooms: HashMap::new(),
        }
    }

    pub fn create_room(&mut self, vs_ai: bool, difficulty: i32) -> String {
        let code = loop {
            let c = generate_code();
            if !self.rooms.contains_key(&c) {
                break c;
            }
        };

        let room = Room {
            code: code.clone(),
            game: Game::new(vs_ai, difficulty),
            x_player: None,
            o_player: None,
        };

        self.rooms.insert(code.clone(), room);
        code
    }

    pub fn get_room(&self, code: &str) -> Option<&Room> {
        self.rooms.get(code)
    }

    pub fn get_room_mut(&mut self, code: &str) -> Option<&mut Room> {
        self.rooms.get_mut(code)
    }

    pub fn join_player(&mut self, code: &str, player_id: &str) -> Result<PlayerId, String> {
        let room = self
            .rooms
            .get_mut(code)
            .ok_or_else(|| "room not found".to_string())?;

        if room.x_player.as_deref() == Some(player_id) {
            return Ok(PlayerId::X);
        }
        if room.o_player.as_deref() == Some(player_id) {
            return Ok(PlayerId::O);
        }

        if room.x_player.is_none() {
            room.x_player = Some(player_id.to_string());
            Ok(PlayerId::X)
        } else if room.o_player.is_none() {
            room.o_player = Some(player_id.to_string());
            Ok(PlayerId::O)
        } else {
            Ok(PlayerId::Spectator)
        }
    }

    pub fn remove_room(&mut self, code: &str) {
        self.rooms.remove(code);
    }

    pub fn clean_old_rooms(&mut self) {
        self.rooms.retain(|_, room| {
            room.x_player.is_some() || room.o_player.is_some()
        });
    }
}
