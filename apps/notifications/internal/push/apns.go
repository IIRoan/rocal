package push

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

type Device struct {
	Token       string
	BundleID    string
	Environment string
}

type Alert struct {
	Title string
	Body  string
}

type Notification struct {
	Alert      Alert
	CollapseID string
	Type       string
	EventID    string
}

type Result struct {
	StatusCode   int
	Reason       string
	Unregistered bool
}

type Client struct {
	keyID   string
	teamID  string
	key     *ecdsa.PrivateKey
	http    *http.Client
	mu      sync.Mutex
	token   string
	tokenAt time.Time
}

func ParseAuthKey(pemBytes []byte) (*ecdsa.PrivateKey, error) {
	block, _ := pem.Decode(pemBytes)
	if block == nil {
		return nil, fmt.Errorf("APNs auth key is not valid PEM")
	}
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("APNs auth key could not be parsed")
	}
	key, ok := parsed.(*ecdsa.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("APNs auth key is not ECDSA")
	}
	return key, nil
}

func NewClient(keyID, teamID string, key *ecdsa.PrivateKey, httpClient *http.Client) *Client {
	if httpClient == nil {
		httpClient = &http.Client{
			Timeout: 15 * time.Second,
			Transport: &http.Transport{
				ForceAttemptHTTP2: true,
				TLSClientConfig:   &tls.Config{MinVersion: tls.VersionTLS12},
			},
		}
	}
	return &Client{keyID: keyID, teamID: teamID, key: key, http: httpClient}
}

func MetadataPayload(n Notification) map[string]any {
	payload := map[string]any{
		"aps": map[string]any{
			"alert": map[string]any{
				"title": n.Alert.Title,
				"body":  n.Alert.Body,
			},
			"sound": "default",
		},
		"t": n.Type,
	}
	if n.EventID != "" {
		payload["eid"] = n.EventID
	}
	return payload
}

func EventReminder(minutesBefore int, eventID, title string) Notification {
	alertTitle := "Event reminder"
	if trimmed := strings.TrimSpace(title); trimmed != "" {
		alertTitle = trimmed
	}
	body := "Starting now"
	if minutesBefore > 0 {
		body = fmt.Sprintf("Starts in %d minutes", minutesBefore)
		if minutesBefore == 1 {
			body = "Starts in 1 minute"
		}
	}
	return Notification{
		Alert:      Alert{Title: alertTitle, Body: body},
		CollapseID: "event:" + eventID,
		Type:       "event",
		EventID:    eventID,
	}
}

func NewMail(count int, fromName, subject string) Notification {
	fromName = strings.TrimSpace(fromName)
	subject = strings.TrimSpace(subject)
	title := "New email"
	body := "You have a new message"
	if count > 1 {
		body = fmt.Sprintf("%d new emails", count)
	} else if fromName != "" {
		title = fromName
		if subject != "" {
			body = subject
		} else {
			body = "New email"
		}
	} else if subject != "" {
		body = subject
	}
	return Notification{
		Alert:      Alert{Title: title, Body: body},
		CollapseID: "mail",
		Type:       "mail",
	}
}

func (c *Client) Send(device Device, notification Notification) (Result, error) {
	if c == nil || c.key == nil {
		return Result{}, fmt.Errorf("push service not configured")
	}
	host := "https://api.push.apple.com"
	if device.Environment == "sandbox" {
		host = "https://api.sandbox.push.apple.com"
	}
	jwt, err := c.bearer()
	if err != nil {
		return Result{}, err
	}
	body, err := json.Marshal(MetadataPayload(notification))
	if err != nil {
		return Result{}, err
	}
	req, err := http.NewRequest(http.MethodPost, host+"/3/device/"+device.Token, bytes.NewReader(body))
	if err != nil {
		return Result{}, err
	}
	req.Header.Set("authorization", "bearer "+jwt)
	req.Header.Set("apns-topic", device.BundleID)
	req.Header.Set("apns-push-type", "alert")
	req.Header.Set("apns-priority", "10")
	if notification.CollapseID != "" {
		req.Header.Set("apns-collapse-id", notification.CollapseID)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return Result{}, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
	reason := ""
	if len(raw) > 0 {
		var parsed struct {
			Reason string `json:"reason"`
		}
		_ = json.Unmarshal(raw, &parsed)
		reason = parsed.Reason
	}
	unregistered := resp.StatusCode == http.StatusGone ||
		strings.EqualFold(reason, "Unregistered")
	return Result{StatusCode: resp.StatusCode, Reason: reason, Unregistered: unregistered}, nil
}

func AlternateEnvironment(environment string) string {
	if strings.EqualFold(strings.TrimSpace(environment), "sandbox") {
		return "production"
	}
	return "sandbox"
}

func (c *Client) SendPreferring(device Device, notification Notification) (Result, Device, error) {
	used := device
	result, err := c.Send(used, notification)
	if err != nil {
		return result, used, err
	}
	if result.StatusCode < 400 || !strings.EqualFold(result.Reason, "BadDeviceToken") {
		return result, used, nil
	}
	used.Environment = AlternateEnvironment(device.Environment)
	result, err = c.Send(used, notification)
	return result, used, err
}

func (c *Client) bearer() (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.token != "" && time.Since(c.tokenAt) < 50*time.Minute {
		return c.token, nil
	}
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"ES256","kid":"` + c.keyID + `"}`))
	claims := base64.RawURLEncoding.EncodeToString([]byte(fmt.Sprintf(`{"iss":"%s","iat":%d}`, c.teamID, time.Now().Unix())))
	signingInput := header + "." + claims
	digest := sha256.Sum256([]byte(signingInput))
	r, s, err := ecdsa.Sign(rand.Reader, c.key, digest[:])
	if err != nil {
		return "", err
	}
	curveSize := (elliptic.P256().Params().BitSize + 7) / 8
	sig := append(r.FillBytes(make([]byte, curveSize)), s.FillBytes(make([]byte, curveSize))...)
	token := signingInput + "." + base64.RawURLEncoding.EncodeToString(sig)
	c.token = token
	c.tokenAt = time.Now()
	return token, nil
}

func GenerateTestKeyPEM() ([]byte, error) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, err
	}
	der, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		return nil, err
	}
	return pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}), nil
}
