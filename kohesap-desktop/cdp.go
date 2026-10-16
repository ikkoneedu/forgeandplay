package main

// Gizli tarayıcı (DevTools protokolü ile).
// Edge/Chrome görünmez modda bir kez açılır, sayfalar sekmede yüklenir,
// JavaScript'in veriyi getirmesi beklenir ve oluşan HTML okunur.
// Sayfanın arka planda çağırdığı veri adresleri (XHR/fetch) de kaydedilir.

import (
	"bufio"
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

/* ---------- minimal websocket istemcisi ---------- */

type wsConn struct {
	c  net.Conn
	br *bufio.Reader
	wm sync.Mutex
}

func wsDial(raw string) (*wsConn, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return nil, err
	}
	c, err := net.DialTimeout("tcp", u.Host, 5*time.Second)
	if err != nil {
		return nil, err
	}
	kb := make([]byte, 16)
	rand.Read(kb)
	key := base64.StdEncoding.EncodeToString(kb)
	req := "GET " + u.RequestURI() + " HTTP/1.1\r\nHost: " + u.Host + "\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: " + key + "\r\nSec-WebSocket-Version: 13\r\n\r\n"
	if _, err := c.Write([]byte(req)); err != nil {
		c.Close()
		return nil, err
	}
	br := bufio.NewReaderSize(c, 1<<16)
	resp, err := http.ReadResponse(br, nil)
	if err != nil {
		c.Close()
		return nil, err
	}
	if resp.StatusCode != 101 {
		c.Close()
		return nil, fmt.Errorf("websocket el sıkışma hatası: %d", resp.StatusCode)
	}
	return &wsConn{c: c, br: br}, nil
}

func (w *wsConn) send(b []byte) error {
	w.wm.Lock()
	defer w.wm.Unlock()
	hdr := []byte{0x81}
	n := len(b)
	switch {
	case n < 126:
		hdr = append(hdr, byte(n)|0x80)
	case n < 65536:
		hdr = append(hdr, 126|0x80, byte(n>>8), byte(n))
	default:
		hdr = append(hdr, 127|0x80)
		l := make([]byte, 8)
		binary.BigEndian.PutUint64(l, uint64(n))
		hdr = append(hdr, l...)
	}
	mask := make([]byte, 4)
	rand.Read(mask)
	hdr = append(hdr, mask...)
	p := make([]byte, n)
	for i := range b {
		p[i] = b[i] ^ mask[i%4]
	}
	_, err := w.c.Write(append(hdr, p...))
	return err
}

func (w *wsConn) read() ([]byte, error) {
	var msg []byte
	for {
		h := make([]byte, 2)
		if _, err := io.ReadFull(w.br, h); err != nil {
			return nil, err
		}
		fin, op := h[0]&0x80 != 0, h[0]&0x0f
		n := uint64(h[1] & 0x7f)
		if n == 126 {
			b := make([]byte, 2)
			if _, err := io.ReadFull(w.br, b); err != nil {
				return nil, err
			}
			n = uint64(binary.BigEndian.Uint16(b))
		} else if n == 127 {
			b := make([]byte, 8)
			if _, err := io.ReadFull(w.br, b); err != nil {
				return nil, err
			}
			n = binary.BigEndian.Uint64(b)
		}
		var mask []byte
		if h[1]&0x80 != 0 {
			mask = make([]byte, 4)
			io.ReadFull(w.br, mask)
		}
		p := make([]byte, n)
		if _, err := io.ReadFull(w.br, p); err != nil {
			return nil, err
		}
		if mask != nil {
			for i := range p {
				p[i] ^= mask[i%4]
			}
		}
		switch op {
		case 8:
			return nil, errors.New("bağlantı kapandı")
		case 9: // ping → pong
			w.wm.Lock()
			w.c.Write([]byte{0x8a, 0x80, 0, 0, 0, 0})
			w.wm.Unlock()
			continue
		case 10:
			continue
		}
		msg = append(msg, p...)
		if fin {
			return msg, nil
		}
	}
}

/* ---------- DevTools oturumu ---------- */

type cdpMsg struct {
	ID        int                       `json:"id,omitempty"`
	Method    string                    `json:"method,omitempty"`
	Params    json.RawMessage           `json:"params,omitempty"`
	Result    json.RawMessage           `json:"result,omitempty"`
	Error     *struct{ Message string } `json:"error,omitempty"`
	SessionID string                    `json:"sessionId,omitempty"`
}

type cdpBrowser struct {
	cmd     *exec.Cmd
	ws      *wsConn
	mu      sync.Mutex
	nextID  int
	pending map[int]chan cdpMsg
	events  map[string]func(cdpMsg) // sessionId → olay dinleyici
	dead    chan struct{}
	lastUse time.Time
}

var (
	brMu      sync.Mutex
	brCurrent *cdpBrowser
	pageMu    sync.Mutex // aynı anda tek sayfa
)

func startBrowser() (*cdpBrowser, error) {
	bin := findBrowser()
	if bin == "" {
		return nil, errors.New("Edge veya Chrome bulunamadı")
	}
	// her çalıştırmaya ayrı profil: eski/çökmüş bir gizli tarayıcının kilidi engel olmasın
	profile := filepath.Join(os.TempDir(), fmt.Sprintf("KOHesap-gizli-%d", os.Getpid()))
	if old, _ := filepath.Glob(filepath.Join(os.TempDir(), "KOHesap-gizli-*")); len(old) > 0 {
		for _, d := range old {
			if d != profile {
				os.RemoveAll(d) // kilitliyse sessizce geçer
			}
		}
	}
	_ = os.MkdirAll(profile, 0o755)
	portFile := filepath.Join(profile, "DevToolsActivePort")
	os.Remove(portFile)
	args := []string{
		"--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
		"--disable-extensions", "--mute-audio", "--hide-scrollbars", "--window-size=1366,900",
		"--remote-debugging-port=0", "--remote-allow-origins=*",
		"--user-data-dir=" + profile, "--user-agent=" + browserUA, "--lang=tr-TR",
		"--disable-features=msEdgeStartupBoost,Translate",
		"about:blank",
	}
	if os.Getenv("KOHESAP_NOSANDBOX") != "" {
		args = append([]string{"--no-sandbox"}, args...)
	}
	cmd := exec.Command(bin, args...)
	hideConsole(cmd)
	var stderr strings.Builder
	cmd.Stderr = &limitWriter{b: &stderr, n: 4000}
	if err := cmd.Start(); err != nil {
		return nil, errors.New("tarayıcı başlatılamadı: " + err.Error())
	}
	go cmd.Wait()
	// tarayıcı hazır olunca port dosyasını yazar
	var wsURL string
	deadline := time.Now().Add(20 * time.Second)
	for time.Now().Before(deadline) {
		if b, err := os.ReadFile(portFile); err == nil {
			lines := strings.Split(strings.TrimSpace(string(b)), "\n")
			if len(lines) >= 2 {
				wsURL = "ws://127.0.0.1:" + strings.TrimSpace(lines[0]) + strings.TrimSpace(lines[1])
				break
			}
		}
		time.Sleep(150 * time.Millisecond)
	}
	if wsURL == "" {
		cmd.Process.Kill()
		msg := "gizli tarayıcı açılmadı (20 sn)"
		if s := strings.TrimSpace(stderr.String()); s != "" {
			msg += ": " + s
		}
		return nil, errors.New(msg)
	}
	ws, err := wsDial(wsURL)
	if err != nil {
		cmd.Process.Kill()
		return nil, errors.New("tarayıcıya bağlanılamadı: " + err.Error())
	}
	b := &cdpBrowser{cmd: cmd, ws: ws, pending: map[int]chan cdpMsg{}, events: map[string]func(cdpMsg){}, dead: make(chan struct{}), lastUse: time.Now()}
	go b.loop()
	go b.idleKiller()
	log.Printf("gizli tarayıcı açıldı: %s", bin)
	return b, nil
}

type limitWriter struct {
	b *strings.Builder
	n int
}

func (l *limitWriter) Write(p []byte) (int, error) {
	if l.b.Len() < l.n {
		l.b.Write(p)
	}
	return len(p), nil
}

