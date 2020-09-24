var express = require('express');
var router = express.Router();

const { WebClient } = require('@slack/web-api');

const web = new WebClient(process.env.slack_key)
const _ = require('lodash');
const axios = require('axios');
const to = require('await-to');

const installRedis = require('../configs/redis.work');


let typeHandler = (type, payload) => {

  let handler = {
    ['url_verification']: handlerUrlVerification,
    ['event_callback']: handlerEventCallback
  };

  return handler[type] || (async () => console.log("FUNCTION NOT EXISTS"));
}

let handlerUrlVerification = async ({ body: payload, ...req }, res) => {
  console.log("verified url");
  return res.json(payload.challenge).status(200);
}

let handlerEventCallback = async ({ body: payload, ...req }, res) => {
  const workQueue = await installRedis();

  workQueue.add({ payload, type: "chat" });

  return;//res.sendStatus(200);
}

router.post('/', async function (req, res, next) {

  console.log(req.body)

  let handler = typeHandler(req.body.type);

  let [err, _answer] = await to(handler(req, res));

  if (err) {
    console.log(err)
    next(err);
  }

  return res.sendStatus(200);
});

module.exports = router;
