//go:build windows

package main

import "syscall"

var procGetAsyncKeyState = syscall.NewLazyDLL("user32.dll").NewProc("GetAsyncKeyState")

// keyDown: tuş (veya fare yan tuşu) şu an basılı mı — hangi pencere önde olursa olsun.
// Tuşu yakalamaz/engellemez; oyun da tuşu normal şekilde alır (Discord'daki gibi).
func keyDown(vk int) (bool, bool) {
	r, _, _ := procGetAsyncKeyState.Call(uintptr(vk))
	return r&0x8000 != 0, true
}
