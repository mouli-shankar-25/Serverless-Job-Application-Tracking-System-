const { Client } = require('pg');

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 5432,
    ssl: { rejectUnauthorized: false }
};

// 1. DEFINE THE RULES
const VALID_TRANSITIONS = {
    "Applied":   ["Screening", "Rejected"],
    "Screening": ["Interview", "Rejected"],
    "Interview": ["Offer", "Rejected"],
    "Offer":     ["Hired", "Rejected"],
    "Hired":     [], // End of line
    "Rejected":  []  // End of line
};

exports.handler = async (event) => {
    const { application_id, new_stage, email } = event;
    const client = new Client(dbConfig);
    await client.connect();

    try {
        // 2. GET CURRENT STAGE
        const res = await client.query(
            "SELECT current_stage FROM applications WHERE application_id = $1", 
            [application_id]
        );
        
        if (res.rows.length === 0) throw new Error("Application not found");
        const currentStage = res.rows[0].current_stage;

        // 3. VALIDATE THE MOVE
        const allowedStages = VALID_TRANSITIONS[currentStage] || [];
        
        if (!allowedStages.includes(new_stage)) {
            // This Error will cause the Step Function to go to the Red "Fail" State
            throw new Error(`INVALID TRANSITION: Cannot move from ${currentStage} to ${new_stage}`);
        }

        // 4. IF VALID, UPDATE DB
        await client.query(
            'UPDATE applications SET current_stage = $1 WHERE application_id = $2',
            [new_stage, application_id]
        );

        // Audit Log
        await client.query(
            'INSERT INTO application_history (application_id, old_stage, new_stage, changed_at) VALUES ($1, $2, $3, NOW())',
            [application_id, currentStage, new_stage]
        );

        return { status: "Updated", email, new_stage };

    } catch (err) {
        console.error(err);
        throw err; // Crucial: Throwing ensures Step Function marks this as "Fail"
    } finally {
        await client.end();
    }
};