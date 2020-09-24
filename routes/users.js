var express = require('express');
var router = express.Router();

const { WebClient } = require('@slack/web-api');
const web = new WebClient(process.env.slack_key)


let redirect_uri = "http://localhost:3000/auth/redirect";

router.get('/', function (req, res, next) {
  res.send(`<a href="https://slack.com/oauth/v2/authorize?scope=files:write&client_id=${process.env.slack__client_id}&redirect_uri=${redirect_uri}">
  <img alt="" Add to Slack"" height="40" width="139" 
  src="https://platform.slack-edge.com/img/add_to_slack.png" 
  srcset="https://platform.slack-edge.com/img/add_to_slack.png 1x, https://platform.slack-edge.com/img/add_to_slack@2x.png 2x" />
  </a>`);
});

router.get("/redirect", async (req, res) => {
  
  console.log(req.query.code)
  
  let response = await web.oauth.v2.access({
    client_id: process.env.slack__client_id,
    client_secret: process.env.slack__client_secret,
    code: req.query.code,
    redirect_uri
  })

  console.log(response)

  return res.sendStatus(200);
})


module.exports = router;
