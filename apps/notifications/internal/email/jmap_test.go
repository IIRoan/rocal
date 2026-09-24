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

func TestSendSetsMessageIDOnlyWhenPrefixIsGiven(t *testing.T) {
	var drafts []map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/jmap/session") {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"apiUrl":          serverURL(r),
				"primaryAccounts": map[string]string{"urn:ietf:params:jmap:mail": "acct-1"},
				"accounts":        map[string]any{"acct-1": map[string]any{}},
			})
			return
		}
		var request struct {
			MethodCalls [][]json.RawMessage `json:"methodCalls"`
		}
		_ = json.NewDecoder(r.Body).Decode(&request)
		var method string
		_ = json.Unmarshal(request.MethodCalls[0][0], &method)
		if method == "Mailbox/get" {
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
		var params struct {
			Create map[string]map[string]any `json:"create"`
		}
		_ = json.Unmarshal(request.MethodCalls[0][1], &params)
		drafts = append(drafts, params.Create["draft1"])
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
	message := Message{To: "owner@solace.onl", Subject: "Event reminder in 15 minutes", Text: "Hi", HTML: "<p>Hi</p>"}
	if _, err := client.Send(context.Background(), message); err != nil {
		t.Fatal(err)
	}
	message.MessageIDPrefix = "solace-reminder."
	if _, err := client.Send(context.Background(), message); err != nil {
		t.Fatal(err)
	}

	if len(drafts) != 2 {
		t.Fatalf("expected two drafts, got %d", len(drafts))
	}
	if _, present := drafts[0]["messageId"]; present {
		t.Fatalf("plain mail must let Stalwart generate the Message-ID, got %#v", drafts[0]["messageId"])
	}
	ids, _ := drafts[1]["messageId"].([]any)
	if len(ids) != 1 {
		t.Fatalf("expected one Message-ID on the tagged mail, got %#v", drafts[1]["messageId"])
	}
	id, _ := ids[0].(string)
	if !strings.HasPrefix(id, "solace-reminder.") || !strings.HasSuffix(id, "@solace.onl") {
		t.Fatalf("unexpected Message-ID %q", id)
	}
}

func TestBuildMessageID(t *testing.T) {
	id, err := buildMessageID("solace-reminder.", "noreply@solace.onl")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(id, "solace-reminder.") || !strings.HasSuffix(id, "@solace.onl") {
		t.Fatalf("unexpected Message-ID %q", id)
	}
	if other, _ := buildMessageID("solace-reminder.", "noreply@solace.onl"); other == id {
		t.Fatal("expected unique Message-IDs")
	}

	if id, err := buildMessageID("", "noreply@solace.onl"); err != nil || id != "" {
		t.Fatalf("expected no Message-ID without a prefix, got %q, %v", id, err)
	}
	if _, err := buildMessageID("solace-reminder.", "noreply"); err == nil {
		t.Fatal("expected an error for a sender without a domain")
	}
}

func TestBuildSendCallsSetsMessageIDOnlyWhenProvided(t *testing.T) {
	draftOf := func(calls []any) map[string]any {
		emailSet := calls[0].([]any)[1].(map[string]any)
		return emailSet["create"].(map[string]any)["draft1"].(map[string]any)
	}

	withID := draftOf(buildSendCalls(sendCallInput{draftsID: "d", messageID: "solace-reminder.abc@solace.onl"}))
	ids, ok := withID["messageId"].([]any)
	if !ok || len(ids) != 1 || ids[0] != "solace-reminder.abc@solace.onl" {
		t.Fatalf("expected messageId on draft, got %#v", withID["messageId"])
	}

	withoutID := draftOf(buildSendCalls(sendCallInput{draftsID: "d"}))
	if _, present := withoutID["messageId"]; present {
		t.Fatal("expected no messageId when none is provided")
	}
}

func serverURL(r *http.Request) string {
	return "http://" + r.Host + "/jmap/"
}
