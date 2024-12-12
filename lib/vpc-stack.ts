import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class VpcStack extends cdk.Stack {
    public readonly vpc: ec2.Vpc;
    public readonly vpcPeeringConnection: ec2.CfnVPCPeeringConnection;

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        this.vpc = new ec2.Vpc(this, 'OpenSearchLabVPC', {
            maxAzs: 3,
            subnetConfiguration: [
                {
                    cidrMask: 24,
                    name: 'Private-isolated',
                    subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
                },
                {
                    cidrMask: 24,
                    name: 'Public',
                    subnetType: ec2.SubnetType.PUBLIC,
                },
            ],
        });

        new cdk.CfnOutput(this, 'VpcId', {
            value: this.vpc.vpcId,
            description: 'VPC ID',
             exportName: 'OpenSearchLabVpcId',
        });
    }
}