package email

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const defaultJMAPURL = "https://mail.solace.onl"

type Config struct {
	BaseURL  string
	Username string
	Password string
	From     string
	FromName string
	HTTP     *http.Client
}

type Message struct {
	To      string
	Subject string
	Text    string
	HTML    string
}

type Client struct {
	config Config
	http   *http.Client
}

func NewClient(config Config) *Client {
	httpClient := config.HTTP
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 15 * time.Second}
	}
	return &Client{config: config, http: httpClient}
}

func (c *Client) configured() bool {
	return strings.TrimSpace(c.config.Username) != "" &&
		strings.TrimSpace(c.config.Password) != "" &&
		strings.TrimSpace(c.config.From) != ""
}

func (c *Client) Send(ctx context.Context, message Message) (string, error) {
	if !c.configured() {
		return "", fmt.Errorf("email service not configured")
	}
	if strings.TrimSpace(message.To) == "" {
		return "", fmt.Errorf("user email is required")
	}

	authorization := "Basic " + base64.StdEncoding.EncodeToString([]byte(c.config.Username+":"+c.config.Password))
	base := strings.TrimRight(c.config.BaseURL, "/")
	if base == "" {
		base = defaultJMAPURL
	}

	session, err := c.discoverSession(ctx, base, authorization)
	if err != nil {
		return "", err
	}
	contextIDs, err := c.loadSendContext(ctx, session.APIURL, authorization, session.MailAccountID)
	if err != nil {
		return "", err
	}

	envelope, err := c.jmapCall(ctx, session.APIURL, authorization, buildSendCalls(sendCallInput{
		mailAccountID:       session.MailAccountID,
		submissionAccountID: session.SubmissionAccountID,
		draftsID:            contextIDs.draftsID,
		sentID:              contextIDs.sentID,
		identityID:          contextIDs.identityID,
		from:                c.config.From,
		fromName:            c.config.FromName,
		to:                  message.To,
		subject:             message.Subject,
		text:                message.Text,
		html:                message.HTML,
	}))
	if err != nil {
		return "", err
	}
	if err := assertJMAPSuccess(envelope, "Stalwart email send"); err != nil {
		return "", err
	}

	submission, err := methodResult(envelope, "EmailSubmission/set")
	if err != nil {
		return "", err
	}
	created, _ := submission["created"].(map[string]any)
	s1, _ := created["s1"].(map[string]any)
	id, _ := s1["id"].(string)
	if id == "" {
		return "", fmt.Errorf("Stalwart did not queue the message for delivery")
	}
	return id, nil
}

type jmapSession struct {
	APIURL              string
	MailAccountID       string
	SubmissionAccountID string
}

type sendContext struct {
	draftsID   string
	sentID     string
	identityID string
}

func (c *Client) discoverSession(ctx context.Context, base, authorization string) (*jmapSession, error) {
	urls := []string{base + "/jmap/session", base + "/.well-known/jmap"}
	var lastStatus int
	var lastDetail string
	for _, endpoint := range urls {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", authorization)
		req.Header.Set("Accept", "application/json")
		resp, err := c.http.Do(req)
		if err != nil {
			return nil, err
		}
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		_ = resp.Body.Close()
		if resp.StatusCode == http.StatusUnauthorized {
			return nil, fmt.Errorf("Stalwart JMAP authentication failed")
		}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			lastStatus = resp.StatusCode
			lastDetail = string(body)
			continue
		}
		var parsed struct {
			APIURL           string            `json:"apiUrl"`
			PrimaryAccounts  map[string]string `json:"primaryAccounts"`
			Accounts         map[string]any    `json:"accounts"`
		}
		if err := json.Unmarshal(body, &parsed); err != nil {
			return nil, fmt.Errorf("Stalwart JMAP returned a non-JSON response (%s)", resp.Header.Get("Content-Type"))
		}
		mailAccountID := parsed.PrimaryAccounts["urn:ietf:params:jmap:mail"]
		if mailAccountID == "" {
			mailAccountID = parsed.PrimaryAccounts["urn:stalwart:jmap"]
		}
		if mailAccountID == "" {
			for id := range parsed.Accounts {
				mailAccountID = id
				break
			}
		}
		if mailAccountID == "" {
			return nil, fmt.Errorf("Stalwart JMAP session did not include a mail account")
		}
		submissionID := parsed.PrimaryAccounts["urn:ietf:params:jmap:submission"]
		if submissionID == "" {
			submissionID = mailAccountID
		}
		return &jmapSession{
			APIURL:              rewriteToPublicOrigin(parsed.APIURL, base),
			MailAccountID:       mailAccountID,
			SubmissionAccountID: submissionID,
		}, nil
	}
	return nil, fmt.Errorf("Stalwart JMAP session failed (%d)%s", lastStatus, lastDetail)
}

func rewriteToPublicOrigin(raw, publicBase string) string {
	fallback := publicBase + "/jmap/"
	if raw == "" {
		return fallback
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Host == "" {
		return fallback
	}
	base, err := url.Parse(publicBase)
	if err != nil {
		return fallback
	}
	parsed.Scheme = base.Scheme
	parsed.Host = base.Host
	return parsed.String()
}

func (c *Client) jmapCall(ctx context.Context, apiURL, authorization string, methodCalls []any) (map[string]any, error) {
	payload, err := json.Marshal(map[string]any{
		"using": []string{
			"urn:ietf:params:jmap:core",
			"urn:ietf:params:jmap:mail",
			"urn:ietf:params:jmap:submission",
		},
		"methodCalls": methodCalls,
	})
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", authorization)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("Stalwart JMAP request failed (%d)", resp.StatusCode)
	}
	var envelope map[string]any
	if err := json.Unmarshal(body, &envelope); err != nil {
		return nil, fmt.Errorf("Stalwart JMAP returned a non-JSON response")
	}
	return envelope, nil
}

