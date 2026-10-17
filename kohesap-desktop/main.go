// KO Hesap — Knight Online gelir/gider, ticaret, parti ve hesap aracı.
// Tek exe: arayüz exe'nin içine gömülüdür, veriler exe'nin yanındaki
// "KOHesap-veri" klasörüne kaydedilir.
package main

import (
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

//go:embed web
var webFS embed.FS

const (
	appName    = "KO Hesap"
	appVersion = "0.7.1"
	port       = 47811
)

var osExit = os.Exit

var (
	dataDir   string
	dataFile  string
	saveMu    sync.Mutex
	lastPing  time.Time
	pingMu    sync.Mutex
	httpCli   = newHTTPClient()
	tagRe     = regexp.MustCompile(`(?s)<[^>]*>`)
	scriptRe  = regexp.MustCompile(`(?is)<(script|style|noscript)[^>]*>.*?</(script|style|noscript)>`)
	spaceRe   = regexp.MustCompile(`[ \t\r\f\v]+`)
	newlineRe = regexp.MustCompile(`\n\s*\n+`)
)

func main() {
	exe, err := os.Executable()
	if err != nil {
		exe = "."
	}
	dataDir = filepath.Join(filepath.Dir(exe), "KOHesap-veri")
	if os.Getenv("KOHESAP_DATA") != "" {
		dataDir = os.Getenv("KOHESAP_DATA")
	}
	_ = os.MkdirAll(filepath.Join(dataDir, "yedekler"), 0o755)
	dataFile = filepath.Join(dataDir, "veri.json")

	logF, _ := os.OpenFile(filepath.Join(dataDir, "log.txt"), os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if logF != nil {
		log.SetOutput(logF)
	}

	addr := fmt.Sprintf("127.0.0.1:%d", port)
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		// Program zaten açık. Aynı sürümse sadece pencereyi aç;
		// farklı (eski) sürümse onu kapatıp yerine geç.
		cli := &http.Client{Timeout: 3 * time.Second}
		var info struct {
			Version string `json:"version"`
		}
		if resp, e := cli.Get("http://" + addr + "/api/info"); e == nil {
			json.NewDecoder(resp.Body).Decode(&info)
			resp.Body.Close()
		}
		if info.Version == appVersion {
			openWindow(fmt.Sprintf("http://localhost:%d/", port))
			return
		}
		if resp, e := cli.Get("http://" + addr + "/api/quit"); e == nil {
			resp.Body.Close()
		}
		for i := 0; i < 30; i++ {
			time.Sleep(200 * time.Millisecond)
			if ln, err = net.Listen("tcp", addr); err == nil {
				break
			}
		}
		if err != nil {
			openWindow(fmt.Sprintf("http://localhost:%d/", port))
			return
		}
		log.Printf("eski sürüm (%s) kapatıldı", info.Version)
	}

	mux := http.NewServeMux()
	sub, _ := fs.Sub(webFS, "web")
	mux.Handle("/", noCache(http.FileServer(http.FS(sub))))
	mux.HandleFunc("/api/data", handleData)
	mux.HandleFunc("/api/ping", handlePing)
	mux.HandleFunc("/api/fetch", handleFetch)
	mux.HandleFunc("/api/rates", handleRates)
	mux.HandleFunc("/api/siteconfig", handleSiteConfig)
	mux.HandleFunc("/api/ares", handleAres)
	mux.HandleFunc("/api/img", handleImg)
	mux.HandleFunc("/api/ptt", handlePTT)
	mux.HandleFunc("/api/eitem", handleItem)
	mux.HandleFunc("/api/browserfetch", handleBrowserFetch)
	mux.HandleFunc("/api/info", handleInfo)
	mux.HandleFunc("/api/quit", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(204)
		go func() { time.Sleep(300 * time.Millisecond); exitApp() }()
	})

	go watchdog()
	if os.Getenv("KOHESAP_NOWINDOW") == "" {
		go func() {
			time.Sleep(150 * time.Millisecond)
			openWindow(fmt.Sprintf("http://localhost:%d/", port))
		}()
	}
	log.Printf("%s %s çalışıyor: http://%s  veri: %s", appName, appVersion, addr, dataDir)
	// "localhost" bazı Windows'larda önce IPv6'ya (::1) gider; orayı da dinle
	if ln6, err := net.Listen("tcp", fmt.Sprintf("[::1]:%d", port)); err == nil {
		go http.Serve(ln6, mux)
	}
	if err := http.Serve(ln, mux); err != nil {
		log.Fatal(err)
	}
}

