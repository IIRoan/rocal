package templates

import (
	"fmt"
	"html/template"
	"path/filepath"
	"runtime"
	"strings"
)

// EmailTemplateData holds the data for email templates
type EmailTemplateData struct {
	EventID        string
	EventTitle     string
	EventDate      string
	EventTime      string
	EventLocation  string
	CalendarName   string
	CategoryName   string
	CategoryColor  string
	Description    string
	TimeUntilEvent string
	Duration       string
	ReminderText   string
	UserName       string
	UserEmail      string
	UserTheme      string
	EventUrl       string
	CalendarUrl    string
	SettingsUrl    string
	PrivacyUrl     string
	LogoUrl        string
}

// EventReminderEmail returns the HTML template for event reminders
func EventReminderEmail() *template.Template {
	tmpl, err := template.ParseFiles(templatePath("event-reminder.html"))
	if err != nil {
		panic(fmt.Sprintf("Failed to parse email template: %v", err))
	}

	return tmpl
}

func templatePath(name string) string {
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		panic("Failed to resolve template path")
	}

	return filepath.Join(filepath.Dir(currentFile), "..", "emails", name)
}

// RenderEventReminder renders the event reminder email template
func RenderEventReminder(data EmailTemplateData) (string, error) {
	tmpl := EventReminderEmail()

	var buf strings.Builder
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", fmt.Errorf("failed to execute email template: %w", err)
	}

	return buf.String(), nil
}

// GeneratePlainTextEmail generates plain text version of the email
func GeneratePlainTextEmail(data EmailTemplateData) string {
	text := ""
	if data.TimeUntilEvent != "" {
		text += fmt.Sprintf("%s\n", data.TimeUntilEvent)
	}
	text += fmt.Sprintf("%s\n\n", data.EventTitle)
	text += "Details:\n"
	text += fmt.Sprintf("Date: %s\n", data.EventDate)
	text += fmt.Sprintf("Time: %s\n", data.EventTime)

	if data.EventLocation != "" {
		text += fmt.Sprintf("Location: %s\n", data.EventLocation)
	}

	if data.Duration != "" {
		text += fmt.Sprintf("Duration: %s\n", data.Duration)
	}
	if data.EventID != "" {
		text += fmt.Sprintf("Event ID: %s\n", data.EventID)
	}

	text += fmt.Sprintf("Open event: %s\n", data.EventUrl)
	text += "\n"
	text += "This reminder was sent because email notifications are enabled for your account.\n"
	text += fmt.Sprintf("Settings: %s\n", data.SettingsUrl)
	text += fmt.Sprintf("Privacy: %s\n", data.PrivacyUrl)
	text += fmt.Sprintf("Calendar: %s\n", data.CalendarUrl)

	return text
}
