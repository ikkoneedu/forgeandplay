//go:build windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
)

func browserCandidates() []string {
	return []string{
		filepath.Join(os.Getenv("ProgramFiles(x86)"), `Microsoft\Edge\Application\msedge.exe`),
		filepath.Join(os.Getenv("ProgramFiles"), `Microsoft\Edge\Application\msedge.exe`),
		filepath.Join(os.Getenv("LOCALAPPDATA"), `Microsoft\Edge\Application\msedge.exe`),
		filepath.Join(os.Getenv("ProgramFiles"), `Google\Chrome\Application\chrome.exe`),
		filepath.Join(os.Getenv("ProgramFiles(x86)"), `Google\Chrome\Application\chrome.exe`),
		filepath.Join(os.Getenv("LOCALAPPDATA"), `Google\Chrome\Application\chrome.exe`),
	}
}

func findBrowser() string {
	if b := os.Getenv("KOHESAP_BROWSER"); b != "" {
		return b
	}
	for _, c := range browserCandidates() {
		if _, err := os.Stat(c); err == nil {
			return c
		}
	}
	return ""
}

// hideConsole: gizli tarayıcının ekranda pencere/konsol açmaması için.
func hideConsole(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
}

// openWindow: Edge veya Chrome'u "uygulama modu"nda (adres çubuğu olmadan,
// ayrı pencere olarak) açar. Bulamazsa varsayılan tarayıcıyı kullanır.
func openWindow(u string) {
	profile := filepath.Join(os.Getenv("LOCALAPPDATA"), "KOHesap", "pencere")
	_ = os.MkdirAll(profile, 0o755)
	args := []string{"--app=" + u, "--window-size=1440,920", "--user-data-dir=" + profile, "--no-first-run", "--no-default-browser-check",
		// sesli sohbet: oyun öndeyken de pencere yavaşlatılmasın, ses kendiliğinden çalsın
		"--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
		"--autoplay-policy=no-user-gesture-required"}
	if b := findBrowser(); b != "" {
		if exec.Command(b, args...).Start() == nil {
			return
		}
	}
	_ = exec.Command("rundll32", "url.dll,FileProtocolHandler", u).Start()
}
