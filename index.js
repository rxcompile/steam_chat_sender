// For reference. Actual credentials is should be in creds.json
/* creds.json
{
    "accountName": "<myacc>",
    "password": "<mypass>"
}
*/
const oauthFile = "./oauth.json";
const credsFile = "./creds.json";

const readline = require('readline-promise').default;
const SteamUser = require('steam-user')
const SteamCommunity = require('steamcommunity');
const fs = require('fs');
const util = require('util')
const argv = require('minimist')(process.argv.slice(2));

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

const sendMessages = (members, message) =>
    new Promise(async resolve => {
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        var results = [];
        for (steamID of members) {
            const result = await user.chat.sendFriendMessage(steamID, message).then(
                _ => Promise.resolve({ steamID: steamID, result: 'Sent' }),
                e => Promise.resolve({ steamID: steamID, result: e }));
            results.push(result);
            await sleep(1000);
        }
        resolve(results);
    }).then(array => array.forEach(o => console.log(`SteamId[${o.steamID}]: ${o.result}`)));

// subscribe to loggedOn to do payload script
user.on('loggedOn', () => {
    const groupName = argv.group || "rxdesugrp";
    const messageToSend = argv._.join(' ') || "Hi!";
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
    .then(data => Promise.resolve(JSON.parse(data)))
    .catch(err => 'accountName' in argv && 'password' in argv ? Promise.resolve(
        {
            accountName: argv.accountName,
            password: argv.password
        }) : err);

const connectWithCredentials = (credentials) => {
    console.log('oAuth failed. Connect as usual.');
    return removeBadOauth().then(_ => regularLoginPromise(credentials).catch(err => handleLoginError(err, credentials)));
};

const oauthConnect = () => readFile(oauthFile)
    .then(data => Promise.resolve(JSON.parse(data)))
    .then(oauth => oAuthLoginPromise(oauth.steamguard, oauth.oAuthToken))
const regularConnect = () => getCredentials().then(credentials => connectWithCredentials(credentials));

// establish connection
console.log('Logging in to SteamCommunity');
oauthConnect().catch(_ => regularConnect())
    .then(_ => console.log('Logged in to SteamCommunity.'))
    .then(_ => getClientLogonTokenPromise())
    .then(details => connectSteam(details))
    .catch(err => {
        console.log(err);
        process.exit();
    });
