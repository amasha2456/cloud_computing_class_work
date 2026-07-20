import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const sesClient = new SESClient({});

export const handler = async (event) => {
  const eventId = event?.eventId ?? "unknown";
  const eventTitle = event?.eventTitle || eventId;
  const attendeeName = event?.attendeeName || "there";
  const to = event?.to;
  const ticketcount = event?.ticketcount ?? "unknown";
  const remainingSeats = event?.remainingSeats ?? "unknown";

  const sourceEmail = process.env.SES_FROM_EMAIL;

  const command = new SendEmailCommand({
    Source: sourceEmail,
    Destination: {
      ToAddresses: [to],
    },
    Message: {
      Subject: {
        Data: `Not enough seats available: ${eventTitle}`,
      },
      Body: {
        Html: {
          Data: `
            <p>Hi ${attendeeName},</p>
            <p>You requested <strong>${ticketcount}</strong> ticket(s) for <strong>${eventTitle}</strong>, but only <strong>${remainingSeats}</strong> seat(s) are currently available.</p>
            <p>Please try registering again with a smaller number of tickets.</p>
          `,
        },
        Text: {
          Data: `Hi ${attendeeName}, you requested ${ticketcount} ticket(s) for ${eventTitle}, but only ${remainingSeats} seat(s) are currently available. Please try registering again with a smaller number of tickets.`,
        },
      },
    },
  });

  const result = await sesClient.send(command);

  console.log("Seats-unavailable notification sent", {
    eventId,
    ticketcount,
    remainingSeats,
    to,
    messageId: result.MessageId,
  });

  return {
    statusCode: 200,
    messageId: result.MessageId,
  };
};
