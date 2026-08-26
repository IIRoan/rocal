package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net/http"
	"net/mail"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"github.com/robfig/cron/v3"

	"notifications/internal/email"
	"notifications/internal/jobs"
	"notifications/internal/logger"
	"notifications/internal/push"
	"notifications/internal/schedule"
	"notifications/templates"
)

var errJobSkipped = errors.New("notification job skipped")

type NotificationStatus struct {
	IsRunning            bool                `json:"isRunning"`
	PendingNotifications int                 `json:"pendingNotifications"`
	LastProcessedAt      *time.Time          `json:"lastProcessedAt,omitempty"`
	ProcessedCount       int                 `json:"processedCount"`
	FailedCount          int                 `json:"failedCount"`
	Errors               []NotificationError `json:"errors"`
}

type NotificationError struct {
	Error     string    `json:"error"`
	Timestamp time.Time `json:"timestamp"`
}

type EmailContent struct {
	HTML string `json:"html"`
	Text string `json:"text"`
}

type EventData struct {
	Title           string
	Start           time.Time
	End             time.Time
	AllDay          bool
	EncryptionState string
	Location        string
	CalendarName    string
	Description     string
	CategoryName    string
	CategoryColor   string
}

type UserData struct {
	Name     string
	Email    string
	TimeZone string
}

type NotificationServer struct {
	isRunning       bool
	cron            *cron.Cron
	db              *sql.DB
	processedCount  int
	failedCount     int
	errors          []NotificationError
	lastProcessedAt *time.Time
	mailer          *email.Client
	pusher          *push.Client
	maxErrors       int
	log             logger.Logger
}

func NewNotificationServer() *NotificationServer {
	return &NotificationServer{
		cron:      cron.New(cron.WithSeconds()),
		maxErrors: 50,
		errors:    make([]NotificationError, 0),
		log:       logger.New("notifications"),
	}
}

func loadEnv() {
	log := logger.New("notifications")
	files := discoverEnvFiles()
	if len(files) == 0 {
		log.Warn("Could not load .env file: none found in cwd, parent dirs, or apps/backend")
	} else {
		loaded := make([]string, 0, len(files))
		for _, file := range files {
			if err := applyEnvFile(file, envSkipKeys(file)); err != nil {
				log.Warn("Could not load %s: %v", file, err)
				continue
			}
			loaded = append(loaded, file)
		}
		if len(loaded) > 0 {
			log.OK("Environment variables loaded from %s", strings.Join(relEnvPaths(loaded), ", "))
		}
	}

	log.Step("Environment check")
	log.Info("DATABASE_URL present: %t", os.Getenv("DATABASE_URL") != "")
	log.Info("STALWART_JMAP_USERNAME present: %t", os.Getenv("STALWART_JMAP_USERNAME") != "")
	log.Info("APNS_KEY_ID present: %t", os.Getenv("APNS_KEY_ID") != "")
	if from, err := resolveBaseFromAddress(); err == nil && from != "" {
		log.Info("Using email sender address: %s", from)
	}
}

func isSharedBackendEnv(path string) bool {
	return filepath.Base(path) == ".env" && filepath.Base(filepath.Dir(path)) == "backend"
}

func envSkipKeys(path string) map[string]struct{} {
	if !isSharedBackendEnv(path) {
		return nil
	}
	return map[string]struct{}{"PORT": {}}
}

func applyEnvFile(path string, skip map[string]struct{}) error {
	values, err := godotenv.Read(path)
	if err != nil {
		return err
	}
	for key, value := range values {
		if _, omit := skip[key]; omit {
			continue
		}
		if os.Getenv(key) != "" {
			continue
		}
		if err := os.Setenv(key, value); err != nil {
			return err
		}
	}
	return nil
}

