// load libraires
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const mysql = require('mysql2/promise');
const { MongoClient } = require('mongodb');
const AWS = require('aws-sdk');
const multer = require('multer');
const fs = require('fs');

// environment configuration
require('dotenv').config();
const PORT = parseInt(process.argv[2]) || parseInt(process.env.PORT) || 3000;

/* MySQL */

// create mysql connection pool
const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE || 'paf2020',
    connectionLimit: parseInt(process.env.MYSQL_CONNECTION_LIMIT) || 4,
    timezone: '+08:00'
});

const mkQuery = (sql, pool) => {
    return (async(args) => {
        const conn = await pool.getConnection();

        try {
            const [ result, _ ] = await conn.query(sql, args || []);
            return result;
        } catch(error) {
            console.error(`[ERROR] Failed to execute sql query.`);
            console.error(`[ERROR] Message: `, error);
            throw error;
        } finally {
            conn.release();
        }
    });
}

// sql statements
const SQL_GET_GAME_BY_ID = 'select name, year, url, image from game where gid = ?';

// sql functions
const getGameById = mkQuery(SQL_GET_GAME_BY_ID, pool);

/* MongoDB */

// connection string
const MONGO_LOCALHOST = 'mongodb://localhost:27017';
const MONGO_DATABASE = process.env.MONGO_DATABASE || '';
const MONGO_COLLECTION = process.env.MONGO_COLLECTION || '';

// create connection pool with mongo client
const mongoClient = new MongoClient(MONGO_LOCALHOST, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

/* AWS S3 */

// Please set the two following variables in the environment
// AWS_ACCESS_KEY_ID=
// AWS_SECRET_ACCESS_KEY=
// For more info, please refer to https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-environment.html

const S3_ENDPOINT = process.env.S3_ENDPOINT || 'sfo2.digitaloceanspaces.com';
const s3 = new AWS.S3({
    endpoint: new AWS.Endpoint(S3_ENDPOINT)
})

/* Multer */

const upload = multer({
    dest: process.env.TMP_DIR || './temp'
});

const readFile = (path) => {
    return new Promise((resolve, reject) => {
        fs.readFile(path, (error, buff) => {
            if(error != null) 
                reject(error);
            else
                resolve(buff);
        });
    });
};

const putObject = (file, buff, s3) => {
    return new Promise((resolve, reject) => {
        const params = {
            Bucket: process.env.S3_BUCKET,
            Key: file.filename,
            Body: buff,
            ACL: 'public-read',
            ContentType: file.mimetype,
            ContentLength: file.size
        };

        s3.putObject(params, (error, result) => {
            if(error != null)
                reject(error);
            else    
                resolve(result);
        });
    });
};

/* Resources */

// create an instance of express
const app = express();

// logging all requests with morgan
app.use(morgan('combined'));

// cors
app.use(cors());



// POST /upload
app.post('/upload',
    upload.single('file'),
    (req, res) => {
        readFile(req.file.path)
            .then((buff) => {
                return putObject(req.file, buff, s3);
            })
            .then((result) => {
                console.info(`[INFO] Image was uploaded to S3 successfully.`);

                res.status(200);
                res.type('application/json');
                res.json({ status: 'OK' });
            })
            .catch((error) => {
                console.error(`[ERROR] Failed to insert document.`);
                console.error(`[ERROR] Error message: `, error);

                res.status(500);
                res.type('application/json');
                res.json({ error: error });
            });
        
        // Remove file at TMP_DIR after response completed.
        res.on('finish', () => {
            fs.unlink(req.file.path, () => {});
            console.info(`[INFO] Response ended. Removing temp file...`);
        });
    }
);

/* Start Server */

const startApp = async(app, pool, mongoClient) => {
    // pinging mysql database
    const p0 = (async() => {
        const conn = await pool.getConnection();
        
        console.info(`[INFO] Pinging database...`);
        await conn.ping();
        
        console.info(`[INFO] Ping database successfully.`);
        conn.release();
        
        return true;
    })();
    
    // connect to mongoDB
    const p1 = (async() => {
        await mongoClient.connect();
        return true;
    })();
    
    // checking S3 Access Key in environment variables
    const p2 = new Promise((resolve, reject) => {
        if(!!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY)
            resolve();
        else
            reject('S3 Access Key (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) not found in environment.');
    });

    Promise.all([ p0, p1, p2 ])
        .then((result) => {
            app.listen(PORT, () => {
                console.info(`[INFO] Server started on port ${PORT} at ${new Date()}`);
            })
        })
        .catch((error) => {
            console.error(`[ERROR] Failed to start server.`);
            console.error(`[ERROR] Error message: `, error);
        })
}

startApp(app, pool, mongoClient);