let throng = require('throng');
let Queue = require("bull");
let to = require('await-to');

let dotenv = require('dotenv-flow')
dotenv.config();

// Connect to a local redis instance locally, and the Heroku-provided URL in production
let REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

// Spin up multiple processes to handle jobs to take advantage of more CPU cores
// See: https://devcenter.heroku.com/articles/node-concurrency for more info
let workers = process.env.WEB_CONCURRENCY || 1;

// The maximum number of jobs each worker should process at once. This will need
// to be tuned for your application. If each job is mostly waiting on network 
// responses it can be much higher. If each job is CPU-intensive, it might need
// to be much lower.
let maxJobsPerWorker = process.env.MAX_JOBS_WORKER || 10;

// function sleep(ms) {
//     return new Promise(resolve => setTimeout(resolve, ms));
// }

const { handleWork, handleError } = require('./services/handleChats');

function start() {
    // Connect to the named work queue
    let workQueue = new Queue('work', REDIS_URL);

    workQueue.process(maxJobsPerWorker, async (job) => {
        // This is an example job that just slowly reports on progress
        // while doing no work. Replace this with your own job logic.
        let progress = 0;

        console.log(`JOB ${job.id} - Started`)

        if (job.data.type == 'chat') {
            let [err, resp] = await to(handleWork(job.data.payload, job));
            if (err) {
                console.log("Finalizó con errores ---- ", err);
                await to(handleError(job.data.payload, job));
            }
        }

        console.log(`JOB ${job.id} - End`)

        // A job can return values that will be stored in Redis as JSON
        //return { value: "This will be stored" };
    });
}

// Initialize the clustered worker process
// See: https://devcenter.heroku.com/articles/node-concurrency for more info
throng({ workers, start });