package terminal

import (
	"context"
	"os"

	"github.com/UserExistsError/conpty"
	"github.com/gorilla/websocket"
)

func newSession(conn *websocket.Conn, cols, rows int) (*Session, func(), error) {
	if cols <= 0 {
		cols = 80
	}
	if rows <= 0 {
		rows = 24
	}

	shell := os.Getenv("COMSPEC")
	if shell == "" {
		shell = `C:\Windows\System32\cmd.exe`
	}

	c, err := conpty.Start(shell, conpty.ConPtyDimensions(cols, rows))
	if err != nil {
		return nil, nil, err
	}

	s := &Session{
		conn: conn,
		done: make(chan struct{}),
	}

	go readLoop(s, c)
	go writeLoop(s, c, c)
	go func() { c.Wait(context.Background()); s.Close() }()

	return s, func() { c.Close() }, nil
}

func resizePTY(target interface{}, cols, rows int) {
	c, ok := target.(*conpty.ConPty)
	if !ok || cols <= 0 || rows <= 0 {
		return
	}
	_ = c.Resize(cols, rows)
}