func (c *Client) loadSendContext(ctx context.Context, apiURL, authorization, mailAccountID string) (*sendContext, error) {
	envelope, err := c.jmapCall(ctx, apiURL, authorization, []any{
		[]any{"Mailbox/get", map[string]any{"accountId": mailAccountID, "ids": nil, "properties": []string{"id", "role", "name"}}, "m"},
		[]any{"Identity/get", map[string]any{"accountId": mailAccountID}, "i"},
	})
	if err != nil {
		return nil, err
	}
	if err := assertJMAPSuccess(envelope, "Stalwart mailbox lookup"); err != nil {
		return nil, err
	}
	mailboxes, err := methodResult(envelope, "Mailbox/get")
	if err != nil {
		return nil, err
	}
	identities, err := methodResult(envelope, "Identity/get")
	if err != nil {
		return nil, err
	}
	draftsID := pickMailboxID(mailboxes, "drafts")
	if draftsID == "" {
		return nil, fmt.Errorf("Stalwart mailbox has no Drafts folder")
	}
	identityID := pickIdentityID(identities, c.config.From)
	if identityID == "" {
		return nil, fmt.Errorf("Stalwart identity was not found; create it on the sending mailbox")
	}
	return &sendContext{
		draftsID:   draftsID,
		sentID:     pickMailboxID(mailboxes, "sent"),
		identityID: identityID,
	}, nil
}

func pickMailboxID(result map[string]any, role string) string {
	list, _ := result["list"].([]any)
	wanted := strings.ToLower(role)
	for _, item := range list {
		mailbox, _ := item.(map[string]any)
		id, _ := mailbox["id"].(string)
		mailboxRole, _ := mailbox["role"].(string)
		name, _ := mailbox["name"].(string)
		if strings.EqualFold(mailboxRole, wanted) || strings.EqualFold(name, wanted) {
			return id
		}
	}
	return ""
}

func pickIdentityID(result map[string]any, from string) string {
	list, _ := result["list"].([]any)
	needle := strings.ToLower(strings.TrimSpace(from))
	for _, item := range list {
		identity, _ := item.(map[string]any)
		email, _ := identity["email"].(string)
		if strings.ToLower(strings.TrimSpace(email)) == needle {
			id, _ := identity["id"].(string)
			return id
		}
	}
	return ""
}

type sendCallInput struct {
	mailAccountID, submissionAccountID, draftsID, sentID, identityID string
	from, fromName, to, subject, text, html                          string
}

func buildSendCalls(input sendCallInput) []any {
	submissionCreate := map[string]any{
		"emailId":    "#draft1",
		"identityId": input.identityID,
		"envelope": map[string]any{
			"mailFrom": map[string]any{"email": input.from},
			"rcptTo":   []any{map[string]any{"email": input.to}},
		},
	}
	submission := map[string]any{
		"accountId": input.submissionAccountID,
		"create":    map[string]any{"s1": submissionCreate},
	}
	if input.sentID != "" {
		submission["onSuccessUpdateEmail"] = map[string]any{
			"#s1": map[string]any{
				"mailboxIds/" + input.sentID:   true,
				"mailboxIds/" + input.draftsID: nil,
				"keywords/$draft":              nil,
			},
		}
	}
	return []any{
		[]any{"Email/set", map[string]any{
			"accountId": input.mailAccountID,
			"create": map[string]any{
				"draft1": map[string]any{
					"mailboxIds": map[string]any{input.draftsID: true},
					"keywords":   map[string]any{"$seen": true, "$draft": true},
					"from":       []any{map[string]any{"name": input.fromName, "email": input.from}},
					"to":         []any{map[string]any{"email": input.to}},
					"subject":    input.subject,
					"bodyValues": map[string]any{
						"text": map[string]any{"value": input.text},
						"html": map[string]any{"value": input.html},
					},
					"textBody": []any{map[string]any{"partId": "text", "type": "text/plain"}},
					"htmlBody": []any{map[string]any{"partId": "html", "type": "text/html"}},
				},
			},
		}, "c1"},
		[]any{"EmailSubmission/set", submission, "c2"},
	}
}

func methodResult(envelope map[string]any, method string) (map[string]any, error) {
	responses, _ := envelope["methodResponses"].([]any)
	for _, item := range responses {
		entry, _ := item.([]any)
		if len(entry) < 2 {
			continue
		}
		name, _ := entry[0].(string)
		if name == method {
			result, _ := entry[1].(map[string]any)
			if result == nil {
				return nil, fmt.Errorf("Expected %s in JMAP response", method)
			}
			return result, nil
		}
	}
	return nil, fmt.Errorf("Expected %s in JMAP response", method)
}

func assertJMAPSuccess(envelope map[string]any, context string) error {
	responses, _ := envelope["methodResponses"].([]any)
	if len(responses) == 0 {
		return fmt.Errorf("%s: empty JMAP response", context)
	}
	for _, item := range responses {
		entry, _ := item.([]any)
		if len(entry) < 2 {
			continue
		}
		name, _ := entry[0].(string)
		result, _ := entry[1].(map[string]any)
		if name == "error" || strings.HasSuffix(name, "/error") {
			return fmt.Errorf("%s", context)
		}
		if _, ok := result["notCreated"]; ok {
			return fmt.Errorf("%s", name)
		}
	}
	return nil
}
