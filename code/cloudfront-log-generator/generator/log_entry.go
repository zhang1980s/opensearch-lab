package generator

import (
	"fmt"
	"math/rand"
	"time"
)

// CloudFrontLogEntry represents a single log entry in CloudFront format
type CloudFrontLogEntry struct {
	Date            string
	Time            string
	EdgeLocation    string
	BytesSent       int64
	IPAddress       string
	Method          string
	Host            string
	URI             string
	Status          int
	Referer         string
	UserAgent       string
	QueryString     string
	Cookie          string
	ResultType      string
	RequestId       string
	HostHeader      string
	Protocol        string
	BytesReceived   int64
	TimeTaken       float64
	XForwardedFor   string
	SSLProtocol     string
	SSLCipher       string
	ResponseType    string
	RequestProtocol string
}

var edgeLocations = []string{
	"IAD", "DFW", "LAX", "MIA", "SEA", "LHR", "FRA", "NRT", "SIN", "SYD",
}

var httpMethods = []string{"GET", "POST", "PUT", "DELETE", "HEAD"}

var statusCodes = []int{200, 201, 204, 301, 302, 304, 400, 401, 403, 404, 500, 502, 503}

var uriPaths = []string{
	"/images/", "/api/", "/static/", "/assets/", "/videos/",
	"/documents/", "/downloads/", "/products/", "/categories/", "/users/",
}

func generateRandomIP() string {
	return fmt.Sprintf("%d.%d.%d.%d",
		rand.Intn(256), rand.Intn(256),
		rand.Intn(256), rand.Intn(256))
}

func generateRandomString(length int) string {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, length)
	for i := range b {
		b[i] = charset[rand.Intn(len(charset))]
	}
	return string(b)
}

func GenerateLogEntry(timestamp time.Time) CloudFrontLogEntry {
	return CloudFrontLogEntry{
		Date:            timestamp.Format("2006-01-02"),
		Time:            timestamp.Format("15:04:05"),
		EdgeLocation:    edgeLocations[rand.Intn(len(edgeLocations))],
		BytesSent:       rand.Int63n(1024*1024) + 100,
		IPAddress:       generateRandomIP(),
		Method:          httpMethods[rand.Intn(len(httpMethods))],
		Host:            "example.cloudfront.net",
		URI:             uriPaths[rand.Intn(len(uriPaths))] + generateRandomString(8),
		Status:          statusCodes[rand.Intn(len(statusCodes))],
		Referer:         "-",
		UserAgent:       "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
		QueryString:     "-",
		Cookie:          "-",
		ResultType:      "Hit",
		RequestId:       generateRandomString(16),
		HostHeader:      "example.com",
		Protocol:        "https",
		BytesReceived:   rand.Int63n(1024) + 100,
		TimeTaken:       float64(rand.Intn(1000)) / 1000.0,
		XForwardedFor:   "-",
		SSLProtocol:     "TLSv1.2",
		SSLCipher:       "ECDHE-RSA-AES128-GCM-SHA256",
		ResponseType:    "text/html",
		RequestProtocol: "HTTP/2.0",
	}
}

func (e CloudFrontLogEntry) String() string {
	return fmt.Sprintf("%s\t%s\t%s\t%d\t%s\t%s\t%s\t%s\t%d\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%d\t%.3f\t%s\t%s\t%s\t%s\t%s",
		e.Date, e.Time, e.EdgeLocation, e.BytesSent, e.IPAddress, e.Method,
		e.Host, e.URI, e.Status, e.Referer, e.UserAgent, e.QueryString,
		e.Cookie, e.ResultType, e.RequestId, e.HostHeader, e.Protocol,
		e.BytesReceived, e.TimeTaken, e.XForwardedFor, e.SSLProtocol,
		e.SSLCipher, e.ResponseType, e.RequestProtocol)
}
