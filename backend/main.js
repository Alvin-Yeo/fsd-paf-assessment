// load libraires
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const mysql = require('mysql2/promise');
const { MongoClient } = require('mongodb');
const AWS = require('aws-sdk');
const multer = require('multer');
const fs = require('fs');
const sha1 = require('sha1');

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
const SQL_GET_USER = 'SELECT user_id, password FROM user WHERE user_id = ? AND password = ?';

// sql functions
const authenticateUser = mkQuery(SQL_GET_USER, pool);

/* MongoDB */

// connection string
const MONGO_LOCALHOST = 'mongodb://localhost:27017';
const MONGO_DATABASE = process.env.MONGO_DATABASE || 'share-app';
const MONGO_COLLECTION = process.env.MONGO_COLLECTION || 'articles';

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

const mkArticle = (params, s3Key) => {
    return {
        ts: new Date(),
        title: params['title'],
        comments: params['comments'],
        image: s3Key
    }
}

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

// POST /authenticate
app.post('/authenticate',
	express.json(),
	(req, res) => {
		const username = req.body['username'];
		const password = sha1(req.body['password']);
	
		authenticateUser([ username, password ])
			.then((result) => {
				if(result.length > 0) {
					console.info(`[INFO] Authentication successful.`);
					res.status(200);
					res.type('application/json');
					res.json({ 
						status: 200,
						message: 'Authentication successful.'
					});
				} else {
					console.info(`[INFO] Authentication failed. No user records are matched.`);
					res.status(401);
					res.type('application/json');
					res.json({ message: 'Authentication failed. No user records are matched.' });
				}
			})
			.catch((error) => {
				console.error(`[ERROR] Failed to query user in database.`);
				console.error(`[ERROR] Error message: `, error);
	
				res.status(500);
				res.type('application/json');
				res.json({ error: error });
			});
	}
);

// POST /share
app.post('/share',
	upload.single('image'),
    (req, res) => {
		const username = req.body['username'];
		const password = sha1(req.body['password']);

		const doc = mkArticle(req.body, req.file.filename);
	
		// authenticate user
		authenticateUser([ username, password ])
			.then((result) => {
				if(result.length > 0) {
					console.info(`[INFO] Authentication successful.`);
				} else {
					console.info(`[INFO] Authentication failed.`);
					throw new Error('401');
				}
			})
			// upload image and insert doc 
			.then((result) => {
				return readFile(req.file.path);
			})
			.then((buff) => {
                return putObject(req.file, buff, s3);
			})
			.then((result) => {
				console.info(`[INFO] Image was uploaded to S3 successfully.`);
                return mongoClient.db(MONGO_DATABASE)
                    .collection(MONGO_COLLECTION)
                    .insertOne(doc);
            })
            .then((result) => {
				console.info(`[INFO] Document was inserted to mongoDB successfully.`);

				console.info(`[INFO] Removing temp file...`);
				fs.unlink(req.file.path, () => {});

                res.status(200);
                res.type('application/json');
                res.json({ 
                    status: 200,
                    insertedId: result['insertedId']
                });
            })
			.catch((error) => {
				console.error(`[ERROR] Failed to share article.`);
				console.error(`[ERROR] Error message: `, error);
				
				if(error.message === '401') {
					res.status(401);
					res.type('application/json');
					res.json({ error: 'Authentication failed.' });
				} else {
					res.status(500);
					res.type('application/json');
					res.json({ error: error });
				}
			});
    }
);

// serving angular app 
app.use(express.static(__dirname + '/frontend'));

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