func discoverEnvFiles() []string {
	wd, err := os.Getwd()
	if err != nil {
		return nil
	}

	var files []string
	seen := map[string]struct{}{}
	addIfExists := func(path string) {
		abs, err := filepath.Abs(path)
		if err != nil {
			return
		}
		info, err := os.Stat(abs)
		if err != nil || info.IsDir() {
			return
		}
		if _, ok := seen[abs]; ok {
			return
		}
		seen[abs] = struct{}{}
		files = append(files, abs)
	}

	dir := wd
	for range 8 {
		addIfExists(filepath.Join(dir, ".env"))
		addIfExists(filepath.Join(dir, "backend", ".env"))
		addIfExists(filepath.Join(dir, "apps", "backend", ".env"))
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return files
}

func relEnvPaths(files []string) []string {
	wd, err := os.Getwd()
	if err != nil {
		return files
	}
	out := make([]string, 0, len(files))
	for _, file := range files {
		rel, err := filepath.Rel(wd, file)
		if err != nil {
			out = append(out, file)
			continue
		}
		out = append(out, rel)
	}
	return out
}

func (ns *NotificationServer) initMailer() {
	username := strings.TrimSpace(os.Getenv("STALWART_JMAP_USERNAME"))
	password := os.Getenv("STALWART_JMAP_PASSWORD")
	from, _ := resolveBaseFromAddress()
	if username == "" || password == "" || from == "" {
		ns.log.Warn("Stalwart JMAP mailer is not fully configured; email sending is disabled")
		return
	}

	fromName := strings.TrimSpace(os.Getenv("EMAIL_FROM_NAME"))
	if fromName == "" {
		fromName = "Solace"
	}
	baseURL := strings.TrimSpace(os.Getenv("STALWART_JMAP_URL"))
	if baseURL == "" {
		baseURL = strings.TrimSpace(os.Getenv("STALWART_BASE_URL"))
	}

	ns.mailer = email.NewClient(email.Config{
		BaseURL:  baseURL,
		Username: username,
		Password: password,
		From:     from,
		FromName: fromName,
	})
	ns.log.OK("Stalwart JMAP mailer initialized")
	ns.log.Info("Using email sender address: %s", from)
}

func (ns *NotificationServer) initPush() {
	cfg, missing, err := loadAPNsConfig()
	if err != nil {
		ns.log.Warn("APNs auth key could not be loaded; push sending is disabled")
		return
	}
	if len(missing) > 0 {
		ns.log.Warn("APNs is not fully configured (missing %s); push sending is disabled", strings.Join(missing, ", "))
		return
	}
	key, err := push.ParseAuthKey(cfg.pem)
	if err != nil {
		ns.log.Warn("APNs auth key could not be parsed; push sending is disabled")
		return
	}
	ns.pusher = push.NewClient(cfg.keyID, cfg.teamID, key, nil)
	ns.log.OK("APNs client initialized")
}

type apnsConfig struct {
	keyID  string
	teamID string
	pem    []byte
}

func loadAPNsConfig() (apnsConfig, []string, error) {
	cfg := apnsConfig{
		keyID:  strings.TrimSpace(os.Getenv("APNS_KEY_ID")),
		teamID: strings.TrimSpace(os.Getenv("APNS_TEAM_ID")),
	}
	pem, err := readAPNsAuthKey()
	if err != nil {
		return cfg, nil, err
	}
	cfg.pem = pem

	var missing []string
	if cfg.keyID == "" {
		missing = append(missing, "APNS_KEY_ID")
	}
	if cfg.teamID == "" {
		missing = append(missing, "APNS_TEAM_ID")
	}
	if len(bytesTrimSpace(cfg.pem)) == 0 {
		if strings.TrimSpace(os.Getenv("APNS_AUTH_KEY_FILE")) != "" {
			missing = append(missing, "APNS_AUTH_KEY_FILE")
		} else {
			missing = append(missing, "APNS_AUTH_KEY")
		}
	}
	return cfg, missing, nil
}

func readAPNsAuthKey() ([]byte, error) {
	if pem := strings.TrimSpace(os.Getenv("APNS_AUTH_KEY")); pem != "" {
		return normalizeAPNsPEM([]byte(pem)), nil
	}
	path := strings.TrimSpace(os.Getenv("APNS_AUTH_KEY_FILE"))
	if path == "" {
		return nil, nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("APNS_AUTH_KEY_FILE: %w", err)
	}
	return normalizeAPNsPEM(data), nil
}

func normalizeAPNsPEM(raw []byte) []byte {
	s := strings.TrimSpace(string(raw))
	if s == "" {
		return nil
	}
	if strings.Contains(s, "BEGIN") {
		return []byte(s)
	}
	return []byte("-----BEGIN PRIVATE KEY-----\n" + s + "\n-----END PRIVATE KEY-----")
}

func bytesTrimSpace(value []byte) []byte {
	return []byte(strings.TrimSpace(string(value)))
}

func (ns *NotificationServer) initDB() error {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return fmt.Errorf("DATABASE_URL not found")
	}

	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return fmt.Errorf("failed to connect to database: %w", err)
	}

	ns.db = db
	ns.log.OK("Database connection initialized")
	return nil
}

