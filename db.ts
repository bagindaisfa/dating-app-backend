import mysql from 'mysql';

const createDatabaseConnection = () => {
  return new Promise<mysql.Pool>((resolve, reject) => {
    const connection = mysql.createPool({
      host: 'localhost',
      user: 'admin_rp',
      password: 'B@judit0k02018',
      database: 'dating_app',
      connectTimeout: 20000,
    });

    connection.getConnection((err, conn) => {
      if (err) {
        console.error('Error connecting to the database:', err);
        reject(err);
        return;
      }

      console.log('Connected to MySQL database!');
      conn.release();
      resolve(connection);
    });
  });
};

export { createDatabaseConnection };
