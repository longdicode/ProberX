//go:build !windows

package terminal

import (
	"fmt"
	"os"
	"os/exec"

	"github.com/creack/pty"
	"github.com/gorilla/websocket"
)

func newSession(conn *websocket.Conn, cols, rows int) (*Session, func(), error) {
	if cols <= 0 {
		cols = 80
	}
	if rows <= 0 {
		rows = 24
	}

	shell := "/bin/bash"
	if _, err := os.Stat(shell); os.IsNotExist(err) {
		shell = "/bin/sh"
	}
	cmd := exec.Command(shell)
	cmd.Env = append(cmd.Env, "TERM=xterm-256color")

	winSize := &pty.Winsize{Rows: uint16(rows), Cols: uint16(cols)}
	ptmx, err := pty.StartWithSize(cmd, winSize)
	if err != nil {
		return nil, nil, fmt.Errorf("start pty: %w", err)
	}

	s := &Session{
		conn: conn,
		done: make(chan struct{}),
	}

	go readLoop(s, ptmx)
	go writeLoop(s, ptmx, ptmx)
	go func() { cmd.Wait(); s.Close() }()

	return s, func() {
		if cmd.Process != nil {
			cmd.Process.Signal(os.Interrupt)
		}
		ptmx.Close()
	}, nil
}

func resizePTY(target interface{}, cols, rows int) {
	f, ok := target.(*os.File)
	if !ok || cols <= 0 || rows <= 0 {
		return
	}
	_ = pty.Setsize(f, &pty.Winsize{Rows: uint16(rows), Cols: uint16(cols)})
}
