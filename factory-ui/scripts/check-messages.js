/*
 * Checks how services/ui.js shortens the factory's failure messages (shortError): only a model server's own words go,
 * the factory's sentences stay. Runs with Node alone, before the build: node scripts/check-messages.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'services', 'ui.js'), 'utf8');
let ui;
// ui.js is an AMD module: run its factory with stand-ins for knockout and the preferences
new Function('define', source)((deps, factory) => {
  ui = factory({ observable: () => () => {}, pureComputed: () => () => {} }, { hour12: () => false });
});

const server = "Chat model 'llm-a' at https://api.example.com/openai/v1";
const report = '(Rate limit reached for model `llm-a` in organization `org_01abcdefghij` service tier `on_demand` on tokens per day '
  + '(TPD): Limit 100000, Used 99000, Requested 4467. Please try again in 31m49.872s.)';
const json = '{"error":{"message":"Rate limit reached for model `llm-a` in organization `org_01abcdefghij` on tokens per day (TPD): '
  + 'Limit 200000, Used 199954. Please try again in 31m49.872s. Need more tokens?","type":"tokens","code":"rate_limit_exceeded"}}';
const daily = server + ' has used up its daily limit ' + report + ". Try again in about 32 minutes (the server's estimate), or use a "
  + 'plan or model with a larger limit.';

const cases = [
  ['the daily limit', 'Impact analysis failed: ' + daily,
    "Impact analysis failed: The model server has used up its daily limit. Try again in about 32 minutes (the server's estimate), or "
    + 'use a plan or model with a larger limit.', true],
  ['the raw answer of a failed call', 'Impact analysis failed: ' + server + ' failed: ' + json,
    "Impact analysis failed: The model server failed: its daily limit is used up; try again in about 32 minutes.", true],
  ['Write again keeps its file and what follows', 'Writing channel/a.js again failed (' + server + ' takes at most 8192 tokens in one '
    + 'request; this one had 9100.); the previous version is kept. 8 file(s) written.',
    'Writing channel/a.js again failed (the model server takes at most 8192 tokens in one request; this one had 9100.); the previous '
    + 'version is kept. 8 file(s) written.', true],
  ['fixes stopped keep what was not fixed', 'a.js written again. The model\'s limit (' + daily + ') stopped the fixes of what the '
    + 'cross-checks found; not fixed: a.js. Every file is written: Write again a file to fix it.',
    "a.js written again. The model's limit (the model server has used up its daily limit. Try again in about 32 minutes (the server's "
    + 'estimate), or use a plan or model with a larger limit.) stopped the fixes of what the cross-checks found; not fixed: a.js. Every '
    + 'file is written: Write again a file to fix it.', true],
  ['the factory\'s own advice', 'Impact analysis failed: ' + server + ' writes at most 300 tokens a minute, too few for an answer. Use a '
    + 'model or plan with a higher output limit.', 'Impact analysis failed: The model server writes at most 300 tokens a minute, too few '
    + 'for an answer. Use a model or plan with a higher output limit.', true],
  ['the factory\'s wait wins', 'Impact analysis failed: ' + server + ' stayed at its rate limit after 5 tries (Rate limit reached on '
    + 'tokens per minute (TPM). Please try again in 1.2s.). Try again in a few minutes.',
    'Impact analysis failed: The model server stayed at its rate limit after 5 tries. Try again in a few minutes.', true],
  ['seconds as said', 'Impact analysis failed: ' + server + ' reached its rate limit and asks to wait 75 seconds. Try again then.',
    'Impact analysis failed: The model server reached its rate limit and asks to wait 75 seconds. Try again then.', true],
  ['no wait is not "0 minutes"', 'Impact analysis failed: ' + server + ' is at its rate limit; try again in 0s',
    'Impact analysis failed: The model server is at its rate limit; try again in 0s', true],
  ['another server\'s JSON stays', 'Delivery failed: the build server answered {"error":"Unauthorized"}. Check the Jenkins credentials.',
    'Delivery failed: the build server answered {"error":"Unauthorized"}. Check the Jenkins credentials.', false],
  ['a plain message stays', 'Plan ready: 3 file(s).', 'Plan ready: 3 file(s).', false],
  ['a report outside brackets keeps its words whole', 'Impact analysis failed: ' + server + ' failed: Rate limit reached on tokens per day '
    + '(TPD): Limit 100, Used 99. Please try again in 5m.', 'Impact analysis failed: The model server failed: Rate limit reached on tokens '
    + 'per day (TPD): Limit 100, Used 99. Please try again in 5m.', true],
  ['other keys, a key in the address and a user in it are hidden', 'Impact analysis failed: ' + server + ' answered 401 for '
    + 'gsk_abcdefghijklmnop at https://user:p@ss@host/v1?key=SECRET123 (token=x).',
    'Impact analysis failed: The model server answered 401 for [hidden] at https://[hidden]@host/v1?key=[hidden] (token=x). Check the '
    + 'API key on the Models page.', true],
  ['secrets are hidden, details too', 'Impact analysis failed: ' + server + ' answered 401: {"error":{"message":"Incorrect API key '
    + 'sk-abcdefghijklmnop; Authorization: Bearer abc.def"}}', 'Impact analysis failed: The model server answered 401. Check the API key on the Models page.', true]
];

let failed = 0;
for (const [name, message, expected, details] of cases) {
  const result = ui.shortError(message);
  const ok = result.text === expected && !!result.details === details && !/sk-abcdefghijklmnop|Bearer abc|gsk_abc|SECRET123|p@ss/.test(result.details + result.text);
  if (!ok) {
    failed++;
    console.error('Message check failed: ' + name + '\n  got:      ' + result.text + '\n  expected: ' + expected
      + '\n  details:  ' + result.details);
  }
}
// errorText: what every page shows for a failed request
const errorCases = [
  ['a network failure', new Error('Failed to fetch'), 'Could not reach the factory. Check your connection, then try again.'],
  ['nothing said', new Error(''), 'Something went wrong. Try again.'],
  ['an SVN server that refuses', "svn info failed: svn: E170013: Unable to connect to a repository at URL 'svn://127.0.0.1:1/none' svn: "
    + "E730061: Can't connect to host '127.0.0.1': No connection could be made because the target machine actively refused it.",
  "Could not reach the repository at svn://127.0.0.1:1/none: Can't connect to host '127.0.0.1': No connection could be made because the "
    + 'target machine actively refused it. Check the repository URL, the user name and password, and that the SVN server is running, then try again.'],
  ['an SVN path that is missing', "Import failed: svn: E170013: Unable to connect to a repository at URL 'file:///C:/x/trunk' svn: E180001: "
    + "Unable to open repository 'file:///C:/x/trunk'", "Import failed: Could not reach the repository at file:///C:/x/trunk: Unable to open "
    + "repository 'file:///C:/x/trunk'. Check the repository URL, the user name and password, and that the SVN server is running, then try again."],
  ['a Java exception name', 'Impact analysis failed: ' + server + ' failed: java.net.ConnectException. Check that the model server is running.',
    'Impact analysis failed: The model server failed: the server refused the connection. Check that the model server is running.'],
  ['only an exception name', 'java.net.ConnectException', 'The server refused the connection. Check that the server is running, then try again.'],
  ['only an unknown exception name', 'org.example.ProviderException', 'The request failed. Check that the server is running, then try again.'],
  ['an exception name alone', 'Could not get the models of http://127.0.0.1:9/v1: ConnectException. Check the address (it usually ends '
    + 'with /v1) and that the server is running.', 'Could not get the models of http://127.0.0.1:9/v1: the server refused the connection. '
    + 'Check the address (it usually ends with /v1) and that the server is running.'],
  ['an exception class before its message', 'Test failed: org.example.http.ProviderException: the server closed the connection',
    'Test failed: the server closed the connection'],
  ['a plain message stays', 'Plan ready: 3 file(s).', 'Plan ready: 3 file(s).']
];
for (const [name, error, expected] of errorCases) {
  const text = ui.errorText(error);
  if (text !== expected) {
    failed++;
    console.error('Error text check failed: ' + name + '\n  got:      ' + text + '\n  expected: ' + expected);
  }
}
if (failed) {
  process.exit(1);
}
console.log('Messages: ' + (cases.length + errorCases.length) + ' cases as expected.');
