package handler

import (
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

type PeerInfo struct {
	PeerId   string `json:"peerId"`             //nolint:tagliatelle
	PeerName string `json:"peerName,omitempty"` //nolint:tagliatelle
}

type Room struct {
	Peers map[string]*websocket.Conn
	Names map[string]string
	mu    sync.Mutex
}

type Message struct {
	Event string         `json:"event"`
	Data  map[string]any `json:"data"`
	Room  string         `json:"room"`
}

type Server interface {
	Run()
	Stop()
}
type handler struct {
	rooms       map[string]*Room
	upgrader    websocket.Upgrader
	httpHandler http.HandlerFunc
	port        string
}

func InitServerHandler(port string) Server {
	handler := handler{}
	handler.rooms = make(map[string]*Room)
	handler.upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true // all origins
		},
	}
	handler.port = port

	httpHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.URL.Path == "/ws" {
			handler.handleWebSocket(w, r)
			return
		}

		if r.URL.Path == "/rooms" {
			handler.getRooms(w, r)
			return
		}

		http.FileServer(http.Dir("static")).ServeHTTP(w, r)
	})

	handler.httpHandler = httpHandler

	return &handler
}

func (h *handler) Run() {
	log.Printf("Server starting on port %s", h.port)

	if err := http.ListenAndServe(":"+h.port, h.httpHandler); err != nil {
		log.Fatal(err)
	}
}

func (h *handler) Stop() {
	log.Printf("shutting down")
}
