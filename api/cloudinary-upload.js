const crypto = require("crypto");
const https = require("https");
const busboy = require("busboy");
const { getAdminCookie, verifyToken } = require("./admin-cookie");

/* Vercel serverless request body limit ~4.5 MB; multipart overhead needs headroom. */
const MAX_BYTES = 4 * 1024 * 1024;

function cloudinarySignature(paramsToSign, apiSecret) {
  const keys = Object.keys(paramsToSign).sort();
  const str = keys.map(function (k) {
    return k + "=" + paramsToSign[k];
  }).join("&");
  return crypto.createHash("sha1").update(str + apiSecret).digest("hex");
}

function buildMultipartBody(boundary, fields, fileBuffer, fileName, mimeType) {
  const crlf = "\r\n";
  const chunks = [];
  function addText(t) {
    chunks.push(Buffer.from(t, "utf8"));
  }
  Object.keys(fields).forEach(function (name) {
    addText("--" + boundary + crlf);
    addText('Content-Disposition: form-data; name="' + name + '"' + crlf + crlf);
    addText(String(fields[name]) + crlf);
  });
  var safeName = String(fileName || "upload.jpg").replace(/[\r\n"]/g, "_");
  addText("--" + boundary + crlf);
  addText(
    'Content-Disposition: form-data; name="file"; filename="' +
      safeName +
      '"' +
      crlf +
      "Content-Type: " +
      (mimeType || "application/octet-stream") +
      crlf +
      crlf
  );
  chunks.push(fileBuffer);
  addText(crlf + "--" + boundary + "--" + crlf);
  return Buffer.concat(chunks);
}

function uploadBufferToCloudinary(buffer, mimeType, filename, apiKey, apiSecret, cloudName, uploadPreset) {
  return new Promise(function (resolve, reject) {
    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign = {
      timestamp: String(timestamp),
      upload_preset: uploadPreset,
    };
    const signature = cloudinarySignature(paramsToSign, apiSecret);
    const boundary = "----KmmkForm" + crypto.randomBytes(12).toString("hex");
    const body = buildMultipartBody(
      boundary,
      {
        api_key: apiKey,
        timestamp: String(timestamp),
        signature: signature,
        upload_preset: uploadPreset,
      },
      buffer,
      filename,
      mimeType
    );

    const path = "/v1_1/" + encodeURIComponent(cloudName) + "/image/upload";
    const req = https.request(
      {
        hostname: "api.cloudinary.com",
        port: 443,
        method: "POST",
        path: path,
        headers: {
          "Content-Type": "multipart/form-data; boundary=" + boundary,
          "Content-Length": String(body.length),
        },
      },
      function (res) {
        const chunks = [];
        res.on("data", function (d) {
          chunks.push(d);
        });
        res.on("end", function () {
          const raw = Buffer.concat(chunks).toString("utf8");
          var j = {};
          try {
            j = JSON.parse(raw);
          } catch (e) {
            reject(new Error("Cloudinary nem JSON válasz: " + raw.slice(0, 200)));
            return;
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const msg =
              (j.error && (j.error.message || j.error)) ||
              j.message ||
              ("HTTP " + res.statusCode);
            reject(new Error(String(msg)));
            return;
          }
          const out = (j.secure_url || j.url || "").toString().trim();
          if (!/^https:\/\//i.test(out)) {
            reject(new Error("A Cloudinary válaszban nincs https URL."));
            return;
          }
          resolve(out);
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

module.exports = async function cloudinaryUploadHandler(req, res) {
  res.setHeader("content-type", "application/json; charset=utf-8");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("access-control-allow-methods", "POST, OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type");
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const token = getAdminCookie(req);
  if (!verifyToken(token)) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: "Admin munkamenet szükséges. Jelentkezz be újra." }));
    return;
  }

  const apiSecret = String(process.env.CLOUDINARY_API_SECRET || "").trim();
  const apiKey = String(process.env.CLOUDINARY_API_KEY || "").trim();
  const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || "djguaaz7z").trim();
  const uploadPreset = String(process.env.CLOUDINARY_UPLOAD_PRESET || "KMMK uploads").trim();

  if (!apiSecret || !apiKey) {
    res.statusCode = 500;
    res.end(
      JSON.stringify({
        error:
          "Hiányzik a CLOUDINARY_API_SECRET vagy CLOUDINARY_API_KEY a Vercel környezeti változók közül. Ezek nélkül csak unsigned preset működne a böngészőből.",
      })
    );
    return;
  }

  const ct = (req.headers["content-type"] || "").toLowerCase();
  if (!ct.includes("multipart/form-data")) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "multipart/form-data kell (mezőnév: file)." }));
    return;
  }

  let fileBuffer = null;
  let mimeType = "application/octet-stream";
  let filename = "upload.jpg";

  try {
    await new Promise(function (resolve, reject) {
      const bb = busboy({
        headers: req.headers,
        limits: { fileSize: MAX_BYTES, files: 1 },
      });
      bb.on("file", function (name, file, info) {
        if (name !== "file") {
          file.resume();
          return;
        }
        mimeType = (info && info.mimeType) || mimeType;
        filename = (info && info.filename) || filename;
        const chunks = [];
        file.on("data", function (d) {
          chunks.push(d);
        });
        file.on("limit", function () {
          reject(new Error("Max. 4 MB / kép."));
        });
        file.on("end", function () {
          fileBuffer = Buffer.concat(chunks);
        });
        file.on("error", reject);
      });
      bb.on("error", reject);
      bb.on("finish", function () {
        resolve();
      });
      req.pipe(bb);
    });
  } catch (e) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: e && e.message ? e.message : String(e) }));
    return;
  }

  if (!fileBuffer || !fileBuffer.length) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "Üres fájl vagy hiányzó „file” mező." }));
    return;
  }

  try {
    const secureUrl = await uploadBufferToCloudinary(
      fileBuffer,
      mimeType,
      filename,
      apiKey,
      apiSecret,
      cloudName,
      uploadPreset
    );
    res.statusCode = 200;
    res.end(JSON.stringify({ secure_url: secureUrl, url: secureUrl }));
  } catch (e2) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: e2 && e2.message ? e2.message : String(e2) }));
  }
};
