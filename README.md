# Dating App Service
This service provides backend functionality for a dating application, including user authentication, profile matching, and swipe functionality.

# Structure
The service is structured as follows:

- app.ts: Main entry point for the application, setting up the Express server, middleware, and API endpoints.
- db.ts: Manages the connection to the MySQL database using the mysql library.

# How to Run the Service
Follow the steps below to run the dating app service:

# Prerequisites
1. Node.js: Ensure you have Node.js installed.
2. MySQL Database: Set up a MySQL database and update the connection details in db.ts.

# Installation
1. Clone the repository:
```
git clone https://github.com/bagindaisfa/dating-app-backend.git
```

3. Navigate to the project folder:
```
cd dating-app-service
```

3. Install dependencies:
```
npm install
```

# Database Setup
1. Create a MySQL database named dating_app.
2. Import the database schema from database.sql.

# Configuration
1. Update the JWT secret key in app.ts:
```
const TZ_JWT_SECRET_KEY = "your-secret-key";
```

# Running the Service
1. Start the service:
```
npx ts-node app.ts
```

The service will be available at http://localhost:3000.

# API Endpoints
Login: POST /api/login
Signup: POST /api/signup
Get Profile: GET /api/profile
Left Swipe: POST /api/swipe/left
Right Swipe: POST /api/swipe/right
Update User Type: PUT /api/user
