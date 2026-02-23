# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Deploy Commands

### CDK Infrastructure (TypeScript)
```bash
npm run build          # Compile TypeScript
npm run watch          # Watch mode compilation
npm run test           # Run Jest tests
npx cdk synth          # Synthesize CloudFormation templates
npx cdk deploy --all   # Deploy all stacks

# Deploy to specific account/region
./cdk-deploy-to.sh <account-id> <region> --all
```

### CloudFront Log Generator (Go)
```bash
cd code/cloudfront-log-generator
make                   # Build the binary

# Generate and upload logs to S3
./cloudfront-log-generator -s3-bucket <bucket> -files 2000 -format json.gz -s3-path cflog/20241212
```

## Architecture Overview

This is an AWS CDK project that deploys a complete OpenSearch lab environment for testing log ingestion and analytics.

### Stack Dependencies
```
VpcStack → OpenSearchStack
```

### Key Components

**VpcStack** (`lib/stacks/vpc-stack.ts`)
- Creates VPC with 3 AZs, public and private subnets

**OpenSearchStack** (`lib/stacks/opensearch-stack.ts`) orchestrates three constructs:

1. **OpenSearchDomain** (`lib/constructs/opensearch-domain.ts`)
   - OpenSearch 2.15 cluster: 3 master nodes + 3 data nodes (r6g.large.search)
   - Multi-AZ with standby, fine-grained access control enabled
   - Admin credentials stored in Secrets Manager
   - Audit logging enabled to CloudWatch

2. **OpenSearchIngestionPipeline** (`lib/constructs/opensearch-ingestion-pipeline.ts`)
   - OSIS pipeline that reads JSON logs from S3 (`cflog/` prefix)
   - Processes and writes to `cloudfront-logs` index
   - Auto-scales 1-4 units

3. **NginxProxy** (`lib/constructs/nginx-proxy.ts`)
   - EC2 reverse proxy in public subnet for Dashboards access
   - Self-signed TLS, exposes OpenSearch Dashboards externally

### Data Flow
```
Log Generator → S3 Bucket → OSIS Pipeline → OpenSearch Domain → Dashboards (via Nginx)
```

### Utility Tools

**code/cloudfront-log-generator/** - Go tool generating synthetic CloudFront logs
- Packages: `config/`, `generator/`, `logger/`
- Outputs: JSON.GZ or CSV.TAR.GZ format
- Concurrent upload to S3

**labs/glue-s3-aos/** - PySpark Glue job for CSV TAR.GZ processing to OpenSearch