func (b *cdpBrowser) loop() {
	defer close(b.dead)
	for {
		raw, err := b.ws.read()
		if err != nil {
			return
		}
		var m cdpMsg
		if json.Unmarshal(raw, &m) != nil {
			continue
		}
		b.mu.Lock()
		if m.ID != 0 {
			if ch, ok := b.pending[m.ID]; ok {
				delete(b.pending, m.ID)
				ch <- m
			}
		} else if f := b.events[m.SessionID]; f != nil {
			go f(m)
		}
		b.mu.Unlock()
	}
}

func (b *cdpBrowser) idleKiller() {
	for {
		select {
		case <-b.dead:
			return
		case <-time.After(30 * time.Second):
		}
		b.mu.Lock()
		idle := time.Since(b.lastUse)
		b.mu.Unlock()
		if idle > 5*time.Minute {
			brMu.Lock()
			if brCurrent == b {
				brCurrent = nil
			}
			brMu.Unlock()
			b.close()
			return
		}
	}
}

func (b *cdpBrowser) close() {
	b.call("", "Browser.close", nil, 2*time.Second)
	time.Sleep(300 * time.Millisecond)
	if b.cmd.Process != nil {
		b.cmd.Process.Kill()
	}
}

func (b *cdpBrowser) call(session, method string, params any, timeout time.Duration) (json.RawMessage, error) {
	b.mu.Lock()
	b.nextID++
	id := b.nextID
	ch := make(chan cdpMsg, 1)
	b.pending[id] = ch
	b.lastUse = time.Now()
	b.mu.Unlock()
	msg := map[string]any{"id": id, "method": method}
	if params != nil {
		msg["params"] = params
	}
	if session != "" {
		msg["sessionId"] = session
	}
	data, _ := json.Marshal(msg)
	if err := b.ws.send(data); err != nil {
		return nil, err
	}
	select {
	case m := <-ch:
		if m.Error != nil {
			return nil, errors.New(m.Error.Message)
		}
		return m.Result, nil
	case <-time.After(timeout):
		b.mu.Lock()
		delete(b.pending, id)
		b.mu.Unlock()
		return nil, errors.New(method + " zaman aşımı")
	case <-b.dead:
		return nil, errors.New("gizli tarayıcı kapandı")
	}
}

func getBrowser() (*cdpBrowser, error) {
	brMu.Lock()
	defer brMu.Unlock()
	if brCurrent != nil {
		select {
		case <-brCurrent.dead:
			brCurrent = nil
		default:
			return brCurrent, nil
		}
	}
	b, err := startBrowser()
	if err != nil {
		return nil, err
	}
	brCurrent = b
	return b, nil
}

type netReq struct {
	URL    string `json:"url"`
	Method string `json:"method,omitempty"`
	Type   string `json:"type"`
	Status int    `json:"status"`
	Mime   string `json:"mime"`
	Body   string `json:"body,omitempty"`
	reqID  string
}

// renderPage: sayfayı gizli sekmede açar, içerik oturana kadar bekler.
func renderPage(u string, waitMs int) (string, []netReq, error) {
	pageMu.Lock()
	defer pageMu.Unlock()
	if waitMs <= 0 {
		waitMs = 15000
	}
	var lastErr error
	for attempt := 0; attempt < 2; attempt++ {
		b, err := getBrowser()
		if err != nil {
			return "", nil, err
		}
		html, reqs, err := b.render(u, time.Duration(waitMs)*time.Millisecond)
		if err == nil {
			return html, reqs, nil
		}
		lastErr = err
		// tarayıcı bozulduysa yeniden başlat
		brMu.Lock()
		if brCurrent == b {
			brCurrent = nil
		}
		brMu.Unlock()
		b.close()
	}
	return "", nil, lastErr
}