func (ns *NotificationServer) Start() error {
	if ns.isRunning {
		return nil
	}

	if err := ns.initDB(); err != nil {
		return err
	}

	ns.isRunning = true
	ns.initMailer()
	ns.initPush()

	_, err := ns.cron.AddFunc("*/15 * * * * *", func() {
		if err := ns.processScheduledNotifications(); err != nil {
			ns.failedCount++
			ns.addError(err.Error())
			ns.log.Err("Scheduled processing failed: %v", err)
		}
	})
	if err != nil {
		return fmt.Errorf("failed to schedule notification processor: %w", err)
	}

	ns.cron.Start()
	ns.log.OK("Notification server started")
	return nil
}

func (ns *NotificationServer) Stop() {
	if !ns.isRunning {
		return
	}

	ns.isRunning = false
	ctx := ns.cron.Stop()
	<-ctx.Done()
	if ns.db != nil {
		if err := ns.db.Close(); err != nil {
			ns.log.Warn("Failed to close database connection: %v", err)
		}
		ns.db = nil
	}
	ns.log.OK("Notification server stopped")
}

func (ns *NotificationServer) Shutdown() {
	ns.log.Info("Shutting down notification server")
	ns.Stop()
}

func (ns *NotificationServer) addError(message string) {
	ns.errors = append(ns.errors, NotificationError{
		Error:     message,
		Timestamp: time.Now(),
	})

	if len(ns.errors) > ns.maxErrors {
		ns.errors = ns.errors[1:]
	}
}

