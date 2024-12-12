import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';


interface OpenSearchStackProps extends cdk.StackProps {
    vpc: ec2.IVpc;
}

export class OpenSearchStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: OpenSearchStackProps) {
        super(scope, id, props);

        
        // const domainName = this.stackName.toLowerCase();
        const domainName = 'opensearchlab';

        const subnets = props.vpc.selectSubnets({
            subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
            onePerAz: true,
            availabilityZones: props.vpc.availabilityZones.slice(0, 3)
        }).subnets;

        // Create a security group for OpenSearch
        const openSearchSG = new ec2.SecurityGroup(this, 'OpenSearchSG', {
            vpc: props.vpc,
            description: 'Security group for OpenSearch domain',
            allowAllOutbound: true
        });

        openSearchSG.addIngressRule(
            ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
            ec2.Port.tcp(443),
            'Allow HTTPS traffic from specific IP range'
        );

        const accessPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['es:*'],
            principals: [new iam.AnyPrincipal()],
            resources: ['*'],
        });

        // Create a secret for the master user password
        const masterUserPassword = new secretsmanager.Secret(this, 'OpenSearchMasterUserPassword', {
            secretName: 'OpenSearchMasterUserPassword',
            generateSecretString: {
                secretStringTemplate: JSON.stringify({ username: 'Admin' }),
                generateStringKey: 'password',
                excludeCharacters: '"@/\\', // Exclude characters that might cause issues
                passwordLength: 16,
                requireEachIncludedType: true // Ensure at least one of each character type
            },
        });

        const auditLogGroup = new logs.LogGroup(this, 'AuditLogGroup', {
            logGroupName: '/aws/opensearch/domains/${domainName}/audit-logs  ',
            retention: logs.RetentionDays.ONE_WEEK,
            removalPolicy: cdk.RemovalPolicy.DESTROY
        });

        const openSearchDomain = new opensearch.Domain(this, 'OpenSearchDomain', {
            domainName: domainName,
            version: opensearch.EngineVersion.OPENSEARCH_2_15,
            vpc: props.vpc,
            vpcSubnets: [{ subnets }],
            zoneAwareness: {
                enabled: true,
                availabilityZoneCount: 3,
            },
            capacity: {
                dataNodes: 3,
                dataNodeInstanceType: 'r6g.large.search',
                masterNodes: 3,
                masterNodeInstanceType: 'r6g.large.search',
                multiAzWithStandbyEnabled: true,
            },
            ebs: {
                volumeSize: 100,
                volumeType: ec2.EbsDeviceVolumeType.GP3,
            },
            nodeToNodeEncryption: true,
            encryptionAtRest: {
                enabled: true,
            },
            enforceHttps: true,
            automatedSnapshotStartHour: 0,
            securityGroups: [openSearchSG],
            accessPolicies: [accessPolicy],
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
            removalPolicy: cdk.RemovalPolicy.DESTROY
        });

        // EC2 Proxy instance

        const ec2SecurityGroup = new ec2.SecurityGroup(this, 'EC2SecurityGroup', {
            vpc: props.vpc,
            description: 'Security group for Proxy EC2 instance',
            allowAllOutbound: true
        });

        ec2SecurityGroup.addIngressRule(
            ec2.Peer.anyIpv4(),
            ec2.Port.tcp(80),
            'Allow HTTP traffic from anywhere'
        );

        ec2SecurityGroup.addIngressRule(
            ec2.Peer.anyIpv4(),
            ec2.Port.tcp(443),
            'Allow HTTPS traffic from anywhere'
        );

        ec2SecurityGroup.addIngressRule(
            ec2.Peer.anyIpv4(),
            ec2.Port.tcp(22),
            'Allow SSH traffic from anywhere'
        );

        const ec2Role = new iam.Role(this, 'EC2SSMRole', {
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
            ]
        });

        // Create user data script
        const userDataScript = ec2.UserData.forLinux();
        userDataScript.addCommands(
            '#!/bin/bash',
            'sudo yum update -y',
            'sudo amazon-linux-extras install nginx1 -y',
            'sudo mkdir /etc/nginx/ssl',
            'sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout /etc/nginx/ssl/nginx-selfsigned.key -out /etc/nginx/ssl/nginx-selfsigned.crt -subj "/C=SG/ST=State/L=City/O=Organization/OU=Unit/CN=zzhe.xyz"',
            'sudo mkdir -p /etc/nginx/conf.d',
            'cat > /etc/nginx/conf.d/reverse-proxy.conf << EOL',
            'server {',
            '    listen 443 ssl;',
            '    server_name _;',
            '',
            '    ssl_certificate /etc/nginx/ssl/nginx-selfsigned.crt;',
            '    ssl_certificate_key /etc/nginx/ssl/nginx-selfsigned.key;',
            '',
            '    location / {',
            `        proxy_pass https://${openSearchDomain.domainEndpoint}/;`,
            '        proxy_set_header Host \\$host;',
            '        proxy_set_header X-Real-IP \\$remote_addr;',
            '        proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for;',
            '        proxy_set_header X-Forwarded-Proto \\$scheme;',
            '',
            '        proxy_ssl_verify off;',
            '        proxy_ssl_server_name on;',
            '        proxy_ssl_protocols TLSv1.2 TLSv1.3;',
            '    }',
            '}',
            '',
            'server {',
            '    listen 80;',
            '    server_name _;',
            '    return 301 https://\\$server_name\\$request_uri;',
            '}',
            'EOL',
            'sudo systemctl start nginx',
            'sudo systemctl enable nginx',
            'sudo nginx -t'
        );

        const ec2Instance = new ec2.Instance(this, 'NginxProxyInstance', {
            vpc: props.vpc,
            vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
            machineImage: ec2.MachineImage.latestAmazonLinux2(),
            securityGroup: ec2SecurityGroup,
            userData: userDataScript,
            role: ec2Role // Attach the IAM role to the EC2 instance
        });

        const eip = new ec2.CfnEIP(this, 'NginxProxyEIP', {
            instanceId: ec2Instance.instanceId,
            domain: 'vpc',
        });


        // Output the Elastic IP address and OpenSearch Dashboard URL
        new cdk.CfnOutput(this, 'NginxProxyPublicIP', {
            value: eip.ref,
            description: 'Public IP address of the Nginx Proxy',
            exportName: 'NginxProxyPublicIP',
        });

        new cdk.CfnOutput(this, 'OpenSearchDashboardUrl', {
            value: `https://${eip.ref}/_dashboards/`,
            description: 'URL for OpenSearch Dashboards',
            exportName: 'OpenSearchDashboardUrl',
        });

        new cdk.CfnOutput(this, 'OpenSearchDomainEndpoint', {
            value: openSearchDomain.domainEndpoint,
            description: 'Open Search Domain Endpoint',
            exportName: 'OpenSearchDomainEndpoint'
        });

        new cdk.CfnOutput(this, 'OpenSearchDomainName', {
            value: domainName,
            description: 'OpenSearch Domain Name',
            exportName: 'OpenSearchDomainName'
        });
    }
}