func (b *cdpBrowser) render(u string, maxWait time.Duration) (string, []netReq, error) {
	res, err := b.call("", "Target.createTarget", map[string]any{"url": "about:blank"}, 10*time.Second)
	if err != nil {
		return "", nil, err
	}
	var t struct {
		TargetID string `json:"targetId"`
	}
	json.Unmarshal(res, &t)
	defer b.call("", "Target.closeTarget", map[string]any{"targetId": t.TargetID}, 5*time.Second)

	res, err = b.call("", "Target.attachToTarget", map[string]any{"targetId": t.TargetID, "flatten": true}, 10*time.Second)
	if err != nil {
		return "", nil, err
	}
	var at struct {
		SessionID string `json:"sessionId"`
	}
	json.Unmarshal(res, &at)
	sid := at.SessionID

	var reqMu sync.Mutex
	var reqs []netReq
	b.mu.Lock()
	methods := map[string]string{}
	b.events[sid] = func(m cdpMsg) {
		switch m.Method {
		case "Network.requestWillBeSent":
			var p struct {
				RequestID string `json:"requestId"`
				Request   struct {
					Method string `json:"method"`
				} `json:"request"`
			}
			json.Unmarshal(m.Params, &p)
			reqMu.Lock()
			methods[p.RequestID] = p.Request.Method
			reqMu.Unlock()
		case "Network.responseReceived":
			var p struct {
				RequestID string `json:"requestId"`
				Type      string `json:"type"`
				Response  struct {
					URL      string `json:"url"`
					Status   int    `json:"status"`
					MimeType string `json:"mimeType"`
				} `json:"response"`
			}
			json.Unmarshal(m.Params, &p)
			if p.Type == "XHR" || p.Type == "Fetch" || p.Type == "WebSocket" || p.Type == "EventSource" || strings.Contains(p.Response.MimeType, "json") {
				reqMu.Lock()
				if len(reqs) < 80 {
					reqs = append(reqs, netReq{URL: p.Response.URL, Method: methods[p.RequestID], Type: p.Type, Status: p.Response.Status, Mime: p.Response.MimeType, reqID: p.RequestID})
				}
				reqMu.Unlock()
			}
		case "Network.loadingFinished":
			var p struct {
				RequestID string `json:"requestId"`
			}
			json.Unmarshal(m.Params, &p)
			reqMu.Lock()
			idx := -1
			for i := range reqs {
				if reqs[i].reqID == p.RequestID && (strings.Contains(reqs[i].Mime, "json") || reqs[i].Mime == "text/plain") {
					idx = i
				}
			}
			bodies := 0
			for i := range reqs {
				if reqs[i].Body != "" {
					bodies++
				}
			}
			reqMu.Unlock()
			if idx < 0 || bodies >= 25 {
				return
			}
			r, err := b.call(sid, "Network.getResponseBody", map[string]any{"requestId": p.RequestID}, 5*time.Second)
			if err != nil {
				return
			}
			var body struct {
				Body          string `json:"body"`
				Base64Encoded bool   `json:"base64Encoded"`
			}
			json.Unmarshal(r, &body)
			if body.Base64Encoded {
				if d, err := base64.StdEncoding.DecodeString(body.Body); err == nil {
					body.Body = string(d)
				}
			}
			if len(body.Body) > 3<<20 {
				body.Body = body.Body[:3<<20]
			}
			reqMu.Lock()
			reqs[idx].Body = body.Body
			reqMu.Unlock()
		}
	}
	b.mu.Unlock()
	defer func() { b.mu.Lock(); delete(b.events, sid); b.mu.Unlock() }()

	b.call(sid, "Network.enable", map[string]any{}, 5*time.Second)
	b.call(sid, "Page.enable", map[string]any{}, 5*time.Second)
	if _, err := b.call(sid, "Page.navigate", map[string]any{"url": u}, 20*time.Second); err != nil {
		return "", nil, err
	}

	// içerik uzunluğu sabitlenene kadar bekle
	start := time.Now()
	lastLen, stableSince := -1, time.Now()
	for time.Since(start) < maxWait {
		time.Sleep(500 * time.Millisecond)
		r, err := b.call(sid, "Runtime.evaluate", map[string]any{
			"expression":    `document.readyState + "|" + (document.body ? document.body.innerText.length : 0)`,
			"returnByValue": true,
		}, 5*time.Second)
		if err != nil {
			continue
		}
		var ev struct {
			Result struct {
				Value string `json:"value"`
			} `json:"result"`
		}
		json.Unmarshal(r, &ev)
		parts := strings.SplitN(ev.Result.Value, "|", 2)
		if len(parts) != 2 {
			continue
		}
		n := 0
		fmt.Sscan(parts[1], &n)
		if n != lastLen {
			lastLen, stableSince = n, time.Now()
			continue
		}
		if parts[0] == "complete" && n > 0 && time.Since(stableSince) > 2*time.Second && time.Since(start) > 3*time.Second {
			break
		}
	}
	r, err := b.call(sid, "Runtime.evaluate", map[string]any{
		"expression":    "document.documentElement.outerHTML",
		"returnByValue": true,
	}, 10*time.Second)
	if err != nil {
		return "", nil, err
	}
	var ev struct {
		Result struct {
			Value string `json:"value"`
		} `json:"result"`
	}
	json.Unmarshal(r, &ev)
	if strings.TrimSpace(ev.Result.Value) == "" {
		return "", nil, errors.New("gizli tarayıcı boş sayfa döndürdü")
	}
	reqMu.Lock()
	defer reqMu.Unlock()
	return ev.Result.Value, append([]netReq(nil), reqs...), nil
}

