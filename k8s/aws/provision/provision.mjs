import {
  EC2Client,
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
  DescribeKeyPairsCommand,
  CreateKeyPairCommand,
  DescribeSecurityGroupsCommand,
  CreateSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand,
  RunInstancesCommand,
  DescribeInstancesCommand,
  waitUntilInstanceRunning,
  AllocateAddressCommand,
  AssociateAddressCommand,
  DescribeAddressesCommand,
} from "@aws-sdk/client-ec2";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { writeFileSync, chmodSync } from "node:fs";

const REGION = process.env.AWS_REGION || "us-east-2";
const MY_IP = process.env.MY_IP;
const KEY_NAME = "newevent-k3s-key";
const SG_NAME = "newevent-k3s-sg";
const INSTANCE_NAME = "newevent-k3s-node";

if (!MY_IP) {
  console.error("MY_IP env var is required (your current public IP, no CIDR suffix)");
  process.exit(1);
}

const ec2 = new EC2Client({ region: REGION });
const ssm = new SSMClient({ region: REGION });

async function getUbuntuAmi() {
  const param = await ssm.send(
    new GetParameterCommand({
      Name: "/aws/service/canonical/ubuntu/server/22.04/stable/current/amd64/hvm/ebs-gp2/ami-id",
    }),
  );
  return param.Parameter.Value;
}

async function getDefaultVpcAndSubnet() {
  const vpcs = await ec2.send(
    new DescribeVpcsCommand({ Filters: [{ Name: "isDefault", Values: ["true"] }] }),
  );
  if (!vpcs.Vpcs || vpcs.Vpcs.length === 0) {
    throw new Error("No default VPC found in this account/region");
  }
  const vpcId = vpcs.Vpcs[0].VpcId;

  const subnets = await ec2.send(
    new DescribeSubnetsCommand({ Filters: [{ Name: "vpc-id", Values: [vpcId] }] }),
  );
  const subnetId = subnets.Subnets[0].SubnetId;
  return { vpcId, subnetId };
}

async function ensureKeyPair() {
  try {
    await ec2.send(new DescribeKeyPairsCommand({ KeyNames: [KEY_NAME] }));
    console.log(`Key pair ${KEY_NAME} already exists (reusing) - private key must already be on disk.`);
    return;
  } catch (e) {
    if (e.name !== "InvalidKeyPair.NotFound") throw e;
  }
  const created = await ec2.send(new CreateKeyPairCommand({ KeyName: KEY_NAME }));
  const keyPath = new URL("../newevent-k3s-key.pem", import.meta.url).pathname;
  writeFileSync(keyPath, created.KeyMaterial);
  chmodSync(keyPath, 0o400);
  console.log(`Created key pair, saved to ${keyPath}`);
}

async function ensureSecurityGroup(vpcId) {
  const existing = await ec2.send(
    new DescribeSecurityGroupsCommand({
      Filters: [
        { Name: "group-name", Values: [SG_NAME] },
        { Name: "vpc-id", Values: [vpcId] },
      ],
    }),
  );
  if (existing.SecurityGroups?.length > 0) {
    console.log(`Security group ${SG_NAME} already exists (reusing).`);
    return existing.SecurityGroups[0].GroupId;
  }

  const created = await ec2.send(
    new CreateSecurityGroupCommand({
      GroupName: SG_NAME,
      Description: "newevent k3s node - ssh from admin ip, k8s api + http/https public",
      VpcId: vpcId,
    }),
  );
  const groupId = created.GroupId;

  await ec2.send(
    new AuthorizeSecurityGroupIngressCommand({
      GroupId: groupId,
      IpPermissions: [
        {
          IpProtocol: "tcp",
          FromPort: 22,
          ToPort: 22,
          IpRanges: [{ CidrIp: `${MY_IP}/32`, Description: "SSH from admin machine" }],
        },
        {
          IpProtocol: "tcp",
          FromPort: 6443,
          ToPort: 6443,
          IpRanges: [{ CidrIp: "0.0.0.0/0", Description: "k8s API - secured by mTLS client cert" }],
        },
        {
          IpProtocol: "tcp",
          FromPort: 80,
          ToPort: 80,
          IpRanges: [{ CidrIp: "0.0.0.0/0", Description: "HTTP ingress - public site" }],
        },
        {
          IpProtocol: "tcp",
          FromPort: 443,
          ToPort: 443,
          IpRanges: [{ CidrIp: "0.0.0.0/0", Description: "HTTPS ingress - public site" }],
        },
      ],
    }),
  );
  console.log(`Created security group ${groupId} with 4 ingress rules.`);
  return groupId;
}

async function findExistingInstance() {
  const result = await ec2.send(
    new DescribeInstancesCommand({
      Filters: [
        { Name: "tag:Name", Values: [INSTANCE_NAME] },
        { Name: "instance-state-name", Values: ["pending", "running"] },
      ],
    }),
  );
  const instances = result.Reservations?.flatMap((r) => r.Instances) || [];
  return instances[0];
}

async function launchInstance(amiId, subnetId, sgId) {
  const existing = await findExistingInstance();
  if (existing) {
    console.log(`Instance ${existing.InstanceId} already exists (reusing).`);
    return existing.InstanceId;
  }

  const result = await ec2.send(
    new RunInstancesCommand({
      ImageId: amiId,
      InstanceType: "t3.small",
      KeyName: KEY_NAME,
      MinCount: 1,
      MaxCount: 1,
      SubnetId: subnetId,
      SecurityGroupIds: [sgId],
      BlockDeviceMappings: [
        {
          DeviceName: "/dev/sda1",
          Ebs: { VolumeSize: 30, VolumeType: "gp3" },
        },
      ],
      TagSpecifications: [
        {
          ResourceType: "instance",
          Tags: [{ Key: "Name", Value: INSTANCE_NAME }],
        },
      ],
    }),
  );
  const instanceId = result.Instances[0].InstanceId;
  console.log(`Launched instance ${instanceId}, waiting for it to be running...`);
  await waitUntilInstanceRunning(
    { client: ec2, maxWaitTime: 180 },
    { InstanceIds: [instanceId] },
  );
  return instanceId;
}

async function ensureElasticIp(instanceId) {
  const addresses = await ec2.send(
    new DescribeAddressesCommand({
      Filters: [{ Name: "instance-id", Values: [instanceId] }],
    }),
  );
  if (addresses.Addresses?.length > 0) {
    console.log("Elastic IP already associated (reusing).");
    return addresses.Addresses[0].PublicIp;
  }

  const allocated = await ec2.send(new AllocateAddressCommand({ Domain: "vpc" }));
  await ec2.send(
    new AssociateAddressCommand({
      AllocationId: allocated.AllocationId,
      InstanceId: instanceId,
    }),
  );
  console.log(`Allocated and associated Elastic IP ${allocated.PublicIp}`);
  return allocated.PublicIp;
}

const amiId = await getUbuntuAmi();
console.log(`Ubuntu 22.04 AMI: ${amiId}`);

const { vpcId, subnetId } = await getDefaultVpcAndSubnet();
console.log(`Using default VPC ${vpcId}, subnet ${subnetId}`);

await ensureKeyPair();
const sgId = await ensureSecurityGroup(vpcId);
const instanceId = await launchInstance(amiId, subnetId, sgId);
const publicIp = await ensureElasticIp(instanceId);

console.log("\n=== DONE ===");
console.log(`Instance ID: ${instanceId}`);
console.log(`Public IP: ${publicIp}`);
