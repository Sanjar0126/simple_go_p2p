package main

import (
	"encoding/json"
	"fmt"
	"net"
	"sync"
)

type Peer struct {
	ID   string `json:"id"`
	Addr string `json:"addr"`
}

var (
	peers = make(map[string]Peer)
	mu    sync.Mutex
)

func main() {
	listener, err := net.Listen("tcp", ":8000")
	if err != nil {
		fmt.Println("Error starting server:", err)
		return
	}
	defer listener.Close()

	fmt.Println("Discovery server listening on port 8000...")
	for {
		conn, err := listener.Accept()
		if err != nil {
			fmt.Println("Error accepting connection:", err)
			continue
		}
		go handleConnection(conn)
	}
}

func handleConnection(conn net.Conn) {
	defer conn.Close()

	var peer Peer
	decoder := json.NewDecoder(conn)
	if err := decoder.Decode(&peer); err != nil {
		fmt.Println("Invalid data:", err)
		return
	}

	mu.Lock()
	peers[peer.ID] = peer
	mu.Unlock()

	fmt.Println("Registered peer:", peer.ID, "at", peer.Addr)

	mu.Lock()
	peerList := make([]Peer, 0, len(peers))
	for _, p := range peers {
		peerList = append(peerList, p)
	}
	mu.Unlock()

	encoder := json.NewEncoder(conn)
	if err := encoder.Encode(peerList); err != nil {
		fmt.Println("Error sending peer list:", err)
	}
}
