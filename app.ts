import express, { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createDatabaseConnection } from './db';
import crypto from 'crypto';

const app = express();
app.use(express.json());
const PORT = 3000;
const TZ_JWT_SECRET_KEY = "B@judit0k02018112233445566778899";

let dbConnection:any;

// Initialize the database connection
createDatabaseConnection()
  .then((connection) => {
    dbConnection = connection;
    
    // Start the server after the database connection is established
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Error connecting to the database:', error);
  });

// Gracefully close the database connection on process termination
process.on('SIGINT', async () => {
  if (dbConnection) {
    await dbConnection.close();
    console.log('Database connection closed.');
  }
  process.exit(0);
});

// Middleware to verify JWT token
const verifyToken = (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    jwt.verify(token, TZ_JWT_SECRET_KEY, (err, decoded) => {
    if (err) return res.status(401).json({ message: 'Token is not valid' });

    // Attach user information to the request for further processing
    (req as any).user = decoded;
    next();
    });
};

// Middleware to check daily limit and prevent repeated profiles
const checkDailyLimit = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { user_id } = req.params; // Assuming user information is attached to the request
        
        // Logic to check daily limit
        const checkUserType = await dbConnection.query('SELECT * FROM users WHERE user_id = $1', [user_id]);
        if (checkUserType.rows[0].type === 'premium') {
          next(); // Continue to the next middleware or route handler
          return;
        } else {
            const todaySwipeCountResult = await dbConnection.query('SELECT COUNT(*) FROM swipe_history WHERE user_id = $1 AND swipe_date = CURRENT_DATE', [user_id]);
            const todaySwipeCount = parseInt(todaySwipeCountResult.rows[0].count, 10);
        
            if (todaySwipeCount >= 10) {
              return res.status(403).json({ message: 'Daily swipe limit exceeded' });
            }
        
            next(); // Continue to the next middleware or route handler
        }
        
      } catch (error) {
        console.error('Error in checkDailyLimit middleware:', error);
        res.status(500).json({ error: 'Internal Server Error' });
      }
  };

// encrypt password
const encrypt = (text: string, secretKey: string): string => {
    const cipher = crypto.createCipher('aes-256-cbc', secretKey);
    let encrypted = cipher.update(text, 'utf-8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
}

app.post('/api/login', async (req: Request, res: Response) => {
    const { username, password } = req.body;
    const encryptedText = encrypt(password, TZ_JWT_SECRET_KEY);

    await dbConnection.query(`SELECT * FROM users WHERE username='${username}' AND password='${encryptedText}'`, (err:any, results:any) => {
        if (err) {
          console.error("Error fetching users:", err);
          res.status(500).json({ error: "Internal server error" });
          return;
        }

        if (results.length === 0) {
            res.status(404).json({ error: "User not found" });
            return;
        } else {
            // Create a JWT token
            const user = { id: results[0].id, username: results[0].username };
            const token = jwt.sign(user, TZ_JWT_SECRET_KEY, { expiresIn: '1h' });
            res.json({ users: { id: results[0].id, username: results[0].username, type: results[0].type, token: token} });
        }
      });

    
});

app.post("/api/signup", verifyToken, async (req: Request, res: Response) => {
    const { username, display_name, gender, password } = req.body;
    const encryptedText = encrypt(password, TZ_JWT_SECRET_KEY);

    const sqlQuery = `INSERT INTO users (username,password,type) VALUES (?,?,'regular')`;
    const sqlQueryProfile = `INSERT INTO profiles (user_id,display_name,gender) VALUES (?,?,?)`;

    await dbConnection.query(sqlQuery, [username, encryptedText], async (err:any, results:any) => {
      if (err) {
        console.error("Error insert users:", err);
        res.status(500).json({ error: "Internal server error" });
        return;
      } else {
        await dbConnection.query(sqlQueryProfile, [results.insertId, display_name, gender], (err:any, results:any) => {
            if (err) {
              console.error("Error insert profiles:", err);
              res.status(500).json({ error: "Internal server error" });
              return;
            } else {
                res.json({ users: results });
            }
          });
      }
    });
});

// API endpoint to get a profile
app.get('/profile/:userId', checkDailyLimit, async (req: Request, res: Response) => {
    const { user_id } = req.params;
    try {
      // Logic to get a profile from the database
      const result = await dbConnection.query(`SELECT * FROM profiles WHERE id NOT IN (SELECT profile_id FROM swipe_history WHERE user_id= ${user_id}) ORDER BY RANDOM() LIMIT 1`);
      const profile = result.rows[0];
      res.json({ profile });
    } catch (error) {
      console.error('Error fetching profile:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

// API endpoint to swipe left (pass) on a profile
app.post('/api/swipe/left/:userId', verifyToken, checkDailyLimit, async (req, res) => {
    const { user_id } = req.params;
    
    try {
      // Logic to record the left swipe in the database
      await dbConnection.query('INSERT INTO swipe_history (user_id, action, swipe_date) VALUES ($1, $2, CURRENT_DATE)', [user_id, 'pass']);
      res.json({ message: 'Swipe left successful' });
    } catch (error) {
      console.error('Error recording left swipe:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
});
  
// API endpoint to swipe right (like) on a profile
app.post('/api/swipe/right/:userId', verifyToken, checkDailyLimit, async (req, res) => {
const { user_id } = req.params;

try {
    // Logic to record the right swipe in the database
    await dbConnection.query('INSERT INTO swipe_history (user_id, action, swipe_date) VALUES ($1, $2, CURRENT_DATE)', [user_id, 'like']);
    res.json({ message: 'Swipe right successful' });
} catch (error) {
    console.error('Error recording right swipe:', error);
    res.status(500).json({ error: 'Internal Server Error' });
}
});

// API endpoint to update user type
app.put('/api/user/:userId', verifyToken, async (req, res) => {
    const { user_id, type } = req.body;
    try {
      // Logic to update user type
      await dbConnection.query('UPDATE users SET type = $1 WHERE user_id = $2', [type, user_id]);
      res.json({ message: 'User type updated successfully' });
    } catch (error) {
      console.error('Error updating user type:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });