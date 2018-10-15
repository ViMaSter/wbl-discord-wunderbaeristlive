// Helper method
const expand = require('expandJS');
String.prototype.format = expand.stringFormat;

// Main discord functionality
const Discord = require('discord.js');
181

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
        this.discordClient = discordClient;

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
            setInterval(statusChecker.Update.bind(statusChecker), 5000);
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
                this.discordClient.channels.find("id", process.env.DISCORD_CHANNEL_ID).send(message);
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
                this.discordClient.channels.find("id", process.env.DISCORD_CHANNEL_ID).send(embedFormat);
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

class YouTubeNotifier {
    constructor(discordClient, channelID, clientID, validationSteps, initialStatusUpdate) {
        validationSteps = typeof validationSteps == "undefined" ? 5 : validationSteps;
        validationSteps = Math.min(Math.max(validationSteps, 1), 1000);

        this.channelInfo = {};
        this.channelID = channelID;
        this.clientID = clientID;
        this.discordClient = discordClient;

        discordClient.on('ready', async () => {
            console.log(`[DISCORD] Discord library is ready!`);
            console.log(`[DISCORD] Logged in as ${discordClient.user.tag}!`);

            console.log(`[YOUTUBE] Resolving YouTube-ID ${this.channelID}...`);
            this.channelInfo = await this.GetYouTubeChannel(this.channelID);
            console.log(`[YOUTUBE] Resolved ${this.channelID} to /${this.channelInfo.name}!`);

            let statusChecker = new StatusMonitor(validationSteps, !!initialStatusUpdate, this.SendMessages.bind(this), this.GetLastLivestream.bind(this));
            statusChecker.Update();
            setInterval(statusChecker.Update.bind(statusChecker), 5000);
        });
    }

    async GetLastLivestream(newStateCallback)
    {
        const response = await Request(`https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${this.channelID}&eventType=live&type=video&key=${process.env.YOUTUBE_API_KEY}`);
        if (response.statusCode !== 200)
        {
            console.error(`[YOUTUBE] Error accessing YouTube V3 API for live events (status code ${response.statusCode})!`);
            console.error(JSON.stringify(response.body));
            return;
        }

        const parsedResponse = JSON.parse(response.body);
        if (parsedResponse.items.length <= 0)
        {
            console.group("[YOUTUBE] API returned no current live-events.");
            console.log(parsedResponse);
            console.groupEnd();
            return;
        }

        const lastLivestream = parsedResponse.items[parsedResponse.items.length - 1];
        const thumbnailOrder = ["maxres", "standard", "high", "medium", "default"];
        let thumbnailURL = "";
        for (const type in thumbnailOrder)
        {
            if (lastLivestream.snippet.thumbnails[thumbnailOrder[type]])
            {
                thumbnailURL = lastLivestream.snippet.thumbnails[thumbnailOrder[type]].url;
                break;
            }
        };

        if(!thumbnailURL)
        {
            thumbnailURL = this.channelName.thumbnail;
        }

        let data = {
            id: lastLivestream.id.videoId,
            title: lastLivestream.snippet.title,
            thumbnail: thumbnailURL
        };

        // YouTube has no concept of reruns; altough premieres might be supported at a later point in time
        const streamState = "LIVE";

        newStateCallback(streamState, data);
    }

    async GetYouTubeChannel(channelID)
    {
        const response = await Request(`https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${this.channelID}&key=${process.env.YOUTUBE_API_KEY}`);
        if (response.statusCode !== 200)
        {
            console.error(`[YOUTUBE] Error accessing YouTube V3 API for channel info (status code ${response.statusCode})!`);
            console.error(JSON.stringify(response.body));
            return;
        }

        const parsedResponse = JSON.parse(response.body);
        if (parsedResponse.items.length <= 0)
        {
            console.log(`[YOUTUBE] API returned no info about channel '${channelID}'`);
            return;
        }

        const channelInfo = parsedResponse.items[0];

        const thumbnailOrder = ["maxres", "standard", "high", "medium", "default"];
        let thumbnailURL = "";
        for (const type in thumbnailOrder)
        {
            if (channelInfo.snippet.thumbnails[thumbnailOrder[type]])
            {
                thumbnailURL = channelInfo.snippet.thumbnails[thumbnailOrder[type]].url;
                break;
            }
        };

        return {
            "id": channelID,
            "thumbnail": thumbnailURL,
            "name": channelInfo.snippet.title,
            "description": channelInfo.snippet.description
        }
    }

