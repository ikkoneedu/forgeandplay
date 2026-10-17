//go:build !windows

package main

func keyDown(vk int) (bool, bool) { return false, false }
