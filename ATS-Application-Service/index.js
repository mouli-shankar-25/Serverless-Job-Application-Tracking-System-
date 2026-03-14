const { Client } = require('pg');
const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");

const sqs = new SQSClient({ region: "us-east-1" });

const QUEUE_URL = process.env.QUEUE_URL; 
if (!QUEUE_URL) {
    throw new Error("QUEUE_URL environment variable is missing");
}

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 5432,
    ssl: { rejectUnauthorized: false }
};

exports.handler = async (event) => {
    const client = new Client(dbConfig);
    await client.connect();

    try {
        const method = event.requestContext.http.method;
        const path = event.requestContext.http.path;
        
        // Identity
        const claims = event.requestContext.authorizer.jwt.claims;
        const userEmail = claims.email;
        
        const userRes = await client.query("SELECT user_id, role FROM users WHERE email = $1", [userEmail]);
        const user = userRes.rows[0];
        if (!user) return { statusCode: 401, body: "User not found." };

        // --- POST /apply (Candidates Only) ---
        if (method === 'POST' && path === '/apply') {
            if (user.role !== 'candidate') return { statusCode: 403, body: "Candidates only" };
            
            const body = JSON.parse(event.body);
            const res = await client.query(
                `INSERT INTO applications (job_id, candidate_id, current_stage) 
                 VALUES ($1, $2, 'Applied') RETURNING *`,
                [body.job_id, user.user_id]
            );

            // Notify Candidate AND Recruiter
            await sqs.send(new SendMessageCommand({
                QueueUrl: QUEUE_URL,
                MessageBody: JSON.stringify({
                    candidate_email: userEmail,
                    msg: `Application Received for Job ${body.job_id}`
                })
            }));

            return { statusCode: 201, body: JSON.stringify(res.rows[0]) };
        }

        // --- GET /my-applications (Candidates Only) ---
        if (method === 'GET' && path === '/my-applications') {
            const res = await client.query(
                `SELECT a.*, j.title, c.name as company 
                 FROM applications a 
                 JOIN jobs j ON a.job_id = j.job_id 
                 JOIN companies c ON j.company_id = c.company_id
                 WHERE a.candidate_id = $1`,
                [user.user_id]
            );
            return { statusCode: 200, body: JSON.stringify(res.rows) };
        }

        // --- GET /job-applications (Recruiters OR Hiring Managers) ---
        if (method === 'GET' && path === '/job-applications') {
            if (user.role !== 'recruiter' && user.role !== 'hiring_manager') {
                return { statusCode: 403, body: "Access Denied: Management Only" };
            }
            
            const jobId = event.queryStringParameters.job_id;
            const res = await client.query(
                `SELECT a.*, u.first_name, u.last_name, u.email 
                 FROM applications a JOIN users u ON a.candidate_id = u.user_id
                 WHERE a.job_id = $1`,
                [jobId]
            );
            return { statusCode: 200, body: JSON.stringify(res.rows) };
        }

        return { statusCode: 404, body: "Not Found" };

    } catch (err) {
        console.error(err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    } finally {
        await client.end();
    }
};