func (ns *NotificationServer) processScheduledNotifications() error {
	now := time.Now()
	ns.lastProcessedAt = &now

	if ns.db == nil {
		return fmt.Errorf("database service not configured")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	due, dueErr := schedule.ClaimDue(ctx, ns.db, now)
	if dueErr != nil {
		ns.failedCount++
		ns.addError(dueErr.Error())
		ns.log.Err("Failed to claim due reminder schedules: %v", dueErr)
	} else if len(due) > 0 {
		ns.log.Info("Claimed %d due reminder schedule(s)", len(due))
	}

	claimed, err := jobs.ClaimPending(ctx, ns.db, 50)
	if err != nil {
		if dueErr != nil {
			return fmt.Errorf("%v; %w", dueErr, err)
		}
		return err
	}
	if len(claimed) == 0 {
		if dueErr != nil {
			return dueErr
		}
		ns.log.Info("Notification tick executed - no due jobs")
		return nil
	}

	processed := 0
	skipped := 0
	failed := 0
	for _, job := range claimed {
		if err := ns.dispatchJob(ctx, job); err != nil {
			if errors.Is(err, errJobSkipped) {
				skipped++
				continue
			}
			failed++
			ns.failedCount++
			ns.addError(err.Error())
			ns.log.Err("Failed to send %s %s job: %v", job.Kind, job.Channel, err)
			if logErr := jobs.InsertLog(ctx, ns.db, job, "failed"); logErr != nil {
				ns.log.Warn("Failed to write notification failure log for %s: %v", job.ID, logErr)
			}
			_ = jobs.MarkFailed(ctx, ns.db, job.ID, jobs.RetryDelay(job.Attempts), err.Error())
			continue
		}
		if err := jobs.MarkSent(ctx, ns.db, job.ID); err != nil {
			ns.log.Warn("Job %s sent but could not be marked sent: %v", job.ID, err)
		}
		if err := jobs.InsertLog(ctx, ns.db, job, "sent"); err != nil {
			ns.log.Warn("Failed to write notification success log for %s: %v", job.ID, err)
		}
		processed++
	}

	ns.log.OK("Notification processing complete: %d sent, %d skipped, %d failed", processed, skipped, failed)
	return dueErr
}

func (ns *NotificationServer) dispatchJob(ctx context.Context, job jobs.Job) error {
	if job.Attempts >= jobs.MaxAttempts {
		return ns.skipJob(ctx, job, "max delivery attempts exceeded")
	}
	switch job.Channel {
	case "email":
		return ns.dispatchEmailJob(ctx, job)
	case "push":
		return ns.dispatchPushJob(ctx, job)
	default:
		return ns.skipJob(ctx, job, "unknown channel")
	}
}

func (ns *NotificationServer) skipJob(ctx context.Context, job jobs.Job, reason string) error {
	ns.log.Info("Skipped %s %s job: %s", job.Kind, job.Channel, reason)
	if ns.db != nil {
		_ = jobs.MarkSkipped(ctx, ns.db, job.ID)
	}
	return errJobSkipped
}

func (ns *NotificationServer) dispatchEmailJob(ctx context.Context, job jobs.Job) error {
	if ns.mailer == nil {
		return ns.skipJob(ctx, job, "email sending is not configured")
	}
	eventID := job.Payload.EventID
	if eventID == "" && job.EventID.Valid {
		eventID = job.EventID.String
	}
	event, user, err := jobs.LoadReminder(ctx, ns.db, eventID, job.UserID)
	if err != nil {
		return err
	}
	return ns.sendEmailNotification(ctx, EventData{
		Title:           event.Title,
		Start:           event.Start,
		End:             event.End,
		AllDay:          event.AllDay,
		EncryptionState: event.EncryptionState,
		Location:        event.Location,
		CalendarName:    event.CalendarName,
		Description:     event.Description,
		CategoryName:    event.CategoryName,
		CategoryColor:   event.CategoryColor,
	}, UserData{Name: user.Name, Email: user.Email, TimeZone: user.TimeZone}, job.MinutesBefore, eventID)
}

func (ns *NotificationServer) dispatchPushJob(ctx context.Context, job jobs.Job) error {
	if ns.pusher == nil {
		return ns.skipJob(ctx, job, "push sending is not configured")
	}
	devices, err := jobs.ListPushDevices(ctx, ns.db, job.UserID)
	if err != nil {
		return err
	}
	if len(devices) == 0 {
		if job.Attempts >= 3 {
			return ns.skipJob(ctx, job, "no registered devices")
		}
		return fmt.Errorf("no registered devices")
	}

	kind := job.Kind
	if kind == "" {
		kind = job.Payload.Kind
	}

	var notification push.Notification
	switch kind {
	case "new_mail":
		count := job.InboundCount
		if count < 1 {
			count = 1
		}
		notification = push.NewMail(count, job.FromName, job.Subject)
		notification.CollapseID = "mail:" + job.ID
	case "event_reminder":
		eventID := job.Payload.EventID
		if eventID == "" && job.EventID.Valid {
			eventID = job.EventID.String
		}
		title := capturedReminderTitle(job.Title)
		if title == "" && eventID != "" && eventID != "test-notification" && eventID != "manual-test" {
			event, _, err := jobs.LoadReminder(ctx, ns.db, eventID, job.UserID)
			if err != nil {
				return err
			}
			title = capturedReminderTitle(event.Title)
		}
		notification = push.EventReminder(job.MinutesBefore, eventID, title)
	default:
		return ns.skipJob(ctx, job, "unknown kind")
	}

	var lastErr error
	sent := 0
	for _, device := range devices {
		if err := ns.sendPushToDevice(ctx, device, notification); err != nil {
			lastErr = err
			continue
		}
		sent++
	}
	if sent == 0 && lastErr != nil {
		return lastErr
	}
	ns.log.Info("Delivered %s push to %d device(s)", kind, sent)
	return nil
}

func (ns *NotificationServer) sendPushToDevice(ctx context.Context, device jobs.PushDevice, notification push.Notification) error {
	result, used, err := ns.pusher.SendPreferring(push.Device{
		Token:       device.Token,
		BundleID:    device.BundleID,
		Environment: device.Environment,
	}, notification)
	if err != nil {
		return err
	}
	if result.Unregistered {
		_ = jobs.DeletePushDevice(ctx, ns.db, device.TokenHash)
		return fmt.Errorf("APNs rejected an unregistered token")
	}
	if result.StatusCode >= 400 {
		if result.Reason != "" {
			return fmt.Errorf("APNs rejected push: %s", result.Reason)
		}
		return fmt.Errorf("APNs rejected push")
	}
	if used.Environment != device.Environment {
		_ = jobs.UpdatePushDeviceEnvironment(ctx, ns.db, device.TokenHash, used.Environment)
	}
	ns.log.Info("APNs accepted %s push env=%s status=%d", notification.Type, used.Environment, result.StatusCode)
	return nil
}

func nullableString(value sql.NullString) string {
	if value.Valid {
		return value.String
	}
	return ""
}

func capturedReminderTitle(title string) string {
	trimmed := strings.TrimSpace(title)
	if trimmed == "" || strings.EqualFold(trimmed, "Encrypted event") {
		return ""
	}
	return trimmed
}

func (ns *NotificationServer) shouldRedactReminderContent(event EventData) bool {
	return strings.TrimSpace(event.EncryptionState) == "encrypted"
}

func (ns *NotificationServer) reminderDisplayTitle(event EventData) string {
	if title := capturedReminderTitle(event.Title); title != "" {
		return title
	}
	if ns.shouldRedactReminderContent(event) {
		return "Encrypted event"
	}
	return ""
}

func (ns *NotificationServer) generateEmailContent(event EventData, user UserData, minutesBefore int, eventID string) (*EmailContent, error) {
	formattedDetails, err := ns.formatEventDetailsForEmail(event, user.TimeZone, minutesBefore)
	if err != nil {
		return nil, err
	}

	eventTitle := ns.reminderDisplayTitle(event)
	if eventTitle == "" {
		eventTitle = "Event reminder"
	}
	eventLocation := event.Location
	calendarName := event.CalendarName
	categoryName := event.CategoryName
	categoryColor := event.CategoryColor
	description := event.Description
	duration := formattedDetails.Duration

	if ns.shouldRedactReminderContent(event) {
		eventLocation = ""
		calendarName = ""
		categoryName = ""
		categoryColor = ""
		description = ""
		duration = ""
	}

	templateData := templates.EmailTemplateData{
		EventID:        eventID,
		EventTitle:     eventTitle,
		EventDate:      formattedDetails.EventDate,
		EventTime:      formattedDetails.EventTime,
		EventLocation:  eventLocation,
		CalendarName:   calendarName,
		CategoryName:   categoryName,
		CategoryColor:  categoryColor,
		Description:    description,
		TimeUntilEvent: formattedDetails.TimeUntilEvent,
		Duration:       duration,
		ReminderText:   formattedDetails.ReminderText,
		UserName:       user.Name,
		UserEmail:      user.Email,
		UserTheme:      "light",
		EventUrl:       buildFrontendURL("/calendar", map[string]string{"eventId": eventID}),
		CalendarUrl:    buildFrontendURL("/calendar", nil),
		SettingsUrl:    buildFrontendURL("/settings", nil),
		PrivacyUrl:     buildFrontendURL("/privacy", nil),
		LogoUrl:        "https://solace.onl/favicon-192x192.png",
	}

	html, err := templates.RenderEventReminder(templateData)
	if err != nil {
		return nil, fmt.Errorf("failed to render html email: %w", err)
	}

	text := templates.GeneratePlainTextEmail(templateData)

	return &EmailContent{
		HTML: html,
		Text: text,
	}, nil
}

type formattedEventDetails struct {
	EventDate      string
	EventTime      string
	TimeUntilEvent string
	ReminderText   string
	Duration       string
}

func (ns *NotificationServer) formatEventDetailsForEmail(event EventData, timezone string, minutesBefore int) (*formattedEventDetails, error) {
	loc := time.UTC
	if timezone != "" {
		if loaded, err := time.LoadLocation(timezone); err == nil {
			loc = loaded
		}
	}

	start := event.Start.In(loc)
	end := event.End.In(loc)
	eventTime := "All day"
	if !event.AllDay {
		if end.After(start) {
			eventTime = fmt.Sprintf("%s - %s", start.Format("3:04 PM"), end.Format("3:04 PM"))
		} else {
			eventTime = start.Format("3:04 PM")
		}
	}

	return &formattedEventDetails{
		EventDate:      start.Format("Monday, Jan 2"),
		EventTime:      eventTime,
		TimeUntilEvent: strings.TrimPrefix(ns.formatReminderText(minutesBefore), "Your event starts in "),
		ReminderText:   ns.formatReminderText(minutesBefore),
		Duration:       ns.calculateEventDuration(event.Start, event.End, event.AllDay),
	}, nil
}

func (ns *NotificationServer) calculateEventDuration(start, end time.Time, allDay bool) string {
	if allDay {
		return "All day"
	}
	if end.Before(start) || end.Equal(start) {
		return ""
	}

	duration := end.Sub(start)
	hours := int(duration.Hours())
	minutes := int(duration.Minutes()) % 60

	if hours > 0 && minutes > 0 {
		return fmt.Sprintf("%dh %dm", hours, minutes)
	}
	if hours > 0 {
		return fmt.Sprintf("%dh", hours)
	}
	if minutes > 0 {
		return fmt.Sprintf("%dm", minutes)
	}

	return ""
}

func (ns *NotificationServer) formatReminderText(minutesBefore int) string {
	if minutesBefore <= 0 {
		return "Your event is starting now"
	}
	if minutesBefore < 60 {
		if minutesBefore == 1 {
			return "Your event starts in 1 minute"
		}
		return fmt.Sprintf("Your event starts in %d minutes", minutesBefore)
	}

	hours := minutesBefore / 60
	remainingMinutes := minutesBefore % 60
	if remainingMinutes == 0 {
		if hours == 1 {
			return "Your event starts in 1 hour"
		}
		return fmt.Sprintf("Your event starts in %d hours", hours)
	}

	return fmt.Sprintf("Your event starts in %dh %dm", hours, remainingMinutes)
}

func (ns *NotificationServer) generateEmailSubject(event EventData, minutesBefore int) string {
	title := ns.reminderDisplayTitle(event)
	if title == "" {
		title = "Event reminder"
	}
	if minutesBefore <= 0 {
		return fmt.Sprintf("%s starting now", title)
	}

	return fmt.Sprintf("%s in %s", title, ns.formatReminderSummary(minutesBefore))
}

func (ns *NotificationServer) sendEmailNotification(ctx context.Context, event EventData, user UserData, minutesBefore int, eventID string) error {
	if ns.mailer == nil {
		return fmt.Errorf("email service not configured")
	}
	if user.Email == "" {
		return fmt.Errorf("user email is required")
	}

	content, err := ns.generateEmailContent(event, user, minutesBefore, eventID)
	if err != nil {
		return err
	}

	id, err := ns.mailer.Send(ctx, email.Message{
		To:      user.Email,
		Subject: ns.generateEmailSubject(event, minutesBefore),
		HTML:    content.HTML,
		Text:    content.Text,
	})
	if err != nil {
		return fmt.Errorf("failed to send email with Stalwart: %w", err)
	}

	ns.log.OK("Email queued successfully: %s", id)
	ns.processedCount++
	return nil
}

func (ns *NotificationServer) getFromAddress(event EventData, minutesBefore int) (string, error) {
	from, err := resolveBaseFromAddress()
	if err != nil {
		return "", err
	}
	if from == "" {
		return "", fmt.Errorf("EMAIL_FROM is not configured; set it to the Stalwart Identity address")
	}

	displayName := ns.senderDisplayName(event, minutesBefore)
	if displayName == "" {
		return from, nil
	}

	return (&mail.Address{Name: displayName, Address: from}).String(), nil
}

func (ns *NotificationServer) senderDisplayName(event EventData, minutesBefore int) string {
	title := sanitizeMailFragment(ns.reminderDisplayTitle(event))
	if title == "" {
		title = "reminder"
	}

	if minutesBefore <= 0 {
		return fmt.Sprintf("%s starting now", title)
	}

	return fmt.Sprintf("%s in %s", title, ns.formatReminderSummary(minutesBefore))
}

func (ns *NotificationServer) formatReminderSummary(minutesBefore int) string {
	if minutesBefore <= 0 {
		return "starting now"
	}

	if minutesBefore < 60 {
		if minutesBefore == 1 {
			return "1 minute"
		}
		return fmt.Sprintf("%d minutes", minutesBefore)
	}

	hours := minutesBefore / 60
	remainingMinutes := minutesBefore % 60
	if remainingMinutes == 0 {
		if hours == 1 {
			return "1 hour"
		}
		return fmt.Sprintf("%d hours", hours)
	}

	minuteLabel := "minutes"
	if remainingMinutes == 1 {
		minuteLabel = "minute"
	}

	if hours == 1 {
		return fmt.Sprintf("1 hour %d %s", remainingMinutes, minuteLabel)
	}

	return fmt.Sprintf("%d hours %d %s", hours, remainingMinutes, minuteLabel)
}

func sanitizeMailFragment(value string) string {
	value = strings.NewReplacer(
		"<", " ",
		">", " ",
		"\"", " ",
		"'", " ",
		":", " ",
		",", " ",
		";", " ",
		"(", " ",
		")", " ",
		"[", " ",
		"]", " ",
		"{", " ",
		"}", " ",
		"/", " ",
		"\\", " ",
		"|", " ",
		"@", " ",
	).Replace(value)

	return strings.TrimSpace(strings.Join(strings.Fields(value), " "))
}

func resolveBaseFromAddress() (string, error) {
	raw := strings.TrimSpace(os.Getenv("EMAIL_FROM"))
	if raw == "" {
		raw = strings.TrimSpace(os.Getenv("EMAIL_FROM_ADDRESS"))
	}
	if raw == "" {
		raw = strings.TrimSpace(os.Getenv("FROM_EMAIL"))
	}
	if raw == "" {
		return "", nil
	}

	parsed, err := mail.ParseAddress(raw)
	if err == nil && parsed.Address != "" {
		return parsed.Address, nil
	}

	if strings.Contains(raw, "@") {
		return raw, nil
	}

	return "", fmt.Errorf("EMAIL_FROM must contain a valid email address")
}

func buildFrontendURL(path string, query map[string]string) string {
	base := strings.TrimRight(strings.TrimSpace(os.Getenv("FRONTEND_URL")), "/")
	if base == "" {
		base = strings.TrimRight(strings.TrimSpace(os.Getenv("NEXT_PUBLIC_APP_URL")), "/")
	}
	if base == "" {
		base = "http://localhost"
	}

	u, err := url.Parse(base)
	if err != nil {
		return base + path
	}

	u.Path = strings.TrimRight(u.Path, "/") + path
	if len(query) > 0 {
		values := u.Query()
		for key, value := range query {
			values.Set(key, value)
		}
		u.RawQuery = values.Encode()
	}

	return u.String()
}

func (ns *NotificationServer) GetStatus() *NotificationStatus {
	pendingCount := 0
	if ns.db != nil {
		count, err := ns.countPendingNotifications()
		if err != nil {
			ns.log.Warn("Failed to count pending notifications: %v", err)
		} else {
			pendingCount = count
		}
	}

	return &NotificationStatus{
		IsRunning:            ns.isRunning,
		PendingNotifications: pendingCount,
		LastProcessedAt:      ns.lastProcessedAt,
		ProcessedCount:       ns.processedCount,
		FailedCount:          ns.failedCount,
		Errors:               ns.errors,
	}
}

func (ns *NotificationServer) countPendingNotifications() (int, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var count int
	err := ns.db.QueryRowContext(ctx, `
		SELECT COUNT(*)
		FROM notification_job
		WHERE status = 'pending'
	`).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to count pending notifications: %w", err)
	}

	return count, nil
}