// shutdownBrowser: program kapanırken gizli tarayıcıyı da kapat.
func shutdownBrowser() {
	brMu.Lock()
	b := brCurrent
	brCurrent = nil
	brMu.Unlock()
	if b != nil {
		b.close()
	}
}

type fetchResult struct {
	URL    string `json:"url"`
	Status int    `json:"status"`
	Text   string `json:"text"`
	Error  string `json:"error,omitempty"`
}

// browserFetch: verilen sayfayı gizli sekmede açıp, o sitenin içinden (aynı
// çerezler ve köken ile) veri adreslerini çağırır. Sayfalama için kullanılır.
func browserFetch(page string, urls []string) ([]fetchResult, error) {
	pageMu.Lock()
	defer pageMu.Unlock()
	b, err := getBrowser()
	if err != nil {
		return nil, err
	}
	res, err := b.call("", "Target.createTarget", map[string]any{"url": "about:blank"}, 10*time.Second)
	if err != nil {
		return nil, err
	}
	var t struct {
		TargetID string `json:"targetId"`
	}
	json.Unmarshal(res, &t)
	defer b.call("", "Target.closeTarget", map[string]any{"targetId": t.TargetID}, 5*time.Second)
	res, err = b.call("", "Target.attachToTarget", map[string]any{"targetId": t.TargetID, "flatten": true}, 10*time.Second)
	if err != nil {
		return nil, err
	}
	var at struct {
		SessionID string `json:"sessionId"`
	}
	json.Unmarshal(res, &at)
	sid := at.SessionID
	b.call(sid, "Page.enable", map[string]any{}, 5*time.Second)
	if _, err := b.call(sid, "Page.navigate", map[string]any{"url": page}, 20*time.Second); err != nil {
		return nil, err
	}
	for i := 0; i < 40; i++ {
		time.Sleep(250 * time.Millisecond)
		r, err := b.call(sid, "Runtime.evaluate", map[string]any{"expression": "document.readyState", "returnByValue": true}, 5*time.Second)
		if err == nil && strings.Contains(string(r), "complete") {
			break
		}
	}
	out := make([]fetchResult, 0, len(urls))
	for _, u := range urls {
		expr := `fetch(` + jsString(u) + `, {credentials: "include", headers: {"Accept": "application/json, text/plain, */*"}}).then(async r => JSON.stringify({s: r.status, t: await r.text()})).catch(e => JSON.stringify({s: 0, e: String(e)}))`
		r, err := b.call(sid, "Runtime.evaluate", map[string]any{"expression": expr, "awaitPromise": true, "returnByValue": true}, 30*time.Second)
		fr := fetchResult{URL: u}
		if err != nil {
			fr.Error = err.Error()
		} else {
			var ev struct {
				Result struct {
					Value string `json:"value"`
				} `json:"result"`
			}
			json.Unmarshal(r, &ev)
			var v struct {
				S int    `json:"s"`
				T string `json:"t"`
				E string `json:"e"`
			}
			json.Unmarshal([]byte(ev.Result.Value), &v)
			fr.Status, fr.Text, fr.Error = v.S, v.T, v.E
		}
		out = append(out, fr)
		time.Sleep(250 * time.Millisecond)
	}
	return out, nil
}