func noCache(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		h.ServeHTTP(w, r)
	})
}

// Pencere kapandıktan sonra arka planda kalmamak için: arayüz düzenli ping
// atar; uzun süre ping gelmezse program kapanır.
func watchdog() {
	for {
		time.Sleep(10 * time.Second)
		if os.Getenv("KOHESAP_NOWINDOW") != "" {
			continue
		}
		pingMu.Lock()
		lp := lastPing
		pingMu.Unlock()
		if !lp.IsZero() && time.Since(lp) > 120*time.Second {
			log.Println("Pencere kapandı, çıkılıyor.")
			exitApp()
		}
	}
}

func handlePing(w http.ResponseWriter, r *http.Request) {
	pingMu.Lock()
	lastPing = time.Now()
	pingMu.Unlock()
	w.WriteHeader(204)
}

func handleInfo(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]any{"name": appName, "version": appVersion, "dataDir": dataDir})
}

func handleData(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		b, err := os.ReadFile(dataFile)
		if errors.Is(err, os.ErrNotExist) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte("null"))
			return
		}
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(b)
	case http.MethodPut, http.MethodPost:
		b, err := io.ReadAll(io.LimitReader(r.Body, 50<<20))
		if err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		if !json.Valid(b) {
			http.Error(w, "geçersiz veri", 400)
			return
		}
		if err := saveData(b); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		w.WriteHeader(204)
	default:
		http.Error(w, "method", 405)
	}
}

func saveData(b []byte) error {
	saveMu.Lock()
	defer saveMu.Unlock()
	// Günlük yedek: o günün ilk kaydından önce eski dosyayı yedekle.
	if old, err := os.ReadFile(dataFile); err == nil && len(old) > 0 {
		bk := filepath.Join(dataDir, "yedekler", "veri-"+time.Now().Format("2006-01-02")+".json")
		if _, err := os.Stat(bk); errors.Is(err, os.ErrNotExist) {
			_ = os.WriteFile(bk, old, 0o644)
			pruneBackups(30)
		}
	}
	tmp := dataFile + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, dataFile)
}

func pruneBackups(keep int) {
	files, _ := filepath.Glob(filepath.Join(dataDir, "yedekler", "veri-*.json"))
	sort.Strings(files)
	for len(files) > keep {
		os.Remove(files[0])
		files = files[1:]
	}
}

// handleFetch: verilen web sayfasını indirir, ham HTML'i ve okunabilir metni döner.
// Fiyat ayıklama (regex) arayüz tarafında yapılır.
func handleFetch(w http.ResponseWriter, r *http.Request) {
	var req struct {
		URL    string `json:"url"`
		Render bool   `json:"render"`
		Pages  int    `json:"pages"`
		Wait   int    `json:"wait"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "istek okunamadı", 400)
		return
	}
	u, err := url.Parse(strings.TrimSpace(req.URL))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		writeJSON(w, map[string]any{"ok": false, "error": "Geçerli bir http/https adresi girin."})
		return
	}
	if req.Pages > 0 {
		pages, err := renderPages(u.String(), req.Pages)
		if err != nil {
			writeJSON(w, map[string]any{"ok": false, "error": err.Error(), "mode": "tarayici"})
			return
		}
		log.Printf("sayfalı okuma %s: %d sayfa", u, len(pages))
		writeJSON(w, map[string]any{"ok": true, "pages": pages, "mode": "tarayici"})
		return
	}
	if req.Render {
		start := time.Now()
		html, reqs, err := renderPage(u.String(), req.Wait)
		if err != nil {
			log.Printf("render %s: %v", u, err)
			writeJSON(w, map[string]any{"ok": false, "error": err.Error(), "mode": "tarayici"})
			return
		}
		log.Printf("render %s: %d bayt, %s", u, len(html), time.Since(start))
		writeJSON(w, map[string]any{"ok": true, "status": 200, "html": html, "text": htmlToText(html), "mode": "tarayici", "requests": reqs, "time": time.Now().Format(time.RFC3339)})
		return
	}
	status, body, err := fetchPassing(u.String())
	if err != nil {
		writeJSON(w, map[string]any{"ok": false, "error": "Bağlantı hatası: " + err.Error()})
		return
	}
	resp := struct{ StatusCode int }{status}
	html := string(body)
	log.Printf("fetch %s: %d, %d bayt", u, resp.StatusCode, len(body))
	writeJSON(w, map[string]any{
		"mode":   "dogrudan",
		"ok":     resp.StatusCode < 400,
		"status": resp.StatusCode,
		"error":  map[bool]string{true: "", false: fmt.Sprintf("Site %d hata kodu döndürdü.", resp.StatusCode)}[resp.StatusCode < 400],
		"html":   html,
		"text":   htmlToText(html),
		"time":   time.Now().Format(time.RFC3339),
	})
}

func htmlToText(h string) string {
	t := scriptRe.ReplaceAllString(h, " ")
	t = regexp.MustCompile(`(?i)<(br|/p|/div|/tr|/li|/h\d)[^>]*>`).ReplaceAllString(t, "\n")
	t = tagRe.ReplaceAllString(t, " ")
	r := strings.NewReplacer("&nbsp;", " ", "&amp;", "&", "&lt;", "<", "&gt;", ">", "&quot;", `"`, "&#39;", "'", "&#8378;", "₺")
	t = r.Replace(t)
	t = spaceRe.ReplaceAllString(t, " ")
	t = newlineRe.ReplaceAllString(t, "\n")
	if len(t) > 200000 {
		t = t[:200000]
	}
	return strings.TrimSpace(t)
}

// handleRates: döviz kurları (USD bazlı) — ücretsiz, anahtarsız servis.
func handleRates(w http.ResponseWriter, r *http.Request) {
	resp, err := httpCli.Get("https://open.er-api.com/v6/latest/USD")
	if err != nil {
		writeJSON(w, map[string]any{"ok": false, "error": "Kur servisine ulaşılamadı: " + err.Error()})
		return
	}
	defer resp.Body.Close()
	var d struct {
		Result string             `json:"result"`
		Time   string             `json:"time_last_update_utc"`
		Rates  map[string]float64 `json:"rates"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&d); err != nil || d.Rates["TRY"] == 0 {
		writeJSON(w, map[string]any{"ok": false, "error": "Kur verisi okunamadı."})
		return
	}
	try := d.Rates["TRY"]
	writeJSON(w, map[string]any{
		"ok":   true,
		"time": d.Time,
		"USD":  try,
		"EUR":  try / d.Rates["EUR"],
		"GBP":  try / d.Rates["GBP"],
	})
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	json.NewEncoder(w).Encode(v)
}

func handleBrowserFetch(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Page string   `json:"page"`
		URLs []string `json:"urls"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Page == "" || len(req.URLs) == 0 {
		http.Error(w, "istek okunamadı", 400)
		return
	}
	if len(req.URLs) > 60 {
		req.URLs = req.URLs[:60]
	}
	res, err := browserFetch(req.Page, req.URLs)
	if err != nil {
		writeJSON(w, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, map[string]any{"ok": true, "results": res})
}

// handleSiteConfig: forgeandplay.com'daki KO Hesap yapılandırmasını (Firebase
// ayarları, son exe sürümü) tarayıcı yerine program içinden alır; böylece
// tarayıcının farklı-köken (CORS) kısıtına takılmaz. Son başarılı cevap
// diske yazılır; internet yokken onunla açılır.
func handleSiteConfig(w http.ResponseWriter, r *http.Request) {
	cache := filepath.Join(dataDir, "site-config.json")
	urls := []string{
		"https://forgeandplay.com/api/kohesap/config",
		"https://www.forgeandplay.com/api/kohesap/config",
		"https://forgeandplay.vercel.app/api/kohesap/config",
	}
	var lastErr error
	for _, u := range urls {
		req, _ := http.NewRequest("GET", u, nil)
		req.Header.Set("User-Agent", "KOHesap/"+appVersion)
		resp, err := httpCli.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		resp.Body.Close()
		var probe struct {
			Firebase struct {
				APIKey string `json:"apiKey"`
			} `json:"firebase"`
		}
		if resp.StatusCode == 200 && json.Unmarshal(body, &probe) == nil && probe.Firebase.APIKey != "" {
			_ = os.WriteFile(cache, body, 0o644)
			w.Header().Set("Content-Type", "application/json")
			w.Write(body)
			return
		}
		lastErr = fmt.Errorf("%s: %d", u, resp.StatusCode)
	}
	if b, err := os.ReadFile(cache); err == nil {
		log.Printf("site yapılandırması alınamadı (%v), önbellek kullanılıyor", lastErr)
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-KOHesap-Cache", "1")
		w.Write(b)
		return
	}
	msg := "forgeandplay.com'a ulaşılamadı"
	if lastErr != nil {
		msg += ": " + lastErr.Error()
	}
	http.Error(w, msg, 502)
}

func newHTTPClient() *http.Client {
	jar, _ := cookiejar.New(nil)
	return &http.Client{Timeout: 20 * time.Second, Jar: jar}
}

var (
	jsCookieRe   = regexp.MustCompile(`document\.cookie\s*=\s*["']([^=;"']+)=([^;"']*)`)
	jsLocationRe = regexp.MustCompile(`location\.href\s*=\s*["']([^"']+)["']`)
)

// fetchPassing: sayfayı indirir. Site "DDoS koruması" ara sayfası gönderirse
// (JavaScript ile çerez yazıp yönlendiren sayfa) çerezi kendisi ekleyip
// gerçek sayfayı ister. Çerezler program açık kaldıkça saklanır.
func fetchPassing(raw string) (int, []byte, error) {
	cur := raw
	for hop := 0; hop < 3; hop++ {
		req, _ := http.NewRequest("GET", cur, nil)
		req.Header.Set("User-Agent", browserUA)
		req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
		req.Header.Set("Accept-Language", "tr-TR,tr;q=0.9,en;q=0.8")
		resp, err := httpCli.Do(req)
		if err != nil {
			return 0, nil, err
		}
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
		resp.Body.Close()
		if len(body) > 6000 {
			return resp.StatusCode, body, nil
		}
		ck := jsCookieRe.FindSubmatch(body)
		loc := jsLocationRe.FindSubmatch(body)
		if ck == nil {
			return resp.StatusCode, body, nil
		}
		base, _ := url.Parse(cur)
		httpCli.Jar.SetCookies(base, []*http.Cookie{{Name: strings.TrimSpace(string(ck[1])), Value: strings.TrimSpace(string(ck[2])), Path: "/"}})
		next := cur
		if loc != nil {
			if nu, err := base.Parse(string(loc[1])); err == nil {
				next = nu.String()
			}
		}
		log.Printf("koruma sayfası geçiliyor: %s → %s", cur, next)
		cur = next
	}
	return 0, nil, errors.New("sitenin koruma sayfası geçilemedi")
}

// ---------- canlı pazar: sitenin canlı pazar sayfasının kullandığı iç adres ----------

var (
	aresMu    sync.Mutex
	aresCache = map[string]aresEntry{}
)

type aresEntry struct {
	at   time.Time
	body []byte
	via  string
}

// handleAres: /api/market/ares'i önce doğrudan (çerez + tarayıcı başlıkları),
// olmazsa gizli tarayıcıda sitenin kendi sayfasının içinden çağırır.
// Cevap 60 sn önbellekte tutulur.
func handleAres(w http.ResponseWriter, r *http.Request) {
	base := strings.TrimRight(r.URL.Query().Get("base"), "/")
	if base == "" {
		base = "https://www.enucuzgb.com"
	}
	bu, err := url.Parse(base)
	if err != nil || (bu.Scheme != "https" && bu.Scheme != "http") {
		http.Error(w, "geçersiz adres", 400)
		return
	}
	q := r.URL.Query()
	params := url.Values{}
	for _, k := range []string{"query", "minPrice", "maxPrice", "server", "grade", "type", "priceshort", "stats"} {
		params.Set(k, q.Get(k))
	}
	target := base + "/api/market/ares?" + params.Encode()
	force := q.Get("force") == "1"

	aresMu.Lock()
	hit, ok := aresCache[target]
	aresMu.Unlock()
	if ok && !force && time.Since(hit.at) < 60*time.Second {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Via", hit.via+"-cache")
		w.Write(hit.body)
		return
	}
	body, via, err := apiGetVia(base, target)
	if err != nil {
		writeJSON(w, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	log.Printf("ares %s: %d bayt (%s)", params.Get("server"), len(body), via)
	aresMu.Lock()
	aresCache[target] = aresEntry{time.Now(), body, via}
	if len(aresCache) > 100 {
		for k := range aresCache {
			delete(aresCache, k)
			break
		}
	}
	aresMu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Via", via)
	w.Write(body)
}

// apiGetVia: sitenin iç JSON adresini okur. Önce doğrudan (gerekirse koruma
// çerezini alıp tekrar), olmazsa gizli tarayıcıda sitenin kendi sayfasından.
func apiGetVia(base, target string) ([]byte, string, error) {
	page := base + "/canlipazar"
	isJSON := func(b []byte) bool {
		t := strings.TrimSpace(string(b[:min(len(b), 20)]))
		return strings.HasPrefix(t, "{") || strings.HasPrefix(t, "[")
	}
	get := func() (int, []byte, error) {
		req, _ := http.NewRequest("GET", target, nil)
		req.Header.Set("User-Agent", browserUA)
		req.Header.Set("Accept", "application/json, text/plain, */*")
		req.Header.Set("Accept-Language", "tr-TR,tr;q=0.9")
		req.Header.Set("Referer", page)
		req.Header.Set("Sec-Fetch-Site", "same-origin")
		req.Header.Set("Sec-Fetch-Mode", "cors")
		req.Header.Set("Sec-Fetch-Dest", "empty")
		resp, err := httpCli.Do(req)
		if err != nil {
			return 0, nil, err
		}
		defer resp.Body.Close()
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 64<<20))
		return resp.StatusCode, b, nil
	}
	st, b, err := get()
	if err == nil && (st >= 400 || !isJSON(b)) {
		fetchPassing(page) // koruma çerezi / oturum
		st, b, err = get()
	}
	if err == nil && st < 400 && isJSON(b) {
		return b, "dogrudan", nil
	}
	res, berr := browserFetch(page, []string{target})
	if berr == nil && len(res) == 1 && res[0].Error == "" && res[0].Status < 400 && isJSON([]byte(res[0].Text)) {
		return []byte(res[0].Text), "tarayici", nil
	}
	msg := "site adresi okunamadı"
	if err != nil {
		msg += ": " + err.Error()
	} else {
		msg += fmt.Sprintf(" (doğrudan %d)", st)
	}
	if berr != nil {
		msg += "; tarayıcı: " + berr.Error()
	} else if len(res) == 1 {
		msg += fmt.Sprintf("; tarayıcı %d %s", res[0].Status, res[0].Error)
	}
	log.Println(msg)
	return nil, "", errors.New(msg)
}

func apiGet(base, target string) ([]byte, error) {
	b, _, err := apiGetVia(base, target)
	return b, err
}
