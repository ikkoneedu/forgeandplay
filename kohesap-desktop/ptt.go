package main

import (
	"fmt"
	"net/http"
	"strconv"
	"time"
)

// keyDownFn: testte sahte tuşla değiştirilebilsin diye.
var keyDownFn = keyDown

// handlePTT: sesli sohbette "bas-konuş" tuşunun durumunu canlı akış (SSE)
// olarak gönderir. Oyun penceresi öndeyken de çalışır. Sayfa arka planda
// olsa bile akış olayları gecikmeden işlenir (zamanlayıcı kısıtlamasına takılmaz).
func handlePTT(w http.ResponseWriter, r *http.Request) {
	vk, err := strconv.Atoi(r.URL.Query().Get("vk"))
	if err != nil || vk <= 0 || vk > 0xFE {
		http.Error(w, "geçersiz tuş", 400)
		return
	}
	fl, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "akış desteklenmiyor", 500)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Connection", "keep-alive")
	_, supported := keyDownFn(vk)
	if !supported {
		fmt.Fprint(w, "event: unsupported\ndata: 1\n\n")
		fl.Flush()
		return
	}
	fmt.Fprint(w, "event: ready\ndata: 1\n\n")
	fl.Flush()
	t := time.NewTicker(15 * time.Millisecond)
	defer t.Stop()
	keep := time.NewTicker(15 * time.Second)
	defer keep.Stop()
	last := false
	for {
		select {
		case <-r.Context().Done():
			return
		case <-keep.C:
			fmt.Fprint(w, ": canli\n\n")
			fl.Flush()
		case <-t.C:
			down, _ := keyDownFn(vk)
			if down != last {
				last = down
				if down {
					fmt.Fprint(w, "event: down\ndata: 1\n\n")
				} else {
					fmt.Fprint(w, "event: up\ndata: 1\n\n")
				}
				fl.Flush()
			}
		}
	}
}
