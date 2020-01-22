// For reference. Actual credentials is should be in creds.json
/* creds.json
{
    "accountName": "<myacc>",
    "password": "<mypass>"
}
*/
const oauthFile = "./oauth.json";
const credsFile = "./creds.json";
const groupName = "rxdesugrp";
const messageToSend = "Hi!";

const readline = require('readline-promise').default;
const SteamUser = require('steam-user')
const SteamCommunity = require('steamcommunity');
const fs = require('fs');
const util = require('util')

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
const community = new SteamCommunity();
const user = new SteamUser();

const regularLoginPromise = util.promisify((info, cb) => community.login(info, (err, ...results) => cb(err, results)));
const oAuthLoginPromise = util.promisify(SteamCommunity.prototype.oAuthLogin).bind(community);
const getClientLogonTokenPromise = util.promisify(SteamCommunity.prototype.getClientLogonToken).bind(community);
const getSteamGroupPromise = util.promisify(SteamCommunity.prototype.getSteamGroup).bind(community);
const getGroupMembersPromise = util.promisify(SteamCommunity.prototype.getGroupMembers).bind(community);
const readFile = util.promisify(fs.readFile);

const connectSteam = (connectionDetails) => {
    console.log("Logging in to SteamAPI...");
    user.logOn(connectionDetails);
    return Promise.resolve();
};
const sendMessages = (members, message) => Promise.all(
    members.map(steamID =>
        user.chat
            .sendFriendMessage(steamID, message)
            .catch(e => { console.log(e); })
    )
);

// subscribe to loggedOn to do payload script
user.on('loggedOn', () => {
    console.log("Logged in to SteamAPI.");
    user.setPersona(SteamUser.EPersonaState.Online);
    console.log(`Start send message \"${messageToSend}\".`);
    getSteamGroupPromise(groupName)
        .then(grp => getGroupMembersPromise(grp.steamID))
        .then(members => sendMessages(members, messageToSend))
        .then(_ => console.log("Messages sent"), err => console.log(err))
        .then(_ => process.exit());
});

const removeBadOauth = () => {
    fs.unlink(oauthFile, _ => { });
    return Promise.resolve();
};

const writeGoodOauth = (steamguard, oAuthToken) => new Promise((resolve, fail) => {
    const data = JSON.stringify({
        "steamguard": steamguard,
        "oAuthToken": oAuthToken
    });
    fs.writeFile(oauthFile, data, e => {
        if (e) {
            fail(e);
        } else {
            console.log('Saved oAuth for later use.');
            resolve();
        }
    });
});

const handleSteamGuard = (accountName, password) => rl.questionAsync('What is SteamGuard value?\n')
    .then(guard => regularLoginPromise({
        accountName: accountName,
        password: password,
        authCode: guard
    }))
    .then(([sessionID, cookies, steamguard, oAuthToken]) => writeGoodOauth(steamguard, oAuthToken));

const handleLoginError = (err, credentials) => err.message == "SteamGuard"
    ? handleSteamGuard(credentials.accountName, credentials.password)
    : Promise.reject(err)

const getCredentials = () => readFile(credsFile)
    .then(data => Promise.resolve(JSON.parse(data)));

const connectWithCredentials = (creds) => {
    console.log('oAuth failed. Connect as usual.');
    return removeBadOauth().then(_ => regularLoginPromise(creds).catch(err => handleLoginError(err, creds)));
};

// establish connection
console.log('Logging in to SteamCommunity');
readFile(oauthFile)
    .then(data => Promise.resolve(JSON.parse(data)))
    .then(oauth => oAuthLoginPromise(oauth.steamguard, oauth.oAuthToken))
    .catch(_ => getCredentials().then(credentials => connectWithCredentials(credentials)))
    .then(_ => console.log('Logged in to SteamCommunity.'))
    .then(_ => getClientLogonTokenPromise())
    .then(details => connectSteam(details))
    .catch(err => {
        console.log(err);
        process.exit();
    });