func (ns *NotificationServer) statusHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(ns.GetStatus())
}

func (ns *NotificationServer) healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	statusCode := http.StatusOK
	status := "healthy"
	if !ns.isRunning {
		statusCode = http.StatusServiceUnavailable
		status = "stopped"
	}

	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"status":    status,
		"timestamp": time.Now(),
		"service":   "notifications",
		"push":      ns.pusher != nil,
		"email":     ns.mailer != nil,
	})
}

func resolveTestRecipient(flagValue string) string {
	recipient := strings.TrimSpace(flagValue)
	if recipient == "" && len(flag.Args()) > 0 {
		recipient = strings.TrimSpace(flag.Args()[0])
	}
	if recipient == "" {
		recipient = strings.TrimSpace(os.Getenv("TEST_EMAIL"))
	}
	return recipient
}

func (ns *NotificationServer) sendTestPush(recipient string) error {
	recipient = strings.TrimSpace(recipient)
	if recipient == "" {
		return fmt.Errorf("test recipient is required; use --test-to, pass a positional email after --test-push, or set TEST_EMAIL")
	}

	ns.initPush()
	if ns.pusher == nil {
		return fmt.Errorf("push service not configured")
	}
	if err := ns.initDB(); err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var userID string
	err := ns.db.QueryRowContext(ctx, `SELECT id FROM "user" WHERE lower(email) = lower($1)`, recipient).Scan(&userID)
	if errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("no user found for that address")
	}
	if err != nil {
		return err
	}

	var enabledCount, totalCount int
	if err := ns.db.QueryRowContext(ctx, `
		SELECT
			COUNT(*) FILTER (WHERE is_enabled = TRUE),
			COUNT(*)
		FROM push_device
		WHERE user_id = $1
	`, userID).Scan(&enabledCount, &totalCount); err != nil {
		return err
	}
	if enabledCount == 0 {
		if totalCount > 0 {
			return fmt.Errorf("this account has %d disabled iOS device(s); open Solace Dev while signed in", totalCount)
		}
		return fmt.Errorf("no registered iOS devices for this account; open Solace Dev while signed in")
	}

	devices, err := jobs.ListPushDevices(ctx, ns.db, userID)
	if err != nil {
		return err
	}
	if len(devices) == 0 {
		return fmt.Errorf("no registered iOS devices for this account; open Solace Dev while signed in")
	}

	notification := push.EventReminder(15, "manual-test", "Solace")
	notification.CollapseID = "test:" + userID

	sent := 0
	var lastErr error
	for _, device := range devices {
		if err := ns.sendPushToDevice(ctx, device, notification); err != nil {
			lastErr = err
			continue
		}
		sent++
		ns.log.OK("Test push accepted for %s", device.BundleID)
	}
	if sent == 0 {
		if lastErr != nil {
			return lastErr
		}
		return fmt.Errorf("APNs did not accept a test push")
	}
	ns.log.OK("Test push delivered to %d device(s)", sent)
	return nil
}

