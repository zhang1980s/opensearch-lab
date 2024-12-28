package generator

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/s3"
	"go.uber.org/zap"
)

func getBucketRegion(bucket string) (string, error) {
	sess, err := session.NewSession()
	if err != nil {
		return "", fmt.Errorf("failed to create AWS session: %w", err)
	}

	svc := s3.New(sess, &aws.Config{
		Region: aws.String("us-east-1"),
	})

	result, err := svc.GetBucketLocation(&s3.GetBucketLocationInput{
		Bucket: aws.String(bucket),
	})
	if err != nil {
		return "", fmt.Errorf("failed to get bucket location: %w", err)
	}

	if result.LocationConstraint == nil {
		return "us-east-1", nil
	}

	return *result.LocationConstraint, nil
}

func UploadToS3(bucketName, bucketPath, filePath string) error {
	region, err := getBucketRegion(bucketName)
	if err != nil {
		return fmt.Errorf("failed to determine bucket region: %w", err)
	}

	sess, err := session.NewSession(&aws.Config{
		Region: aws.String(region),
	})
	if err != nil {
		return fmt.Errorf("failed to create AWS session: %w", err)
	}

	file, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	svc := s3.New(sess)

	key := filepath.Join(bucketPath, filepath.Base(filePath))

	_, err = svc.PutObject(&s3.PutObjectInput{
		Bucket: aws.String(bucketName),
		Key:    aws.String(key),
		Body:   file,
	})

	if err != nil {
		return fmt.Errorf("failed to upload file to S3: %w", err)
	}

	zap.L().Info("Successfully uploaded file to S3",
		zap.String("bucket", bucketName),
		zap.String("region", region),
		zap.String("key", key))

	return nil
}
