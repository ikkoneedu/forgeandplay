//go:build !windows

package main

import (
	"os"
	"os/exec"
	"runtime"
)

func findBrowser() string {
	if b := os.Getenv("KOHESAP_BROWSER"); b != "" {
		return b
	}
	for _, n := range []string{"microsoft-edge", "google-chrome", "chromium", "chromium-browser"} {
		if p, err := exec.LookPath(n); err == nil {
			return p
		}
	}
	return ""
}

func hideConsole(cmd *exec.Cmd) {}

func openWindow(u string) {
	if runtime.GOOS == "darwin" {
		_ = exec.Command("open", u).Start()
		return
	}
	_ = exec.Command("xdg-open", u).Start()
}
