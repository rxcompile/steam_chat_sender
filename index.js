const SteamUser = require('steam-user')
const SteamCommunity = require('steamcommunity');
const readline = require('readline');
const fs = require('fs');
const SteamID = require('steamid');

const oauthFile = "./oauth.json";
const credsFile = "./creds.json";


const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

let community = new SteamCommunity();
let user = new SteamUser();

// For reference. Actual credentials is should be in creds.json
/*
{
    "username": "<myacc>",
    "password": "<mypass>"
}
*/
let file;
try {
    file = fs.readFileSync(credsFile);
} catch (error) {
    process.exit();
}
const loginDetail = JSON.parse(file);

const authUser = () => {
    community.getClientLogonToken((err, details) => {
        if (err) {
            console.log(err);
            process.exit();
        } else {
            user.logOn(details);
        }
    });
};

const regularLogin = (info) => {
    const loginHandler = (err, sessionID, cookies, steamguard, oAuthToken) => {
        if (err) {
            if (err.message == "SteamGuard") {
                rl.question('What is SteamGuard value?\n', (answer) => {
                    const loginViaGuard = {
                        accountName: info.accountName,
                        password: info.password,
                        authCode: answer
                    };
                    regularLogin(loginViaGuard);
                });
            } else {
                console.log("Error: ${err}. Exiting...");
                process.exit();
            }
        } else {
            console.log("Hello Web");
            authUser();
            fs.writeFile(oauthFile, JSON.stringify({ "steamguard": steamguard, "oAuthToken": oAuthToken }));
        }
    };
    community.login(info, loginHandler);
};

const oauthLogin = (oauthData) => {
    community.oAuthLogin(oauthData.steamguard, oauthData.oAuthToken, (err, ssid, cookies) => {
        if (err) {
            console.log("Error: ${err}. oAuth failed. Connect as usual.");
            fs.unlink(oauthFile);
            regularLogin(loginDetail);
        } else {
            console.log("oAuthLogin");
            authUser();
        }
    });
};

fs.readFile(oauthFile, (err, data) => {
    if (err) {
        regularLogin(loginDetail);
    } else {
        oauthLogin(JSON.parse(data))
    }
});

user.on('loggedOn', (details) => {
    console.log("API Logged");
    console.log(details);
    user.setPersona(SteamUser.EPersonaState.Online);
});

user.on('friendsList', () => {
    for (const id in user.myFriends) {
        community.getSteamUser(new SteamID(id), (err, u) => {
            if (!err) {
                if (u.name == "RxCompiLe") {
                    user.chat.sendFriendMessage(u.steamID, "Hi");
                }
            }
        });
    }
    console.log(user.myFriends);
});
