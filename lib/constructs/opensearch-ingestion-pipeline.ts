import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as osis from 'aws-cdk-lib/aws-osis';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
import { Construct } from 'constructs';

interface OpenSearchIngestionPipelineProps {
  vpc: ec2.IVpc;
  openSearchDomain: opensearch.Domain;
}

export class OpenSearchIngestionPipeline extends Construct {
  constructor(scope: Construct, id: string, props: OpenSearchIngestionPipelineProps) {
    super(scope, id);

    const logBucket = new s3.Bucket(this, 'CloudFrontLogBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const pipelineRole = new iam.Role(this, 'OpenSearchIngestionPipelineRole', {
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal('osis.amazonaws.com'),
        new iam.ServicePrincipal('osis-pipelines.amazonaws.com')
      ),
      description: 'IAM role for OpenSearch Ingestion pipeline',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')
      ]
    });

    pipelineRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject', 's3:ListBucket'],
      resources: [logBucket.bucketArn, `${logBucket.bucketArn}/*`],
    }));

    pipelineRole.addToPolicy(new iam.PolicyStatement({
      actions: ['es:ESHttp*', 'es:DescribeDomain', 'es:DescribeDomainConfig'],
      resources: [props.openSearchDomain.domainArn, `${props.openSearchDomain.domainArn}/*`],
    }));

    logBucket.addToResourcePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject', 's3:ListBucket'],
      resources: [logBucket.bucketArn, `${logBucket.bucketArn}/*`],
      principals: [new iam.ArnPrincipal(pipelineRole.roleArn)],
    }));

    const pipeline = new osis.CfnPipeline(this, 'CloudFrontLogPipeline', {
      pipelineName: 'cloudfront-log-pipeline',
      minUnits: 1,
      maxUnits: 4,
      pipelineConfigurationBody: JSON.stringify({
        version: "2",
        "log-pipeline": {
          source: {
            s3: {
              codec: { json: {} },
              compression: "gzip",
              aws: {
                region: cdk.Stack.of(this).region,
                sts_role_arn: pipelineRole.roleArn,
              },
              acknowledgments: true,
              scan: {
                buckets: [
                  {
                    bucket: {
                      name: logBucket.bucketName,
                      filter: { include_prefix: ["cflog/20241212"] },
                    },
                  },
                ],
              },
              delete_s3_objects_on_read: false,
            },
          },
          processor: [
            {
              date: {
                destination: "@timestamp",
                from_time_received: true,
              },
            },
          ],
          sink: [
            {
              opensearch: {
                hosts: [`https://${props.openSearchDomain.domainEndpoint}`],
                index: "cloudfront-logs",
                aws: {
                  sts_role_arn: pipelineRole.roleArn,
                  region: cdk.Stack.of(this).region,
                },
                dlq: {
                  s3: {
                    bucket: logBucket.bucketName,
                    region: cdk.Stack.of(this).region,
                    sts_role_arn: pipelineRole.roleArn,
                  },
                },
              },
            },
          ],
        },
      }),
    });

    new cdk.CfnOutput(this, 'OpenSearchIngestionPipelineName', {
      value: pipeline.pipelineName!,
      description: 'OpenSearch Ingestion Pipeline Name',
      exportName: 'OpenSearchIngestionPipelineName',
    });
  }
}
