package main

import (
	"bufio"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestPTTStream(t *testing.T) {
	var pressed atomic.Bool
	keyDownFn = func(vk int) (bool, bool) { return pressed.Load(), true }
	defer func() { keyDownFn = keyDown }()
	srv := httptest.NewServer(http.HandlerFunc(handlePTT))
	defer srv.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET", srv.URL+"?vk=5", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if ct := resp.Header.Get("Content-Type"); ct != "text/event-stream" {
		t.Fatalf("content-type %q", ct)
	}
	sc := bufio.NewScanner(resp.Body)
	var events []string
	go func() {
		time.Sleep(200 * time.Millisecond)
		pressed.Store(true)
		time.Sleep(200 * time.Millisecond)
		pressed.Store(false)
	}()
	for sc.Scan() && len(events) < 3 {
		if l := sc.Text(); strings.HasPrefix(l, "event: ") {
			events = append(events, strings.TrimPrefix(l, "event: "))
		}
	}
	if strings.Join(events, ",") != "ready,down,up" {
		t.Fatalf("olaylar: %v", events)
	}
}
