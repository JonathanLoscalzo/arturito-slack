var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

let dotenv = require('dotenv-flow');
dotenv.config();

const { createEventAdapter } = require('@slack/events-api');
const slackEvents = createEventAdapter(process.env.slack_key);

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

// Create an express application
const app = express();
(async () => {

    app.use(logger('dev'));
    // Plug the adapter in as a middleware
    app.use('/my/path', slackEvents.requestListener());
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    app.use(cookieParser());
    app.use(express.static(path.join(__dirname, 'public')));

    app.use('/', indexRouter);
    app.use('/auth', usersRouter);

    function errorHandler(err, req, res, next) {
        if (res.headersSent) {
            return next(err);
        }
        res.status(500);
        res.status(500).send('Something broke!');
        return res;
    }

    app.use(errorHandler);
})();

module.exports = app;
