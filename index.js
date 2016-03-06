'use strict'

const fs = require('fs')
const readline = require('readline')
const google = require('googleapis')
const GoogleAuth = require('google-auth-library')
const request = require('request')
const format = require('util').format

// get this from https://console.developers.google.com/apis/credentials
const pkg = require('./package.json')
const clientCredentials = require('./.client_secret')

const SCOPES = [
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/drive.readonly'
]
const TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + '/.credentials'
const TOKEN_PATH = format('%s/.%s-drive-auth', TOKEN_DIR, pkg.name)

/**
 * Authorizes the app with Google drive. New token will be requested if needed. Token will be 
 * stored in `TOKEN_PATH`. Delete `TOKEN_PATH` manually if `SCOPES` is modified.
 */
function authorize(cb) {
  let clientSecret = clientCredentials.installed.client_secret
  let clientId = clientCredentials.installed.client_id
  let redirectUrl = clientCredentials.installed.redirect_uris[0]
  let auth = new GoogleAuth()
  let authClient = new auth.OAuth2(clientId, clientSecret, redirectUrl)

  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) getNewToken(authClient, cb)
    else {
      authClient.credentials = JSON.parse(token)
      cb(null, authClient)
    }
  })
}

/**
 * Get a new auth token. User will need to open OAuth dialog url in their browser and copy/past the
 * generate code.
 */
function getNewToken(authClient, cb) {
  let authUrl = authClient.generateAuthUrl({access_type: 'offline', scope: SCOPES})
  console.log('Open this: %s', authUrl)
  let rl = readline.createInterface({input: process.stdin, output: process.stdout})

  rl.question('Enter the code from that page here: ', code => {
    rl.close()
    authClient.getToken(code, (err, token) => {
      if (err) cb(err)
      else {
        authClient.credentials = token
        storeToken(token)
        cb(null, authClient)
      }
    })
  })
}

/**
 * Stores generated OAuth2 token to user dir for later use.
 */
function storeToken(token) {
  try {
    fs.mkDirSync(TOKEN_DIR)
  } catch(err) {
    if (err.code !== 'EEXIST') {
      console.warn('Failed to store token. Could not create %s (%s)', TOKEN_DIR, err.code)
    }
  }
  fs.writeFile(TOKEN_PATH, JSON.stringify(token), err => {
    if (err) console.warn('Failed to store token to %s (%s)', TOKEN_PATH, err.code)
    else console.log('Token stored to %s', TOKEN_PATH)
  })
}

/**
 * Export worksheet `gid` from file `fileId` into `tsv` format. Outut is piped into `dest`. 
 * Dest must be a `stream.Writable`.
 */
function exportFile(auth, fileId, gid, dest) {
  let token = auth.credentials.access_token
  let downloadUrl = format(
    'https://docs.google.com/spreadsheets/d/%s/export?format=tsv&gid=%s', fileId, gid
  )

  let req = request({
    method: 'GET',
    url: downloadUrl,
    headers: {'Authorization': 'Bearer ' + token}
  })
  .on('response', res => {
    if (res.statusCode !== 200) {
      console.error('Failed to get file, got status %s', res.statusCode)
    } else {
      req.pipe(dest)
    }
  })
  .on('error', err => {
    console.error('Failed to download file', err)
  })
}

// Run the program. Print usage format if anything is missing.
let fileId = process.argv[2]
let gid = process.argv[3]

if (!fileId || !gid) {
  console.error('Usage: node download.js {{fileId}} {{gid}}')
  process.exit(1)
}

authorize((err, auth) => {
  if (err) throw err
  else exportFile(auth, fileId, gid, process.stdout)
})
