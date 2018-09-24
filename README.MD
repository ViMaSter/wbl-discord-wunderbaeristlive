# wunderbaeristlive-bot

Discord-bot built for [wunderbaerlive](https://www.twitch.tv/wunderbaerlive) using [Heroku](https://dashboard.heroku.com) as a provider.  
Notifies a specific discord-channel if a specific twitch-channel goes live or plays a VODcast.

## Setup

1. Grab a Client ID from any of your [discord apps](https://discordapp.com/developers/applications/me) (create one if needed)
2. Grab a Client ID from any of your [twitch apps](https://dev.twitch.tv/dashboard/apps)
3. Join the Bot to any server using `https://discordapp.com/oauth2/authorize?client_id=[YOUR BOT CLIENT ID]&scope=bot&permissions=18432`
4. **(local)** Install the [Heroku Toolbelt](https://devcenter.heroku.com/articles/heroku-cli)
5. **(local)** Verify Node.js is >=v8.0.0 by running `node -v`; if not, [update it](https://nodejs.org/en/)
6. **(local)** Clone the repository
   **(remote)** Push this repository to your heroku app
7. **(local)** Run `npm install` and install any other package dependencies the output log mentions
8. **(local)** Create a .env-file containing the following lines (replace comments with values):  
   **(remote)** Setup the following config variables in your Heroku-dashboard at https://dashboard.heroku.com/apps/[YOUR-HEROKU-APP]/settings:
```
--- General ---
DISCORD_CHANNEL_ID=          // [integer] Channel ID of the discord room to post the notification in
DISCORD_USER_TOKEN=          // [string]  User token of your discord app
TWITCH_CHANNEL_ID=           // [integer] Channel ID of the twitch channel to monitor
TWITCH_CLIENT_ID=            // [string]  Client ID of your twitch app
VALIDATION_STEPS_REQUIRED=   // [integer] How often the twitch state is checked until the notification is actially posted
PEOPLE=                      // [string]  Array of names of hosts split by ","
--- When live ---
ISLIVE_MESSAGE=              // [string]  Text for single message sent before embed message  (leave blank to just send the embed message)
ISLIVE_EMBED_TITLE=          // [string]  Headline of embed message (leave blank to not send the embed message)
ISLIVE_EMBED_GAME_PREFIX=    // [string]  Text above game-title in embed message
ISLIVE_EMBED_PEOPLE_PREFIX=  // [string]  Text above list of hosts in embed message
--- When running vodcasts ---
ISRERUN_MESSAGE=             // [string]  Text for single message sent before embed message  (leave blank to just send the embed message)
ISRERUN_EMBED_TITLE=         // [string]  Headline of embed message (leave blank to not send the embed message)
ISRERUN_EMBED_PEOPLE_PREFIX= // [string]  Text above list of hosts in embed message
ISRERUN_EMBED_GAME_PREFIX=   // [string]  Text above game-title in embed message
ALLOW_INITIAL_STATE_POST=    // [EXISTS]  Message is sent if the stream is live, when the bot restarts
```
The values to be added after the `=` are either integers; i.e. `VALIDATION_STEPS_REQUIRED=5`; or strings `ISLIVE_MESSAGE=Hey everyone! We're live!`.

9. **(local)** Run `heroku local` inside the repository  
   **(remote)** Restart all dynos
