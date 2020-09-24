const { WebClient } = require('@slack/web-api');
const web = new WebClient(process.env.slack_key)
const _ = require('lodash');
const axios = require('axios');
const to = require('await-to');
const { Octokit } = require("@octokit/rest");
const Keyv = require('keyv');
const threadsStore = new Keyv(process.env.REDIS_URL, { namespace: 'threads' })

const RUNNING = "RUNNING";

let handleWork = async (payload, job) => {

    if (payload.event.type === "app_mention") {

        if (payload.event.text.includes("archive")) {

            if (!isNotAThread(payload)) {

                await web.chat.postMessage({
                    channel: payload.event.channel,
                    text: `<@${payload.event.user}> No se permite archivar si no es un thread.`,
                    thread_ts: payload.event.thread_ts || null
                });

                return;

            } else {

                // busco el channel-thread, si existe no lo persisto
                let key = `${payload.event.channel}_${payload.event.thread_ts}`;
                let v = await threadsStore.get(key);
                job.thread_key = key;

                if (!!v) {

                    if (v == RUNNING) {
                        await web.chat.postMessage({
                            channel: payload.event.channel,
                            text: `<@${payload.event.user}> Este thread se está ejecutando... :timer_clock:`,
                            thread_ts: payload.event.thread_ts || null
                        });
                    }
                    else {
                        await web.chat.postMessage({
                            channel: payload.event.channel,
                            text: `<@${payload.event.user}> Este thread ya fue almacenado <${v}|acá>`,
                            thread_ts: payload.event.thread_ts || null
                        });
                    }

                    return;

                }

                await threadsStore.set(key, RUNNING)

                let title = payload.event.text.match(/"(.*)"/gi)
                if (title == null) {
                    await web.chat.postMessage({
                        channel: payload.event.channel,
                        text: `<@${payload.event.user}> Falta el titulo que debe ir incluido entre comillas: "así!"`,
                        thread_ts: payload.event.thread_ts || null
                    });
                    return;
                } else {
                    title = title[0];
                }

                await web.chat.postMessage({
                    channel: payload.event.channel,
                    text: `<@${payload.event.user}> Petición tomada ${job.id}`,
                    thread_ts: payload.event.thread_ts || null
                });

                // traer el thread completo
                let thread = await obtainThread(payload)

                // obtener información de los users
                let users = await obtainUsers(thread);

                // transformamos los mensajes, filtramos los que no son de bot
                let messages = await transformMessages(thread, users);

                // De las conversaciones con imagenes, traemos las imagenes y las subimos a imgur
                await extractAndUploadImages(messages);

                let history = require('../utils/parser')(messages, title);

                // subimos un issue a github
                let url = await writeThread(history, title);

                await threadsStore.set(key, url)

                await web.chat.postMessage({
                    channel: payload.event.channel,
                    text: `<@${payload.event.user}>, este es el <${url}|link del thread> :heavy_check_mark: `,
                    thread_ts: payload.event.thread_ts || null
                });
            }

            return;//es.sendStatus(200)
        }

        return;//res.sendStatus(200)
    }

    await web.chat.postMessage({
        channel: payload.event.channel,
        text: `<@${payload.event.user}> Por ahora no poseo otra operación`,
        thread_ts: payload.event.thread_ts || null
    });

}

let handleError = async (payload, job) => {

    if (job.thread_key) {
        let v = await threadsStore.get(job.thread_key);

        if (v == RUNNING) {
            console.log(`Elimino la key ${job.thread_key} porque ocurrió un error y no se llegó a enviar la issue`);
            await threadsStore.delete(job.thread_key);


        } else if (!!v) {
            await web.chat.postMessage({
                channel: payload.event.channel,
                text: `<@${payload.event.user}> ocurrió un error, pero igual tengo el <${v}|link a la issue creada>. `,
                thread_ts: payload.event.thread_ts || null
            });
        }

        return;
    }

    await web.chat.postMessage({
        channel: payload.event.channel,
        text: `<@${payload.event.user}> ocurrió un error, por favor intentá de nuevo :lloros: `,
        thread_ts: payload.event.thread_ts || null
    });
}

let isNotAThread = (payload) => !!payload.event["thread_ts"]

