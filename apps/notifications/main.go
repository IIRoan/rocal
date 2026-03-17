package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	"github.com/resend/resend-go/v2"
	"github.com/robfig/cron/v3"

	"notifications/templates"
)

type serviceLogger struct {
	logger *log.Logger
}

func newServiceLogger() serviceLogger {
	return serviceLogger{
		logger: log.New(os.Stdout, "", 0),
	}
}

func (l serviceLogger) log(level string, message string, args ...any) {
	ts := time.Now().Format("15:04:05")
	if len(args) > 0 {
		message = fmt.Sprintf(message, args...)
	}
	l.logger.Printf("%s %-4s %s", ts, level, message)
}

func (l serviceLogger) Debug(message string, args ...any) { l.log("DEBUG", message, args...) }
func (l serviceLogger) Info(message string, args ...any)  { l.log("INFO", message, args...) }
func (l serviceLogger) OK(message string, args ...any)    { l.log("OK", message, args...) }
func (l serviceLogger) Warn(message string, args ...any)  { l.log("WARN", message, args...) }
func (l serviceLogger) Err(message string, args ...any)   { l.log("ERR", message, args...) }
func (l serviceLogger) Step(message string, args ...any)  { l.log("STEP", message, args...) }

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
	Title         string
	Start         time.Time
	End           time.Time
	Location      string
	Description   string
	CategoryName  string
	CategoryColor string
}

type UserData struct {
	Name     string
	Email    string
	TimeZone string
}

type NotificationServer struct {
	isRunning       bool
	cron            *cron.Cron
	processedCount  int
	failedCount     int
	errors          []NotificationError
	lastProcessedAt *time.Time
	resend          *resend.Client
	maxErrors       int
	log             serviceLogger
}

func NewNotificationServer() *NotificationServer {
	return &NotificationServer{
		cron:      cron.New(cron.WithSeconds()),
		maxErrors: 50,
		errors:    make([]NotificationError, 0),
		log:       newServiceLogger(),
	}
}

func loadEnv() {
	logger := newServiceLogger()
	if err := godotenv.Load(); err != nil {
		logger.Warn("Could not load .env file: %v", err)
	} else {
		logger.OK("Environment variables loaded from .env")
	}

	logger.Step("Environment check")
	logger.Info("DATABASE_URL present: %t", os.Getenv("DATABASE_URL") != "")
	logger.Info("RESEND_API_KEY present: %t", os.Getenv("RESEND_API_KEY") != "")
}

func (ns *NotificationServer) initResend() {
	apiKey := os.Getenv("RESEND_API_KEY")
	if apiKey == "" {
		ns.log.Warn("RESEND_API_KEY not found, email sending is disabled")
		return
	}

	ns.resend = resend.NewClient(apiKey)
	ns.log.OK("Resend client initialized")
}

func (ns *NotificationServer) Start() error {
	if ns.isRunning {
		return nil
	}

	ns.isRunning = true
	ns.initResend()

	_, err := ns.cron.AddFunc("0 * * * * *", func() {
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
	ns.log.Info("Notification tick executed")
	return nil
}

func (ns *NotificationServer) generateEmailContent(event EventData, user UserData, minutesBefore int) (*EmailContent, error) {
	formattedDetails, err := ns.formatEventDetailsForEmail(event, user.TimeZone, minutesBefore)
	if err != nil {
		return nil, err
	}

	templateData := templates.EmailTemplateData{
		EventTitle:     event.Title,
		EventDate:      formattedDetails.EventDate,
		EventTime:      formattedDetails.EventTime,
		EventLocation:  event.Location,
		CategoryName:   event.CategoryName,
		CategoryColor:  event.CategoryColor,
		Description:    event.Description,
		TimeUntilEvent: formattedDetails.TimeUntilEvent,
		Duration:       formattedDetails.Duration,
		ReminderText:   formattedDetails.ReminderText,
		UserName:       user.Name,
		UserEmail:      user.Email,
		UserTheme:      "light",
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

	return &formattedEventDetails{
		EventDate:      start.Format("January 2, 2006"),
		EventTime:      start.Format("3:04 PM"),
		TimeUntilEvent: strings.TrimPrefix(ns.formatReminderText(minutesBefore), "Your event starts in "),
		ReminderText:   ns.formatReminderText(minutesBefore),
		Duration:       ns.calculateEventDuration(event.Start, event.End),
	}, nil
}

func (ns *NotificationServer) calculateEventDuration(start, end time.Time) string {
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
	if minutesBefore <= 0 {
		return fmt.Sprintf("Starting now: %s", event.Title)
	}

	return fmt.Sprintf("Reminder: %s", event.Title)
}

func (ns *NotificationServer) sendEmailNotification(ctx context.Context, event EventData, user UserData, minutesBefore int) error {
	if ns.resend == nil {
		return fmt.Errorf("email service not configured")
	}
	if user.Email == "" {
		return fmt.Errorf("user email is required")
	}

	content, err := ns.generateEmailContent(event, user, minutesBefore)
	if err != nil {
		return err
	}

	params := &resend.SendEmailRequest{
		From:    ns.getFromAddress(),
		To:      []string{user.Email},
		Subject: ns.generateEmailSubject(event, minutesBefore),
		Html:    content.HTML,
		Text:    content.Text,
	}

	response, err := ns.resend.Emails.Send(params)
	if err != nil {
		return fmt.Errorf("failed to send email with resend: %w", err)
	}

	ns.log.OK("Email sent successfully: %s", response.Id)
	ns.processedCount++
	return nil
}

func (ns *NotificationServer) getFromAddress() string {
	from := os.Getenv("FROM_EMAIL")
	if from == "" {
		from = "Notifications <onboarding@resend.dev>"
	}
	return from
}

func (ns *NotificationServer) GetStatus() *NotificationStatus {
	return &NotificationStatus{
		IsRunning:            ns.isRunning,
		PendingNotifications: 0,
		LastProcessedAt:      ns.lastProcessedAt,
		ProcessedCount:       ns.processedCount,
		FailedCount:          ns.failedCount,
		Errors:               ns.errors,
	}
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
	})
}

func main() {
	loadEnv()

	server := NewNotificationServer()
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
		return "8080"
	}
	return port
}
