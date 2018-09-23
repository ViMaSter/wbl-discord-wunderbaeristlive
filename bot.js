// Helper method
const expand = require('expandJS');
String.prototype.format = expand.stringFormat;

// Main discord functionality
const Discord = require('discord.js');
const client = new Discord.Client();
// HTTP request helper
const Date = require('datejs');
const Request = require('async-request');

// globals
let TWITCH_CHANNEL_NAME = "";

const LiveTypes = ["RERUN", "OFFLINE", "LIVE"];


function GetStateSpecificEnvironmentVariable(state, variableName)
{
    return process.env[`IS${state}_${variableName}`].replace("\\n", "\n") || "";
}


async function GetPopularClipLastMonth()
{
    const options = {
        headers: {
            'Accept': 'application/vnd.twitchtv.v5+json',
            'Client-ID': process.env.TWITCH_CLIENT_ID
        }
    };

    const response = await Request(`https:\/\/api.twitch.tv/kraken/clips/top?channel=${TWITCH_CHANNEL_NAME}&period=month&limit=1`, options);
    if (response.statusCode !== 200)
    {
        console.error(`[TWITCH] Error accessing kraken status API for last clip timestamp (status code ${response.statusCode})!`);
        console.error(`[TWITCH] ${JSON.stringify(response.body)}`);
        return;
    }

    const parsedResponse = JSON.parse(response.body);

    return parsedResponse.clips[0];
}

async function GetUserData(userIDOrStreamData)
{
    if (typeof userIDOrStreamData == "string" || typeof userIDOrStreamData == "number")
    {
        const options = {
            headers: {
                'Accept': 'application/vnd.twitchtv.v5+json',
                'Client-ID': process.env.TWITCH_CLIENT_ID
            }
        };

        const response = await Request(`https:\/\/api.twitch.tv/kraken/users/${userIDOrStreamData}`, options);
        if (response.statusCode !== 200)
        {
            console.error(`[TWITCH] Error accessing kraken status API for user data (status code ${response.statusCode})!`);
            console.error(`[TWITCH] ${JSON.stringify(response.body)}`);
            return;
        }

        const parsedResponse = JSON.parse(response.body);

        return parsedResponse;
    }

    if (typeof userIDOrStreamData == "object")
    {
        return userIDOrStreamData.channel;
    }
}

async function GetGameData(streamData)
{
    return { "name": streamData.game };
}

async function PrintLiveEmbed(state, streamData)
{
    const userData = await GetUserData(streamData);
    const gameData = await GetGameData(streamData);

    if (!userData)
    {
        console.warn(`[TWITCH] We're unable to find user ${streamData.user_id}; not printing any embed message!`);
        return;
    }

    if (!gameData)
    {
        console.warn(`[TWITCH] We're unable to find game ${streamData.game_id}; not printing any embed message!`);
        return;
    }

    // filter people streaming
    let matches = [];
    let people = process.env.PEOPLE.split(',');
    console.log(`[INTERNAL] Trying to find '${people.join(',')}' in the stream title...`)
    const regex = new RegExp('(?:\| | und )('+people.join('|')+')', 'g');
    let m;

    while ((m = regex.exec(streamData.channel.status)) !== null) {
        if (m.index === regex.lastIndex) {
            regex.lastIndex++;
        }

        m.forEach((match, groupIndex) => {
            if (groupIndex == 1)
            {
                matches.push(match);
            }
        });
    }

    let embed = new Discord.RichEmbed()
    .setAuthor(GetStateSpecificEnvironmentVariable(state, "EMBED_TITLE"), "", `https://twitch.tv/${TWITCH_CHANNEL_NAME}`)
    .setColor(0x6441A5)
    .setImage(streamData.preview.template.replace("{width}", 1280).replace("{height}", 720))
    .setThumbnail(userData.logo)
    .setURL(`https://twitch.tv/${TWITCH_CHANNEL_NAME}`)
    .addField(GetStateSpecificEnvironmentVariable(state, "EMBED_GAME_PREFIX"), gameData.name, true)

    if (matches.length != 0)
    {
        embed.setTitle(streamData.channel.status.replace(/(\ \| ([^\|]*))$/g, ""));
        embed.addField(GetStateSpecificEnvironmentVariable(state, "EMBED_PEOPLE_PREFIX"), matches.join(" & ") + "!", true);
    }
    else
    {
        embed.setTitle(streamData.channel.status);
    }

    return embed;
}

