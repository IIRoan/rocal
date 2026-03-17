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
	EventTitle      string
	EventDate       string
	EventTime       string
	EventLocation   string
	CategoryName    string
	CategoryColor   string
	Description     string
	TimeUntilEvent  string
	Duration        string
	ReminderText    string
	UserName        string
	UserEmail       string
	UserTheme       string
	EventUrl        string
	CalendarUrl     string
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
	text := fmt.Sprintf("Event Reminder: %s\n\n", data.EventTitle)
	text += fmt.Sprintf("%s\n\n", data.ReminderText)
	text += "Event Details:\n"
	text += fmt.Sprintf("Date: %s\n", data.EventDate)
	text += fmt.Sprintf("Time: %s\n", data.EventTime)

	if data.EventLocation != "" {
		text += fmt.Sprintf("Location: %s\n", data.EventLocation)
	}

	if data.CategoryName != "" {
		text += fmt.Sprintf("Category: %s\n", data.CategoryName)
	}

	if data.Duration != "" {
		text += fmt.Sprintf("Duration: %s\n", data.Duration)
	}

	if data.Description != "" {
		text += fmt.Sprintf("Description: %s\n", data.Description)
	}

	text += "\n"
	text += fmt.Sprintf("Hi %s, this reminder was sent to %s\n", data.UserName, data.UserEmail)
	text += "Solace Calendar"

	return text
}
