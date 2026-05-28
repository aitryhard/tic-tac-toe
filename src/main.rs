mod game;
mod room;

use std::collections::HashMap;
use std::sync::Arc;

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, State,
    },
    http::Method,
    response::{Html, IntoResponse, Json},
    routing::{get, post},
    Router,
};
use futures_util::{SinkExt, StreamExt};
use rand::Rng;
use serde_json::{json, Value};
use tokio::sync::{broadcast, RwLock};
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;
use tracing_subscriber;

use game::Game;
use room::{PlayerId, RoomManager};

struct GameRoom {
    game: Game,
    players: HashMap<String, PlayerId>,
    tx: broadcast::Sender<String>,
}

type Rooms = Arc<RwLock<HashMap<String, GameRoom>>>;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let room_mgr: Arc<RwLock<RoomManager>> = Arc::new(RwLock::new(RoomManager::new()));
    let rooms: Rooms = Arc::new(RwLock::new(HashMap::new()));

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers(Any);

    let serve_dir = ServeDir::new("static").append_index_html_on_directories(true);

    let app = Router::new()
        .route("/", get(index))
        .route("/api/room", post(create_room))
        .route("/ws/{code}", get(ws_handler))
        .layer(cors)
        .fallback_service(serve_dir)
        .with_state((room_mgr, rooms));

    let addr = "0.0.0.0:3000";
    println!("Server running at http://{}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn index() -> Html<String> {
    match tokio::fs::read_to_string("static/index.html").await {
        Ok(content) => Html(content),
        Err(_) => Html("<h1>Not found</h1>".to_string()),
    }
}

async fn create_room(
    State((room_mgr, rooms)): State<(Arc<RwLock<RoomManager>>, Rooms)>,
    body: String,
) -> Json<Value> {
    let parsed: Value = serde_json::from_str(&body).unwrap_or(json!({}));
    let vs_ai = parsed.get("vs_ai").and_then(|b| b.as_bool()).unwrap_or(false);
    let difficulty = parsed.get("difficulty").and_then(|d| d.as_i64()).unwrap_or(1) as i32;

    let mut mgr = room_mgr.write().await;
    mgr.clean_old_rooms();
    let code = mgr.create_room(vs_ai, difficulty);

    let (tx, _) = broadcast::channel(32);
    let game_room = GameRoom {
        game: Game::new(vs_ai, difficulty),
        players: HashMap::new(),
        tx,
    };
    rooms.write().await.insert(code.clone(), game_room);

    Json(json!({ "code": code }))
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    Path(code): Path<String>,
    State((room_mgr, rooms)): State<(Arc<RwLock<RoomManager>>, Rooms)>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, code, room_mgr, rooms))
}

async fn handle_socket(
    mut socket: WebSocket,
    code: String,
    room_mgr: Arc<RwLock<RoomManager>>,
    rooms: Rooms,
) {
    let player_id: String = (0..16).map(|_| rand::thread_rng().gen_range('a'..='z')).collect();
    let mut player_role = PlayerId::Spectator;

    {
        let mut mgr = room_mgr.write().await;
        match mgr.join_player(&code, &player_id) {
            Ok(role) => {
                player_role = role.clone();
                let is_vs_ai = mgr.get_room(&code).map(|r| r.game.vs_ai).unwrap_or(false);

                let msg = json!({
                    "type": "joined",
                    "player": match &role {
                        PlayerId::X => "X",
                        PlayerId::O => "O",
                        PlayerId::Spectator => "spectator",
                    },
                    "vs_ai": is_vs_ai,
                });
                let _ = socket.send(Message::Text(msg.to_string().into())).await;

                if let Some(room) = rooms.read().await.get(&code) {
                    let has_players = {
                        let r = mgr.get_room(&code).unwrap();
                        r.x_player.is_some() && r.o_player.is_some()
                    };
                    if has_players || is_vs_ai {
                        let _ = socket.send(Message::Text(
                            json!({"type": "game_start", "state": room.game.state()}).to_string().into(),
                        )).await;
                    }
                }

                if let Some(gr) = rooms.write().await.get_mut(&code) {
                    gr.players.insert(player_id.clone(), role);
                }
            }
            Err(e) => {
                let _ = socket
                    .send(Message::Text(json!({"type": "error", "message": e}).to_string().into()))
                    .await;
                return;
            }
        }
    }

    let mut rx = {
        let rooms_lock = rooms.read().await;
        rooms_lock
            .get(&code)
            .map(|r| r.tx.subscribe())
            .unwrap()
    };

    let (mut sender, mut receiver) = socket.split();

    let send_task = tokio::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(msg) => {
                    if sender.send(Message::Text(msg.into())).await.is_err() {
                        break;
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                Err(_) => break,
            }
        }
    });

    let rooms_clone = rooms.clone();
    let code_clone = code.clone();
    let player_role_clone = player_role.clone();

    let recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if let Message::Text(text) = msg {
                let data: Value = match serde_json::from_str(&text) {
                    Ok(d) => d,
                    Err(_) => continue,
                };

                let msg_type = data["type"].as_str().unwrap_or("").to_string();

                match msg_type.as_str() {
                    "move" => {
                        let pos = data["position"].as_u64().unwrap_or(9) as usize;
                        let player = match &player_role_clone {
                            PlayerId::X => 'X',
                            PlayerId::O => 'O',
                            _ => continue,
                        };

                        let ai_should_move = {
                            let mut rooms_lock = rooms_clone.write().await;
                            if let Some(gr) = rooms_lock.get_mut(&code_clone) {
                                if gr.game.make_move(pos, player).is_ok() {
                                    let _ = gr.tx.send(
                                        json!({"type": "game_state", "state": gr.game.state()}).to_string(),
                                    );
                                    gr.game.vs_ai && gr.game.winner.is_none() && !gr.game.draw
                                } else {
                                    false
                                }
                            } else {
                                false
                            }
                        };

                        if ai_should_move {
                            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                            let mut rooms_lock = rooms_clone.write().await;
                            if let Some(gr) = rooms_lock.get_mut(&code_clone) {
                                gr.game.ai_move();
                                let _ = gr.tx.send(
                                    json!({"type": "game_state", "state": gr.game.state()}).to_string(),
                                );
                            }
                        }
                    }
                    "restart" => {
                        let mut rooms_lock = rooms_clone.write().await;
                        if let Some(gr) = rooms_lock.get_mut(&code_clone) {
                            gr.game.reset();
                            let _ = gr.tx.send(
                                json!({"type": "game_state", "state": gr.game.state()}).to_string(),
                            );
                        }
                    }
                    _ => {}
                }
            }
        }
    });

    tokio::select! {
        _ = send_task => {}
        _ = recv_task => {}
    }

    let mut rooms_lock = rooms.write().await;
    if let Some(gr) = rooms_lock.get_mut(&code) {
        gr.players.remove(&player_id);
    }
}