func (ns *NotificationServer) sendTestEmail(recipient string) error {
	recipient = strings.TrimSpace(recipient)
	if recipient == "" {
		return fmt.Errorf("test recipient is required; use --test-to, pass a positional email after --test, or set TEST_EMAIL")
	}

	ns.initMailer()
	if ns.mailer == nil {
		return fmt.Errorf("email service not configured")
	}

	now := time.Now()
	start := now.Add(90 * time.Minute)
	end := start.Add(45 * time.Minute)
	testEvent := EventData{
		Title:         "Manual reminder test",
		Start:         start,
		End:           end,
		AllDay:        false,
		Location:      "Test location",
		CalendarName:  "Solace test calendar",
		Description:   "This is a manually triggered reminder email for smoke-testing the notification pipeline.",
		CategoryName:  "Test",
		CategoryColor: "#ff6b35",
	}
	testUser := UserData{
		Name:     "Test Recipient",
		Email:    recipient,
		TimeZone: "Europe/Amsterdam",
	}

	content, err := ns.generateEmailContent(testEvent, testUser, 30, "manual-test-event")
	if err != nil {
		return err
	}

	id, err := ns.mailer.Send(context.Background(), email.Message{
		To:      recipient,
		Subject: ns.generateEmailSubject(testEvent, 30),
		HTML:    content.HTML,
		Text:    content.Text,
	})
	if err != nil {
		return fmt.Errorf("failed to send test email with Stalwart: %w", err)
	}

	ns.log.OK("Test email queued successfully: %s", id)
	return nil
}

