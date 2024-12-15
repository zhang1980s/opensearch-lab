#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { VpcStack } from '../lib/stacks/vpc-stack';
import { OpenSearchStack } from '../lib/stacks/opensearch-stack';


const app = new cdk.App();

const projectName = app.node.tryGetContext('projectName') || 'OpenSearchLab';

const env = {
  account: process.env.CDK_DEPLOY_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEPLOY_REGION || process.env.CDK_DEFAULT_REGION,
};

const vpcStack = new VpcStack(app, 'VpcStack', {
  stackName: `${projectName}-VpcStack`,
  env: env,
});

const openSearchStack = new OpenSearchStack(app, 'OpenSearchStack', {
  stackName: `${projectName}-OpenSearchStack`,
  env: env,
  vpc: vpcStack.vpc,
});

openSearchStack.addDependency(vpcStack);

app.synth();
