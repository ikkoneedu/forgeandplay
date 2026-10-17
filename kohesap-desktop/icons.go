package main

import (
	"crypto/sha1"
	"encoding/hex"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

// ---------- item ikonları: sitenin ikonlarını getirir, diskte saklar ----------

var iconPathRe = regexp.MustCompile(`^/(ItemIcon|img/pus|img/items?)/[A-Za-z0-9_.\-]+\.(png|jpe?g|webp|gif)$`)

// NTT Game resmi oyun rehberindeki sınıf görselleri (karakter seçim ekranı)
var nttPathRe = regexp.MustCompile(`^/knight/ver2018/assets/images/guide/character_(karus|elmorad)[1-5]\.png$`)

const nttOrigin = "https://image.nttgame.com"
const nttReferer = "https://www.nttgame.com/knight/tr/guide/character"

func fetchImage(u, referer string) (int, []byte, error) {
	req, _ := http.NewRequest("GET", u, nil)
	req.Header.Set("User-Agent", browserUA)
	req.Header.Set("Accept", "image/avif,image/webp,image/png,image/*,*/*;q=0.8")
	req.Header.Set("Referer", referer)
	resp, err := httpCli.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	return resp.StatusCode, b, err
}

func siteBase(r *http.Request) string {
	b := r.URL.Query().Get("base")
	if u, err := url.Parse(b); err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != "" {
		return u.Scheme + "://" + u.Host
	}
	return "https://www.enucuzgb.com"
}

func handleImg(w http.ResponseWriter, r *http.Request) {
	p := r.URL.Query().Get("p")
	ntt := r.URL.Query().Get("h") == "ntt"
	if (ntt && !nttPathRe.MatchString(p)) || (!ntt && !iconPathRe.MatchString(p)) {
		http.Error(w, "izin yok", 400)
		return
	}
	base := siteBase(r)
	if ntt {
		base = nttOrigin
	}
	sum := sha1.Sum([]byte(base + p))
	dir := filepath.Join(dataDir, "ikonlar")
	file := filepath.Join(dir, hex.EncodeToString(sum[:])+filepath.Ext(p))
	if b, err := os.ReadFile(file); err == nil && len(b) > 0 {
		serveImg(w, b)
		return
	}
	var status int
	var body []byte
	var err error
	if ntt {
		status, body, err = fetchImage(base+p, nttReferer)
	} else {
		status, body, err = fetchPassing(base + p)
	}
	if err != nil || status != 200 || !strings.HasPrefix(http.DetectContentType(body), "image/") {
		w.Header().Set("Cache-Control", "no-store")
		http.Error(w, "bulunamadı", 404)
		return
	}
	_ = os.MkdirAll(dir, 0o755)
	_ = os.WriteFile(file, body, 0o644)
	serveImg(w, body)
}

func serveImg(w http.ResponseWriter, b []byte) {
	w.Header().Set("Content-Type", http.DetectContentType(b))
	w.Header().Set("Cache-Control", "public, max-age=604800")
	_, _ = w.Write(b)
}

// ---------- item detay: fiyat geçmişi (sitenin iç adresi) ----------

var (
	itemMu    sync.Mutex
	itemCache = map[string]aresEntry{}
)

var itemActionRe = regexp.MustCompile(`^(price_history|channel_compare|tooltip)$`)

func handleItem(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	if !itemActionRe.MatchString(q.Get("action")) {
		writeJSON(w, map[string]any{"ok": false, "error": "geçersiz istek"})
		return
	}
	base := siteBase(r)
	vals := url.Values{}
	for _, k := range []string{"action", "itemId", "itemName", "server", "mType", "days"} {
		if v := q.Get(k); v != "" {
			vals.Set(k, v)
		}
	}
	target := base + "/api/market/item?" + vals.Encode()
	if q.Get("action") == "tooltip" {
		target = base + "/api/market/tooltip?" + url.Values{"itemId": {q.Get("itemId")}}.Encode()
	}
	itemMu.Lock()
	if e, ok := itemCache[target]; ok && time.Since(e.at) < 10*time.Minute {
		itemMu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(e.body)
		return
	}
	itemMu.Unlock()
	body, err := apiGet(base, target)
	if err != nil {
		writeJSON(w, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	itemMu.Lock()
	if len(itemCache) > 300 {
		itemCache = map[string]aresEntry{}
	}
	itemCache[target] = aresEntry{at: time.Now(), body: body}
	itemMu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(body)
}
