package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/gorilla/websocket"
)

func getRooms(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if err := json.NewEncoder(w).Encode(rooms); err != nil {
		http.Error(w, "Failed to encode JSON", http.StatusInternalServerError)
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
			handleOffer(msg)
		case "answer":
			handleAnswer(msg)
		case "ice-candidate":
			handleICECandidate(msg)
		case "disconnect":
			handleDisconnect(msg)
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

	peerName, _ := msg.Data["peerName"].(string)
	if peerName == "" {
		peerName = peerId
	}

	if _, exists := rooms[roomID]; !exists {
		rooms[roomID] = &Room{
			Peers: make(map[string]*websocket.Conn),
			Names: make(map[string]string),
		}
	}

	room := rooms[roomID]
	room.mu.Lock()

	room.Peers[peerId] = conn
	if peerName != "" {
		room.Names[peerId] = peerName
	}

	existingPeers := make([]PeerInfo, 0)

	for existingPeer := range room.Peers {
		if existingPeer != peerId {
			existingPeers = append(existingPeers, PeerInfo{
				PeerId:   existingPeer,
				PeerName: room.Names[existingPeer],
			})
		}
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
					"peerId":   peerId,
					"peerName": peerName,
				},
				Room: roomID,
			})
			if err != nil {
				log.Println("error notifying peers")
				break
			}
		}
	}
}

func handleDisconnect(msg Message) {
	roomID := msg.Room
	room := rooms[roomID]

	if room == nil {
		return
	}

	peerId, ok := msg.Data["peerId"].(string)
	if !ok {
		log.Printf("Invalid peerId in disconnect message")
		return
	}

	room.mu.Lock()
	delete(room.Peers, peerId)
	delete(room.Names, peerId)

	// if room is empty, remove room from list
	if len(room.Peers) == 0 {
		delete(rooms, roomID)
	} else {
		for _, peer := range room.Peers {
			err := peer.WriteJSON(Message{
				Event: "peer-left",
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
	room.mu.Unlock()
}

func handleOffer(msg Message) {
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

func handleAnswer(msg Message) {
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

func handleICECandidate(msg Message) {
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