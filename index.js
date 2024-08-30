#! /usr/bin/node
"use strict";

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

const crypto = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs");
const url = require("node:url");

const express = require("express");

const secret = process.env.SECRET;
if (!secret) throw new Error('Application needs a SECRET env var')
const port = 3000;
const fsRootPath = "/zfspool/p2p/";
const scheme = "https";
const hostname = "ouistous.club";
const urlBasePath = "/downloads/";
const secureUrlBasePath = "/download/";
const defaultExpirationHours = 24;

const app = express();

const generateSecureLink = (
  fsAbsolutePath,
  expiresHours = defaultExpirationHours
) => {
  const timestampExpiration =
    Math.ceil(Date.now() / 1000) + expiresHours * 60 * 60;
  const uri = url.resolve(
    secureUrlBasePath,
    fsAbsolutePath.replace(fsRootPath, "")
  );
  const unsecureUrl = url.format({
    protocol: scheme,
    hostname: hostname,
    pathname: uri,
  });
  const textToHash = timestampExpiration + decodeURI(uri) + " " + secret; //same pattern as defined in Nginx secure_link_md5 directive
  const binaryHash = crypto.createHash("md5").update(textToHash).digest();
  const base64Hash = Buffer.from(binaryHash)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const secureUrl =
    unsecureUrl + "?h=" + base64Hash + "&e=" + timestampExpiration;
  return secureUrl;
};

app.get("*", (req, res) => {
  // nginx strips the "/dowloads"" component of the request path
  const relativeFsPath = req.path
    .substring(1)
    .split("/")
    .map((segment) => decodeURIComponent(segment))
    .join("/");
  const absoluteFsPath = fsRootPath + relativeFsPath;

  const isDirectory = fs.statSync(absoluteFsPath).isDirectory();
  if (!isDirectory)
    throw new Error("GET requests for files should is not secure");

  //   Get list of files in directory
  const inodes = fs.readdirSync(absoluteFsPath, { withFileTypes: true });
  const inodeListHtml = inodes
    .map((inode) => {
      const inodePath = path.join(absoluteFsPath, inode.name);
      const link = inode.isDirectory()
        ? inodePath
            .replace(fsRootPath, urlBasePath)
            .split("/")
            .map((segment) => encodeURIComponent(segment))
            .join("/") + "/"
        : inode.isFile()
        ? generateSecureLink(inodePath)
        : "";
      if (inode.isDirectory()) {
        return `<li><b><a href="${link}">${inode.name}</a></b></li>`;
      } else {
        return `<li><a href="${link}">${inode.name}</a></li>`;
      }
    })
    .join("");

  const html = `
	<p><b>Current path:</b> /${relativeFsPath}<p>
	<ul>
	${inodeListHtml}
	</ul>
	<p><i>Links expire after ${defaultExpirationHours} hours.</i></p>
	`;
  res.send(html);
});

app.listen(port, () => console.log(`Listening on port ${port}!`));

// Use the following Nginx directive
// location ^~ /download/ {
//     auth_basic off;
//     alias   /zfspool/p2p/;
//     secure_link $arg_h,$arg_e;
//     secure_link_md5 "$secure_link_expires$uri 7gUrn2D0TXZBxyi0AB4XpIoD9yReNCZ";

//     if ($secure_link = "") {
//         return 404;
//     }

//     if ($secure_link = "0") {
//         return 404;
//     }

// }
