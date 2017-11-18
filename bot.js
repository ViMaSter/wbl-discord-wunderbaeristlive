// Main discord functionality
const Discord = require('discord.js');
const client = new Discord.Client();
// HTTP request helper
const Date = require('datejs');
const Request = require('async-request');

// globals
let TWITCH_CHANNEL_NAME = ""

async function GetPopularClipLastMonth()
{
    var options = {
        headers: {
            'Client-ID': process.env.TWITCH_CLIENT_ID,
            'Accept': 'application/vnd.twitchtv.v5+json'
        }
    };

    const response = await Request(`https:\/\/api.twitch.tv/kraken/clips/top?channel=${TWITCH_CHANNEL_NAME}&period=month&limit=1`, options);
    if (response.statusCode !== 200)
    {
        console.error(`[TWITCH] Error accessing helix status API for last clip timestamp (status code ${response.statusCode})!`);
        console.error(`[TWITCH] ${JSON.stringify(response.body)}`);
        return;
    }

    const parsedResponse = JSON.parse(response.body);
    
    return parsedResponse.clips[0];
}

async function GetUserData(userID)
{
    var options = {
        headers: {
            'Client-ID': process.env.TWITCH_CLIENT_ID,
            'Accept': 'application/vnd.twitchtv.v5+json'
        }
    };

    const response = await Request(`https:\/\/api.twitch.tv/kraken/users/${userID}`, options);
    if (response.statusCode !== 200)
    {
        console.error(`[TWITCH] Error accessing helix status API for user data (status code ${response.statusCode})!`);
        console.error(`[TWITCH] ${JSON.stringify(response.body)}`);
        return;
    }

    const parsedResponse = JSON.parse(response.body);
    
    return parsedResponse;
}

async function GetGameData(gameID)
{
    var options = {
        headers: {
            'Client-ID': process.env.TWITCH_CLIENT_ID,
            'Accept': 'application/vnd.twitchtv.v5+json'
        }
    };

    const response = await Request(`https:\/\/api.twitch.tv/helix/games?id=${gameID}`, options);
    if (response.statusCode !== 200)
    {
        console.error(`[TWITCH] Error accessing helix status API for game data (status code ${response.statusCode})!`);
        console.error(`[TWITCH] ${JSON.stringify(response.body)}`);
        return;
    }

    const parsedResponse = JSON.parse(response.body);
    
    return parsedResponse.data[0];
}

async function PrintLiveEmbed(streamData)
{
    const userData = await GetUserData(streamData.user_id);
    const gameData = await GetGameData(streamData.game_id);

    // filter people streaming
    let matches = [];
    const regex = /(?:\| | und )(Vincent|Chris|Hanna|Viki|Minh)/g;
    let m;

    while ((m = regex.exec(streamData.title)) !== null) {
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
        .setTitle(streamData.title)
        .setAuthor("WIR SIND LIVE", userData.logo, `https://twitch.tv/${TWITCH_CHANNEL_NAME}`)
        .setColor(0x6441A5)
        .setImage(streamData.thumbnail_url.replace("{width}", 1280).replace("{height}", 720))
        .setThumbnail(gameData.box_art_url.replace("{width}", 136).replace("{height}", 190))
        .setURL(`https://twitch.tv/${TWITCH_CHANNEL_NAME}`)
        .addField("On-Air mit...", gameData.name, true)

    if (matches.length != 0)
    {
        embed.addField(`Am Start ${matches.length==1?'ist':'sind'}...`, matches.join(" & ") + "!", true);
    }

    return embed;
}

function CheckOnlineStatus(client) {
    let currentState = false;
    let streamInfo = undefined;

    async function OnOnline(data)
    {
        console.log(`[TWITCH] Stream came online! Preparing message...`);
        
        const clip = await GetPopularClipLastMonth();
        const messageFormat = `${TWITCH_CHANNEL_NAME} ist live! Jetzt auf einschalten oder sowas hier verpassen: ${clip.url}`;
        const embedFormat = await PrintLiveEmbed(data);

        console.log(`[TWITCH] Sending regular message:`);
        console.log(`[TWITCH] ${messageFormat}`);
        client.channels.find("id", process.env.DISCORD_CHANNEL_ID).send(messageFormat);

        console.log(`Sending embed message:`);
        console.log(`[TWITCH] ${JSON.stringify(embedFormat)}`);
        client.channels.find("id", process.env.DISCORD_CHANNEL_ID).send(embedFormat);

        console.log(`Sending done!`);
    }

    function OnOffline(data)
    {
        console.log(`Stream went offline!`);
    }

    function SetCurrentState(newState, data)
    {
        if (currentState == newState)
        {
            return;
        }

        if (typeof currentState == "undefined")
        {
            currentState = newState;
            return;
        }

        currentState = newState;
        if (newState)
        {
            OnOnline(data);
        }
        else
        {
            OnOffline();
        }
    }

    async function OnUpdate()
    {
        var options = {
            headers: {
                'Client-ID': process.env.TWITCH_CLIENT_ID
            }
        };

        const response = await Request(`https:\/\/api.twitch.tv/helix/streams?user_id=${process.env.TWITCH_CHANNEL_ID}`, options);
        if (response.statusCode !== 200)
        {
            console.error(`[TWITCH] Error accessing helix status API (status code ${response.statusCode})!`);
            console.error(JSON.stringify(response.body));
            return;
        }

        const parsedResponse = JSON.parse(response.body);
        const streamIsOnline = parsedResponse.data.length > 0;
        SetCurrentState(streamIsOnline, streamIsOnline ? parsedResponse.data[0] : {});
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

	setInterval(CheckOnlineStatus(client), 5000);
});

client.login(process.env.DISCORD_USER_TOKEN);

// Web helper
function tablefy(content)
{
    const keyWhitelist = {
        "TWITCH_CLIENT_ID": false,
        "TWITCH_CHANNEL_ID": true,
        "DISCORD_CHANNEL_ID" : true,
        "DISCORD_USER_TOKEN": false
    };

    let output = "";
    output += "<table>";
    for (key in content)
    {
        if (typeof keyWhitelist[key] == "undefined")
        {
            continue;
        }

        output += "<tr>";
        output += "<th>";
        output += key;
        output += "</th>";
        output += "<td>";
        output += keyWhitelist[key] ? content[key] : "<i>REDACTED</i>";
        output += "</td>";
        output += "</tr>";
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