func jsString(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

// renderPages: sayfayı açar, tabloları okur, sonra sitenin "sonraki sayfa"
// düğmesine basarak her sayfanın tablolarını toplar (en fazla maxPages).
func renderPages(u string, maxPages int) ([]string, error) {
	pageMu.Lock()
	defer pageMu.Unlock()
	if maxPages < 1 {
		maxPages = 1
	}
	b, err := getBrowser()
	if err != nil {
		return nil, err
	}
	res, err := b.call("", "Target.createTarget", map[string]any{"url": "about:blank"}, 10*time.Second)
	if err != nil {
		return nil, err
	}
	var t struct {
		TargetID string `json:"targetId"`
	}
	json.Unmarshal(res, &t)
	defer b.call("", "Target.closeTarget", map[string]any{"targetId": t.TargetID}, 5*time.Second)
	res, err = b.call("", "Target.attachToTarget", map[string]any{"targetId": t.TargetID, "flatten": true}, 10*time.Second)
	if err != nil {
		return nil, err
	}
	var at struct {
		SessionID string `json:"sessionId"`
	}
	json.Unmarshal(res, &at)
	sid := at.SessionID
	b.call(sid, "Page.enable", map[string]any{}, 5*time.Second)
	if _, err := b.call(sid, "Page.navigate", map[string]any{"url": u}, 20*time.Second); err != nil {
		return nil, err
	}
	eval := func(expr string, timeout time.Duration) string {
		r, err := b.call(sid, "Runtime.evaluate", map[string]any{"expression": expr, "returnByValue": true, "awaitPromise": true}, timeout)
		if err != nil {
			return ""
		}
		var ev struct {
			Result struct {
				Value any `json:"value"`
			} `json:"result"`
		}
		json.Unmarshal(r, &ev)
		if s, ok := ev.Result.Value.(string); ok {
			return s
		}
		return ""
	}
	// ilk tablo yüklenene kadar bekle
	sig := `(() => { const r = document.querySelector('table tbody tr') || document.querySelector('table tr:nth-child(2)'); return r ? r.innerText.slice(0, 200) + '|' + document.querySelectorAll('table tr').length : ''; })()`
	for i := 0; i < 40; i++ {
		time.Sleep(400 * time.Millisecond)
		if eval(sig, 5*time.Second) != "" {
			break
		}
	}
	time.Sleep(800 * time.Millisecond)
	grab := `(() => [...document.querySelectorAll('table')].map(t => t.outerHTML).join('\n'))()`
	next := `(() => {
	  const vis = e => e && e.offsetParent !== null && !e.disabled && !/disabled/i.test(e.className + ' ' + (e.parentElement ? e.parentElement.className : '')) && e.getAttribute('aria-disabled') !== 'true';
	  const els = [...document.querySelectorAll('button, a, li, span, [role=button]')].filter(vis);
	  const txt = e => (e.innerText || e.textContent || '').trim();
	  let n = els.find(e => /^(sonraki|ileri|next|›|»|>|→|sonraki sayfa)$/i.test(txt(e)) || /next|sonraki|ileri/i.test((e.getAttribute('aria-label') || '') + ' ' + (e.title || '')));
	  if (!n) {
	    const act = els.find(e => /active|current|selected/i.test(e.className + ' ' + (e.getAttribute('aria-current') || '')) && /^\d+$/.test(txt(e)));
	    if (act) { const want = String(+txt(act) + 1); n = els.find(e => txt(e) === want && e !== act); }
	  }
	  if (!n) return 'none';
	  n.scrollIntoView({ block: 'center' }); n.click(); return 'ok';
	})()`
	var pages []string
	last := ""
	for p := 0; p < maxPages; p++ {
		h := eval(grab, 10*time.Second)
		if h == "" {
			break
		}
		pages = append(pages, h)
		if p == maxPages-1 {
			break
		}
		before := eval(sig, 5*time.Second)
		if eval(next, 5*time.Second) != "ok" {
			break
		}
		changed := false
		for i := 0; i < 25; i++ {
			time.Sleep(300 * time.Millisecond)
			now := eval(sig, 5*time.Second)
			if now != "" && now != before && now != last {
				changed = true
				break
			}
		}
		last = before
		if !changed {
			break
		}
		time.Sleep(400 * time.Millisecond)
	}
	if len(pages) == 0 {
		return nil, errors.New("sayfada tablo bulunamadı")
	}
	return pages, nil
}
