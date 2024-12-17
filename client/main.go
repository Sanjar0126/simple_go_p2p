package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"strings"
	"sync"
)

type Peer struct {
	ID   string `json:"id"`
	Addr string `json:"addr"`
}

var wg sync.WaitGroup

func main() {
	reader := bufio.NewReader(os.Stdin)
	fmt.Print("Enter your ID: ")
	id, _ := reader.ReadString('\n')
	id = strings.TrimSpace(id)

	conn, err := net.Dial("tcp", "0.0.0.0:9090")
	if err != nil {
		fmt.Println("Error connecting to server:", err)
		return
	}
	defer conn.Close()

	selfAddr := getLocalAddress()
	self := Peer{ID: id, Addr: selfAddr}
	encoder := json.NewEncoder(conn)
	if err := encoder.Encode(self); err != nil {
		fmt.Println("Error registering with server:", err)
		return
	}

	var peerList []Peer
	decoder := json.NewDecoder(conn)
	if err := decoder.Decode(&peerList); err != nil {
		fmt.Println("Error retrieving peer list:", err)
		return
	}

	fmt.Println("Connected peers:")
	for _, p := range peerList {
		fmt.Println(p.ID, "->", p.Addr)
	}

	wg.Add(1)
	go startListening(selfAddr)

	for {
		fmt.Print("Enter message (peer_id: message): ")
		input, _ := reader.ReadString('\n')
		input = strings.TrimSpace(input)

		if input == "exit" {
			break
		}

		parts := strings.SplitN(input, ":", 2)
		if len(parts) != 2 {
			fmt.Println("Invalid format. Use peer_id: message")
			continue
		}
		peerID, message := strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1])

		var targetPeer *Peer
		for _, p := range peerList {
			if p.ID == peerID {
				targetPeer = &p
				break
			}
		}

		if targetPeer == nil {
			fmt.Println("Peer not found.")
			continue
		}

		sendMessage(targetPeer.Addr, self.ID+": "+message)
	}

	wg.Wait()
}

func getLocalAddress() string {
	listener, _ := net.Listen("tcp", ":0")
	defer listener.Close()
	return listener.Addr().String()
}

func startListening(addr string) {
	defer wg.Done()
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		fmt.Println("Error starting listener:", err)
		return
	}
	defer listener.Close()

	fmt.Println("Listening for messages on", addr)
	for {
		conn, err := listener.Accept()
		if err != nil {
			fmt.Println("Error accepting connection:", err)
			continue
		}
		go func(c net.Conn) {
			defer c.Close()
			message, _ := bufio.NewReader(c).ReadString('\n')
			fmt.Println("Received:", strings.TrimSpace(message))
		}(conn)
	}
}

func sendMessage(addr, message string) {
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		fmt.Println("Error connecting to peer:", err)
		return
	}
	defer conn.Close()

	fmt.Fprintf(conn, message+"\n")
}
