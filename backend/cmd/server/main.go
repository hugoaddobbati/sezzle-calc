// Command server runs the calculator HTTP API.
package main

import (
	"context"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"calculator/internal/api"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))

	// Stop cleanly on Ctrl+C or `docker stop` (SIGTERM).
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	listener, err := net.Listen("tcp", ":"+port())
	if err != nil {
		logger.Error("cannot listen", "error", err)
		os.Exit(1)
	}
	if err := run(ctx, logger, listener); err != nil {
		logger.Error("server failed", "error", err)
		os.Exit(1)
	}
}

// port returns the PORT environment variable, or 8080 if it is unset.
func port() string {
	if p := os.Getenv("PORT"); p != "" {
		return p
	}
	return "8080"
}

// run serves the API on listener until ctx is cancelled, then shuts down
// gracefully, letting in-flight requests finish.
func run(ctx context.Context, logger *slog.Logger, listener net.Listener) error {
	server := &http.Server{
		Handler:           api.NewRouter(logger),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	serveErr := make(chan error, 1)
	go func() { serveErr <- server.Serve(listener) }()
	logger.Info("server listening", "addr", listener.Addr().String())

	select {
	case err := <-serveErr:
		return err // the server stopped by itself, e.g. the listener failed
	case <-ctx.Done():
	}

	logger.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return server.Shutdown(shutdownCtx)
}
