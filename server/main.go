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

type TurnConfig struct {
	TurnURL        string
	TurnUsername   string
	TurnCredential string
}

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
