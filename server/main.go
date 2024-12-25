// main.go
package main

import (
	"log"
	"net/http"
	"os"
	"sync"

	"github.com/gorilla/websocket"
)

type Room struct {
	Peers map[string]*websocket.Conn
	mu    sync.Mutex
}

type Message struct {
	Event string         `json:"event"`
	Data  map[string]any `json:"data"`
	Room  string         `json:"room"`
}

var (
	rooms    = make(map[string]*Room)
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true // all origins
		},
	}
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.URL.Path == "/ws" {
			handleWebSocket(w, r)
			return
		}

		http.FileServer(http.Dir("static")).ServeHTTP(w, r)
	})

	log.Printf("Server starting on port %s", port)
	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatal(err)
	}
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Websocket upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	for {
		var msg Message
		if err := conn.ReadJSON(&msg); err != nil {
			log.Printf("Error reading message: %v", err)
			break
		}

		switch msg.Event {
		case "join":
			handleJoin(conn, msg)
		case "offer":
			handleOffer(conn, msg)
		case "answer":
			handleAnswer(conn, msg)
		case "ice-candidate":
			handleICECandidate(conn, msg)
		}
	}
}

func handleJoin(conn *websocket.Conn, msg Message) {
	roomID := msg.Room
	peerId, ok := msg.Data["peerId"].(string)
	if !ok {
		log.Printf("Invalid peerId in join message")
		return
	}

	if _, exists := rooms[roomID]; !exists {
		rooms[roomID] = &Room{
			Peers: make(map[string]*websocket.Conn),
		}
	}

	room := rooms[roomID]
	room.mu.Lock()
	room.Peers[peerId] = conn
	room.mu.Unlock()

	// Notify others in room
	for _, peer := range room.Peers {
		if peer != conn {
			peer.WriteJSON(Message{
				Event: "peer-joined",
				Data: map[string]any{
					"peerId": peerId,
				},
				Room: roomID,
			})
		}
	}
}

func handleOffer(conn *websocket.Conn, msg Message) {
	room := rooms[msg.Room]
	if room == nil {
		log.Printf("Room not found: %s", msg.Room)
		return
	}

	target, ok := msg.Data["target"].(string)
	if !ok {
		log.Printf("Invalid target in offer message")
		return
	}

	room.mu.Lock()
	targetPeer := room.Peers[target]
	room.mu.Unlock()

	if targetPeer != nil {
		if err := targetPeer.WriteJSON(msg); err != nil {
			log.Printf("Error sending offer: %v", err)
		}
	}
}

func handleAnswer(conn *websocket.Conn, msg Message) {
	room := rooms[msg.Room]
	if room == nil {
		log.Printf("Room not found: %s", msg.Room)
		return
	}

	target, ok := msg.Data["target"].(string)
	if !ok {
		log.Printf("Invalid target in answer message")
		return
	}

	room.mu.Lock()
	targetPeer := room.Peers[target]
	room.mu.Unlock()

	if targetPeer != nil {
		if err := targetPeer.WriteJSON(msg); err != nil {
			log.Printf("Error sending answer: %v", err)
		}
	}
}

func handleICECandidate(conn *websocket.Conn, msg Message) {
	room := rooms[msg.Room]
	if room == nil {
		log.Printf("Room not found: %s", msg.Room)
		return
	}

	target, ok := msg.Data["target"].(string)
	if !ok {
		log.Printf("Invalid target in ICE candidate message")
		return
	}

	room.mu.Lock()
	targetPeer := room.Peers[target]
	room.mu.Unlock()

	if targetPeer != nil {
		if err := targetPeer.WriteJSON(msg); err != nil {
			log.Printf("Error sending ICE candidate: %v", err)
		}
	}
}
