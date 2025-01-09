package main

import (
	"log"
	"net/http"

	"github.com/gorilla/websocket"
)

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

	existingPeers := make([]string, 0)
	for existingPeer := range room.Peers {
		existingPeers = append(existingPeers, existingPeer)
	}

	room.Peers[peerId] = conn
	room.mu.Unlock()

	err := conn.WriteJSON(Message{
		Event: "peers-in-room",
		Data: map[string]interface{}{
			"peers": existingPeers,
		},
		Room: roomID,
	})
	if err != nil {
		log.Println("error sending existing peer list to new peer")
	}

	for id, peer := range room.Peers {
		if id != peerId {
			err = peer.WriteJSON(Message{
				Event: "peer-joined",
				Data: map[string]interface{}{
					"peerId": peerId,
				},
				Room: roomID,
			})
			if err != nil {
				log.Println("error sending notifying peers")
				break
			}
		}
	}
}

func handleDisconnect(conn *websocket.Conn, roomID string, peerId string) {
	room := rooms[roomID]
	if room == nil {
		return
	}

	room.mu.Lock()
	delete(room.Peers, peerId)

	// if room is empty, remove
	if len(room.Peers) == 0 {
		delete(rooms, roomID)
	} else {
		// Notify remaining peers about the disconnection
		for _, peer := range room.Peers {
			peer.WriteJSON(Message{
				Event: "peer-left",
				Data: map[string]interface{}{
					"peerId": peerId,
				},
				Room: roomID,
			})
		}
	}
	room.mu.Unlock()
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
