package email

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSendSubmitsEmailSetAndSubmission(t *testing.T) {
	var sawEmailSet, sawSubmission bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/jmap/session") {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"apiUrl": serverURL(r),
				"primaryAccounts": map[string]string{
					"urn:ietf:params:jmap:mail": "acct-1",
				},
				"accounts": map[string]any{"acct-1": map[string]any{}},
			})
			return
		}
		body, _ := io.ReadAll(r.Body)
		payload := string(body)
		if strings.Contains(payload, "Mailbox/get") {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"methodResponses": []any{
					[]any{"Mailbox/get", map[string]any{"list": []any{
						map[string]any{"id": "mb-drafts", "role": "drafts", "name": "Drafts"},
					}}, "m"},
					[]any{"Identity/get", map[string]any{"list": []any{
						map[string]any{"id": "ident-1", "email": "noreply@solace.onl"},
					}}, "i"},
				},
			})
			return
		}
		if strings.Contains(payload, "Email/set") {
			sawEmailSet = true
			sawSubmission = strings.Contains(payload, "EmailSubmission/set")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"methodResponses": []any{
					[]any{"Email/set", map[string]any{"created": map[string]any{"draft1": map[string]any{"id": "e1"}}}, "c1"},
					[]any{"EmailSubmission/set", map[string]any{"created": map[string]any{"s1": map[string]any{"id": "sub-1"}}}, "c2"},
				},
			})
			return
		}
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	client := NewClient(Config{
		BaseURL:  server.URL,
		Username: "noreply@solace.onl",
		Password: "secret",
		From:     "noreply@solace.onl",
		FromName: "Solace",
		HTTP:     server.Client(),
	})
	id, err := client.Send(context.Background(), Message{
		To:      "user@example.com",
		Subject: "Hello",
		Text:    "Hi",
		HTML:    "<p>Hi</p>",
	})
	if err != nil {
		t.Fatal(err)
	}
	if id != "sub-1" {
		t.Fatalf("got %s", id)
	}
	if !sawEmailSet || !sawSubmission {
		t.Fatal("expected Email/set and EmailSubmission/set")
	}
}

func TestSendReadsLargeSessionDocument(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/jmap/session") {
			padding := strings.Repeat("x", 6000)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"apiUrl": serverURL(r),
				"primaryAccounts": map[string]string{
					"urn:ietf:params:jmap:mail": "acct-1",
				},
				"accounts":     map[string]any{"acct-1": map[string]any{}},
				"capabilities": map[string]any{"pad": padding},
			})
			return
		}
		body, _ := io.ReadAll(r.Body)
		payload := string(body)
		if strings.Contains(payload, "Mailbox/get") {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"methodResponses": []any{
					[]any{"Mailbox/get", map[string]any{"list": []any{
						map[string]any{"id": "mb-drafts", "role": "drafts", "name": "Drafts"},
					}}, "m"},
					[]any{"Identity/get", map[string]any{"list": []any{
						map[string]any{"id": "ident-1", "email": "noreply@solace.onl"},
					}}, "i"},
				},
			})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"methodResponses": []any{
				[]any{"Email/set", map[string]any{"created": map[string]any{"draft1": map[string]any{"id": "e1"}}}, "c1"},
				[]any{"EmailSubmission/set", map[string]any{"created": map[string]any{"s1": map[string]any{"id": "sub-1"}}}, "c2"},
			},
		})
	}))
	defer server.Close()

	client := NewClient(Config{
		BaseURL:  server.URL,
		Username: "noreply@solace.onl",
		Password: "secret",
		From:     "noreply@solace.onl",
		FromName: "Solace",
		HTTP:     server.Client(),
	})
	id, err := client.Send(context.Background(), Message{
		To: "user@example.com", Subject: "Hello", Text: "Hi", HTML: "<p>Hi</p>",
	})
	if err != nil {
		t.Fatal(err)
	}
	if id != "sub-1" {
		t.Fatalf("got %s", id)
	}
}

func TestSendFailsWhenIdentityMissing(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/jmap/session") {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"apiUrl":          serverURL(r),
				"primaryAccounts": map[string]string{"urn:ietf:params:jmap:mail": "acct-1"},
				"accounts":        map[string]any{"acct-1": map[string]any{}},
			})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"methodResponses": []any{
				[]any{"Mailbox/get", map[string]any{"list": []any{
					map[string]any{"id": "mb-drafts", "role": "drafts", "name": "Drafts"},
				}}, "m"},
				[]any{"Identity/get", map[string]any{"list": []any{}}, "i"},
			},
		})
	}))
	defer server.Close()

	client := NewClient(Config{
		BaseURL:  server.URL,
		Username: "noreply@solace.onl",
		Password: "secret",
		From:     "noreply@solace.onl",
		FromName: "Solace",
		HTTP:     server.Client(),
	})
	_, err := client.Send(context.Background(), Message{To: "user@example.com", Subject: "Hello", Text: "Hi", HTML: "<p>Hi</p>"})
	if err == nil || !strings.Contains(err.Error(), "identity was not found") {
		t.Fatalf("expected missing identity error, got %v", err)
	}
}

func serverURL(r *http.Request) string {
	return "http://" + r.Host + "/jmap/"
}