async function writeThread(messages, title) {
    const octokit = new Octokit({
        auth: process.env.GITHUB__ACCESS_KEY,
    });

    let [err, resp] = await to(octokit.issues.create({
        owner: process.env.GITHUB__OWNER,
        repo: process.env.GITHUB__REPO,
        title: title,
        body: messages
    }))

    if (err) {
        console.log(err)
    } else {
        let issue_number = resp.data.number;
        let link = resp.data.html_url;

        [err, resp] = await to(octokit.issues.update({
            owner: process.env.GITHUB__OWNER,
            repo: process.env.GITHUB__REPO,
            issue_number: issue_number,
            state: 'closed'
        }));
        if (err) console.log(err);
        else return link

    }

    throw err;
}

async function obtainThread(payload) {
    let thread = []
    for await (const page of web.paginate('conversations.replies', {
        channel: payload.event.channel,
        ts: payload.event.thread_ts,
        limit: 1000,
    })) {
        thread = thread.concat(page.messages);
        if (!page.has_more) { break; }
    }

    return thread;
}

async function obtainUsers(thread) {
    let users = []
    let icons = require('../utils/icons')
    for await (let user of _.uniq(thread.map(message => message.user))
        .map(u => web.users.info({ token: process.env.slack_key, user: u }))) {
        if (user.ok == true) {
            let icon = icons[Math.floor(Math.random() * icons.length)];
            user.user.icon_assigned = icon;
            users.push(user.user);
        }

    }
    return users;
}

async function transformMessages(thread, users) {
    let messages = thread
        .filter(m => !!!m['bot_id'])
        .map(message => (
            {
                usercode: message.user,
                text: message.text,
                blocks: message.blocks,
                files: message.files ? message.files.map(file => ({ id: file.id, name: file.name, url: file.url_private })) : []
            }));

    let flat = (b) => {
        if (b['elements'])
            return _.chain(b.elements).map(e => flat(e)).flattenDeep().value().concat(b);
        else
            return b;
    }

    // assign user, TODO: hacerlo performante
    for (let m of messages) {
        let u = users.find(u => u.id == m.usercode)
        if (u) {
            m.user = u;
        }

        if (m["blocks"] && Array.isArray(m["blocks"])) {

            for (let b of _.flatten(m.blocks.map(b => flat(b)))) {
                if (b.type == 'user') {
                    b.user = users.find(u => u.id == b.user_id)
                }
            }
        } else {
            console.log("caso especial: ", m);
        }


    }

    return messages;
}

async function extractAndUploadImages(messages) {
    let images = _.chain(messages)
        .filter(m => !!m.files.length)
        .map(m => m.files)
        .flatten()
        .value();

    for (let f of images) {

        let [err, resp] = await to(web.files.sharedPublicURL({
            token: process.env.slack__access_token,
            file: f.id
        }));

        let assign = async (file, images) => {
            let im = images.find(i => i.id == file.id);
            let template = (team_id, file_id, pub_secret, filename) => `https://files.slack.com/files-pri/${team_id}-${file_id}/${filename}?pub_secret=${pub_secret}`;
            let [team_id, file_id, pub_secret] = file.permalink_public.match(/(\w+)/g).slice(-3);
            im["public_url"] = template(team_id, file_id, pub_secret, im.name);

            var FormData = require('form-data');
            const imgurForm = new FormData();
            imgurForm.append('image', im.public_url);

            // upload image if is it ok
            // https://stackoverflow.com/questions/57253156/how-to-use-the-permalink-public-url-of-an-uploaded-image-to-include-it-in-a-mess
            // https://github.com/slackapi/node-slack-sdk/issues/1000
            [err, res] = await to(axios.post("https://api.imgur.com/3/image", imgurForm, {
                headers: {
                    "Authorization": `Client-ID ${process.env.imgur__client_id}`,
                    ...imgurForm.getHeaders(),
                }
            }));

            if (err) {
                console.log(err)
            } else if (res.data.status == 200) {
                im["imgurl"] = res.data.data.link;
            }

        };

        if (!err) {
            await assign(resp.file, images);
        }
        else {

            if (err.data.error == 'already_public') {
                [err, resp] = await to(web.files.info({
                    file: f.id,
                    token: process.env.slack__access_token
                }));
                await assign(resp.file, images);
            }
        }
    }
}


module.exports = { handleWork, handleError };