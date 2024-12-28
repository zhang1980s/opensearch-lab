build:
	if [ -f cloudfront-log-generator ]; then rm cloudfront-log-generator ; fi;
	GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -o cloudfront-log-generator main.go;
	chmod +x cloudfront-log-generator
