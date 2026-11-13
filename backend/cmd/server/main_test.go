package main

import (
	"context"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"
)

var quietLogger = slog.New(slog.NewTextHandler(io.Discard, nil))

func TestPort(t *testing.T) {
	t.Setenv("PORT", "")
	if got := port(); got != "8080" {
		t.Errorf("default port = %q, want 8080", got)
	}
	t.Setenv("PORT", "9000")
	if got := port(); got != "9000" {
		t.Errorf("port = %q, want 9000", got)
	}
}

func TestRunServesAndShutsDown(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0") // any free port
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- run(ctx, quietLogger, listener) }()

	resp, err := http.Get("http://" + listener.Addr().String() + "/api/health")
	if err != nil {
		t.Fatalf("health check failed: %v", err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK || !strings.Contains(string(body), `"ok"`) {
		t.Errorf("health = %d %s, want 200 ok", resp.StatusCode, body)
	}

	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Errorf("run returned %v after shutdown, want nil", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("server did not shut down")
	}
}

func TestRunReportsListenerFailure(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	listener.Close() // Serve fails immediately on a closed listener

	if err := run(context.Background(), quietLogger, listener); err == nil {
		t.Error("run returned nil for a closed listener, want an error")
	}
}