async function SendMessages(state, data)
{
    const messageFormat = GetStateSpecificEnvironmentVariable(state, "MESSAGE");
    if (messageFormat.length > 0)
    {
        const clip = await GetPopularClipLastMonth();
        if (typeof clip != "undefined")
        {
            const message = messageFormat.format({clipURL: clip.url, twitchChannelName: TWITCH_CHANNEL_NAME})
            console.log(`[DISCORD] Sending regular message:`);
            console.log(`[DISCORD] ${message}`);
            client.channels.find("id", process.env.DISCORD_CHANNEL_ID).send(message);
        }
        else
        {
            console.log(`[DISCORD] Requested to send a message about ${state}, but there is no clip in the last month... Skipping the regular text!`);
        }
    }
    else
    {
        console.log(`[DISCORD] Not sending a message, as there's no MESSAGE for '${state}' set`);
    }

    if (GetStateSpecificEnvironmentVariable(state, "EMBED_TITLE"))
    {
        const embedFormat = await PrintLiveEmbed(state, data);
        if (embedFormat)
        {
            console.log(`[DISCORD] Sending embed message:`);
            console.log(`[DISCORD] ${JSON.stringify(embedFormat)}`);
            client.channels.find("id", process.env.DISCORD_CHANNEL_ID).send(embedFormat);
        }
        else
        {
            console.log(`[DISCORD] Requested to send an embed message about ${state}, but we don't have sufficient information; check the log!`);
        }
    }
    else
    {
        console.log(`[DISCORD] Not sending a message, as there's no EMBED_TITLE for '${state}' set`);
    }
}

function CheckOnlineStatus(client) {
    let currentState = undefined;
    let streamInfo = undefined;

    const requiredValidationSteps = parseInt(process.env.VALIDATION_STEPS_REQUIRED, 10) || 1;
    let currentValidationSteps = 0;

    let upcomingState = null;

    async function OnOnline(data)
    {
    }

    function OnOffline(data)
    {
    }

    function CollectState(state)
    {
        if (upcomingState != state)
        {
            upcomingState = state;
            currentValidationSteps = 1;
        }

        console.log(`[INTERNAL] Collecting state ${state}: Stage ${currentValidationSteps} / ${requiredValidationSteps}`);

        if (currentValidationSteps < requiredValidationSteps)
        {
            currentValidationSteps++;
            return false;
        }
        if (currentValidationSteps == requiredValidationSteps)
        {
            return true;
        }
        if (currentValidationSteps > requiredValidationSteps)
        {
            return false;
        }

        return false;
    }

    function UpdateState(newState, data) {
        if (!CollectState(newState))
        {
            return;
        }

        if (currentState == newState)
        {
            return;
        }
        
        if (typeof currentState == "undefined")
        {
            if (typeof process.env["ALLOW_INITIAL_STATE_POST"] == "undefined")
            {
                currentState = newState;
                console.log(`[TWITCH] Not executing logic for initial state setup; initial state: "${currentState}"!`);
                return;
            }   
        }

        currentState = newState;
        OnStateChange(newState, data);
    }

    const stateCallbacks = {
        "OFFLINE": async function (data)
        {
            console.log(`[TWITCH] Stream went offline!`);
        },
        "RERUN": async function (data)
        {
            console.log(`[TWITCH] Stream is now playing reruns! Preparing messages...`);

            SendMessages("RERUN", data);

            console.log(`[TWITCH] Sending done!`);
        },
        "LIVE": async function (data)
        {
            console.log(`[TWITCH] Stream is live! Preparing messages...`);

            SendMessages("LIVE", data);

            console.log(`[TWITCH] Sending done!`);
        }
    };

    async function OnStateChange(state, data)
    {
        stateCallbacks[state](data);
    }

    async function OnUpdate()
    {
        const options = {
            headers: {
                'Accept': 'application/vnd.twitchtv.v5+json',
                'Client-ID': process.env.TWITCH_CLIENT_ID
            }
        };

        const response = await Request(`https:\/\/api.twitch.tv/kraken/streams/${process.env.TWITCH_CHANNEL_ID}?stream_type=all`, options);
        if (response.statusCode !== 200)
        {
            console.error(`[TWITCH] Error accessing kraken status API (status code ${response.statusCode})!`);
            console.error(JSON.stringify(response.body));
            return;
        }

        const parsedResponse = JSON.parse(response.body);
        let data = {
            user_id: 0,
            game_id: 0,
            title: "NO TITLE",
            thumbnail_url: ""
        };
        let streamState = "OFFLINE";

        if (parsedResponse.stream)
        {
            data = parsedResponse.stream;
            streamState = parsedResponse.stream.stream_type.toUpperCase();
        }

        UpdateState(streamState, data);
        return;
    }

    return OnUpdate;
}