    async PrintLiveEmbed(state, streamData)
    {
        // As of Oct 2018, (3+ years after YT Gaming launched) no game-data is available at any API-endpoint : (

        // sssysssssssssddsssssssssshyhssssssssssdyyssssssssy
        // ysssossssssyyhs +---------------------------+ sssy
        // ysssoydNNmdd/-. |   This is where I would   | ooos
        // ysyddNmNNNNNdoo | read out game information | o++
        // yyNNN/-ysssdNNN +---------------------------+ o++s
        // yhNNh-/-.`:.:y::---...........`.-::::/::::o+oso++s
        // yhNm:-:.-::-.:s:::--.```.-...```-::::/::::++sso++o
        // d//+: :-...-:.-+o/:-`````....```.:///+/:::+osso++o
        // h:-.:.``---:..+yy+:....-.`-/-....://++////+ossooos
        // yd/./yo++:-/-.osy+:--``ys+ss-````/+oo+o:+/+osssssy
        // yy.../++sooysyyyso+//-`s:/ss+-``/+osyss++/+osssssy
        // d-......-.-:-:odso++o++++++++  .++oyyss/+++ssssssy
        // /............./y+oo/..+s+//////+oo+osoo++o+oyssssy
        // .........-.:--hy+.``/s`......``:oo+yhhosoo+oyssssy
        // ::---...-/+--::` `:ss:         -+++oos/yyyyyyyyssy
        //    ````.`yy`.-  :ssoo-.........-/oooo/:/osyhddddhh
        // `       :Nd  .-syssssoosssosssssssssssssssyhdmmmmm
        // --------ymd--+dyssssssyyyyyyyyyyyyyyyyhhhhhhhhhhhd

        // ysssssssss  +---------------------------+  ssssssy
        // ysssoossss  |      IF I HAD ANY!!!      |  sssssos
        // yssso+ssss  +---------------------------+  ssso++s
        // yssso+ssso+-.......:++/......-:++/:------/ooss+++s
        // yssso+ssso/...-.....--.....+hdddhs/::::-::o+sso++s
        // ysssoossso:..-------.``:syyNNNNNNNNdysy+::o+oso++o
        // ysyysssss+----:::::-..smmh+++ssssyhddddo:/+osso++o
        // ysssoooss/--::://:/+:sho:-----:.--:+o+//:/+osso++s
        // sssssooso::/:+/+/+s:.-/::-.:--.::-+oshs/+/+osssssy
        // ssssssss+::/+o+oso/-+yyyysss:/:ooooyyoy/o/+osssssy
        // yyyyyyss+////ohs:.:/:/oossy-`` .+++hdhs/+++ssssssy
        // syyyysso++/+ss:------------:y/-+oooosoo++o+osssssy
        // ssysssso/++y:`` -::--:o:/o::::-/ssoyhssooo+osssssy
        // ssysyysooso`    -````/y:/s:.`:+//sdoy+/ssyssyysssy
        // ssyyyhhhd:  .   -   :No.+/+s/o+:/sso-+++ysydddhhyh
        // yhdmmmdh-   .`  .  .NN/-/sssoo+oo++oyysoosshdmmmmm
        // mmmmmmm-     -  `. hy//..dho/shyyyyyhhhhddddmmmmmm


        // filter people streaming
        let matches = [];
        let people = process.env.PEOPLE.split(',');
        console.log(`[INTERNAL] Trying to find '${people.join(',')}' in the stream title...`)
        const regex = new RegExp('(?:\| | und )('+people.join('|')+')', 'g');
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
        .setAuthor(GetStateSpecificEnvironmentVariable(state, "EMBED_TITLE"), "", `https://youtube.com/c/${this.channelID}`)
        .setColor(0xFF0000)
        .setThumbnail(this.channelInfo.thumbnail)
        .setURL(`https://youtube.com/watch?v=${streamData.id}`)

        if (streamData.thumbnail)
        {
            embed.setImage(streamData.thumbnail);
        }

        if (matches.length != 0)
        {
            embed.setTitle(streamData.title.replace(/( )?(\| ([^\|]*))$/g, ""));
            embed.addField(GetStateSpecificEnvironmentVariable(state, "EMBED_PEOPLE_PREFIX"), matches.join(" & ") + "!", true);
        }
        else
        {
            embed.setTitle(streamData.title);
        }

        return embed;
    }

