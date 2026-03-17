package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"github.com/resend/resend-go/v2"
	"github.com/robfig/cron/v3"

	"notifications/internal/logger"
	"notifications/templates"
)

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

type NotificationData struct {
	ID                    string
	EventID               string
	UserID                string
	NotificationType      string
	MinutesBefore         int
	NotificationTime      time.Time
	NotificationDateLocal string
	NotificationTimezone  string
}

type NotificationServer struct {
	isRunning       bool
	cron            *cron.Cron
	db              *sql.DB
	processedCount  int
	failedCount     int
	errors          []NotificationError
	lastProcessedAt *time.Time
	resend          *resend.Client
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
	if err := godotenv.Load(); err != nil {
		log.Warn("Could not load .env file: %v", err)
	} else {
		log.OK("Environment variables loaded from .env")
	}

	log.Step("Environment check")
	log.Info("DATABASE_URL present: %t", os.Getenv("DATABASE_URL") != "")
	log.Info("RESEND_API_KEY present: %t", os.Getenv("RESEND_API_KEY") != "")
}

func (ns *NotificationServer) initResend() {
	apiKey := os.Getenv("RESEND_API_KEY")
	if apiKey == "" {
		ns.log.Warn("RESEND_API_KEY not found, email sending is disabled")
		return
	}

	ns.resend = resend.NewClient(apiKey)
	ns.log.OK("Resend client initialized")
	if from := strings.TrimSpace(os.Getenv("FROM_EMAIL")); from == "" {
		ns.log.Warn("FROM_EMAIL not configured; set it to an address on your verified Resend domain")
	} else {
		ns.log.Info("Using FROM_EMAIL sender: %s", from)
	}
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
	currentMinute := now.Truncate(time.Minute)
	ns.lastProcessedAt = &now

	if ns.db == nil {
		return fmt.Errorf("database service not configured")
	}

	notifications, err := ns.fetchDueNotifications(currentMinute)
	if err != nil {
		return err
	}

	if len(notifications) == 0 {
		ns.log.Info("Notification tick executed - no due email notifications")
		return nil
	}

	ns.log.Info("Processing %d due email notification(s)", len(notifications))

	processed := 0
	failed := 0
	for _, item := range notifications {
		if err := ns.sendEmailNotification(context.Background(), item.Event, item.User, item.Notification.MinutesBefore, item.Notification.EventID); err != nil {
			failed++
			ns.failedCount++
			ns.addError(err.Error())
			ns.log.Err("Failed to send notification %s for event %s: %v", item.Notification.ID, item.Notification.EventID, err)
			if logErr := ns.insertNotificationLog(item.Notification, item.User, "failed"); logErr != nil {
				ns.log.Warn("Failed to write notification failure log for %s: %v", item.Notification.ID, logErr)
			}
			continue
		}

		if err := ns.markNotificationSent(item.Notification.ID); err != nil {
			failed++
			ns.failedCount++
			ns.addError(err.Error())
			ns.log.Err("Notification %s email was sent but could not be marked as sent: %v", item.Notification.ID, err)
			continue
		}

		if err := ns.insertNotificationLog(item.Notification, item.User, "sent"); err != nil {
			ns.log.Warn("Failed to write notification success log for %s: %v", item.Notification.ID, err)
		}

		processed++
	}

	ns.log.OK("Notification processing complete: %d sent, %d failed", processed, failed)
	return nil
}

type dueNotification struct {
	Notification NotificationData
	Event        EventData
	User         UserData
}

