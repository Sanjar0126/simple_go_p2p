package main

import (
	"bufio"
	"fmt"
	"net"
	"os"
	"strings"

	"github.com/pion/stun"
)

func discoverPublicAddress(stunServer string) (string, error) {
	conn, err := net.Dial("udp", stunServer)
	if err != nil {
		return "", fmt.Errorf("failed to connect to STUN server: %v", err)
	}
	defer conn.Close()

	message := stun.MustBuild(stun.TransactionID, stun.BindingRequest)
	if _, err := conn.Write(message.Raw); err != nil {
		return "", fmt.Errorf("failed to send STUN request: %v", err)
	}

	// Read STUN response
	buf := make([]byte, 1024)
	n, err := conn.Read(buf)
	if err != nil {
		return "", fmt.Errorf("failed to read STUN response: %v", err)
	}
	var response stun.Message
	response.Raw = buf[:n]
	if err := response.Decode(); err != nil {
		return "", fmt.Errorf("failed to decode STUN response: %v", err)
	}

	var xorAddr stun.XORMappedAddress
	if err := xorAddr.GetFrom(&response); err != nil {
		return "", fmt.Errorf("failed to get public address: %v", err)
	}

	return fmt.Sprintf("%s", xorAddr), nil
}

func startServer(port string) {
	listener, err := net.Listen("tcp", "0.0.0.0:"+port)
	if err != nil {
		fmt.Println("Failed to start server:", err)
		return
	}
	defer listener.Close()

	fmt.Println("Listening for incoming connections on port", port)
	for {
		conn, err := listener.Accept()
		if err != nil {
			fmt.Println("Failed to accept connection:", err)
			continue
		}
		go handleConnection(conn)
	}
}

func handleConnection(conn net.Conn) {
	defer conn.Close()
	reader := bufio.NewReader(conn)
	for {
		msg, err := reader.ReadString('\n')
		if err != nil {
			fmt.Println("Connection closed.")
			return
		}
		fmt.Print("Message received: ", msg)
	}
}

func startClient(remoteAddress string) {
	conn, err := net.Dial("tcp", remoteAddress)
	if err != nil {
		fmt.Println("Failed to connect to peer:", err)
		return
	}
	defer conn.Close()

	fmt.Println("Connected to peer. Start chatting!")
	reader := bufio.NewReader(os.Stdin)
	for {
		fmt.Print("You: ")
		msg, _ := reader.ReadString('\n')
		conn.Write([]byte(msg))
	}
}

func main() {
	stunServer := "stun.l.google.com:19302"

	// get public IP and port
	publicAddress, err := discoverPublicAddress(stunServer)
	if err != nil {
		fmt.Println("Error discovering public address:", err)
		return
	}

	fmt.Println("Your public address (IP:Port):", publicAddress)

	// server or client
	fmt.Println("Choose (server/client):")
	var mode string
	fmt.Scanln(&mode)

	if strings.ToLower(mode) == "server" {
		// Run as server
		port := strings.Split(publicAddress, ":")[1]
		startServer(port)
	} else {
		// Run as client
		fmt.Println("Enter peer's public IP:Port:")
		var peerAddress string
		fmt.Scanln(&peerAddress)
		startClient(peerAddress)
	}
}
