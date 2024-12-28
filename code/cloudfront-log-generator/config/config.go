package config

import "time"

// Constants for configuration
const (
	MinFileSize     = 10 * 1024       // 10KB
	MaxFileSize     = 2 * 1024 * 1024 // 2MB
	ApproxEntrySize = 250             // Approximate size of a single log entry in bytes
	WorkerPoolSize  = 4               // Number of workers in the pool
)

// StartTime calculates the starting time for log generation based on file count.
func StartTime(fileCount int) time.Time {
	return time.Now().Add(-time.Duration(fileCount) * time.Hour)
}
