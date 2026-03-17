.PHONY: dev build clean deps test

# Development
dev:
	bun run build:emails
	go run main.go

# Build
build:
	bun run build:emails
	go build -o notifications main.go

# Clean
clean:
	rm -f notifications
	rm -f go.sum
	rm -rf node_modules/
	rm -rf emails/

# Install dependencies
deps:
	go mod tidy

# Run tests
test:
	go test ./...

# Format code
fmt:
	go fmt ./...

# Lint
lint:
	golangci-lint run

# Production build
prod:
	CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o notifications main.go
