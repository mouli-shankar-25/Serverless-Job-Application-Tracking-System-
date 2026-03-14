const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");
const ses = new SESClient({ region: "us-east-1" });

// --- FIX: LOAD FROM ENVIRONMENT VARIABLE ---
const SENDER_EMAIL = process.env.SENDER_EMAIL;

exports.handler = async (event) => {
    // Safety check
    if (!SENDER_EMAIL) {
        console.error("Missing SENDER_EMAIL environment variable");
        return { status: "Error", message: "Configuration Error" };
    }

    console.log("Processing batch size:", event.Records.length);

    for (const record of event.Records) {
        try {
            // 1. Parse the message body sent by SQS
            const body = JSON.parse(record.body);
            
            // Use the email sent from Step Function, or fallback
            // Note: In production, never fallback to a hardcoded email, 
            // but for this portfolio logic it handles missing data gracefully.
            const candidateEmail = body.candidate_email; 
            const messageText = body.msg || "Your application status has been updated.";

            if (!candidateEmail) {
                console.log("Skipping record: No candidate email provided");
                continue;
            }

            // 2. Define Email Params
            const params = {
                Source: SENDER_EMAIL, // USES ENV VARIABLE NOW
                Destination: { 
                    ToAddresses: [candidateEmail] 
                },
                Message: {
                    Subject: { Data: "ATS Notification" },
                    Body: {
                        Text: { Data: messageText }
                    }
                }
            };

            // 3. Send Email
            await ses.send(new SendEmailCommand(params));
            console.log(`Email sent successfully to ${candidateEmail}`);

        } catch (err) {
            console.error("Error sending email:", err);
            // We don't throw error here so we don't crash the whole batch processing
        }
    }
    return { status: "Done" };
};