func (ns *NotificationServer) fetchDueNotifications(currentMinute time.Time) ([]dueNotification, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	rows, err := ns.db.QueryContext(ctx, `
		SELECT
			en.id,
			en.event_id,
			ce.user_id,
			en.notification_type,
			en.minutes_before,
			en.notification_time,
			en.notification_date_local,
			en.notification_timezone,
			ce.title,
			ce.start,
			ce."end",
			ce.location,
			ce.description,
			ec.name,
			ec.color,
			u.name,
			u.email,
			COALESCE(us.timezone, 'UTC')
		FROM event_notification en
		INNER JOIN calendar_event ce ON ce.id = en.event_id
		INNER JOIN "user" u ON u.id = ce.user_id
		LEFT JOIN user_settings us ON us.user_id = u.id
		LEFT JOIN event_category ec ON ec.id = ce.category_id
		WHERE en.notification_time <= $1
		  AND en.is_enabled = TRUE
		  AND en.is_sent = FALSE
		  AND en.notification_type = 'email'
		ORDER BY en.notification_time ASC
	`, currentMinute)
	if err != nil {
		return nil, fmt.Errorf("failed to query due notifications: %w", err)
	}
	defer rows.Close()

	results := make([]dueNotification, 0)
	for rows.Next() {
		var item dueNotification
		var location sql.NullString
		var description sql.NullString
		var categoryName sql.NullString
		var categoryColor sql.NullString

		if err := rows.Scan(
			&item.Notification.ID,
			&item.Notification.EventID,
			&item.Notification.UserID,
			&item.Notification.NotificationType,
			&item.Notification.MinutesBefore,
			&item.Notification.NotificationTime,
			&item.Notification.NotificationDateLocal,
			&item.Notification.NotificationTimezone,
			&item.Event.Title,
			&item.Event.Start,
			&item.Event.End,
			&location,
			&description,
			&categoryName,
			&categoryColor,
			&item.User.Name,
			&item.User.Email,
			&item.User.TimeZone,
		); err != nil {
			return nil, fmt.Errorf("failed to scan due notification: %w", err)
		}

		item.Event.Location = nullableString(location)
		item.Event.Description = nullableString(description)
		item.Event.CategoryName = nullableString(categoryName)
		item.Event.CategoryColor = nullableString(categoryColor)

		results = append(results, item)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("failed while reading due notifications: %w", err)
	}

	return results, nil
}

func nullableString(value sql.NullString) string {
	if value.Valid {
		return value.String
	}
	return ""
}

func (ns *NotificationServer) markNotificationSent(notificationID string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	result, err := ns.db.ExecContext(ctx, `
		UPDATE event_notification
		SET is_sent = TRUE, updated_at = NOW()
		WHERE id = $1 AND is_sent = FALSE
	`, notificationID)
	if err != nil {
		return fmt.Errorf("failed to mark notification as sent: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to read notification update result: %w", err)
	}
	if rowsAffected == 0 {
		return fmt.Errorf("notification was not updated as sent")
	}

	return nil
}

func (ns *NotificationServer) insertNotificationLog(notification NotificationData, user UserData, status string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := ns.db.ExecContext(ctx, `
		INSERT INTO notification_log (
			id,
			event_id,
			user_id,
			notification_type,
			minutes_before,
			sent_at,
			status,
			created_at
		) VALUES (
			$1,
			$2,
			$3,
			$4,
			$5,
			NOW(),
			$6,
			NOW()
		)
	`,
		fmt.Sprintf("%d", time.Now().UnixNano()),
		notification.EventID,
		notification.UserID,
		notification.NotificationType,
		notification.MinutesBefore,
		status,
	)
	if err != nil {
		return fmt.Errorf("failed to insert notification log: %w", err)
	}

	return nil
}

func (ns *NotificationServer) generateEmailContent(event EventData, user UserData, minutesBefore int, eventID string) (*EmailContent, error) {
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
		EventUrl:       fmt.Sprintf("https://solace.onl/event/%s", eventID),
		CalendarUrl:    "https://solace.onl/calendar",
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

func (ns *NotificationServer) sendEmailNotification(ctx context.Context, event EventData, user UserData, minutesBefore int, eventID string) error {
	if ns.resend == nil {
		return fmt.Errorf("email service not configured")
	}
	if user.Email == "" {
		return fmt.Errorf("user email is required")
	}

	content, err := ns.generateEmailContent(event, user, minutesBefore, eventID)
	if err != nil {
		return err
	}

	fromAddress, err := ns.getFromAddress()
	if err != nil {
		return err
	}

	params := &resend.SendEmailRequest{
		From:    fromAddress,
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

func (ns *NotificationServer) getFromAddress() (string, error) {
	from := strings.TrimSpace(os.Getenv("FROM_EMAIL"))
	if from == "" {
		return "", fmt.Errorf("FROM_EMAIL is not configured; set it to an address on your verified Resend domain")
	}
	return from, nil
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
		FROM event_notification
		WHERE is_enabled = TRUE
		  AND is_sent = FALSE
		  AND notification_type = 'email'
		  AND notification_time >= NOW()
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
