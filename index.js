#! /usr/bin/node
'use strict';

/*
	This node app listens on port 3000, and expects to run behind a Nginx reverse
	proxy with the secure link module enabled.
	../downloads/some/path/ URLs render the list of files and directories
	Clicking on a file points to a download link of format /download/path/to/file?h=md5hash&e=expirationdate
*/ 

// Use the following directives in your Nginx conf file

// location ^~ /downloads/ {
//     proxy_pass http://localhost:3000/;
// }
// location ^~ /download/ {
//     auth_basic off;
//     alias   /path/to/files;
//     secure_link $arg_h,$arg_e;
//     secure_link_md5 "$secure_link_expires$uri somesecret";
//     if ($secure_link = "") {
//         return 404;
//     }
//     if ($secure_link = "0") {
//         return 404;
//     }
// }

const crypto = require("crypto");
const path = require('path');
const fs = require('fs');
const url = require('url');
const express = require('express');

const secret = "somesecret";
const port = 3000;
const fsRootPath = '/some/path/';
const scheme = 'https';
const hostname = 'somehost.net';
const urlBasePath = '/downloads/';
const secureUrlBasePath = '/download/';
const defaultExpirationHours = 24;

const app = express();

const generateSecureLink = (fsAbsolutePath, expiresHours = defaultExpirationHours) => {
	const timestampExpiration = Math.ceil(Date.now() / 1000) + (expiresHours*60*60);
	const uri = url.resolve(secureUrlBasePath, fsAbsolutePath.replace(fsRootPath,''));
	const unsecureUrl = url.format({
		protocol: scheme,
		hostname: hostname,
		pathname: uri,
	});
	const textToHash = timestampExpiration + decodeURI(uri) + " " + secret; //same pattern as defined in Nginx secure_link_md5 directive
	const binaryHash = crypto.createHash("md5").update(textToHash).digest();
	const base64Hash = Buffer.from(binaryHash).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
	const secureUrl = unsecureUrl + '?h=' + base64Hash + '&e=' + timestampExpiration;
	return secureUrl;
};

const renderHtml = (currentPath) => {
	const fileHtml = file => {
		const filePath = path.join(currentPath, file);
		const isDirectory = fs.statSync(filePath).isDirectory();
		const fileLinkPath = isDirectory ? encodeURI(path.join(currentPath, file).replace(fsRootPath,'')) : generateSecureLink(filePath);
		const fileLinkHtml = `<a href="${fileLinkPath}">${file}</a>`;
		if (isDirectory) {
			return `<li><b>${fileLinkHtml}</b></li>`;
		} else {
			return `<li>${fileLinkHtml}</li>`;
		};
	};
	const pathHtml = `<p><b>Current path:</b> /${currentPath.replace(fsRootPath,'')}<p>`;
	const files = fs.readdirSync(currentPath);
	const filesHtml = '<ul>' + files.map( file => {return fileHtml(file)} ).join('') + '</ul>';
	const footnote = `<p><i>Links expire after ${defaultExpirationHours} hours.</i></p>`;
	return pathHtml + filesHtml + footnote;
};

app.get('/', (req, res) => {
	const html = renderHtml(fsRootPath);
	res.send(html);
});

app.get('/*+', (req, res) => {
	const absoluteFsPath = path.join(fsRootPath, ...req.path.replace(urlBasePath,'').split('/').map( segment => {return decodeURIComponent(segment)} ));
	const html = renderHtml(absoluteFsPath);
	res.send(html);
});

app.listen(port, () => console.log(`Listening on port ${port}!`));
