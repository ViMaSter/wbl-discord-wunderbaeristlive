// Helper method
const expand = require('expandJS');
String.prototype.format = expand.stringFormat;

// Main discord functionality
const Discord = require('discord.js');
const client = new Discord.Client();
client.login(process.env.DISCORD_USER_TOKEN);

// HTTP request helper
const Date = require('datejs');
const Request = require('async-request');

function GetStateSpecificEnvironmentVariable(state, variableName)
{
    return process.env[`IS${state}_${variableName}`].replace("\\n", "\n") || "";
}

class TwitchNotifier {
    constructor(discordClient, channelID, clientID, validationSteps, initialStatusUpdate) {
        validationSteps = typeof validationSteps == "undefined" ? 5 : validationSteps;
        validationSteps = Math.min(Math.max(validationSteps, 1), 1000);

        this.channelName = "";
        this.channelID = channelID;
        this.clientID = clientID;

        discordClient.on('ready', async () => {
            console.log(`[DISCORD] Discord library is ready!`);
            console.log(`[DISCORD] Logged in as ${discordClient.user.tag}!`);

            console.log(`[TWITCH] Resolving twitch-ID ${this.channelID}...`);
            this.channelName = await this.GetUserData(this.channelID);
            this.channelName = this.channelName.name;
            console.log(`[TWITCH] Resolved ${this.channelID} to /${this.channelName}!`);
            console.log(`[TWITCH] Waiting for twitch channel ${this.channelName} to come online!`);

            let statusChecker = new StatusMonitor(validationSteps, initialStatusUpdate, this.SendMessages.bind(this), this.GetTwitchState.bind(this));
            statusChecker.Update();
            setInterval(statusChecker.Update, 5000);
        });
    }

    async GetTwitchState(newStateCallback)
    {
        const options = {
            headers: {
                'Accept': 'application/vnd.twitchtv.v5+json',
                'Client-ID': this.clientID
            }
        };

        const response = await Request(`https:\/\/api.twitch.tv/kraken/streams/${this.channelID}?stream_type=all`, options);
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

        newStateCallback(streamState, data);
    }

    async GetPopularClipLastMonth()
    {
        const options = {
            headers: {
                'Accept': 'application/vnd.twitchtv.v5+json',
                'Client-ID': this.clientID
            }
        };

        const response = await Request(`https:\/\/api.twitch.tv/kraken/clips/top?channel=${this.channelName}&period=month&limit=1`, options);
        if (response.statusCode !== 200)
        {
            console.error(`[TWITCH] Error accessing kraken status API for last clip timestamp (status code ${response.statusCode})!`);
            console.error(`[TWITCH] ${JSON.stringify(response.body)}`);
            return;
        }

        const parsedResponse = JSON.parse(response.body);

        return parsedResponse.clips[0];
    }

    async GetUserData(userIDOrStreamData)
    {
        if (typeof userIDOrStreamData == "string" || typeof userIDOrStreamData == "number")
        {
            const options = {
                headers: {
                    'Accept': 'application/vnd.twitchtv.v5+json',
                    'Client-ID': this.clientID
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

    async GetGameData(streamData)
    {
        return { "name": streamData.game };
    }

    async PrintLiveEmbed(state, streamData)
    {
        const userData = await this.GetUserData(streamData);
        const gameData = await this.GetGameData(streamData);

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
        .setAuthor(GetStateSpecificEnvironmentVariable(state, "EMBED_TITLE"), "", `https://twitch.tv/${this.channelName}`)
        .setColor(0x6441A5)
        .setThumbnail(userData.logo)
        .setURL(`https://twitch.tv/${this.channelName}`)
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

    async SendMessages(state, data)
    {
        const messageFormat = GetStateSpecificEnvironmentVariable(state, "MESSAGE");
        if (messageFormat.length > 0)
        {
            const clip = await this.GetPopularClipLastMonth();
            if (typeof clip != "undefined")
            {
                const message = messageFormat.format({clipURL: clip.url, twitchChannelName: this.channelName})
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
            const embedFormat = await this.PrintLiveEmbed(state, data);
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
}

twitch = new TwitchNotifier(client, process.env.TWITCH_CHANNEL_ID, process.env.TWITCH_CLIENT_ID, process.env.VALIDATION_STEPS_REQUIRED, process.env.ALLOW_INITIAL_STATE_POST);

class StatusMonitor {
    constructor(validationSteps, initialStatusUpdate, stateCallback, updateCallback)
    {
        this.initialStatusUpdate = initialStatusUpdate;

        this.stateCallback = stateCallback;
        this.updateCallback = updateCallback;

        this.currentState = undefined;
        this.streamInfo = undefined;

        this.requiredValidationSteps = parseInt(validationSteps, 10) || 1;
        this.currentValidationSteps = 0;

        this.upcomingState = null;

        this.stateCallbacks = {
            "OFFLINE": async function (data)
            {
                console.log(`[STATUS] Stream went offline!`);
            },
            "RERUN": async function (data)
            {
                console.log(`[STATUS] Stream is now playing reruns! Preparing messages...`);

                stateCallback("RERUN", data);

                console.log(`[STATUS] Sending done!`);
            },
            "LIVE": async function (data)
            {
                console.log(`[STATUS] Stream is live! Preparing messages...`);

                stateCallback("LIVE", data);

                console.log(`[STATUS] Sending done!`);
            }
        };
    }
    Update()
    {
        this.updateCallback(this.updateState.bind(this));
    }

    collectState(state)
    {
        if (this.upcomingState != state)
        {
            this.upcomingState = state;
            this.currentValidationSteps = 1;
        }

        console.log(`[STATUS] Collecting state ${state}: Stage ${this.currentValidationSteps} / ${this.requiredValidationSteps}`);

        if (this.currentValidationSteps < this.requiredValidationSteps)
        {
            this.currentValidationSteps++;
            return false;
        }
        if (this.currentValidationSteps == this.requiredValidationSteps)
        {
            return true;
        }
        if (this.currentValidationSteps > this.requiredValidationSteps)
        {
            return false;
        }

        return false;
    }

    updateState(newState, data) {
        if (!this.collectState(newState))
        {
            return;
        }

        if (this.currentState == newState)
        {
            return;
        }
        
        if (typeof this.currentState == "undefined")
        {
            if (!this.initialStatusUpdate)
            {
                this.currentState = newState;
                console.log(`[STATUS] Not executing logic for initial state setup; initial state: "${this.currentState}"!`);
                return;
            }   
        }

        this.currentState = newState;
        this.onStateChange(newState, data);
    }

    async onStateChange(state, data)
    {
        this.stateCallbacks[state](data);
    }
}

// Web helper
class WebConfigHelper
{
    constructor()
    {
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

                response.write(this.tablefy(process.env));
                response.end();
            });
        }).listen(process.env.PORT || 3000);

        console.log(`[WEB] Listening on port ${process.env.PORT || 3000}...`);
    }

    tablefy(content)
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
}

webConfigHelper = new WebConfigHelper();