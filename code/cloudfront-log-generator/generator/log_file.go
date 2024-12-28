package generator

import (
	"archive/tar"
	"bytes"
	"cloudfront-log-generator/config"
	"compress/gzip"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"os"
	"path/filepath"
	"time"

	"go.uber.org/zap"
)

func GenerateLogFile(distributionId string, timestamp time.Time, outputDir, format string) (string, int, error) {
	var fileName string
	if format == "json.gz" {
		fileName = fmt.Sprintf("%s.%s.%s.json.gz", distributionId, timestamp.Format("2006-01-02-15"), generateRandomString(8))
	} else {
		fileName = fmt.Sprintf("%s.%s.%s.csv.tar.gz", distributionId, timestamp.Format("2006-01-02-15"), generateRandomString(8))
	}

	filePath := filepath.Join(outputDir, fileName)
	file, err := os.Create(filePath)
	if err != nil {
		return "", 0, fmt.Errorf("failed to create file: %w", err)
	}
	defer file.Close()

	gzipWriter := gzip.NewWriter(file)
	defer gzipWriter.Close()

	var writer io.Writer
	var tarWriter *tar.Writer
	if format == "csv.tar.gz" {
		tarWriter = tar.NewWriter(gzipWriter)
		defer tarWriter.Close()
		writer = tarWriter
	} else {
		writer = gzipWriter
	}

	// Randomly choose a target size between 10KB and 2MB
	targetSize := int64(10*1024 + rand.Intn(2*1024*1024-10*1024))
	currentSize := int64(0)
	entriesWritten := 0

	if format == "json.gz" {
		encoder := json.NewEncoder(writer)
		for currentSize < targetSize {
			entryTime := timestamp.Add(time.Duration(entriesWritten) * time.Second)
			logEntry := GenerateLogEntry(entryTime)
			if err := encoder.Encode(logEntry); err != nil {
				return "", entriesWritten, fmt.Errorf("failed to write log entry: %w", err)
			}
			currentSize += int64(config.ApproxEntrySize)
			entriesWritten++
		}
	} else {
		csvBuffer := &bytes.Buffer{}
		csvWriter := csv.NewWriter(csvBuffer)

		// Write CSV header
		header := []string{"date", "time", "x-edge-location", "sc-bytes", "c-ip", "cs-method", "cs(Host)",
			"cs-uri-stem", "sc-status", "cs(Referer)", "cs(User-Agent)", "cs-uri-query", "cs(Cookie)",
			"x-edge-result-type", "x-edge-request-id", "x-host-header", "cs-protocol", "cs-bytes",
			"time-taken", "x-forwarded-for", "ssl-protocol", "ssl-cipher", "x-edge-response-type",
			"cs-protocol-version"}
		if err := csvWriter.Write(header); err != nil {
			return "", 0, fmt.Errorf("failed to write CSV header: %w", err)
		}

		for currentSize < targetSize {
			entryTime := timestamp.Add(time.Duration(entriesWritten) * time.Second)
			logEntry := GenerateLogEntry(entryTime)
			record := []string{
				logEntry.Date, logEntry.Time, logEntry.EdgeLocation, fmt.Sprintf("%d", logEntry.BytesSent),
				logEntry.IPAddress, logEntry.Method, logEntry.Host, logEntry.URI, fmt.Sprintf("%d", logEntry.Status),
				logEntry.Referer, logEntry.UserAgent, logEntry.QueryString, logEntry.Cookie, logEntry.ResultType,
				logEntry.RequestId, logEntry.HostHeader, logEntry.Protocol, fmt.Sprintf("%d", logEntry.BytesReceived),
				fmt.Sprintf("%.3f", logEntry.TimeTaken), logEntry.XForwardedFor, logEntry.SSLProtocol,
				logEntry.SSLCipher, logEntry.ResponseType, logEntry.RequestProtocol,
			}
			if err := csvWriter.Write(record); err != nil {
				return "", entriesWritten, fmt.Errorf("failed to write CSV record: %w", err)
			}
			currentSize += int64(config.ApproxEntrySize)
			entriesWritten++
		}

		csvWriter.Flush()
		if err := csvWriter.Error(); err != nil {
			return "", entriesWritten, fmt.Errorf("error flushing CSV writer: %w", err)
		}

		// Write the CSV data as a single entry in the tar archive
		hdr := &tar.Header{
			Name: fmt.Sprintf("%s.csv", distributionId),
			Mode: 0600,
			Size: int64(csvBuffer.Len()),
		}
		if err := tarWriter.WriteHeader(hdr); err != nil {
			return "", entriesWritten, fmt.Errorf("failed to write tar header: %w", err)
		}
		if _, err := io.Copy(tarWriter, csvBuffer); err != nil {
			return "", entriesWritten, fmt.Errorf("failed to write CSV data to tar: %w", err)
		}
	}

	zap.L().Info("Generated log file",
		zap.String("fileName", fileName),
		zap.Int("entries", entriesWritten),
		zap.Int64("size", currentSize),
		zap.String("format", format))

	return filePath, entriesWritten, nil
}
