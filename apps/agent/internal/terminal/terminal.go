package terminal

import (
	"encoding/json"
	"io"
	"log"
	"sync"

	"github.com/gorilla/websocket"
)

type Session struct {
	conn    *websocket.Conn
	done    chan struct{}
	once    sync.Once
	cleanup func()
}

type controlMessage struct {
	Type string `json:"type"`
	Cols int    `json:"cols,omitempty"`
	Rows int    `json:"rows,omitempty"`
}

func NewSession(conn *websocket.Conn, cols, rows int) (*Session, error) {
	s, clean, err := newSession(conn, cols, rows)
	if err != nil {
		return nil, err
	}
	s.cleanup = clean
	return s, nil
}

func readLoop(s *Session, r io.Reader) {
	defer s.Close()

	buf := make([]byte, 4096)
	for {
		n, err := r.Read(buf)
		if n > 0 {
			if writeErr := s.conn.WriteMessage(websocket.BinaryMessage, buf[:n]); writeErr != nil {
				return
			}
		}
		if err != nil {
			return
		}
	}
}

func writeLoop(s *Session, w io.Writer, resizeTarget interface{}) {
	defer s.Close()

	for {
		msgType, data, err := s.conn.ReadMessage()
		if err != nil {
			return
		}

		switch msgType {
		case websocket.BinaryMessage:
			if _, err := w.Write(data); err != nil {
				return
			}
		case websocket.TextMessage:
			var ctrl controlMessage
			if err := json.Unmarshal(data, &ctrl); err == nil && ctrl.Type == "resize" {
				if resizeTarget != nil {
					resizePTY(resizeTarget, ctrl.Cols, ctrl.Rows)
				}
			} else {
				if _, err := w.Write(data); err != nil {
					return
				}
			}
		}
	}
}

func (s *Session) Close() {
	s.once.Do(func() {
		close(s.done)
		if s.cleanup != nil {
			s.cleanup()
		}
		if s.conn != nil {
			s.conn.Close()
		}
		log.Println("terminal: session closed")
	})
}

func (s *Session) Run() {
	<-s.done
}
