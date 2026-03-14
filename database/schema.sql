-- 1. Create Companies Table (Recruiters belong to companies)
CREATE TABLE companies (
    company_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create Users Table (Supports RBAC: Candidate, Recruiter, Hiring Manager)
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    cognito_sub VARCHAR(255) UNIQUE, -- Links to AWS Login later
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('candidate', 'recruiter', 'hiring_manager')),
    company_id INT REFERENCES companies(company_id), -- Nullable (Candidates don't have a company)
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create Jobs Table
CREATE TABLE jobs (
    job_id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(company_id),
    recruiter_id INT NOT NULL REFERENCES users(user_id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Create Applications Table (Tracks the workflow stage)
CREATE TABLE applications (
    application_id SERIAL PRIMARY KEY,
    job_id INT NOT NULL REFERENCES jobs(job_id),
    candidate_id INT NOT NULL REFERENCES users(user_id),
    current_stage VARCHAR(50) NOT NULL DEFAULT 'Applied',
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(job_id, candidate_id) -- Prevents applying to the same job twice
);

-- 5. Create Application History Table (Audit Log)
CREATE TABLE application_history (
    history_id SERIAL PRIMARY KEY,
    application_id INT NOT NULL REFERENCES applications(application_id),
    old_stage VARCHAR(50),
    new_stage VARCHAR(50) NOT NULL,
    changed_by INT REFERENCES users(user_id),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Add dummy data to verify it works
INSERT INTO companies (name) VALUES ('Tech Corp'), ('Cloud Solutions');