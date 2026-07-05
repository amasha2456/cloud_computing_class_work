//import { APIGatewayProxyHandler } from "aws-lambda";
import { SESService } from "./email.service";
import type { Response, Request } from "express";

const sesService = new SESService();

//export const handler: APIGatewayProxyHandler = async (event) => {

export const handler = async (req: Request, res: Response) => {
  try {
    if (!req.body) {
      return res.status(400).json({
        message: "Request body is required",
      });
    }
    const { to, subject, html } = req.body;

    if (!to || !subject || !html) {
      return res.status(400).json({
        message: "Missing required fields",
      });
    }

    const result = await sesService.sendEmail({
      to,
      subject,
      html,
    });

    return res.status(200).json({
      messageId: result.MessageId,
      success: true,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
    });
  }
};

// handler({
//   to: "amasha@torchlabs.xyz",
//   subject: "Test Email",
//   html: "<h1>Test Email</h1>",
// });
