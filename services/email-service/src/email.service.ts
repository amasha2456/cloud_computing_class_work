import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import "dotenv/config";

const sesClient = new SESClient({
  region: process.env.AWS_REGION!,
});

type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export class SESService {
  async sendEmail({ to, subject, html, text }: SendEmailParams) {
    const command = new SendEmailCommand({
      Source: process.env.SES_FROM_EMAIL!,
      Destination: {
        ToAddresses: [to],
      },
      Message: {
        Subject: {
          Data: subject,
        },
        Body: {
          Html: {
            Data: html,
          },
          Text: {
            Data: text || "",
          },
        },
      },
    });

    return await sesClient.send(command);
  }
}
