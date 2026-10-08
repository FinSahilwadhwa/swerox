"use strict";

var fs = require("fs");
var https = require("https");
var path = require("path");
var urlParser = require("url");

var SBI_PDF_URL =
  process.env.SBI_TT_SOURCE_URL ||
  "https://sbi.bank.in/documents/16012/1400784/FOREX_CARD_RATES.pdf";

var repoRoot = path.join(__dirname, "..");
var archiveRoot = "sbi-tt-rates";

function getIndiaDate() {
  var parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  var date = {};
  parts.forEach(function (part) {
    date[part.type] = part.value;
  });

  return date.year + "-" + date.month + "-" + date.day;
}

function resolveArchivePath(dateValue) {
  var parts = dateValue.split("-");
  return path.join(repoRoot, archiveRoot, parts[0], parts[1], dateValue + ".pdf");
}

function ensureDir(dirPath) {
  if (fs.existsSync(dirPath)) return;
  ensureDir(path.dirname(dirPath));
  fs.mkdirSync(dirPath);
}

function fetchPdf(url, redirectCount, done) {
  var parsedUrl = urlParser.parse(url);

  https
    .get(
      {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        path: parsedUrl.path,
        headers: {
          Accept: "application/pdf,*/*",
          "User-Agent": "SWEROX-SBI-TT-Rates-Archiver/1.0"
        }
      },
      function (response) {
        if (
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location &&
          redirectCount < 5
        ) {
          response.resume();
          return fetchPdf(response.headers.location, redirectCount + 1, done);
        }

        if (response.statusCode !== 200) {
          response.resume();
          return done(new Error("SBI returned HTTP " + response.statusCode));
        }

        var chunks = [];
        response.on("data", function (chunk) {
          chunks.push(chunk);
        });
        response.on("end", function () {
          var buffer = Buffer.concat(chunks);
          var contentType = response.headers["content-type"] || "";
          var looksLikePdf = buffer.slice(0, 5).toString("utf8") === "%PDF-";

          if (!looksLikePdf && contentType.indexOf("pdf") === -1) {
            return done(
              new Error("Downloaded file is not a PDF. Content-Type: " + (contentType || "unknown"))
            );
          }

          if (buffer.length < 5000) {
            return done(new Error("Downloaded PDF is unexpectedly small: " + buffer.length + " bytes"));
          }

          done(null, buffer);
        });
      }
    )
    .on("error", done);
}

var archiveDate = process.env.SBI_TT_DATE || getIndiaDate();
var outputPath = resolveArchivePath(archiveDate);

if (fs.existsSync(outputPath)) {
  console.log("Archive already exists: " + outputPath);
  process.exit(0);
}

fetchPdf(SBI_PDF_URL, 0, function (error, pdf) {
  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  ensureDir(path.dirname(outputPath));
  fs.writeFileSync(outputPath, pdf);
  console.log("Saved SBI TT rates PDF for " + archiveDate + ": " + outputPath);
});


