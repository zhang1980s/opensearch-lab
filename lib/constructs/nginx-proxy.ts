import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
import { Construct } from 'constructs';

interface NginxProxyProps {
    vpc: ec2.IVpc;
    openSearchDomain: opensearch.Domain;
}

export class NginxProxy extends Construct {
    public readonly proxyeip: ec2.CfnEIP;

    constructor(scope: Construct, id: string, props: NginxProxyProps) {
        super(scope, id);

        const ec2SecurityGroup = new ec2.SecurityGroup(this, 'EC2SecurityGroup', {
            vpc: props.vpc,
            description: 'Security group for Proxy EC2 instance',
            allowAllOutbound: true,
        });

        ec2SecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP traffic from anywhere');
        ec2SecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'Allow HTTPS traffic from anywhere');
        ec2SecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'Allow SSH traffic from anywhere');

        const ec2Role = new iam.Role(this, 'EC2SSMRole', {
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
            managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')],
        });

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
            `        proxy_pass https://${props.openSearchDomain.domainEndpoint}/;`,
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

        const proxyeip = new ec2.CfnEIP(this, 'NginxProxyEIP', {
            instanceId: ec2Instance.instanceId,
            domain: 'vpc',
        });

        new cdk.CfnOutput(this, 'NginxProxyPublicIP', {
            value: proxyeip.ref,
            description: 'Public IP address of the Nginx Proxy',
            exportName: 'NginxProxyPublicIP',
        });
    }
}