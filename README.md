# My AOS labs

## 创建环境

```
cdk-deploy-to.sh <account-id> <region> --all
```

## 架构 

1. 创建一个新的VPC

2. 在VPC中的private subnet中创建一个AOS domain， 3个master node， 3个data node。

3. 密码保存在secret manager中新创建的secret中

4. 创建一个给AOS用的安全组，允许本VPC的cidr访问。

5. 创建一个代理EC2