    async SendMessages(state, data)
    {
        // REPLACE WITH GIF-COLLECTION

        /*
        const messageFormat = GetStateSpecificEnvironmentVariable(state, "MESSAGE");
        if (messageFormat.length > 0)
        {
            const clip = await this.GetPopularClipLastMonth();
            if (typeof clip != "undefined")
            {
                const message = messageFormat.format({clipURL: clip.url, twitchChannelName: this.channelName})
                console.log(`[DISCORD] Sending regular message:`);
                console.log(`[DISCORD] ${message}`);
                this.discordClient.channels.find("id", process.env.DISCORD_CHANNEL_ID).send(message);
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
        */

        if (GetStateSpecificEnvironmentVariable(state, "EMBED_TITLE"))
        {
            const embedFormat = await this.PrintLiveEmbed(state, data);
            if (embedFormat)
            {
                console.log(`[DISCORD] Sending embed message:`);
                console.log(`[DISCORD] ${JSON.stringify(embedFormat)}`);
                this.discordClient.channels.find("id", process.env.DISCORD_CHANNEL_ID).send(embedFormat);
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
            "TWITCH_CHANNEL_ID": true,
            "TWITCH_CLIENT_ID": false,
            "YOUTUBE_CHANNEL_ID": true,
            "YOUTUBE_API_KEY": false,
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

        let output = "<style>*{text-align: left;font-family: monospace;}</style>";
        output += "<table>";
        for (const key in content)
        {
            if (typeof keyWhitelist[key] == "undefined")
            {
                continue;
            }
            output += `<tr><th>${key}</th><td>${keyWhitelist[key] ? content[key] : "<i>[REDACTED]</i>"}</td></tr>`
        }
        output += "</table>";

        return output;
    }   
}

const client = new Discord.Client();
client.login(process.env.DISCORD_USER_TOKEN);
webConfigHelper = new WebConfigHelper();

// Ensure app cannot mistake numbers as string
if (process.env.TWITCH_CHANNEL_ID && process.env.TWITCH_CLIENT_ID)
{
    console.log("Received data to create a TwitchNotifier...");
    twitch = new TwitchNotifier(client, process.env.TWITCH_CHANNEL_ID, process.env.TWITCH_CLIENT_ID, parseInt(process.env.VALIDATION_STEPS_REQUIRED), parseInt(process.env.ALLOW_INITIAL_STATE_POST));
}
else
{
    console.log("No data for a TwitchNotifier...");
}

if (process.env.YOUTUBE_CHANNEL_ID && process.env.YOUTUBE_API_KEY)
{
    console.log("Received data to create a YouTubeNotifier...");
    youtube = new YouTubeNotifier(client, process.env.YOUTUBE_CHANNEL_ID, process.env.YOUTUBE_API_KEY, parseInt(process.env.VALIDATION_STEPS_REQUIRED), parseInt(process.env.ALLOW_INITIAL_STATE_POST));
}
else
{
    console.log("No data for a YouTubeNotifier...");
}