client.on('ready', async () => {
    console.log(`[DISCORD] Discord library is ready!`);
    console.log(`[DISCORD] Logged in as ${client.user.tag}!`);

    console.log(`[TWITCH] Resolving twitch-ID ${process.env.TWITCH_CHANNEL_ID}...`);
    TWITCH_CHANNEL_NAME = await GetUserData(process.env.TWITCH_CHANNEL_ID);
    TWITCH_CHANNEL_NAME = TWITCH_CHANNEL_NAME.name;
    console.log(`[TWITCH] Resolved ${process.env.TWITCH_CHANNEL_ID} to /${TWITCH_CHANNEL_NAME}!`);
    console.log(`[TWITCH] Waiting for twitch channel ${TWITCH_CHANNEL_NAME} to come online!`);

    let statusChecker = CheckOnlineStatus(client);
    statusChecker();
    setInterval(statusChecker, 5000);
});

client.login(process.env.DISCORD_USER_TOKEN);

// Web helper
function tablefy(content)
{
    const keyWhitelist = {
        "TWITCH_CLIENT_ID": false,
        "TWITCH_CHANNEL_ID": true,
        "DISCORD_CHANNEL_ID" : true,
        "DISCORD_USER_TOKEN": false,
        "VALIDATION_STEPS_REQUIRED": true,
        "PEOPLE": true,
        "ISLIVE_MESSAGE": true,
        "ISLIVE_EMBED_TITLE": true,
        "ISLIVE_EMBED_GAME_PREFIX": true,
        "ISLIVE_EMBED_PEOPLE_PREFIX": true,
        "ISRERUN_MESSAGE": true,
        "ISRERUN_EMBED_TITLE": true,
        "ISRERUN_EMBED_GAME_PREFIX": true,
        "ISRERUN_EMBED_PEOPLE_PREFIX": true,
    };

    let output = "";
    output += "<table>";
    for (key in content)
    {
        if (typeof keyWhitelist[key] == "undefined")
        {
            continue;
        }
        output += `<tr><th>${key}</th><td>${keyWhitelist[key] ? content[key] : "<i>REDACTED</i>"}</td></tr>`
    }
    output += "</table>";

    return output;
}

require('http').createServer((request, response) => {
    const { headers, method, url } = request;
    let body = [];

    request.on('error', (err) => {
        console.error(err);
    }).on('data', (chunk) => {
        body.push(chunk);
    }).on('end', () => {
        console.log(`[WEB] Handling web request...`);

        body = Buffer.concat(body).toString();

        response.on('error', (err) => {
            console.error(err);
        });

        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/html');

        response.write(tablefy(process.env));
        response.end();
    });
}).listen(process.env.PORT || 3000);

console.log(`[WEB] Listening on port ${process.env.PORT || 3000}...`);
