# Notifications Service (Go)

A standalone notification server built in Go that processes scheduled notifications independently from the main backend. It checks the database for notifications that need sending and sends them using the Resend API with beautiful HTML email templates.

## Features

- **Scheduling**: Processes notifications every minute using cron scheduling
- **Email Delivery**: Sends emails using Resend API v3 with pure Go HTML templates
- **Retry Logic**: Implements exponential backoff for failed deliveries
- **Database Integration**: Uses Prisma Client Go for database operations
- **Health Monitoring**: Provides health check and status endpoints
- **Graceful Shutdown**: Handles SIGINT/SIGTERM signals properly
- **Pure Go**: No Node.js dependencies - completely self-contained

## Architecture

The service maintains the same functionality as the original TypeScript/Bun implementation but is rewritten in Go for better performance and reduced memory usage. It uses pure Go HTML templates instead of React Email.

### Key Components

1. **NotificationServer**: Main server class that orchestrates the notification processing
2. **Database Layer**: Uses Prisma Client Go for database operations
3. **Email Templates**: Pure Go HTML templates with modern design
4. **Retry Queue**: In-memory queue for failed notifications with retry logic
5. **HTTP API**: Health check and status endpoints

## Setup

### Prerequisites

- Go 1.21 or higher
- PostgreSQL database
- Resend API key

### Installation

1. Install Go dependencies:
```bash
go mod tidy
```

2. Copy environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

### Environment Variables

```env
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
RESEND_API_KEY=your_resend_api_key
FROM_EMAIL=notifications@yourdomain.com
PORT=8080
```

## Running

### Development

```bash
go run main.go
```

### Production

```bash
go build -o notifications main.go
./notifications
```

## API Endpoints

### Health Check
```
GET /health
```

Returns server health status.

### Status
```
GET /status
```

Returns detailed server status including:
- Running state
- Pending notifications count
- Processed/failed counts
- Error details
- Retry queue size

## Email Templates

The service uses pure Go HTML templates for beautiful, responsive email design:

- **Modern Design**: Clean, professional layout with emojis and colors
- **Responsive**: Works great on mobile and desktop
- **Category Support**: Color-coded category badges
- **Complete Details**: Date, time, location, description, duration
- **Personalization**: User name and email in footer

### Template Features

- Semantic HTML5 structure
- CSS-in-HTML for maximum email client compatibility
- Emoji icons for visual appeal
- Category color coding
- Mobile-responsive design
- Professional typography

## Database Schema

The service uses the same Prisma schema as the original implementation:

- `EventNotification` - Scheduled notifications
- `NotificationLog` - Delivery logs
- `User` - User preferences and settings
- `Event` - Event details

## Deployment

### Railway

The service is configured for Railway deployment with the `railway.toml` file:
- Uses Nixpacks builder for Go
- Automatic health checks
- Restart policy on failure

### Docker

```dockerfile
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o notifications main.go

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/notifications .
EXPOSE 8080
CMD ["./notifications"]
```

## Monitoring

The service provides comprehensive logging and metrics:

- Processing metrics (processed/failed/skipped counts)
- Error tracking with capped error array
- Retry queue monitoring
- Health check endpoints

## Performance

- **Memory**: Reduced memory footprint vs Node.js
- **CPU**: More efficient notification processing
- **Concurrency**: Go's goroutines handle concurrent operations efficiently
- **Startup**: Faster cold start times
- **Self-contained**: No external Node.js dependencies

## Migration from TypeScript/Bun

This Go implementation maintains 100% feature parity with the original TypeScript/Bun version:

- Same database schema
- Same notification logic
- Same retry mechanisms
- Same API endpoints
- Same configuration options
- **Better**: Pure Go HTML templates (no React/Node.js dependency)

The main differences are:
- Better performance and lower resource usage
- Type safety at compile time
- Simpler deployment (single binary)
- Built-in concurrency handling
- No external Node.js dependencies
