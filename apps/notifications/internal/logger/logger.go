package logger

import (
	"fmt"
	"log"
	"os"
	"time"
)

type Logger struct {
	scope  string
	logger *log.Logger
}

func New(scope string) Logger {
	return Logger{
		scope:  scope,
		logger: log.New(os.Stdout, "", 0),
	}
}

func (l Logger) prefix() string {
	if l.scope == "" {
		return ""
	}
	return fmt.Sprintf(" [%s]", l.scope)
}

func (l Logger) write(level string, message string, args ...any) {
	ts := time.Now().Format("15:04:05")
	if len(args) > 0 {
		message = fmt.Sprintf(message, args...)
	}
	l.logger.Printf("%s %-4s%s %s", ts, level, l.prefix(), message)
}

func (l Logger) Debug(message string, args ...any) { l.write("DEBUG", message, args...) }
func (l Logger) Info(message string, args ...any)  { l.write("INFO", message, args...) }
func (l Logger) OK(message string, args ...any)    { l.write("OK", message, args...) }
func (l Logger) Warn(message string, args ...any)  { l.write("WARN", message, args...) }
func (l Logger) Err(message string, args ...any)   { l.write("ERR", message, args...) }
func (l Logger) Step(message string, args ...any)  { l.write("STEP", message, args...) }
