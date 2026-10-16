// Where uploaded images are stored.
//   STORAGE_DRIVER=local (default) → server/uploads, served at /api/files/…  (for development)
//   STORAGE_DRIVER=oci             → OCI Object Storage bucket (for production)
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const driver = process.env.STORAGE_DRIVER === "oci" ? "oci" : "local";
const LOCAL_DIR = path.join(__dirname, "..", "uploads");
const LOCAL_PREFIX = "/api/files/";

const env = (k) => process.env[k] || "";
const ociBase = () =>
  `https://objectstorage.${env("OCI_REGION")}.oraclecloud.com/n/${env("OCI_NAMESPACE")}/b/${env("OCI_BUCKET")}/o/`;

let ociClient = null;
function getOci() {
  if (!ociClient) {
    const common = require("oci-common");
    const os = require("oci-objectstorage");
    const keyPath = path.resolve(__dirname, "..", env("OCI_PRIVATE_KEY_PATH"));
    const provider = new common.SimpleAuthenticationDetailsProvider(
      env("OCI_TENANCY_OCID"),
      env("OCI_USER_OCID"),
      env("OCI_FINGERPRINT"),
      fs.readFileSync(keyPath, "utf8"),
      process.env.OCI_KEY_PASSPHRASE || null,
      common.Region.fromRegionId(env("OCI_REGION"))
    );
    ociClient = new os.ObjectStorageClient({ authenticationDetailsProvider: provider });
  }
  return ociClient;
}

// Save an image and return the URL to store in the database
async function save(buffer, ext, contentType) {
  const name = `q-${crypto.randomUUID()}.${ext}`; // random, unguessable name
  if (driver === "oci") {
    await getOci().putObject({
      namespaceName: env("OCI_NAMESPACE"),
      bucketName: env("OCI_BUCKET"),
      objectName: name,
      putObjectBody: buffer,
      contentLength: buffer.length,
      contentType,
      cacheControl: "public, max-age=31536000, immutable",
    });
    return ociBase() + name;
  }
  await fs.promises.mkdir(LOCAL_DIR, { recursive: true });
  await fs.promises.writeFile(path.join(LOCAL_DIR, name), buffer);
  return LOCAL_PREFIX + name;
}

// Only accept image URLs that we produced (no hot-linking random websites into questions)
function isOurUrl(url) {
  if (typeof url !== "string") return false;
  if (/^\/api\/files\/q-[0-9a-f-]{36}\.(png|jpg|gif|webp)$/.test(url)) return true;
  return env("OCI_BUCKET") !== "" && url.startsWith(ociBase()) && /q-[0-9a-f-]{36}\.(png|jpg|gif|webp)$/.test(url);
}

module.exports = { driver, save, isOurUrl, LOCAL_DIR };
