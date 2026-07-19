import {
  IAMClient,
  CreateRoleCommand,
  GetRoleCommand,
  AttachRolePolicyCommand,
  PutRolePolicyCommand,
} from "@aws-sdk/client-iam";
import {
  LambdaClient,
  CreateFunctionCommand,
  GetFunctionCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  waitUntilFunctionActiveV2,
  waitUntilFunctionUpdatedV2,
} from "@aws-sdk/client-lambda";
import { readFileSync } from "node:fs";

const REGION = process.env.AWS_REGION || "us-east-2";
const ROLE_NAME = "low-seats-notifier-role";
const FUNCTION_NAME = "low-seats-notifier";
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL;
const LOW_SEATS_NOTIFY_EMAIL = process.env.LOW_SEATS_NOTIFY_EMAIL || SES_FROM_EMAIL;
const ZIP_PATH = process.env.ZIP_PATH;

if (!SES_FROM_EMAIL || !ZIP_PATH) {
  console.error("SES_FROM_EMAIL and ZIP_PATH env vars are required");
  process.exit(1);
}

const envVars = { SES_FROM_EMAIL, LOW_SEATS_NOTIFY_EMAIL };

const iam = new IAMClient({ region: REGION });
const lambda = new LambdaClient({ region: REGION });

const trustPolicy = JSON.stringify({
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "lambda.amazonaws.com" },
      Action: "sts:AssumeRole",
    },
  ],
});

const sesPolicy = JSON.stringify({
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Action: ["ses:SendEmail", "ses:SendRawEmail"],
      Resource: "*",
    },
  ],
});

async function ensureRole() {
  try {
    const existing = await iam.send(new GetRoleCommand({ RoleName: ROLE_NAME }));
    console.log(`Role ${ROLE_NAME} already exists: ${existing.Role.Arn}`);
    return existing.Role.Arn;
  } catch (e) {
    if (e.name !== "NoSuchEntityException") throw e;
  }

  const created = await iam.send(
    new CreateRoleCommand({
      RoleName: ROLE_NAME,
      AssumeRolePolicyDocument: trustPolicy,
      Description: "Execution role for the low-seats-notifier Lambda",
    }),
  );
  console.log(`Created role: ${created.Role.Arn}`);

  await iam.send(
    new AttachRolePolicyCommand({
      RoleName: ROLE_NAME,
      PolicyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
    }),
  );
  console.log("Attached AWSLambdaBasicExecutionRole");

  await iam.send(
    new PutRolePolicyCommand({
      RoleName: ROLE_NAME,
      PolicyName: "low-seats-notifier-ses-send",
      PolicyDocument: sesPolicy,
    }),
  );
  console.log("Attached inline SES send policy");

  return created.Role.Arn;
}

async function ensureFunction(roleArn) {
  const zipBytes = readFileSync(ZIP_PATH);

  let exists = false;
  try {
    await lambda.send(new GetFunctionCommand({ FunctionName: FUNCTION_NAME }));
    exists = true;
  } catch (e) {
    if (e.name !== "ResourceNotFoundException") throw e;
  }

  if (exists) {
    console.log(`Function ${FUNCTION_NAME} exists, updating code + config...`);
    await lambda.send(
      new UpdateFunctionCodeCommand({
        FunctionName: FUNCTION_NAME,
        ZipFile: zipBytes,
      }),
    );
    await waitUntilFunctionUpdatedV2(
      { client: lambda, maxWaitTime: 60 },
      { FunctionName: FUNCTION_NAME },
    );
    await lambda.send(
      new UpdateFunctionConfigurationCommand({
        FunctionName: FUNCTION_NAME,
        Runtime: "nodejs22.x",
        Handler: "index.handler",
        Timeout: 10,
        MemorySize: 128,
        Environment: { Variables: envVars },
        Role: roleArn,
      }),
    );
    await waitUntilFunctionUpdatedV2(
      { client: lambda, maxWaitTime: 60 },
      { FunctionName: FUNCTION_NAME },
    );
    console.log("Updated existing function.");
    return;
  }

  console.log(`Creating function ${FUNCTION_NAME}...`);
  await lambda.send(
    new CreateFunctionCommand({
      FunctionName: FUNCTION_NAME,
      Runtime: "nodejs22.x",
      Handler: "index.handler",
      Role: roleArn,
      Code: { ZipFile: zipBytes },
      Timeout: 10,
      MemorySize: 128,
      Environment: { Variables: envVars },
      Description: "Sends a notification email when an event's seatsAvailable drops below threshold",
    }),
  );

  await waitUntilFunctionActiveV2(
    { client: lambda, maxWaitTime: 60 },
    { FunctionName: FUNCTION_NAME },
  );
  console.log("Function created and active.");
}

const roleArn = await ensureRole();
console.log("Waiting 10s for IAM role propagation...");
await new Promise((r) => setTimeout(r, 10000));
await ensureFunction(roleArn);
console.log("Done.");
