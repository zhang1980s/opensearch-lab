import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { OpenSearchDomain } from '../constructs/opensearch-domain';
import { OpenSearchIngestionPipeline } from '../constructs/opensearch-ingestion-pipeline';
import { NginxProxy } from '../constructs/nginx-proxy';

interface OpenSearchStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
}

export class OpenSearchStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: OpenSearchStackProps) {
    super(scope, id, props);

    const domain = new OpenSearchDomain(this, 'OpenSearchDomain', {
      vpc: props.vpc,
    });

    const pipeline = new OpenSearchIngestionPipeline(this, 'OpenSearchIngestionPipeline', {
      vpc: props.vpc,
      openSearchDomain: domain.domain,
    });

    const proxy = new NginxProxy(this, 'NginxProxy', {
      vpc: props.vpc,
      openSearchDomain: domain.domain,
    });

    new cdk.CfnOutput(this, 'OpenSearchDashboardUrl', {
      value: `https://${proxy.proxyeip}/_dashboards/`,
      description: 'URL for OpenSearch Dashboards',
      exportName: 'OpenSearchDashboardUrl',
    });
  }
}
