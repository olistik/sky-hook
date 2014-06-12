Sky-Hook
==========

This tool emulates a browser (via CasperJS/PhantomJS) in order to grab some information provided by the [Nexive platform](https://www.sistemacompleto.it/Senders/Ricerche/TrackAndTrace.aspx).

## Requirements

Tested with the following versions:

```
$ node -v
v0.10.28
$ npm -v
1.4.13
$ casperjs --version
1.1.0-beta3
```

## Install

```
$ npm install --save moment
```

## Usage

Create a file ```credentials.json```:

```json
{
  "username": "my@account.com",
  "password": "myPassword"
}
```

```
$ casperjs nexive.js
```

The resulting file will be stored in the working directory and named with a date timestamp:

```
$ cat $(ls nexive-*.json | sort | tail -n 1)
```
