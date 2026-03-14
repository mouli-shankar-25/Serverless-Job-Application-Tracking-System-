const { Client } = require('pg');
const { CognitoIdentityProviderClient, AdminAddUserToGroupCommand } = require("@aws-sdk/client-cognito-identity-provider");

const cognito = new CognitoIdentityProviderClient({ region: "us-east-1" });

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 5432,
    ssl: { rejectUnauthorized: false }
};

exports.handler = async (event) => {
    console.log("Syncing User:", JSON.stringify(event));

    // 1. Parse User Data
    const { email, sub, given_name, family_name } = event.request.userAttributes;
    
    // Read the role requested during sign-up
    // (If the frontend doesn't send this, we default to 'candidate')
    const requestedRole = event.request.userAttributes['custom:requested_role'] || 'candidate';
    
    // 2. Determine Group and Role
    let targetGroup = 'Candidates'; // AWS Cognito Group
    let dbRole = 'candidate';       // PostgreSQL Role String

    const roleLower = requestedRole.toLowerCase();

    if (roleLower === 'recruiter') {
        targetGroup = 'Recruiters';
        dbRole = 'recruiter';
    } else if (roleLower === 'hiring_manager') {
        targetGroup = 'HiringManagers'; // Make sure this Group exists in Cognito!
        dbRole = 'hiring_manager';
    }

    try {
        // 3. AUTOMATION: Add User to Cognito Group
        const groupParams = {
            GroupName: targetGroup,
            UserPoolId: event.userPoolId,
            Username: event.userName
        };
        
        await cognito.send(new AdminAddUserToGroupCommand(groupParams));
        console.log(`User ${email} added to group ${targetGroup}`);

    } catch (err) {
        console.error(`Failed to assign group ${targetGroup}:`, err);
        // We log the error but allow the function to continue so the DB insert still happens.
    }

    const client = new Client(dbConfig);
    await client.connect();

    try {
        // 4. Insert into PostgreSQL with the CORRECT Role
        const query = `
            INSERT INTO users (cognito_sub, email, role, first_name, last_name)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (email) DO NOTHING
            RETURNING user_id;
        `;
        
        await client.query(query, [sub, email, dbRole, given_name, family_name]);
        console.log(`User ${email} synced to DB as ${dbRole}.`);

        // 5. Return success to Cognito (Crucial!)
        return event;

    } catch (err) {
        console.error("DB Sync Failed:", err);
        throw err; // Blocking error to prevent login if DB sync fails
    } finally {
        await client.end();
    }
};