// Command vapid prints a new VAPID key pair for web push. Put them in .env (or the
// server's environment) once and keep them: changing them invalidates every
// player's existing notification subscription.
//
//	go run ./cmd/vapid
package main

import (
	"fmt"
	"log"

	webpush "github.com/SherClockHolmes/webpush-go"
)

func main() {
	private, public, err := webpush.GenerateVAPIDKeys()
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("VAPID_PUBLIC_KEY=%s\nVAPID_PRIVATE_KEY=%s\nVAPID_SUBJECT=mailto:you@example.com\n", public, private)
}
