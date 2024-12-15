import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

interface OpenSearchDomainProps {
  vpc: ec2.IVpc;
}

export class OpenSearchDomain extends Construct {
  public readonly domain: opensearch.Domain;

  constructor(scope: Construct, id: string, props: OpenSearchDomainProps) {
    super(scope, id);

    const domainName = 'opensearchlab';

    const openSearchSG = new ec2.SecurityGroup(this, 'OpenSearchSG', {
      vpc: props.vpc,
      description: 'Security group for OpenSearch domain',
      allowAllOutbound: true,
    });

    openSearchSG.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(443),
      'Allow HTTPS traffic from VPC'
    );

    const masterUserPassword = new secretsmanager.Secret(this, 'OpenSearchMasterUserPassword', {
      secretName: 'OpenSearchMasterUserPassword',
      description: 'Master user password for OpenSearch domain',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'Admin' }),
        generateStringKey: 'password',
        excludeCharacters: '"@/\\',
        passwordLength: 16,
        requireEachIncludedType: true,
      },
    });

    const auditLogGroup = new logs.LogGroup(this, 'AuditLogGroup', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.domain = new opensearch.Domain(this, 'Domain', {
      domainName: domainName,
      version: opensearch.EngineVersion.OPENSEARCH_2_15,
      vpc: props.vpc,
      vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
      zoneAwareness: { enabled: true, availabilityZoneCount: 3 },
      capacity: {
        dataNodes: 3,
        dataNodeInstanceType: 'r6g.large.search',
        masterNodes: 3,
        masterNodeInstanceType: 'r6g.large.search',
        multiAzWithStandbyEnabled: true,
      },
      ebs: { volumeSize: 100, volumeType: ec2.EbsDeviceVolumeType.GP3 },
      nodeToNodeEncryption: true,
      encryptionAtRest: { enabled: true },
      enforceHttps: true,
      automatedSnapshotStartHour: 0,
      securityGroups: [openSearchSG],
      accessPolicies: [new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['es:*'],
        principals: [new iam.AnyPrincipal()],
        resources: ['*'],
      })],
      fineGrainedAccessControl: {
        masterUserName: 'Admin',
        masterUserPassword: masterUserPassword.secretValueFromJson('password'),
      },
      logging: {
        slowSearchLogEnabled: true,
        appLogEnabled: true,
        slowIndexLogEnabled: true,
        auditLogEnabled: true,
        auditLogGroup: auditLogGroup,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new cdk.CfnOutput(this, 'OpenSearchDomainEndpoint', {
      value: this.domain.domainEndpoint,
      description: 'OpenSearch Domain Endpoint',
      exportName: 'OpenSearchDomainEndpoint',
    });

    new cdk.CfnOutput(this, 'OpenSearchDomainName', {
      value: domainName,
      description: 'OpenSearch Domain Name',
      exportName: 'OpenSearchDomainName',
    });
  }
}
