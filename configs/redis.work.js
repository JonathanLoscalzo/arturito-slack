module.exports = async () => {
    let REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
    let Queue = require('bull');

    let workQueue = new Queue('work', REDIS_URL);

    // workQueue.on('global:completed', (jobId, result) => {
    //     console.log(`Job completed with result ${result}`);
    // });

    return workQueue;
}