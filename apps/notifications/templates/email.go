package templates

import (
	"fmt"
	"html/template"
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
}

// EventReminderEmail returns the HTML template for event reminders
func EventReminderEmail() *template.Template {
	htmlTemplate := `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Event Reminder: {{.EventTitle}}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f8fafc;
            color: #334155;
            line-height: 1.6;
        }
        
        .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }
        
        .header {
            text-align: center;
            margin-bottom: 32px;
            padding-bottom: 24px;
            border-bottom: 1px solid #e2e8f0;
        }
        
        .event-title {
            color: #1e293b;
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 12px;
            line-height: 1.2;
        }
        
        .reminder-text {
            color: #64748b;
            font-size: 18px;
            margin-bottom: 0;
            font-weight: 500;
        }
        
        .event-details {
            background: #f8fafc;
            padding: 24px;
            border-radius: 8px;
            margin: 24px 0;
            border-left: 4px solid {{.CategoryColor}};
        }
        
        .detail-row {
            margin: 16px 0;
            display: flex;
            align-items: flex-start;
        }
        
        .detail-row:first-child {
            margin-top: 0;
        }
        
        .detail-row:last-child {
            margin-bottom: 0;
        }
        
        .label {
            font-weight: 600;
            color: #374151;
            min-width: 80px;
            margin-right: 16px;
        }
        
        .value {
            flex: 1;
            color: #4b5563;
        }
        
        .category-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 9999px;
            font-size: 12px;
            font-weight: 600;
            background-color: {{.CategoryColor}};
            color: white;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .description {
            margin-top: 8px;
            color: #6b7280;
            font-style: italic;
        }
        
        .footer {
            text-align: center;
            margin-top: 32px;
            padding-top: 24px;
            border-top: 1px solid #e2e8f0;
            color: #9ca3af;
            font-size: 14px;
        }
        
        .footer p {
            margin: 4px 0;
        }
        
        .logo {
            text-align: center;
            margin-bottom: 24px;
        }
        
        .logo-icon {
            width: 48px;
            height: 48px;
            background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
            border-radius: 12px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 20px;
        }
        
        @media (max-width: 600px) {
            .container {
                padding: 24px;
                margin: 10px;
            }
            
            .event-title {
                font-size: 24px;
            }
            
            .detail-row {
                flex-direction: column;
            }
            
            .label {
                margin-bottom: 4px;
                margin-right: 0;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">
            <div class="logo-icon">CAL</div>
        </div>
        
        <div class="header">
            <h1 class="event-title">{{.EventTitle}}</h1>
            <p class="reminder-text">{{.ReminderText}}</p>
        </div>
        
        <div class="event-details">
            <div class="detail-row">
                <span class="label">Date:</span>
                <span class="value">{{.EventDate}}</span>
            </div>
            
            <div class="detail-row">
                <span class="label">Time:</span>
                <span class="value">{{.EventTime}}</span>
            </div>
            
            {{if .EventLocation}}
            <div class="detail-row">
                <span class="label">Location:</span>
                <span class="value">{{.EventLocation}}</span>
            </div>
            {{end}}
            
            {{if .CategoryName}}
            <div class="detail-row">
                <span class="label">Category:</span>
                <span class="value">
                    <span class="category-badge">{{.CategoryName}}</span>
                </span>
            </div>
            {{end}}
            
            {{if .Duration}}
            <div class="detail-row">
                <span class="label">Duration:</span>
                <span class="value">{{.Duration}}</span>
            </div>
            {{end}}
            
            {{if .Description}}
            <div class="detail-row">
                <span class="label">Description:</span>
                <span class="value">
                    {{.Description}}
                </span>
            </div>
            {{end}}
        </div>
        
        <div class="footer">
            <p>Hi {{.UserName}}, this reminder was sent to {{.UserEmail}}</p>
            <p>Powered by your calendar notification service</p>
        </div>
    </div>
</body>
</html>`

	tmpl, err := template.New("eventReminder").Parse(htmlTemplate)
	if err != nil {
		panic(fmt.Sprintf("Failed to parse email template: %v", err))
	}
	
	return tmpl
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
	text += "Powered by your calendar notification service"

	return text
}
