package client

import (
	"crypto/ed25519"
	"crypto/rand"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"
)

func TestSolaceSSHHostKey(t *testing.T) {
	_, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := ssh.NewSignerFromKey(privateKey)
	if err != nil {
		t.Fatal(err)
	}
	_, otherKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	otherSigner, err := ssh.NewSignerFromKey(otherKey)
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name string
		key  ssh.PublicKey
		ok   bool
	}{
		{"pinned host", signer.PublicKey(), true},
		{"changed host", otherSigner.PublicKey(), false},
		{"unknown host", nil, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			listener, err := net.Listen("tcp", "127.0.0.1:0")
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { listener.Close() })
			serverConfig := &ssh.ServerConfig{NoClientAuth: true}
			serverConfig.AddHostKey(signer)
			go func() {
				conn, err := listener.Accept()
				if err != nil {
					return
				}
				defer conn.Close()
				conn.SetDeadline(time.Now().Add(3 * time.Second))
				server, channels, requests, err := ssh.NewServerConn(conn, serverConfig)
				if err != nil {
					return
				}
				defer server.Close()
				go ssh.DiscardRequests(requests)
				for channel := range channels {
					channel.Reject(ssh.Prohibited, "test server")
				}
			}()
			path := filepath.Join(t.TempDir(), "known_hosts")
			line := ""
			if tc.key != nil {
				line = knownhosts.Line([]string{listener.Addr().String()}, tc.key) + "\n"
			}
			if err := os.WriteFile(path, []byte(line), 0600); err != nil {
				t.Fatal(err)
			}
			t.Setenv("GATUS_SSH_KNOWN_HOSTS", path)
			connected, cli, err := CanCreateSSHConnection(listener.Addr().String(), "monitor", "", "", &Config{Timeout: time.Second})
			if cli != nil {
				cli.Close()
			}
			if connected != tc.ok || (err == nil) != tc.ok {
				t.Fatalf("connected=%v error=%v want success=%v", connected, err, tc.ok)
			}
		})
	}
}

func TestSolaceSSHMissingKnownHosts(t *testing.T) {
	t.Setenv("GATUS_SSH_KNOWN_HOSTS", filepath.Join(t.TempDir(), "missing"))
	connected, _, err := CanCreateSSHConnection("127.0.0.1:1", "monitor", "", "", &Config{Timeout: time.Second})
	if connected || err == nil {
		t.Fatal("missing pinned host keys must fail closed")
	}
}

func TestSolaceSSHRequiresKnownHosts(t *testing.T) {
	t.Setenv("GATUS_SSH_KNOWN_HOSTS", "")
	connected, cli, err := CanCreateSSHConnection("127.0.0.1:1", "monitor", "", "", &Config{Timeout: time.Second})
	if cli != nil {
		cli.Close()
	}
	if connected || err == nil || err.Error() != "SSH known hosts are required" {
		t.Fatal("missing host pins must fail before dialing")
	}
}

func TestSolaceSSHHandshakeTimeout(t *testing.T) {
	path := filepath.Join(t.TempDir(), "known_hosts")
	if err := os.WriteFile(path, nil, 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("GATUS_SSH_KNOWN_HOSTS", path)
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	go func() {
		conn, err := listener.Accept()
		if err == nil {
			defer conn.Close()
			time.Sleep(2 * time.Second)
		}
	}()
	start := time.Now()
	connected, cli, err := CanCreateSSHConnection(listener.Addr().String(), "monitor", "", "", &Config{Timeout: 100 * time.Millisecond})
	if cli != nil {
		cli.Close()
	}
	if connected || err == nil || time.Since(start) > time.Second {
		t.Fatal("an unresponsive SSH handshake must obey the endpoint timeout")
	}
}

func TestSolaceSSHCommandTimeout(t *testing.T) {
	_, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := ssh.NewSignerFromKey(privateKey)
	if err != nil {
		t.Fatal(err)
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	path := filepath.Join(t.TempDir(), "known_hosts")
	line := knownhosts.Line([]string{listener.Addr().String()}, signer.PublicKey()) + "\n"
	if err := os.WriteFile(path, []byte(line), 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("GATUS_SSH_KNOWN_HOSTS", path)
	serverConfig := &ssh.ServerConfig{NoClientAuth: true}
	serverConfig.AddHostKey(signer)
	go func() {
		conn, err := listener.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		conn.SetDeadline(time.Now().Add(2 * time.Second))
		server, channels, requests, err := ssh.NewServerConn(conn, serverConfig)
		if err != nil {
			return
		}
		defer server.Close()
		go ssh.DiscardRequests(requests)
		for channel := range channels {
			session, requests, err := channel.Accept()
			if err != nil {
				return
			}
			for request := range requests {
				request.Reply(true, nil)
			}
			session.Close()
		}
	}()
	config := &Config{Timeout: 100 * time.Millisecond}
	start := time.Now()
	connected, cli, err := CanCreateSSHConnection(listener.Addr().String(), "monitor", "", "", config)
	if !connected || err != nil {
		t.Fatalf("SSH fixture failed: %v", err)
	}
	_, _, _, err = ExecuteSSHCommand(cli, `{"command":"health"}`, config)
	if err == nil || time.Since(start) > time.Second {
		t.Fatal("an unresponsive SSH command must obey the endpoint timeout")
	}
}