func main() {
	testMode := flag.Bool("test", false, "send a manual test reminder email and exit")
	testPush := flag.Bool("test-push", false, "send a lock-screen APNs test to the user's registered devices and exit")
	testTo := flag.String("test-to", "", "recipient email address for --test / --test-push")
	flag.Parse()

	loadEnv()

	server := NewNotificationServer()
	if *testMode || *testPush {
		recipient := resolveTestRecipient(*testTo)
		failed := false
		if *testPush {
			if err := server.sendTestPush(recipient); err != nil {
				server.log.Err("Failed to send test push: %v", err)
				failed = true
			}
		}
		if *testMode {
			if err := server.sendTestEmail(recipient); err != nil {
				server.log.Err("Failed to send test email: %v", err)
				failed = true
			}
		}
		if failed {
			os.Exit(1)
		}
		return
	}

	if len(flag.Args()) > 0 {
		server.log.Err("unexpected arguments: %v", flag.Args())
		os.Exit(1)
	}

	if err := server.Start(); err != nil {
		server.log.Err("Failed to start notification server: %v", err)
		os.Exit(1)
	}

	httpServer := &http.Server{
		Addr: ":" + getPort(),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", server.healthHandler)
	mux.HandleFunc("/status", server.statusHandler)
	httpServer.Handler = mux

	signalChan := make(chan os.Signal, 1)
	signal.Notify(signalChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-signalChan
		server.Shutdown()

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = httpServer.Shutdown(ctx)
	}()

	server.log.Info("HTTP server listening on %s", httpServer.Addr)
	if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		server.log.Err("HTTP server failed: %v", err)
		os.Exit(1)
	}
}

func getPort() string {
	port := os.Getenv("PORT")
	if port == "" {
		return "4002"
	}
	return port
}
