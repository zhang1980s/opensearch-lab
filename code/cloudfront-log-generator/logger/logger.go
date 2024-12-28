package logger

import (
	"os"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

func InitLogger() *zap.Logger {
	config := zap.NewProductionConfig()
	config.EncoderConfig.TimeKey = "timestamp"
	config.EncoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder

	logger, err := config.Build()
	if err != nil {
		panic("Failed to initialize logger")
	}

	zap.ReplaceGlobals(logger)

	return logger
}

func Sync() {
	zap.L().Sync()
}

func Fatal(msg string, fields ...zap.Field) {
	zap.L().Fatal(msg, fields...)
	os.Exit(1)
}
