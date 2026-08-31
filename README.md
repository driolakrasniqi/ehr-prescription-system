# EHR Prescription Management System

A thesis project for managing patients, clinical staff, clinics, pharmacies, and user access workflows.

## Technologies

- React and TypeScript
- Node.js and Express
- MySQL
- JWT authentication

## Requirements

- Node.js 20+
- MySQL 8+
- Git

## Installation

### 1. Clone the repository

```powershell
git clone https://github.com/driolakrasniqi/ehr-prescription-system.git
cd ehr-prescription-system
```

### 2. Create the database

In MySQL Workbench, create the database:

```sql
CREATE DATABASE ehr_eprescription
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;
```

Open and execute:

```text
database/schema.sql
```

### 3. Configure the backend

```powershell
cd backend
npm install
Copy-Item .env.example .env
```

Open `backend/.env` and enter your MySQL credentials:

```env
NODE_ENV=development
PORT=5000

DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=ehr_eprescription
DB_USER=your_mysql_user
DB_PASSWORD=your_mysql_password

FRONTEND_URL=http://localhost:5175

JWT_ACCESS_SECRET=replace_with_a_secret_at_least_32_characters_long

ACCESS_TOKEN_TTL_MINUTES=15
REFRESH_TOKEN_TTL_DAYS=7
REFRESH_COOKIE_NAME=ehr_refresh_token

BCRYPT_SALT_ROUNDS=12

LOGIN_RATE_LIMIT_WINDOW_MINUTES=15
LOGIN_RATE_LIMIT_MAX_ATTEMPTS=10
```

Create the initial administrator:

```powershell
$env:SEED_ADMIN_PASSWORD = "ChooseYourPassword123!"
npm run seed
```

Administrator login:

```text
Email: admin@ehr.local
Password: the password selected above
```

### 4. Create demo accounts

After creating the initial administrator, run:

```powershell
npm run seed:demo
```

This creates a demo clinic, pharmacy, doctor, pharmacist, and patient.

| Role | Email | Password |
|---|---|---|
| Doctor | `demo.doctor@example.com` | `DemoDoctor123!` |
| Pharmacist | `demo.pharmacist@example.com` | `DemoPharmacist123!` |
| Patient | `demo.patient@example.com` | `DemoPatient123!` |

The accounts are created only in the local database and contain demonstration data. Running the command again skips records that already exist.

### 5. Configure the frontend

Open another PowerShell terminal from the main project folder:

```powershell
cd frontend
npm install
Copy-Item .env.example .env
```

The frontend environment file should contain:

```env
VITE_API_URL=http://localhost:5000/api/v1
```

## Running the project

From the main project folder:

```powershell
npm install
npm run dev
```

Open:

```text
http://localhost:5175
```

The backend runs at:

```text
http://localhost:5000
```

## Testing

### Backend

Create a separate test database and import `database/schema.sql` into it:

```sql
CREATE DATABASE ehr_eprescription_test
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;
```

Then run:

```powershell
cd backend
$env:DB_NAME = "ehr_eprescription_test"
npm test
```

### Frontend

```powershell
cd frontend
npm run lint
npm run build
```

## Important

This is an academic prototype. Do not use real patient information or commit `.env` files, passwords, tokens, or database credentials.