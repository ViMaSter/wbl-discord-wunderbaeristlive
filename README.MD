# wunderbaeristlive-bot

Discord-bot built for [wunderbaerlive](https://www.twitch.tv/wunderbaerlive) using [Heroku](https://dashboard.heroku.com) as a provider.  
Notifies a specific discord-channel if a specific YouTube- or twitch-channel goes live or the twtich-channel plays a VODcast using both a plain text-message with a highlight-clip and a [Discord embed message](https://discordapp.com/developers/docs/resources/channel#embed-object).

## Setup

1. Grab a Client ID from any of your [discord apps](https://discordapp.com/developers/applications/me) (create one if needed)
2. **(Twitch)** Grab a Client ID from any of your [twitch apps](https://dev.twitch.tv/dashboard/apps)  
   **(YouTube)** [Create a project](https://console.developers.google.com/projectcreate) with [YouTube Data API V3-access](https://console.developers.google.com/apis/library/youtube.googleapis.com) and [grab an API key](https://console.developers.google.com/apis/credentials/key)
3. Join the Bot to any server using `https://discordapp.com/oauth2/authorize?client_id=[YOUR BOT CLIENT ID]&scope=bot&permissions=18432`
4. **(local)** Install the [Heroku Toolbelt](https://devcenter.heroku.com/articles/heroku-cli)
5. **(local)** Verify Node.js is >=v8.0.0 by running `node -v`; if not, [update it](https://nodejs.org/en/)
6. **(local)** Clone the repository
   **(remote)** Push this repository to your heroku app
7. **(local)** Run `npm install` and install any other package dependencies the output log mentions
8. **(local)** Create a .env-file containing the following lines (replace comments with values & remove headers):  
   **(remote)** Setup the following config variables in your Heroku-dashboard at `https://dashboard.heroku.com/apps/[YOUR-HEROKU-APP]/settings`:
```
--- Discord setttings ---
DISCORD_CHANNEL_ID=          // [string]  Channel ID of the discord room to post the notification in
DISCORD_USER_TOKEN=          // [string]  User token of your discord app

--- Twitch setttings ---
TWITCH_CHANNEL_ID=           // [string?]  Channel ID of the twitch channel to monitor
TWITCH_CLIENT_ID=            // [string?]  Client ID of your twitch app

--- YouTube setttings ---
YOUTUBE_CHANNEL_ID=          // [string?]  Channel ID of the YouTube channel to monitor
YOUTUBE_API_KEY=             // [string?]  API key used in YouTube-API requests

--- When live ---
ISLIVE_MESSAGE=              // [string?]  Text for separate message before embed message (leave blank to just send the embed message)
ISLIVE_EMBED_TITLE=          // [string?]  Headline of embed message (leave blank to not send the embed message)
ISLIVE_EMBED_GAME_PREFIX=    // [string]  Text above game-title in embed message
ISLIVE_EMBED_PEOPLE_PREFIX=  // [string]  Text above list of hosts in embed message

--- When running vodcasts (ignored for YT) ---
ISRERUN_MESSAGE=             // [string?]  Text for single message sent before embed message  (leave blank to just send the embed message)
ISRERUN_EMBED_TITLE=         // [string?]  Headline of embed message (leave blank to not send the embed message)
ISRERUN_EMBED_PEOPLE_PREFIX= // [string]  Text above list of hosts in embed message
ISRERUN_EMBED_GAME_PREFIX=   // [string]  Text above game-title in embed message

--- Configuration ---
PEOPLE=                      // [string]  Array of names of hosts split by ","
ALLOW_INITIAL_STATE_POST=    // [integer] If set to 1, a status message is sent if the stream is live, when the bot restarts
VALIDATION_STEPS_REQUIRED=   // [integer] Amount of times the live state is polled before sending a message (1 - 1000)
```
### Setup notes
* The values to be added after the `=` are
  * integers: `VALIDATION_STEPS_REQUIRED=5` or
  * strings `ISLIVE_MESSAGE=Hey everyone! We're live!`.
* Keys with `?` in their comment are optional.
  * Leaving out YouTube-/twitch-configuration values will cause the bot to not monitor that service. 
  * Not supplying a `_MESSAGE` or `_EMBED_TITLE` will not sent a plain Discord or embed message respectively. 
* The `ISLIVE_MESSAGE`/`ISRERUN_MESSAGE` has two template arguments
  * `{channelName}` is replaced with the YouTube or Twitch display name
  * `{clipURL}` is Twitch-exclusive and replaced with the most "popular" clip of the last 30 days.
* The `IS*`-configurations (`ISLIVE_MESSAGE`, `ISRERUN_EMBED_TITLE`, etc.) can be made platform-specific by adding `YOUTUBE_`/`TWITCH_` after the first `_`; they will always gain priority over a generic definition, even if the generic definition is defined after a specific one  
This is required, since the `{clipURL}`-template parameter is only available on Twitch and a more suiting message might be requested
  * i.e. `ISLIVE_MESSAGE` = `ISLIVE_TWITCH_MESSAGE`
  * i.e. `ISLIVE_EMBED_TITLE` = `ISLIVE_YOUTUBE_EMBED_TITLE`
  * etc. ...


9. **(local)** Run `heroku local` inside the repository  
   **(remote)** Restart all dynos
