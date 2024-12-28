package main

import (
	"cloudfront-log-generator/config"
	"cloudfront-log-generator/generator"
	"cloudfront-log-generator/logger"
	"flag"
	"os"
	"path/filepath"
	"sync"
	"time"

	"go.uber.org/zap"
)

func main() {
	// Initialize logger
	log := logger.InitLogger()

	// Command line flags
	fileCount := flag.Int("files", 10, "Number of log files to generate")
	outputDir := flag.String("output", "logs", "Output directory for log files")
	distributionId := flag.String("dist", "E2KJXWL1EXAMPLE", "CloudFront distribution ID")
	s3Bucket := flag.String("s3-bucket", "", "S3 bucket name to upload logs")
	s3Path := flag.String("s3-path", "cflog/20241212", "S3 path (key prefix) where logs will be uploaded")
	format := flag.String("format", "json.gz", "Log file format: json.gz or csv.tar.gz")
	flag.Parse()

	// Validate format
	if *format != "json.gz" && *format != "csv.tar.gz" {
		log.Fatal("Invalid format. Use either 'json.gz' or 'csv.tar.gz'")
	}

	// Create output directory if it doesn't exist
	if err := os.MkdirAll(*outputDir, 0755); err != nil {
		log.Fatal("Error creating output directory", zap.Error(err))
	}

	totalEntries := 0
	startTime := config.StartTime(*fileCount)

	// Generate files concurrently
	var wg sync.WaitGroup
	jobs := make(chan int, *fileCount)
	for w := 0; w < config.WorkerPoolSize; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := range jobs {
				timestamp := startTime.Add(time.Duration(i) * time.Hour)
				fileName, entries, err := generator.GenerateLogFile(*distributionId, timestamp, *outputDir, *format)
				if err != nil {
					log.Error("Error generating log file", zap.Error(err))
					continue
				}
				totalEntries += entries

				if *s3Bucket != "" {
					err = generator.UploadToS3(*s3Bucket, *s3Path, fileName)
					if err != nil {
						log.Error("Error uploading file to S3", zap.Error(err))
					} else {
						log.Info("Uploaded file to S3",
							zap.String("fileName", filepath.Base(fileName)),
							zap.String("s3Bucket", *s3Bucket),
							zap.String("s3Path", *s3Path))
					}
				}
			}
		}()
	}

	for i := 0; i < *fileCount; i++ {
		jobs <- i
	}
	close(jobs)
	wg.Wait()

	log.Info("Generation complete",
		zap.Int("Total log files", *fileCount),
		zap.Int("Total log entries", totalEntries),
		zap.String("Files location", filepath.Join(*outputDir)),
		zap.String("Format", *format))
}
