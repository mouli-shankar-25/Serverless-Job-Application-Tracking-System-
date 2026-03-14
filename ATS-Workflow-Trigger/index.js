const { SFNClient, StartExecutionCommand } = require("@aws-sdk/client-sfn");
const sfn = new SFNClient({ region: "us-east-1" });

exports.handler = async (event) => {
    try {
        // Get Application ID from URL path: /applications/{id}/transition
        const appId = event.pathParameters.id;
        const body = JSON.parse(event.body);

        // Prepare Input for Step Function
        const input = {
            application_id: appId,
            action: body.action,       // e.g., "Advance"
            candidate_email: body.candidate_email,
            new_stage: body.new_stage
        };

        // Start the Workflow
        const command = new StartExecutionCommand({
            stateMachineArn: process.env.STATE_MACHINE_ARN,
            input: JSON.stringify(input)
        });

        const result = await sfn.send(command);

        return { statusCode: 200, body: JSON.stringify({ executionArn: result.executionArn }) };
    } catch (err) {
        console.error(err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};