// main.go
package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"sync"

	"github.com/Sanjar0126/simple_go_p2p/server/handler"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	server := handler.InitServerHandler(port)

	go func() {
		server.Run()
	}()

	ctx, cancel := context.WithCancel(context.Background())
	gracefulShutdown(server, ctx, cancel)
}

func gracefulShutdown(server handler.Server, ctx context.Context, cancel context.CancelFunc) {
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt)

	<-c

	var wg sync.WaitGroup

	wg.Add(1)

	go func(wg *sync.WaitGroup) {
		log.Println("shutting down")
		server.Stop()
		log.Println("shutdown successfully called")
		wg.Done()
	}(&wg)

	go func() {
		wg.Wait()
		cancel()
	}()

	<-ctx.Done()
	os.Exit(0)
}
