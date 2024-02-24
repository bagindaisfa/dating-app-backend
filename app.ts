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
        const { user_id } = req.query; // Assuming user information is attached to the request
        
        // Logic to check daily limit
        await dbConnection.query(`SELECT * FROM users WHERE id = ${user_id}`, async (err:any, results:any) => {
            if (err) {
              console.error("Error fetching user:", err);
              res.status(500).json({ error: "Internal server error" });
              return;
            }
    
            if (results.length === 0) {
                res.status(404).json({ error: "user not found" });
                return;
            } else {
                if (results[0].type === 'premium') {
                    next(); // Continue to the next middleware or route handler
                    return;
                } else {
                    await dbConnection.query(`SELECT COUNT(*) AS count FROM swipe_history WHERE user_id = ${user_id} AND swipe_date = CURRENT_DATE()`, (err:any, results:any) => {
                        if (err) {
                          console.error("Error fetching history:", err);
                          res.status(500).json({ error: "Internal server error" });
                          return;
                        }
                
                        if (results.length === 0) {
                            res.status(404).json({ error: "history not found" });
                            return;
                        } else {
                            const todaySwipeCountResult = results[0];
                            const todaySwipeCount = parseInt(todaySwipeCountResult.count, 10);
                        
                            if (todaySwipeCount >= 10) {
                                return res.status(403).json({ message: 'Daily swipe limit exceeded' });
                            }
                        
                            next(); // Continue to the next middleware or route handler
                        }
                    });   
                }
            }
          });
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

app.post("/api/signup", async (req: Request, res: Response) => {
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
app.get('/api/profile', verifyToken, checkDailyLimit, async (req: Request, res: Response) => {
    const { user_id } = req.query;
    
    try {
      // Logic to get a profile from the database
      await dbConnection.query(`SELECT * FROM profiles WHERE id NOT IN (SELECT profile_id FROM swipe_history WHERE user_id= ${user_id}) LIMIT 1`, (err:any, results:any) => {
        if (err) {
          console.error("Error fetching profile:", err);
          res.status(500).json({ error: "Internal server error" });
          return;
        }

        if (results.length === 0) {
            res.status(404).json({ error: "Profile not found" });
            return;
        } else {
            res.json({ profile: results });
        }
      });
      
    } catch (error) {
      console.error('Error fetching profile:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

// API endpoint to swipe left (pass) on a profile
app.post('/api/swipe/left', verifyToken, checkDailyLimit, async (req, res) => {
    const { user_id, profile_id } = req.query;
    
    try {
      // Logic to record the left swipe in the database
      await dbConnection.query(`INSERT INTO swipe_history (user_id, profile_id, action, swipe_date) VALUES (${user_id}, ${profile_id}, 'pass', CURRENT_DATE())`, (err:any, results:any) => {
        if (err) {
          console.error("Error insert history:", err);
          res.status(500).json({ error: "Internal server error" });
          return;
        }
        res.json({ message: 'Swipe left successful' });
      });
      
    } catch (error) {
      console.error('Error recording left swipe:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
});
  
// API endpoint to swipe right (like) on a profile
app.post('/api/swipe/right', verifyToken, checkDailyLimit, async (req, res) => {
const { user_id, profile_id } = req.query;

try {
    // Logic to record the right swipe in the database
    await dbConnection.query(`INSERT INTO swipe_history (user_id, profile_id, action, swipe_date) VALUES (${user_id}, ${profile_id}, 'like', CURRENT_DATE())`, (err:any, results:any) => {
        if (err) {
          console.error("Error insert history:", err);
          res.status(500).json({ error: "Internal server error" });
          return;
        }
        res.json({ message: 'Swipe right successful' });
      });
} catch (error) {
    console.error('Error recording right swipe:', error);
    res.status(500).json({ error: 'Internal Server Error' });
}
});

// API endpoint to update user type
app.put('/api/user', verifyToken, async (req, res) => {
    const { user_id, type } = req.body;
    try {
      // Logic to update user type
      await dbConnection.query(`UPDATE users SET type = '${type}' WHERE id = ${user_id}`, (err:any, results:any) => {
        if (err) {
          console.error("Error update user:", err);
          res.status(500).json({ error: "Internal server error" });
          return;
        }
        res.json({ message: 'User type updated successfully' });
      });
    } catch (error) {
      console.error('Error updating user type:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });