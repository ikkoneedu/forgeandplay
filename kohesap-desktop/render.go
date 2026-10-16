package main

const browserUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0"

// exitApp: gizli tarayıcıyı kapatıp programdan çıkar.
func exitApp() {
	shutdownBrowser()
	osExit(0)
}
